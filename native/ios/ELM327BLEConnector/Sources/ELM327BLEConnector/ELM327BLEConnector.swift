import CoreBluetooth
import Foundation

public enum ELMConnectorState: String, Sendable {
    case idle, scanning, selected, connecting, discovering, subscribing, ready, awaitingWriteCapacity, awaitingPrompt, interrupted
}

enum ELMReadResponseDisposition: Equatable {
    case process
    case noData
    case transportFailure
    case vehicleLinkFailure
}

func classifyELMReadResponse(_ response: String) -> ELMReadResponseDisposition {
    let normalized = response.uppercased()
    if ["CAN ERROR", "BUS ERROR", "BUS INIT: ERROR", "BUFFER FULL", "LV RESET"].contains(where: normalized.contains) {
        return .transportFailure
    }
    if ["UNABLE TO CONNECT", "STOPPED"].contains(where: normalized.contains) {
        return .vehicleLinkFailure
    }
    return normalized.contains("NO DATA") ? .noData : .process
}

func isCompletedELMAdapterSetupResponse(command: ELMReadCommand, response: String) -> Bool {
    guard command.isAdapterSetup else { return false }
    let lines = response
        .split(whereSeparator: { $0.isNewline })
        .map { $0.trimmingCharacters(in: .whitespacesAndNewlines).uppercased() }
        .filter { !$0.isEmpty }
    guard !lines.contains(where: { ["ERROR", "?", "STOPPED", "CAN ERROR", "BUS ERROR", "BUFFER FULL"].contains($0) }) else {
        return false
    }
    return lines.contains("OK")
}

func requiresELMWriteCapacityWait(writeWithoutResponse: Bool, canSendWithoutResponse: Bool) -> Bool {
    writeWithoutResponse && !canSendWithoutResponse
}

func enqueueSupportedPIDFollowUps(
    pendingCommands: [ELMReadCommand],
    liveCommands: [ELMReadCommand],
    nextSupportedPIDPage: ELMReadCommand?
) -> [ELMReadCommand] {
    var next = pendingCommands
    if let nextSupportedPIDPage {
        next.insert(nextSupportedPIDPage, at: 0)
    }
    next.append(contentsOf: liveCommands)
    return next
}

public struct BLEPeripheralCandidate: Identifiable, Sendable {
    public let id: UUID
    public let displayName: String
}

public struct BLECharacteristicCandidate: Sendable {
    public let serviceUUID: String
    public let characteristicUUID: String
    public let supportsNotify: Bool
    public let supportsWrite: Bool
    public let supportsWriteWithoutResponse: Bool

    public init(
        serviceUUID: String,
        characteristicUUID: String,
        supportsNotify: Bool,
        supportsWrite: Bool,
        supportsWriteWithoutResponse: Bool
    ) {
        self.serviceUUID = serviceUUID
        self.characteristicUUID = characteristicUUID
        self.supportsNotify = supportsNotify
        self.supportsWrite = supportsWrite
        self.supportsWriteWithoutResponse = supportsWriteWithoutResponse
    }
}

public protocol ELM327BLEConnectorDelegate: AnyObject {
    func connector(_ connector: ELM327BLEConnector, didChange state: ELMConnectorState)
    func connector(_ connector: ELM327BLEConnector, didDiscover peripheral: BLEPeripheralCandidate)
    func connector(_ connector: ELM327BLEConnector, requiresCharacteristicSelection candidates: [BLECharacteristicCandidate])
    func connector(_ connector: ELM327BLEConnector, didEmit envelope: NativeConnectorEnvelope)
    func connector(_ connector: ELM327BLEConnector, didComplete manifest: NativeConnectorCompletionManifest)
    func connector(_ connector: ELM327BLEConnector, didFail error: ELMConnectorError)
}

public extension ELM327BLEConnectorDelegate {
    func connector(_ connector: ELM327BLEConnector, didComplete manifest: NativeConnectorCompletionManifest) {}
}

public final class ELM327BLEConnector: NSObject {
    public weak var delegate: ELM327BLEConnectorDelegate?
    public private(set) var state: ELMConnectorState = .idle { didSet { delegate?.connector(self, didChange: state) } }

