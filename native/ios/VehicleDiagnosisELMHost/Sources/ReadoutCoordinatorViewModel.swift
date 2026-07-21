import Combine
import Foundation
import ELM327BLEConnector

@MainActor
final class ReadoutCoordinatorViewModel: ObservableObject {
    struct CharacteristicChoice: Identifiable, Equatable {
        let candidate: BLECharacteristicCandidate

        var id: String {
            "\(candidate.serviceUUID)/\(candidate.characteristicUUID)"
        }

        var label: String {
            let properties = [
                candidate.supportsWrite ? "write" : nil,
                candidate.supportsWriteWithoutResponse ? "write-no-response" : nil,
                candidate.supportsNotify ? "notify" : nil
            ].compactMap { $0 }.joined(separator: ", ")
            return "\(id) [\(properties)]"
        }
    }

    @Published private(set) var connectorState: ELMConnectorState = .idle
    @Published private(set) var peripherals: [BLEPeripheralCandidate] = []
    @Published private(set) var characteristicChoices: [CharacteristicChoice] = []
    @Published private(set) var archiveRecordCount = 0
    @Published private(set) var archiveState = "Incomplete"
    @Published private(set) var errorMessage: String?
    @Published private(set) var exportURL: URL?
    @Published var selectedPeripheralID: UUID?
    @Published var selectedTransmitID = ""
    @Published var selectedReceiveID = ""

    private let coordinator: NativeConnectorReadoutCoordinator

    init(coordinator: NativeConnectorReadoutCoordinator = NativeConnectorReadoutCoordinator()) {
        self.coordinator = coordinator
        coordinator.didUpdate = { [weak self] in
            Task { @MainActor [weak self] in
                self?.refresh()
            }
        }
        refresh()
    }

    var canConnect: Bool {
        connectorState == .selected
    }

    var canConfigure: Bool {
        connectorState == .discovering && transmitChoice != nil && receiveChoice != nil
    }

    var canStartReadout: Bool {
        connectorState == .ready
    }

    func startPeripheralScan() {
        exportURL = nil
        coordinator.startPeripheralScan()
    }

    func selectPeripheral(_ peripheral: BLEPeripheralCandidate) {
        selectedPeripheralID = peripheral.id
        coordinator.selectPeripheral(id: peripheral.id)
    }

    func connectSelectedPeripheral() {
        coordinator.connectSelectedPeripheral()
    }

    func configureReadCharacteristics() {
        guard let transmitChoice, let receiveChoice else { return }
        coordinator.configureReadCharacteristics(
            transmit: transmitChoice.candidate,
            receive: receiveChoice.candidate
        )
    }

    func beginInitialReadout() {
        exportURL = nil
        coordinator.beginInitialReadout()
    }

    func disconnect() {
        coordinator.disconnect()
    }

    func prepareArchiveExport() {
        do {
            let archive = try coordinator.exportCompletedArchive()
            let encoder = JSONEncoder()
            encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
            let data = try encoder.encode(archive)
            let formatter = ISO8601DateFormatter()
            formatter.formatOptions = [.withInternetDateTime]
            let timestamp = formatter.string(from: Date()).replacingOccurrences(of: ":", with: "-")
            let url = FileManager.default.temporaryDirectory
                .appendingPathComponent("vehicle-readout-\(timestamp).json")
            try data.write(to: url, options: .atomic)
            exportURL = url
        } catch {
            errorMessage = "Archive export failed: \(error.localizedDescription)"
        }
    }

    private var transmitChoice: CharacteristicChoice? {
        characteristicChoices.first(where: { $0.id == selectedTransmitID && ($0.candidate.supportsWrite || $0.candidate.supportsWriteWithoutResponse) })
    }

    private var receiveChoice: CharacteristicChoice? {
        characteristicChoices.first(where: { $0.id == selectedReceiveID && $0.candidate.supportsNotify })
    }

    private func refresh() {
        connectorState = coordinator.connectorState
        peripherals = coordinator.peripherals
        characteristicChoices = coordinator.characteristicCandidates.map(CharacteristicChoice.init(candidate:))
        archiveRecordCount = coordinator.completedArchive?.envelopes.count ?? 0
        archiveState = coordinator.completedArchive == nil ? "Incomplete" : "Complete"
        errorMessage = coordinator.archiveError.map { "Archive validation error: \($0)" }
            ?? coordinator.connectorError.map { "Transport error: \($0)" }

        if let selectedPeripheralID, !peripherals.contains(where: { $0.id == selectedPeripheralID }) {
            self.selectedPeripheralID = nil
        }
        if !characteristicChoices.contains(where: { $0.id == selectedTransmitID }) {
            selectedTransmitID = ""
        }
        if !characteristicChoices.contains(where: { $0.id == selectedReceiveID }) {
            selectedReceiveID = ""
        }
    }
}
