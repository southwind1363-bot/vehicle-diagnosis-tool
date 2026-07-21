import CoreBluetooth
import Foundation

public enum ELMConnectorState: String, Sendable {
    case idle, scanning, selected, connecting, discovering, subscribing, ready, awaitingPrompt, interrupted
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
}

public protocol ELM327BLEConnectorDelegate: AnyObject {
    func connector(_ connector: ELM327BLEConnector, didChange state: ELMConnectorState)
    func connector(_ connector: ELM327BLEConnector, didDiscover peripheral: BLEPeripheralCandidate)
    func connector(_ connector: ELM327BLEConnector, requiresCharacteristicSelection candidates: [BLECharacteristicCandidate])
    func connector(_ connector: ELM327BLEConnector, didEmit envelope: NativeConnectorEnvelope)
    func connector(_ connector: ELM327BLEConnector, didFail error: ELMConnectorError)
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
    private var mode09EcuNameScopes = Set<String>()

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
        mode09EcuNameScopes.removeAll()
        pendingCommands = ELMReadCommand.allCases.filter { ![.freezeFrameTriggerDTC, .freezeFrameCoolantTemperature, .freezeFrameEngineRPM, .freezeFrameVehicleSpeed, .freezeFrameIntakeAirTemperature, .freezeFrameControlModuleVoltage, .engineRPM, .coolantTemperature, .controlModuleVoltage, .mode09EcuName].contains($0) }
        runNextCommand()
    }

    public func disconnect() {
        timeoutWorkItem?.cancel()
        timeoutWorkItem = nil
        pendingCommands.removeAll()
        activeCommand = nil
        promptDecoder.reset()
        if let peripheral = selectedPeripheral { central.cancelPeripheralConnection(peripheral) }
        selectedPeripheral = nil
        state = .idle
    }

    private func runNextCommand() {
        guard state == .ready, let command = pendingCommands.first else { return }
        guard let peripheral = selectedPeripheral, let transmit = transmitCharacteristic else { return fail(.disconnected) }
        pendingCommands.removeFirst()
        activeCommand = command
        promptDecoder.reset()
        let type: CBCharacteristicWriteType = transmit.properties.contains(.write) ? .withResponse : .withoutResponse
        guard let request = "\(command.wireValue)\r".data(using: .utf8) else { return fail(.invalidResponse) }
        peripheral.writeValue(request, for: transmit, type: type)
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
        let normalizedResponse = response.uppercased()
        if normalizedResponse.contains("CAN ERROR") || normalizedResponse.contains("BUFFER FULL") {
            emitFailure(for: command, error: "transport_failure")
            interrupt(.invalidResponse)
            return
        }
        if normalizedResponse.contains("NO DATA") || normalizedResponse.contains("UNABLE TO CONNECT") || normalizedResponse.contains("STOPPED") {
            emitFailure(for: command, error: "readout_not_available")
        } else {
            switch command {
            case .disableEcho, .disableLinefeeds, .enableHeaders, .autoProtocol:
                break
            case .identifyAdapter:
                adapterName = firstResponseLine(in: response, excluding: command)
                sequence += 1
                delegate?.connector(self, didEmit: NativeConnectorEnvelopeFactory.adapterIdentity(context: context, sequence: sequence, adapterName: adapterName, protocolHint: protocolHint))
            case .describeProtocol:
                protocolHint = firstResponseLine(in: response, excluding: command)
                sequence += 1
                delegate?.connector(self, didEmit: NativeConnectorEnvelopeFactory.adapterIdentity(context: context, sequence: sequence, adapterName: adapterName, protocolHint: protocolHint))
            case .storedDTC, .pendingDTC, .permanentDTC:
                switch OBD2ReadoutDecoder.decodeDTCs(command: command, response: response) {
                case .success(let results):
                    results.forEach { result in
                        sequence += 1
                        delegate?.connector(self, didEmit: NativeConnectorEnvelopeFactory.dtcs(
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
            case .freezeFrameCapabilities:
                freezeFrameSupportedPIDs = OBD2ReadoutDecoder.freezeFrameSupportedPIDs(response: response)
                let candidates: [ELMReadCommand] = [.freezeFrameTriggerDTC, .freezeFrameCoolantTemperature, .freezeFrameEngineRPM, .freezeFrameVehicleSpeed, .freezeFrameIntakeAirTemperature, .freezeFrameControlModuleVoltage]
                let supported = candidates.filter { command in
                    command.freezeFramePID.map(freezeFrameSupportedPIDs.contains) ?? false
                }
                if supported.contains(.freezeFrameTriggerDTC) {
                    pendingCommands.insert(contentsOf: supported, at: 0)
                } else {
                    emitFailure(for: .freezeFrameTriggerDTC, error: "freeze_frame_unsupported")
                }
            case .freezeFrameTriggerDTC:
                switch OBD2ReadoutDecoder.decodeFreezeFrameTriggerDTC(response: response) {
                case .success(let results):
                    results.forEach { result in
                        sequence += 1
                        delegate?.connector(self, didEmit: NativeConnectorEnvelopeFactory.freezeFrameTriggerDTC(context: context, sequence: sequence, scopeID: result.scopeID, code: result.code))
                    }
                case .failure(let error):
                    emitFailure(for: command, error: error.rawValue)
                }
            case .freezeFrameCoolantTemperature, .freezeFrameEngineRPM, .freezeFrameVehicleSpeed, .freezeFrameIntakeAirTemperature, .freezeFrameControlModuleVoltage:
                switch OBD2ReadoutDecoder.decodeFreezeFrameValue(command: command, response: response) {
                case .success(let results):
                    results.forEach { result in
                        sequence += 1
                        delegate?.connector(self, didEmit: NativeConnectorEnvelopeFactory.freezeFrameValue(context: context, sequence: sequence, scopeID: result.scopeID, value: result.value))
                    }
                case .failure(let error):
                    emitFailure(for: command, error: error.rawValue)
                }
            case .mode09SupportedInfoTypes:
                switch OBD2ReadoutDecoder.decodeMode09SupportedInfoTypes(response: response) {
                case .success(let results):
                    results.forEach { result in
                        sequence += 1
                        delegate?.connector(self, didEmit: NativeConnectorEnvelopeFactory.ecuInfo(context: context, sequence: sequence, scopeID: result.scopeID, id: "supported_info_types_00", infoType: "00", value: result.bitmap))
                        if result.supportsEcuName { mode09EcuNameScopes.insert(result.scopeID ?? "LEGACY") }
                    }
                    if !mode09EcuNameScopes.isEmpty { pendingCommands.insert(.mode09EcuName, at: 0) }
                case .failure(let error):
                    emitFailure(for: command, error: error.rawValue)
                }
            case .mode09EcuName:
                switch OBD2ReadoutDecoder.decodeMode09EcuNames(response: response, supportedScopeIDs: mode09EcuNameScopes) {
                case .success(let results):
                    results.forEach { result in
                        sequence += 1
                        delegate?.connector(self, didEmit: NativeConnectorEnvelopeFactory.ecuInfo(context: context, sequence: sequence, scopeID: result.scopeID, id: "ecu_name", infoType: "0A", value: result.name))
                    }
                case .failure(let error):
                    emitFailure(for: command, error: error.rawValue)
                }
            case .supportedPIDs:
                liveSupportedPIDs = Set(OBD2PIDDecoder.supportedPIDs(response: response))
                sequence += 1
                delegate?.connector(self, didEmit: NativeConnectorEnvelopeFactory.supportedPIDs(context: context, sequence: sequence, pids: [...liveSupportedPIDs].sorted()))
                let candidates: [ELMReadCommand] = [.engineRPM, .coolantTemperature, .controlModuleVoltage]
                pendingCommands.insert(contentsOf: candidates.filter { command in
                    switch command {
                    case .engineRPM: return liveSupportedPIDs.contains("0C")
                    case .coolantTemperature: return liveSupportedPIDs.contains("05")
                    case .controlModuleVoltage: return liveSupportedPIDs.contains("42")
                    default: return false
                    }
                }, at: 0)
            case .readinessStatus:
                switch OBD2ReadoutDecoder.decodeReadiness(response: response) {
                case .success(let results):
                    results.forEach { result in
                        sequence += 1
                        delegate?.connector(self, didEmit: NativeConnectorEnvelopeFactory.readiness(
                            context: context,
                            sequence: sequence,
                            scopeID: result.scopeID,
                            status: result.status
                        ))
                    }
                case .failure(let error):
                    emitFailure(for: command, error: error.rawValue)
                }
            case .engineRPM, .coolantTemperature, .controlModuleVoltage:
                if let value = OBD2PIDDecoder.decode(command, response: response) {
                    sequence += 1
                    delegate?.connector(self, didEmit: NativeConnectorEnvelopeFactory.livePID(context: context, sequence: sequence, value: value))
                } else {
                    emitFailure(for: command, error: "unparsed_pid_response")
                }
            }
        }
        runNextCommand()
    }

    private func emitFailure(for command: ELMReadCommand, error: String) {
        guard let context = sessionContext else { return }
        sequence += 1
        delegate?.connector(self, didEmit: NativeConnectorEnvelopeFactory.failedReadout(context: context, sequence: sequence, command: command, error: error))
    }

    private func interrupt(_ error: ELMConnectorError) {
        pendingCommands.removeAll()
        activeCommand = nil
        promptDecoder.reset()
        state = .interrupted
        delegate?.connector(self, didFail: error)
        if let peripheral = selectedPeripheral { central.cancelPeripheralConnection(peripheral) }
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
        let candidates = characteristics.values.map { characteristic in
            BLECharacteristicCandidate(
                serviceUUID: characteristic.service.uuid.uuidString,
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