    private var central: CBCentralManager!
    private var peripherals: [UUID: CBPeripheral] = [:]
    private var selectedPeripheral: CBPeripheral?
    private var characteristics: [String: CBCharacteristic] = [:]
    private var transmitCharacteristic: CBCharacteristic?
    private var receiveCharacteristic: CBCharacteristic?
    private var pendingServiceIDs = Set<CBUUID>()
    private var pendingCommands: [ELMReadCommand] = []
    private var activeCommand: ELMReadCommand?
    private var promptDecoder = ELMPromptDecoder()
    private var timeoutWorkItem: DispatchWorkItem?
    private var sequence = 0
    private var sessionContext: NativeConnectorSessionContext?
    private var adapterName: String?
    private var protocolHint: String?
    private var freezeFrameSupportedPIDs = Set<String>()
    private var liveSupportedPIDs = Set<String>()
    private var scheduledLivePIDCommands = Set<ELMReadCommand>()
    private var scheduledSupportedPIDPages = Set<ELMReadCommand>()
    private var mode09CalibrationIDScopes = Set<String>()
    private var mode09CalibrationVerificationNumberScopes = Set<String>()
    private var mode09EcuNameScopes = Set<String>()
    private var plannedIntents = Set<String>()
    private var plannedReadoutIDs = Set<String>()
    private var observedReadoutScopes = Set<NativeConnectorReadoutScope>()
    private var emittedEnvelopeCount = 0
    private var firstEnvelopeSequence: Int?
    private var didEmitTerminalManifest = false

    public override init() {
        super.init()
        central = CBCentralManager(delegate: self, queue: .main)
    }

    public func startScan() {
        guard central.state == .poweredOn else { return fail(.bluetoothUnavailable) }
        guard state == .idle || state == .interrupted else { return fail(.invalidState) }
        peripherals.removeAll()
        selectedPeripheral = nil
        characteristics.removeAll()
        central.scanForPeripherals(withServices: nil, options: [CBCentralManagerScanOptionAllowDuplicatesKey: false])
        state = .scanning
    }

    public func select(peripheralID: UUID) {
        guard state == .scanning, let peripheral = peripherals[peripheralID] else { return fail(.peripheralNotSelected) }
        central.stopScan()
        selectedPeripheral = peripheral
        state = .selected
    }

    public func connectSelected() {
        guard state == .selected, let peripheral = selectedPeripheral else { return fail(.peripheralNotSelected) }
        state = .connecting
        central.connect(peripheral, options: nil)
    }

    public func configure(
        transmitServiceUUID: String,
        transmitCharacteristicUUID: String,
        receiveServiceUUID: String,
        receiveCharacteristicUUID: String
    ) {
        guard state == .discovering,
              let transmit = characteristics[key(serviceUUID: transmitServiceUUID, characteristicUUID: transmitCharacteristicUUID)],
              let receive = characteristics[key(serviceUUID: receiveServiceUUID, characteristicUUID: receiveCharacteristicUUID)]
        else { return fail(.characteristicNotReady) }
        guard transmit.properties.contains(.write) || transmit.properties.contains(.writeWithoutResponse),
              receive.properties.contains(.notify) || receive.properties.contains(.indicate),
              let peripheral = selectedPeripheral
        else { return fail(.characteristicNotReady) }
        transmitCharacteristic = transmit
        receiveCharacteristic = receive
        state = .subscribing
        peripheral.setNotifyValue(true, for: receive)
    }

    public func runInitialReadout() {
        guard state == .ready, transmitCharacteristic != nil, receiveCharacteristic != nil else { return fail(.characteristicNotReady) }
        sessionContext = NativeConnectorSessionContext()
        sequence = 0
        adapterName = nil
        protocolHint = nil
        freezeFrameSupportedPIDs.removeAll()
        liveSupportedPIDs.removeAll()
        scheduledLivePIDCommands.removeAll()
        scheduledSupportedPIDPages = [.supportedPIDs]
        mode09CalibrationIDScopes.removeAll()
        mode09CalibrationVerificationNumberScopes.removeAll()
        mode09EcuNameScopes.removeAll()
        plannedIntents.removeAll()
        plannedReadoutIDs.removeAll()
        observedReadoutScopes.removeAll()
        emittedEnvelopeCount = 0
        firstEnvelopeSequence = nil
        didEmitTerminalManifest = false
        pendingCommands = ELMReadCommand.allCases.filter { ![.freezeFrameTriggerDTC, .freezeFrameCalculatedLoad, .freezeFrameShortTermFuelTrimBank1, .freezeFrameLongTermFuelTrimBank1, .freezeFrameFuelPressure, .freezeFrameManifoldAbsolutePressure, .freezeFrameCoolantTemperature, .freezeFrameEngineRPM, .freezeFrameVehicleSpeed, .freezeFrameIntakeAirTemperature, .freezeFrameThrottlePosition, .freezeFrameEngineRuntime, .freezeFrameControlModuleVoltage, .supportedPIDs20, .supportedPIDs40, .supportedPIDs60, .supportedPIDs80, .supportedPIDsA0, .mode09CalibrationID, .mode09CalibrationVerificationNumber, .mode09EcuName].contains($0) && $0.livePID == nil }
        plan(commands: pendingCommands)
        runNextCommand()
    }

