import SwiftUI

struct ContentView: View {
    @EnvironmentObject private var model: NativeConnectorHostModel
    @State private var exportDocument: NativeConnectorArchiveDocument?
    @State private var isExporting = false

    var body: some View {
        NavigationStack {
            Form {
                Section("接続") {
                    LabeledContent("状態", value: model.state.rawValue)
                    Text(model.statusMessage)
                        .font(.footnote)
                    HStack {
                        Button("検索") { model.startScan() }
                        Button("切断", role: .destructive) { model.disconnect() }
                    }
                }

                if !model.peripherals.isEmpty {
                    Section("BLEアダプター") {
                        ForEach(model.peripherals) { peripheral in
                            Button {
                                model.selectPeripheral(peripheral)
                            } label: {
                                HStack {
                                    Text(peripheral.displayName)
                                    Spacer()
                                    if model.selectedPeripheralID == peripheral.id { Image(systemName: "checkmark") }
                                }
                            }
                        }
                        Button("選択したアダプターへ接続") { model.connectSelectedPeripheral() }
                            .disabled(model.selectedPeripheralID == nil || model.state != .selected)
                    }
                }

                if !model.characteristicCandidates.isEmpty {
                    Section("BLE通信特性") {
                        Picker("送信", selection: $model.transmitKey) {
                            ForEach(model.characteristicCandidates.indices.filter {
                                let candidate = model.characteristicCandidates[$0]
                                return candidate.supportsWrite || candidate.supportsWriteWithoutResponse
                            }, id: \.self) { index in
                                let candidate = model.characteristicCandidates[index]
                                Text(model.characteristicLabel(candidate)).tag(model.characteristicKey(candidate))
                            }
                        }
                        Picker("通知", selection: $model.receiveKey) {
                            ForEach(model.characteristicCandidates.indices.filter {
                                model.characteristicCandidates[$0].supportsNotify
                            }, id: \.self) { index in
                                let candidate = model.characteristicCandidates[index]
                                Text(model.characteristicLabel(candidate)).tag(model.characteristicKey(candidate))
                            }
                        }
                        Button("通信特性を確認") { model.configureSelectedCharacteristics() }
                            .disabled(model.transmitKey.isEmpty || model.receiveKey.isEmpty || model.state != .discovering)
                    }
                }

                Section("読取専用診断") {
                    Button("診断読取を開始") { model.beginInitialReadout() }
                        .disabled(model.state != .ready)
                    Button("完了アーカイブを保存") {
                        do {
                            exportDocument = try model.exportDocument()
                            isExporting = true
                        } catch {
                            exportDocument = nil
                        }
                    }
                    .disabled(model.completedArchive == nil)
                }
            }
            .navigationTitle("車両診断")
        }
        .fileExporter(
            isPresented: $isExporting,
            document: exportDocument,
            contentType: .json,
            defaultFilename: model.completedArchive?.suggestedExportFilename ?? "vehicle-diagnosis-readout.json"
        ) { _ in
            exportDocument = nil
        }
    }
}
