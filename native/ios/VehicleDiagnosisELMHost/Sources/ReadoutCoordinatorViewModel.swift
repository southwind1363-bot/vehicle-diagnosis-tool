import Combine
import Foundation
import ELM327BLEConnector

@MainActor
final class ReadoutCoordinatorViewModel: ObservableObject {
    struct CharacteristicChoice: Identifiable {
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

    var archiveStateLabel: String {
        archiveState == "Complete" ? "完了" : "未完了"
    }

    static func suggestedCharacteristicIDs(from candidates: [BLECharacteristicCandidate]) -> (transmitID: String, receiveID: String)? {
        let transmitCandidates = candidates.filter { $0.supportsWrite || $0.supportsWriteWithoutResponse }
        let receiveCandidates = candidates.filter(\.supportsNotify)
        guard transmitCandidates.count == 1, receiveCandidates.count == 1 else { return nil }
        return (
            "\(transmitCandidates[0].serviceUUID)/\(transmitCandidates[0].characteristicUUID)",
            "\(receiveCandidates[0].serviceUUID)/\(receiveCandidates[0].characteristicUUID)"
        )
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
            let url = FileManager.default.temporaryDirectory
                .appendingPathComponent(archive.suggestedExportFilename)
            let data = try archive.jsonData()
            try data.write(to: url, options: .atomic)
            exportURL = url
        } catch {
            errorMessage = "読取アーカイブを作成できませんでした: \(error.localizedDescription)"
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
        errorMessage = coordinator.archiveError.map { "読取アーカイブの検証エラー: \($0)" }
            ?? coordinator.connectorError.map { "通信エラー: \($0)" }

        if let selectedPeripheralID, !peripherals.contains(where: { $0.id == selectedPeripheralID }) {
            self.selectedPeripheralID = nil
        }
        if !characteristicChoices.contains(where: { $0.id == selectedTransmitID }) {
            selectedTransmitID = ""
        }
        if !characteristicChoices.contains(where: { $0.id == selectedReceiveID }) {
            selectedReceiveID = ""
        }
        if let suggested = Self.suggestedCharacteristicIDs(from: coordinator.characteristicCandidates) {
            if selectedTransmitID.isEmpty { selectedTransmitID = suggested.transmitID }
            if selectedReceiveID.isEmpty { selectedReceiveID = suggested.receiveID }
        }
    }
}