    public func disconnect() {
        timeoutWorkItem?.cancel()
        timeoutWorkItem = nil
        if sessionContext != nil && !didEmitTerminalManifest { emitCompletionManifest(state: .interrupted, interruptionCode: "transport:user_disconnected") }
        pendingCommands.removeAll()
        activeCommand = nil
        promptDecoder.reset()
        if let peripheral = selectedPeripheral { central.cancelPeripheralConnection(peripheral) }
        selectedPeripheral = nil
        state = .idle
    }

    private func runNextCommand() {
        guard state == .ready else { return }
        guard let command = pendingCommands.first else {
            emitCompletionManifest(state: .completed, interruptionCode: nil)
            return
        }
        guard let peripheral = selectedPeripheral, let transmit = transmitCharacteristic else { return fail(.disconnected) }
        let type: CBCharacteristicWriteType = transmit.properties.contains(.write) ? .withResponse : .withoutResponse
        guard let request = "\(command.wireValue)\r".data(using: .utf8) else { return fail(.invalidResponse) }
        if requiresELMWriteCapacityWait(
            writeWithoutResponse: type == .withoutResponse,
            canSendWithoutResponse: peripheral.canSendWriteWithoutResponse
        ) {
            waitForWriteCapacity(command)
            return
        }
        send(command, request: request, to: peripheral, characteristic: transmit, type: type)
    }

    private func waitForWriteCapacity(_ command: ELMReadCommand) {
        state = .awaitingWriteCapacity
        let timeout = DispatchWorkItem { [weak self] in
            guard let self,
                  self.state == .awaitingWriteCapacity,
                  self.pendingCommands.first == command
            else { return }
            self.emitFailure(for: command, error: "write_capacity_timeout")
            self.interrupt(.writeCapacityTimeout)
        }
        timeoutWorkItem = timeout
        DispatchQueue.main.asyncAfter(deadline: .now() + command.timeout, execute: timeout)
    }

    private func send(
        _ command: ELMReadCommand,
        request: Data,
        to peripheral: CBPeripheral,
        characteristic: CBCharacteristic,
        type: CBCharacteristicWriteType
    ) {
        pendingCommands.removeFirst()
        activeCommand = command
        promptDecoder.reset()
        peripheral.writeValue(request, for: characteristic, type: type)
        state = .awaitingPrompt
        let timeout = DispatchWorkItem { [weak self] in
            guard let self, self.activeCommand == command else { return }
            self.emitFailure(for: command, error: "response_timeout")
            self.interrupt(.responseTimeout)
        }
        timeoutWorkItem = timeout
        DispatchQueue.main.asyncAfter(deadline: .now() + command.timeout, execute: timeout)
    }

