import Foundation

public final class NativeConnectorReadoutCoordinator: NSObject, ELM327BLEConnectorDelegate {
    public private(set) var connectorState: ELMConnectorState = .idle
    public private(set) var peripherals: [BLEPeripheralCandidate] = []
    public private(set) var characteristicCandidates: [BLECharacteristicCandidate] = []
    public private(set) var completedArchive: NativeConnectorScanArchive?
    public private(set) var archiveError: NativeConnectorScanArchiveError?
    public private(set) var connectorError: ELMConnectorError?

    public let connector: ELM327BLEConnector
    private let archiveBuilder = NativeConnectorScanArchiveBuilder()
    private var archiveRejected = false

    public init(connector: ELM327BLEConnector = ELM327BLEConnector()) {
        self.connector = connector
        super.init()
        self.connector.delegate = self
    }

    public func startPeripheralScan() {
        peripherals.removeAll()
        characteristicCandidates.removeAll()
        connectorError = nil
        connector.startScan()
    }

    public func selectPeripheral(id: UUID) {
        connector.select(peripheralID: id)
    }

    public func connectSelectedPeripheral() {
        connector.connectSelected()
    }

    public func configureReadCharacteristics(
        transmit: BLECharacteristicCandidate,
        receive: BLECharacteristicCandidate
    ) {
        connector.configure(
            transmitServiceUUID: transmit.serviceUUID,
            transmitCharacteristicUUID: transmit.characteristicUUID,
            receiveServiceUUID: receive.serviceUUID,
            receiveCharacteristicUUID: receive.characteristicUUID
        )
    }

    public func beginInitialReadout() {
        archiveBuilder.reset()
        completedArchive = nil
        archiveError = nil
        connectorError = nil
        archiveRejected = false
        connector.runInitialReadout()
    }

    public func disconnect() {
        connector.disconnect()
    }

    public func exportCompletedArchive() throws -> NativeConnectorScanArchive {
        guard let completedArchive else { throw NativeConnectorScanArchiveError.scanNotStarted }
        return completedArchive
    }

    public func connector(_ connector: ELM327BLEConnector, didChange state: ELMConnectorState) {
        connectorState = state
    }

    public func connector(_ connector: ELM327BLEConnector, didDiscover peripheral: BLEPeripheralCandidate) {
        guard !peripherals.contains(where: { $0.id == peripheral.id }) else { return }
        peripherals.append(peripheral)
        peripherals.sort { $0.displayName.localizedCaseInsensitiveCompare($1.displayName) == .orderedAscending }
    }

    public func connector(_ connector: ELM327BLEConnector, requiresCharacteristicSelection candidates: [BLECharacteristicCandidate]) {
        characteristicCandidates = candidates
    }

    public func connector(_ connector: ELM327BLEConnector, didEmit envelope: NativeConnectorEnvelope) {
        guard !archiveRejected else { return }
        do {
            try archiveBuilder.append(envelope)
        } catch let error as NativeConnectorScanArchiveError {
            archiveError = error
            archiveRejected = true
            connector.disconnect()
        } catch {
            archiveError = .invalidEnvelope
            archiveRejected = true
            connector.disconnect()
        }
    }

    public func connector(_ connector: ELM327BLEConnector, didComplete manifest: NativeConnectorCompletionManifest) {
        guard !archiveRejected else { return }
        do {
            try archiveBuilder.complete(with: manifest)
            completedArchive = try archiveBuilder.export()
        } catch let error as NativeConnectorScanArchiveError {
            archiveError = error
        } catch {
            archiveError = .invalidManifest
        }
    }

    public func connector(_ connector: ELM327BLEConnector, didFail error: ELMConnectorError) {
        connectorError = error
    }
}
