import Combine
import Foundation
import ELM327BLEConnector

@MainActor
final class NativeConnectorHostModel: ObservableObject {
    @Published private(set) var state: ELMConnectorState = .idle
    @Published private(set) var peripherals: [BLEPeripheralCandidate] = []
    @Published private(set) var characteristicCandidates: [BLECharacteristicCandidate] = []
    @Published private(set) var completedArchive: NativeConnectorScanArchive?
    @Published private(set) var statusMessage = "BLEアダプターの読取準備ができています。"
    @Published var selectedPeripheralID: UUID?
    @Published var transmitKey = ""
    @Published var receiveKey = ""

    private let coordinator = NativeConnectorReadoutCoordinator()

    init() {
        coordinator.didUpdate = { [weak self] in
            Task { @MainActor [weak self] in self?.refresh() }
        }
        refresh()
    }

    func startScan() {
        statusMessage = "BLEアダプターを検索しています。"
        coordinator.startPeripheralScan()
    }

    func selectPeripheral(_ peripheral: BLEPeripheralCandidate) {
        selectedPeripheralID = peripheral.id
        coordinator.selectPeripheral(id: peripheral.id)
        statusMessage = "\(peripheral.displayName) を選択しました。"
    }

    func connectSelectedPeripheral() {
        coordinator.connectSelectedPeripheral()
        statusMessage = "選択したアダプターへ接続しています。"
    }

    func configureSelectedCharacteristics() {
        guard let transmit = characteristicCandidates.first(where: { characteristicKey($0) == transmitKey }),
              let receive = characteristicCandidates.first(where: { characteristicKey($0) == receiveKey })
        else {
            statusMessage = "送信用と通知用の特性を1つずつ選択してください。"
            return
        }
        coordinator.configureReadCharacteristics(transmit: transmit, receive: receive)
        statusMessage = "通知登録を確認しています。"
    }

    func beginInitialReadout() {
        completedArchive = nil
        coordinator.beginInitialReadout()
        statusMessage = "固定の読取専用診断を実行しています。"
    }

    func disconnect() {
        coordinator.disconnect()
        statusMessage = "切断しました。"
    }

    func exportDocument() throws -> NativeConnectorArchiveDocument {
        try NativeConnectorArchiveDocument(archive: coordinator.exportCompletedArchive())
    }

    func characteristicKey(_ candidate: BLECharacteristicCandidate) -> String {
        "\(candidate.serviceUUID)|\(candidate.characteristicUUID)"
    }

    func characteristicLabel(_ candidate: BLECharacteristicCandidate) -> String {
        "\(candidate.serviceUUID) / \(candidate.characteristicUUID)"
    }

    private func refresh() {
        state = coordinator.connectorState
        peripherals = coordinator.peripherals
        characteristicCandidates = coordinator.characteristicCandidates
        completedArchive = coordinator.completedArchive
        if let error = coordinator.archiveError {
            statusMessage = "アーカイブ検証で拒否されました: \(String(describing: error))。"
        } else if let error = coordinator.connectorError {
            statusMessage = "読取を停止しました: \(String(describing: error))。"
        } else if completedArchive != nil {
            statusMessage = "読取専用アーカイブが完成しました。診断画面へ取込むため端末内に保存してください。"
        }
        if transmitKey.isEmpty, let candidate = characteristicCandidates.first(where: { $0.supportsWrite || $0.supportsWriteWithoutResponse }) {
            transmitKey = characteristicKey(candidate)
        }
        if receiveKey.isEmpty, let candidate = characteristicCandidates.first(where: { $0.supportsNotify }) {
            receiveKey = characteristicKey(candidate)
        }
    }
}