    private func completeActiveCommand(with response: String) {
        guard let command = activeCommand, let context = sessionContext else { return }
        timeoutWorkItem?.cancel()
        timeoutWorkItem = nil
        activeCommand = nil
        state = .ready
        switch classifyELMReadResponse(response) {
        case .transportFailure:
            emitFailure(for: command, error: "transport_failure")
            interrupt(.invalidResponse)
            return
        case .vehicleLinkFailure:
            emitFailure(for: command, error: "vehicle_link_error")
            interrupt(.invalidResponse)
            return
        case .noData:
            if command.isAdapterSetup {
                emitFailure(for: command, error: "adapter_setup_failed")
                interrupt(.invalidResponse)
                return
            }
            emitFailure(for: command, error: "readout_not_available")
        case .process:
            switch command {
            case .disableEcho, .disableLinefeeds, .enableHeaders, .autoProtocol:
                guard isCompletedELMAdapterSetupResponse(command: command, response: response) else {
                    emitFailure(for: command, error: "adapter_setup_failed")
                    interrupt(.invalidResponse)
                    return
                }
            case .identifyAdapter:
                adapterName = firstResponseLine(in: response, excluding: command)
                sequence += 1
                emit(NativeConnectorEnvelopeFactory.adapterIdentity(context: context, sequence: sequence, adapterName: adapterName, protocolHint: protocolHint))
            case .describeProtocol:
                protocolHint = firstResponseLine(in: response, excluding: command)
                sequence += 1
                emit(NativeConnectorEnvelopeFactory.adapterIdentity(context: context, sequence: sequence, adapterName: adapterName, protocolHint: protocolHint))
            case .storedDTC, .pendingDTC, .permanentDTC:
                switch OBD2ReadoutDecoder.decodeDTCs(command: command, response: response) {
                case .success(let results):
                    results.forEach { result in
                        sequence += 1
                        emit(NativeConnectorEnvelopeFactory.dtcs(
                            context: context,
                            sequence: sequence,
                            intent: command.intent,
                            scopeID: result.scopeID,
                            dtcs: result.dtcs
                        ))
                    }
                case .failure(let error):
                    emitFailure(for: command, error: error.rawValue)
                }
            case .onboardMonitor:
                switch OBD2ReadoutDecoder.decodeOnboardMonitorTests(response: response) {
                case .success(let results):
                    results.forEach { result in
                        sequence += 1
                        emit(NativeConnectorEnvelopeFactory.onboardMonitor(context: context, sequence: sequence, scopeID: result.scopeID, tests: result.tests))
                    }
                case .failure(let error):
                    emitFailure(for: command, error: error.rawValue)
                }
            case .freezeFrameCapabilities:
                freezeFrameSupportedPIDs = OBD2ReadoutDecoder.freezeFrameSupportedPIDs(response: response)
                let candidates: [ELMReadCommand] = [.freezeFrameTriggerDTC, .freezeFrameCalculatedLoad, .freezeFrameShortTermFuelTrimBank1, .freezeFrameLongTermFuelTrimBank1, .freezeFrameFuelPressure, .freezeFrameManifoldAbsolutePressure, .freezeFrameCoolantTemperature, .freezeFrameEngineRPM, .freezeFrameVehicleSpeed, .freezeFrameIntakeAirTemperature, .freezeFrameThrottlePosition, .freezeFrameEngineRuntime, .freezeFrameControlModuleVoltage]
                let supported = candidates.filter { command in
                    command.freezeFramePID.map(freezeFrameSupportedPIDs.contains) ?? false
                }
                if supported.contains(.freezeFrameTriggerDTC) {
                    pendingCommands.insert(contentsOf: supported, at: 0)
                    plan(commands: supported)
                } else {
                    emitFailure(for: .freezeFrameTriggerDTC, error: "freeze_frame_unsupported")
                }
            case .freezeFrameTriggerDTC:
                switch OBD2ReadoutDecoder.decodeFreezeFrameTriggerDTC(response: response) {
                case .success(let results):
                    results.forEach { result in
                        sequence += 1
                        emit(NativeConnectorEnvelopeFactory.freezeFrameTriggerDTC(context: context, sequence: sequence, scopeID: result.scopeID, code: result.code))
                    }
                case .failure(let error):
                    emitFailure(for: command, error: error.rawValue)
                }
            case .freezeFrameCalculatedLoad, .freezeFrameShortTermFuelTrimBank1, .freezeFrameLongTermFuelTrimBank1, .freezeFrameFuelPressure, .freezeFrameManifoldAbsolutePressure, .freezeFrameCoolantTemperature, .freezeFrameEngineRPM, .freezeFrameVehicleSpeed, .freezeFrameIntakeAirTemperature, .freezeFrameThrottlePosition, .freezeFrameEngineRuntime, .freezeFrameControlModuleVoltage:
                switch OBD2ReadoutDecoder.decodeFreezeFrameValue(command: command, response: response) {
                case .success(let results):
                    results.forEach { result in
                        sequence += 1
                        emit(NativeConnectorEnvelopeFactory.freezeFrameValue(context: context, sequence: sequence, scopeID: result.scopeID, value: result.value))
                    }
                case .failure(let error):
                    emitFailure(for: command, error: error.rawValue)
                }
            case .mode09SupportedInfoTypes:
                switch OBD2ReadoutDecoder.decodeMode09SupportedInfoTypes(response: response) {
                case .success(let results):
                    results.forEach { result in
                        sequence += 1
                        emit(NativeConnectorEnvelopeFactory.ecuInfo(context: context, sequence: sequence, scopeID: result.scopeID, id: "supported_info_types_00", infoType: "00", value: result.bitmap))
                        if result.supportsCalibrationID { mode09CalibrationIDScopes.insert(result.scopeID ?? "LEGACY") }
                        if result.supportsCalibrationVerificationNumber { mode09CalibrationVerificationNumberScopes.insert(result.scopeID ?? "LEGACY") }
                        if result.supportsEcuName { mode09EcuNameScopes.insert(result.scopeID ?? "LEGACY") }
                    }
                    let followUpCommands: [ELMReadCommand] = [
                        mode09CalibrationIDScopes.isEmpty ? nil : .mode09CalibrationID,
                        mode09CalibrationVerificationNumberScopes.isEmpty ? nil : .mode09CalibrationVerificationNumber,
                        mode09EcuNameScopes.isEmpty ? nil : .mode09EcuName
                    ].compactMap { $0 }
                    if !followUpCommands.isEmpty {
                        pendingCommands.insert(contentsOf: followUpCommands, at: 0)
                        plan(commands: followUpCommands)
                    }
                case .failure(let error):
                    emitFailure(for: command, error: error.rawValue)
                }
            case .mode09CalibrationID:
                switch OBD2ReadoutDecoder.decodeMode09CalibrationIDs(response: response, supportedScopeIDs: mode09CalibrationIDScopes) {
                case .success(let results):
                    results.forEach { result in
                        sequence += 1
                        emit(NativeConnectorEnvelopeFactory.ecuInfo(context: context, sequence: sequence, scopeID: result.scopeID, id: "calibration_id", infoType: "04", value: result.calibrationID))
                    }
                case .failure(let error):
                    emitFailure(for: command, error: error.rawValue)
                }
            case .mode09CalibrationVerificationNumber:
                switch OBD2ReadoutDecoder.decodeMode09CalibrationVerificationNumbers(response: response, supportedScopeIDs: mode09CalibrationVerificationNumberScopes) {
                case .success(let results):
                    results.forEach { result in
                        sequence += 1
                        emit(NativeConnectorEnvelopeFactory.ecuInfo(context: context, sequence: sequence, scopeID: result.scopeID, id: "calibration_verification_number", infoType: "06", value: result.value))
                    }
                case .failure(let error):
                    emitFailure(for: command, error: error.rawValue)
                }
            case .mode09EcuName:
                switch OBD2ReadoutDecoder.decodeMode09EcuNames(response: response, supportedScopeIDs: mode09EcuNameScopes) {
                case .success(let results):
                    results.forEach { result in
                        sequence += 1
                        emit(NativeConnectorEnvelopeFactory.ecuInfo(context: context, sequence: sequence, scopeID: result.scopeID, id: "ecu_name", infoType: "0A", value: result.name))
                    }
                case .failure(let error):
                    emitFailure(for: command, error: error.rawValue)
                }
            case .supportedPIDs, .supportedPIDs20, .supportedPIDs40, .supportedPIDs60, .supportedPIDs80, .supportedPIDsA0:
                switch OBD2ReadoutDecoder.decodeSupportedPIDs(command: command, response: response) {
                case .success(let results):
                    liveSupportedPIDs.formUnion(results.flatMap(\.pids))
                    results.forEach { result in
                        sequence += 1
                        emit(NativeConnectorEnvelopeFactory.supportedPIDs(context: context, sequence: sequence, scopeID: result.scopeID, pageBase: command.supportedPIDPageBase!, pids: result.pids))
                    }
                    let supportedCommands = ELMReadCommand.allCases.filter { candidate in
                        candidate.livePID.map(liveSupportedPIDs.contains) == true && scheduledLivePIDCommands.insert(candidate).inserted
                    }
                    var nextPage: ELMReadCommand?
                    if let candidate = command.nextSupportedPIDPage,
                       let nextPageBase = candidate.supportedPIDPageBase,
                       results.contains(where: { $0.pids.contains(nextPageBase) }),
                       scheduledSupportedPIDPages.insert(candidate).inserted {
                        nextPage = candidate
                    }
                    pendingCommands = enqueueSupportedPIDFollowUps(
                        pendingCommands: pendingCommands,
                        liveCommands: supportedCommands,
                        nextSupportedPIDPage: nextPage
                    )
                    plan(commands: supportedCommands)
                    if let nextPage {
                        plan(commands: [nextPage])
                    }
                case .failure(let error):
                    emitFailure(for: command, error: error.rawValue)
                    runNextCommand()
                    return
                }
            case .readinessStatus:
                switch OBD2ReadoutDecoder.decodeReadiness(response: response) {
                case .success(let results):
                    results.forEach { result in
                        sequence += 1
                        emit(NativeConnectorEnvelopeFactory.readiness(
                            context: context,
                            sequence: sequence,
                            scopeID: result.scopeID,
                            status: result.status
                        ))
                    }
                case .failure(let error):
                    emitFailure(for: command, error: error.rawValue)
                }
            case .odometer:
                switch OBD2ReadoutDecoder.decodeLivePID(command: command, response: response) {
                case .success(let results):
                    results.forEach { result in
                        sequence += 1
                        emit(NativeConnectorEnvelopeFactory.livePID(context: context, sequence: sequence, scopeID: result.scopeID, value: result.value))
                    }
                case .failure(let error):
                    emitFailure(for: command, error: error.rawValue)
                }
            case .calculatedLoad, .shortTermFuelTrimBank1, .longTermFuelTrimBank1, .fuelPressure, .manifoldAbsolutePressure, .engineRPM, .vehicleSpeed, .timingAdvance, .coolantTemperature, .intakeAirTemperature, .massAirFlow, .throttlePosition, .oxygenSensorB1S1, .oxygenSensorB1S2, .oxygenSensorB1S3, .oxygenSensorB1S4, .oxygenSensorB2S1, .oxygenSensorB2S2, .oxygenSensorB2S3, .oxygenSensorB2S4, .wideOxygenVoltageB1S1, .wideOxygenVoltageB1S2, .wideOxygenVoltageB1S3, .wideOxygenVoltageB1S4, .wideOxygenVoltageB2S1, .wideOxygenVoltageB2S2, .wideOxygenVoltageB2S3, .wideOxygenVoltageB2S4, .engineRuntime, .distanceWithMIL, .fuelRailPressureVacuum, .fuelRailPressure, .commandedEGR, .egrError, .commandedEvapPurge, .fuelLevel, .warmupsSinceClear, .distanceSinceClear, .evapVaporPressure, .barometricPressure, .wideOxygenCurrentB1S1, .wideOxygenCurrentB1S2, .wideOxygenCurrentB2S1, .wideOxygenCurrentB2S2, .catalystTemperatureB1S1, .catalystTemperatureB1S2, .catalystTemperatureB2S1, .catalystTemperatureB2S2, .commandedThrottleActuator, .controlModuleVoltage, .absoluteLoad, .commandedEquivalenceRatio, .relativeThrottlePosition, .ambientAirTemperature, .absoluteThrottlePositionB, .absoluteThrottlePositionC, .acceleratorPositionD, .acceleratorPositionE, .acceleratorPositionF, .timeWithMIL, .timeSinceClear, .ethanolPercentage, .fuelRailPressureAbsolute, .relativeAcceleratorPosition, .hybridBatteryRemaining, .engineOilTemperature, .fuelInjectionTiming, .engineFuelRate, .driverDemandTorque, .actualEngineTorque, .engineReferenceTorque, .enginePercentTorqueData, .commandedEGRAndError:
                switch OBD2ReadoutDecoder.decodeLivePID(command: command, response: response) {
                case .success(let results):
                    results.forEach { result in
                        sequence += 1
                        emit(NativeConnectorEnvelopeFactory.livePID(context: context, sequence: sequence, scopeID: result.scopeID, value: result.value))
                    }
                case .failure(let error):
                    emitFailure(for: command, error: error.rawValue)
                }
            }
        }
        runNextCommand()
    }

