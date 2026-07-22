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

    var connectorStateLabel: String {
        switch connectorState {
        case .idle: return "未接続"
        case .scanning: return "検索中"
        case .selected: return "選択済み"
        case .connecting: return "接続中"
        case .discovering: return "通信特性を確認中"
        case .subscribing: return "応答受信を準備中"
        case .ready: return "読取準備完了"
        case .awaitingWriteCapacity: return "アダプター送信待機中"
        case .awaitingPrompt: return "車両応答を待機中"
        case .interrupted: return "中断"
        }
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
        archiveRecordCount = coordinator.capturedEnvelopeCount
        archiveState = coordinator.completedArchive == nil ? "Incomplete" : "Complete"
        errorMessage = coordinator.archiveError.map { self.archiveErrorMessage($0) }
            ?? coordinator.connectorError.map { self.connectorErrorMessage($0) }

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

    private func connectorErrorMessage(_ error: ELMConnectorError) -> String {
        switch error {
        case .bluetoothUnavailable: return "Bluetoothを有効にし、このアプリの使用許可を確認してください。"
        case .invalidState: return "前の通信処理が完了してから、もう一度操作してください。"
        case .peripheralNotSelected: return "読取に使うBLEアダプターを選択してください。"
        case .characteristicNotReady: return "送信・受信の通信特性を確認してから読取を開始してください。"
        case .responseTooLarge: return "アダプター応答が上限を超えたため、安全に読取を中断しました。"
        case .writeCapacityTimeout: return "アダプターが読取要求を送信できる状態にならなかったため、中断しました。"
        case .writeFailed: return "アダプターが読取要求を受け付けなかったため、中断しました。"
        case .responseTimeout: return "車両またはアダプターからの応答が時間内に届きませんでした。"
        case .disconnected: return "アダプターとの接続が切断されました。"
        case .invalidResponse: return "アダプター応答を安全に解釈できませんでした。"
        }
    }

    private func archiveErrorMessage(_ error: NativeConnectorScanArchiveError) -> String {
        switch error {
        case .tooManyEnvelopes:
            return "読取結果が安全な保存上限の256件を超えたため、中断しました。"
        case .scanNotStarted:
            return "完了した読取結果がないため、アーカイブを作成できません。"
        case .scanAlreadyCompleted:
            return "完了済みの読取アーカイブには追加できません。"
        case .invalidEnvelope, .unsafeEnvelope, .mixedScanBoundary, .invalidSequence:
            return "一貫性を確認できない読取結果を受け取ったため、保存しませんでした。"
        case .invalidManifest, .manifestBoundaryMismatch:
            return "読取完了情報を検証できなかったため、保存しませんでした。"
        }
    }
}
