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
    @Published private(set) var readoutPreview = NativeConnectorReadoutPreview.empty
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

    var peripheralScanStatusLabel: String {
        switch connectorState {
        case .scanning:
            return "BLE GATT機器を12秒間検索中"
        case .scanComplete where peripherals.isEmpty:
            return "BLE機器を検出できません。ELM327 miniがBluetooth Classic専用の場合、このiPhone経路では使用できません"
        case .scanComplete:
            return "BLE探索を完了しました。検出した機器を選択してください"
        default:
            return "未検索"
        }
    }

    var canConfigure: Bool {
        connectorState == .discovering && transmitChoice != nil && receiveChoice != nil
    }

    var canStartReadout: Bool {
        connectorState == .ready
    }

    var transmitCharacteristicChoices: [CharacteristicChoice] {
        Self.transmitCharacteristicCandidates(from: coordinator.characteristicCandidates).map(CharacteristicChoice.init(candidate:))
    }

    var receiveCharacteristicChoices: [CharacteristicChoice] {
        Self.receiveCharacteristicCandidates(from: coordinator.characteristicCandidates).map(CharacteristicChoice.init(candidate:))
    }

    var archiveStateLabel: String {
        switch archiveState {
        case "Complete": return "完了"
        case "Partial": return "一部未取得"
        case "Interrupted": return "中断済み"
        default: return "未完了"
        }
    }

    var canExportArchive: Bool {
        archiveState == "Complete" || archiveState == "Partial" || archiveState == "Interrupted"
    }

    var readoutCompletionLabel: String {
        guard let archive = coordinator.completedArchive else { return "完了待ち" }
        let summary = Self.readoutCompletion(expectedReadoutIDs: archive.completionManifest.expectedReadouts, envelopes: archive.envelopes)
        return "予定 \(summary.expectedCount) / 取得 \(summary.capturedCount) / 未取得 \(summary.missingIDs.count)"
    }

    var readoutProfileLabel: String {
        Self.readoutProfileLabel(for: coordinator.completedArchive?.completionManifest.readoutProfile)
    }

    static func readoutProfileLabel(for profile: NativeConnectorReadoutProfile?) -> String {
        switch profile {
        case .initialDiagnostic: return "初期診断読取"
        case .quickCondition: return "クイック状態確認"
        case nil: return "未記録"
        }
    }

    var missingReadoutLabels: [String] {
        guard let archive = coordinator.completedArchive else { return [] }
        return Self.readoutCompletion(expectedReadoutIDs: archive.completionManifest.expectedReadouts, envelopes: archive.envelopes)
            .missingIDs
            .map { readoutLabel(intent: $0, readoutID: $0) }
    }

    var reportedReadoutScopeLabel: String {
        guard let archive = coordinator.completedArchive else { return "完了待ち" }
        return Self.readoutScopeSummary(Self.observedReadoutScopes(archive.envelopes))
    }

    var captureRangeLabel: String {
        guard let archive = coordinator.completedArchive else { return "未取得" }
        return Self.captureRangeSummary(capturedAtValues: archive.envelopes.map(\.capturedAt))
    }

    static func archiveState(for scanState: NativeConnectorScanState?, hasReadoutFailures: Bool = false) -> String {
        switch scanState {
        case .completed where hasReadoutFailures: return "Partial"
        case .completed: return "Complete"
        case .interrupted: return "Interrupted"
        case nil: return "Incomplete"
        }
    }

    static func readoutCompletion(expectedReadoutIDs: [String], envelopes: [NativeConnectorEnvelope]) -> (expectedCount: Int, capturedCount: Int, missingIDs: [String]) {
        let expectedIDs = Set(expectedReadoutIDs.filter { !$0.isEmpty })
        let capturedIDs = Set(NativeConnectorReadoutPreview.effectiveReadoutEnvelopes(from: envelopes).compactMap { envelope -> String? in
            guard envelope.ok, envelope.errors.isEmpty, !envelope.blocked, !envelope.wouldTransmit, let readoutID = envelope.readoutID, expectedIDs.contains(readoutID) else { return nil }
            return readoutID
        })
        let missingIDs = expectedIDs.subtracting(capturedIDs).sorted()
        return (expectedIDs.count, capturedIDs.count, missingIDs)
    }

    static func observedReadoutScopes(_ envelopes: [NativeConnectorEnvelope]) -> [NativeConnectorReadoutScope] {
        let scopes = Set(NativeConnectorReadoutPreview.effectiveReadoutEnvelopes(from: envelopes).compactMap { envelope -> NativeConnectorReadoutScope? in
            guard envelope.ok, envelope.errors.isEmpty, !envelope.blocked, !envelope.wouldTransmit,
                  let readoutID = envelope.readoutID,
                  let scopeID = envelope.readoutScopeID,
                  !scopeID.isEmpty
            else { return nil }
            return NativeConnectorReadoutScope(readoutID: readoutID, scopeID: scopeID)
        })
        return scopes.sorted { lhs, rhs in
            lhs.scopeID == rhs.scopeID ? lhs.readoutID < rhs.readoutID : lhs.scopeID < rhs.scopeID
        }
    }

    static func readoutScopeSummary(_ scopes: [NativeConnectorReadoutScope]) -> String {
        let scopeIDs = Set(scopes.map(\.scopeID).filter { !$0.isEmpty }).sorted()
        guard !scopeIDs.isEmpty else { return "ECUスコープ未取得" }
        return "\(scopeIDs.count) ECU / \(scopeIDs.joined(separator: " / "))"
    }

    static func captureRangeSummary(capturedAtValues: [String]) -> String {
        let captures = capturedAtValues.compactMap { value -> (value: String, date: Date)? in
            guard let date = parseCaptureDate(value) else { return nil }
            return (value, date)
        }.sorted { $0.date < $1.date }
        guard let first = captures.first, let last = captures.last else { return "未取得" }
        guard first.date != last.date else { return first.value }
        let spanSeconds = max(0, Int(last.date.timeIntervalSince(first.date).rounded()))
        return "\(first.value) -> \(last.value) / \(spanSeconds)秒"
    }

    private static func parseCaptureDate(_ value: String) -> Date? {
        let standard = ISO8601DateFormatter()
        if let date = standard.date(from: value) { return date }
        let fractional = ISO8601DateFormatter()
        fractional.formatOptions.insert(.withFractionalSeconds)
        return fractional.date(from: value)
    }

    func readoutLabel(intent: String, readoutID: String?) -> String {
        switch readoutID ?? intent {
        case "adapter_identity": return "アダプター識別"
        case "stored_dtc_snapshot": return "保存DTC"
        case "pending_dtc_snapshot": return "保留DTC"
        case "permanent_dtc_snapshot": return "永久DTC"
        case "freeze_frame_snapshot": return "フリーズフレーム"
        case "supported_pid_matrix": return "対応PID"
        case "readiness_snapshot": return "レディネス"
        case "ecu_info_snapshot": return "ECU情報"
        case "onboard_monitor_snapshot": return "Mode 06"
        case "live_pid_snapshot": return "ライブデータ"
        default: return readoutID ?? intent
        }
    }

    func readoutFailureLabel(_ errorCode: String) -> String {
        switch errorCode {
        case "readout_not_available": return "ECU応答なしまたは未対応"
        case "adapter_setup_failed": return "ELM327初期化応答を確認できないため、読取前に中断しました"
        case "vehicle_link_error": return "車両ECUとの通信を確立できないため、以降の読取を中断しました"
        case "transport_failure": return "アダプターまたは車両通信の異常を検出したため、中断しました"
        case "response_timeout": return "応答待機時間切れ"
        case "write_capacity_timeout": return "アダプター送信待機時間切れ"
        case "write_failed": return "アダプター送信失敗"
        case "freeze_frame_unsupported": return "フリーズフレーム未対応"
        case "negative_response": return "ECUが読取要求を受け付けませんでした"
        case "malformed_response": return "応答形式を安全に解釈できませんでした"
        default: return errorCode
        }
    }

    var connectorStateLabel: String {
        switch connectorState {
        case .idle: return "未接続"
        case .scanning: return "検索中"
        case .scanComplete: return "検索完了"
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
        let transmitCandidates = transmitCharacteristicCandidates(from: candidates)
        let receiveCandidates = receiveCharacteristicCandidates(from: candidates)
        guard transmitCandidates.count == 1, receiveCandidates.count == 1 else { return nil }
        guard transmitCandidates[0].serviceUUID == receiveCandidates[0].serviceUUID else { return nil }
        return (
            "\(transmitCandidates[0].serviceUUID)/\(transmitCandidates[0].characteristicUUID)",
            "\(receiveCandidates[0].serviceUUID)/\(receiveCandidates[0].characteristicUUID)"
        )
    }

    static func transmitCharacteristicCandidates(from candidates: [BLECharacteristicCandidate]) -> [BLECharacteristicCandidate] {
        candidates.filter { $0.supportsWrite || $0.supportsWriteWithoutResponse }
    }

    static func receiveCharacteristicCandidates(from candidates: [BLECharacteristicCandidate]) -> [BLECharacteristicCandidate] {
        candidates.filter(\.supportsNotify)
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
        guard canStartReadout else { return }
        exportURL = nil
        coordinator.beginInitialReadout()
    }

    func beginQuickReadout() {
        guard canStartReadout else { return }
        exportURL = nil
        coordinator.beginQuickReadout()
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
        readoutPreview = coordinator.readoutPreview
        archiveState = Self.archiveState(
            for: coordinator.completedArchive?.completionManifest.scanState,
            hasReadoutFailures: !readoutPreview.readoutFailures.isEmpty
        )
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
        case .connectionTimeout: return "Bluetooth接続、サービス探索、または通知設定が時間内に完了しなかったため中断しました。"
        case .writeCapacityTimeout: return "アダプターが読取要求を送信できる状態にならなかったため、中断しました。"
        case .writeFailed: return "アダプターが読取要求を受け付けなかったため、中断しました。"
        case .responseTimeout: return "車両またはアダプターからの応答が時間内に届きませんでした。"
        case .disconnected: return "アダプターとの接続が切断されました。"
        case .invalidResponse: return "アダプター応答を安全に解釈できませんでした。"
        }
    }

    func archiveErrorMessage(_ error: NativeConnectorScanArchiveError) -> String {
        switch error {
        case .tooManyEnvelopes:
            return "読取結果が安全な保存上限の\(NativeConnectorScanArchiveBuilder.maximumEnvelopeCount)件を超えたため、中断しました。"
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