    private func emitFailure(for command: ELMReadCommand, error: String) {
        guard let context = sessionContext else { return }
        sequence += 1
        emit(NativeConnectorEnvelopeFactory.failedReadout(context: context, sequence: sequence, command: command, error: error))
    }

    private func plan(commands: [ELMReadCommand]) {
        commands.filter { !$0.isAdapterSetup }.forEach { command in
            plannedIntents.insert(command.intent)
            if let readoutID = command.readoutID { plannedReadoutIDs.insert(readoutID) }
        }
    }

    private func emit(_ envelope: NativeConnectorEnvelope) {
        emittedEnvelopeCount += 1
        if firstEnvelopeSequence == nil { firstEnvelopeSequence = envelope.sequence }
        if let readoutID = envelope.readoutID, let scopeID = envelope.readoutScopeID, !scopeID.isEmpty {
            observedReadoutScopes.insert(NativeConnectorReadoutScope(readoutID: readoutID, scopeID: scopeID))
        }
        delegate?.connector(self, didEmit: envelope)
    }

    private func emitCompletionManifest(state: NativeConnectorScanState, interruptionCode: String?) {
        guard let context = sessionContext, !didEmitTerminalManifest else { return }
        didEmitTerminalManifest = true
        let interruption = interruptionCode.map {
            NativeConnectorInterruption(code: $0, connectionID: context.connectionID, sequence: sequence)
        }
        let manifest = NativeConnectorCompletionManifest(
            schemaVersion: "native_connector_completion_manifest_v1",
            recordType: "completion_manifest",
            platform: "ios",
            interfaceID: "user-vci-elm327",
            scanID: context.scanID,
            vehicleContextID: context.vehicleContextID,
            capturedAt: ISO8601DateFormatter().string(from: Date()),
            scanState: state,
            expectedIntents: plannedIntents.sorted(),
            expectedReadouts: plannedReadoutIDs.sorted(),
            expectedReadoutScopes: observedReadoutScopes.sorted {
                $0.readoutID == $1.readoutID ? $0.scopeID < $1.scopeID : $0.readoutID < $1.readoutID
            },
            connectionSegments: [NativeConnectorConnectionSegment(
                connectionID: context.connectionID,
                connectionSequence: 0,
                firstSequence: firstEnvelopeSequence,
                lastSequence: emittedEnvelopeCount > 0 ? sequence : nil,
                envelopeCount: emittedEnvelopeCount
            )],
            interruption: interruption,
            readOnly: true,
            vehicleCommandEnabled: false,
            executionEnabled: false,
            wouldTransmit: false,
            retainedRawPayload: false
        )
        delegate?.connector(self, didComplete: manifest)
    }

    private func interrupt(_ error: ELMConnectorError) {
        timeoutWorkItem?.cancel()
        timeoutWorkItem = nil
        emitCompletionManifest(state: .interrupted, interruptionCode: interruptionCode(for: error))
        pendingCommands.removeAll()
        activeCommand = nil
        promptDecoder.reset()
        state = .interrupted
        delegate?.connector(self, didFail: error)
        if let peripheral = selectedPeripheral { central.cancelPeripheralConnection(peripheral) }
    }

    private func interruptionCode(for error: ELMConnectorError) -> String {
        switch error {
        case .bluetoothUnavailable: return "transport:bluetooth_unavailable"
        case .invalidState: return "connector:invalid_state"
        case .peripheralNotSelected: return "connector:peripheral_not_selected"
        case .characteristicNotReady: return "connector:characteristic_not_ready"
        case .responseTooLarge: return "transport:response_too_large"
        case .writeCapacityTimeout: return "transport:write_capacity_timeout"
        case .writeFailed: return "transport:write_failed"
        case .responseTimeout: return "transport:response_timeout"
        case .disconnected: return "transport:disconnected"
        case .invalidResponse: return "readout:invalid_response"
        }
    }

    private func fail(_ error: ELMConnectorError) {
        guard state != .interrupted else { return }
        interrupt(error)
    }

    private func key(serviceUUID: String, characteristicUUID: String) -> String {
        "\(serviceUUID.uppercased())/\(characteristicUUID.uppercased())"
    }

    private func firstResponseLine(in response: String, excluding command: ELMReadCommand) -> String? {
        response
            .split(whereSeparator: { $0.isNewline })
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .first { !$0.isEmpty && $0.uppercased() != command.wireValue }
    }
}

extension ELM327BLEConnector: CBCentralManagerDelegate {
    public func centralManagerDidUpdateState(_ central: CBCentralManager) {
        if central.state != .poweredOn, state != .idle { fail(.bluetoothUnavailable) }
    }

    public func centralManager(_ central: CBCentralManager, didDiscover peripheral: CBPeripheral, advertisementData: [String: Any], rssi RSSI: NSNumber) {
        guard state == .scanning else { return }
        peripherals[peripheral.identifier] = peripheral
        delegate?.connector(self, didDiscover: BLEPeripheralCandidate(id: peripheral.identifier, displayName: peripheral.name ?? "BLE peripheral"))
    }

    public func centralManager(_ central: CBCentralManager, didConnect peripheral: CBPeripheral) {
        guard peripheral.identifier == selectedPeripheral?.identifier else { return }
        peripheral.delegate = self
        state = .discovering
        peripheral.discoverServices(nil)
    }

    public func centralManager(_ central: CBCentralManager, didFailToConnect peripheral: CBPeripheral, error: Error?) { fail(.disconnected) }

    public func centralManager(_ central: CBCentralManager, didDisconnectPeripheral peripheral: CBPeripheral, error: Error?) {
        guard state != .idle else { return }
        if state != .interrupted { interrupt(.disconnected) }
    }
}

extension ELM327BLEConnector: CBPeripheralDelegate {
    public func peripheralIsReady(toSendWriteWithoutResponse peripheral: CBPeripheral) {
        guard peripheral.identifier == selectedPeripheral?.identifier, state == .awaitingWriteCapacity else { return }
        timeoutWorkItem?.cancel()
        timeoutWorkItem = nil
        state = .ready
        runNextCommand()
    }

    public func peripheral(_ peripheral: CBPeripheral, didDiscoverServices error: Error?) {
        guard state == .discovering, peripheral.identifier == selectedPeripheral?.identifier else { return }
        guard error == nil, let services = peripheral.services, !services.isEmpty else { return fail(.characteristicNotReady) }
        pendingServiceIDs = Set(services.map(\.uuid))
        services.forEach { peripheral.discoverCharacteristics(nil, for: $0) }
    }

    public func peripheral(_ peripheral: CBPeripheral, didDiscoverCharacteristicsFor service: CBService, error: Error?) {
        guard state == .discovering, peripheral.identifier == selectedPeripheral?.identifier else { return }
        guard error == nil else { return fail(.characteristicNotReady) }
        service.characteristics?.forEach { characteristic in
            characteristics[key(serviceUUID: service.uuid.uuidString, characteristicUUID: characteristic.uuid.uuidString)] = characteristic
        }
        pendingServiceIDs.remove(service.uuid)
        guard pendingServiceIDs.isEmpty else { return }
        let candidates = characteristics.values.compactMap { characteristic -> BLECharacteristicCandidate? in
            guard let service = characteristic.service else { return nil }
            return BLECharacteristicCandidate(
                serviceUUID: service.uuid.uuidString,
                characteristicUUID: characteristic.uuid.uuidString,
                supportsNotify: characteristic.properties.contains(.notify) || characteristic.properties.contains(.indicate),
                supportsWrite: characteristic.properties.contains(.write),
                supportsWriteWithoutResponse: characteristic.properties.contains(.writeWithoutResponse)
            )
        }.sorted { $0.characteristicUUID < $1.characteristicUUID }
        delegate?.connector(self, requiresCharacteristicSelection: candidates)
    }

    public func peripheral(_ peripheral: CBPeripheral, didUpdateNotificationStateFor characteristic: CBCharacteristic, error: Error?) {
        guard error == nil, characteristic === receiveCharacteristic, characteristic.isNotifying else { return fail(.characteristicNotReady) }
        state = .ready
    }

    public func peripheral(_ peripheral: CBPeripheral, didWriteValueFor characteristic: CBCharacteristic, error: Error?) {
        guard peripheral.identifier == selectedPeripheral?.identifier,
              characteristic === transmitCharacteristic,
              error != nil,
              let command = activeCommand
        else { return }
        timeoutWorkItem?.cancel()
        timeoutWorkItem = nil
        activeCommand = nil
        emitFailure(for: command, error: "write_failed")
        interrupt(.writeFailed)
    }

    public func peripheral(_ peripheral: CBPeripheral, didUpdateValueFor characteristic: CBCharacteristic, error: Error?) {
        guard error == nil, characteristic === receiveCharacteristic, let value = characteristic.value else { return fail(.invalidResponse) }
        do {
            if let response = try promptDecoder.append(value) { completeActiveCommand(with: response) }
        } catch let connectorError as ELMConnectorError {
            interrupt(connectorError)
        } catch {
            interrupt(.invalidResponse)
        }
    }
}
