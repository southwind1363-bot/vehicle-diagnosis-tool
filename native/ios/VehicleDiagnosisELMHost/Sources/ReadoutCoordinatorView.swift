import SwiftUI

struct ReadoutCoordinatorView: View {
    @ObservedObject var viewModel: ReadoutCoordinatorViewModel

    var body: some View {
        NavigationStack {
            Form {
                Section("読取状態") {
                    LabeledContent("接続", value: viewModel.connectorStateLabel)
                    LabeledContent("アーカイブ", value: viewModel.archiveStateLabel)
                    LabeledContent("取得済みレコード", value: "\(viewModel.archiveRecordCount)")
                    if let errorMessage = viewModel.errorMessage {
                        Text(errorMessage)
                            .foregroundStyle(.red)
                    }
                }

                Section("1. BLEアダプター") {
                    Text("iPhoneではBLE GATT対応のELM327だけを使います。Bluetooth Classic専用のELM327 miniはこの経路では使えません。")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                    Button("近くのアダプターを検索") {
                        viewModel.startPeripheralScan()
                    }
                    ForEach(viewModel.peripherals) { peripheral in
                        Button {
                            viewModel.selectPeripheral(peripheral)
                        } label: {
                            HStack {
                                Text(peripheral.displayName.isEmpty ? "名称未取得のアダプター" : peripheral.displayName)
                                Spacer()
                                if viewModel.selectedPeripheralID == peripheral.id {
                                    Image(systemName: "checkmark")
                                }
                            }
                        }
                    }
                    Button("選択したアダプターへ接続") {
                        viewModel.connectSelectedPeripheral()
                    }
                    .disabled(!viewModel.canConnect)
                }

                Section("2. 通信特性") {
                    Text("接続後に、要求送信用の書込み特性と応答受信用の通知特性を選択します。")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                    Picker("送信", selection: $viewModel.selectedTransmitID) {
                        Text("選択してください").tag("")
                        ForEach(viewModel.characteristicChoices) { choice in
                            Text(choice.label).tag(choice.id)
                        }
                    }
                    Picker("受信", selection: $viewModel.selectedReceiveID) {
                        Text("選択してください").tag("")
                        ForEach(viewModel.characteristicChoices) { choice in
                            Text(choice.label).tag(choice.id)
                        }
                    }
                    Button("読取用の通信特性を確定") {
                        viewModel.configureReadCharacteristics()
                    }
                    .disabled(!viewModel.canConfigure)
                }

                Section("3. 読取専用スキャン") {
                    Text("DTC、フリーズフレーム、レディネス、ECU情報、対応PID、標準PIDを読取ります。消去、アクティブテスト、書込みは送信しません。")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                    Button("初回読取を開始") {
                        viewModel.beginInitialReadout()
                    }
                    .disabled(!viewModel.canStartReadout)
                    Button("切断", role: .destructive) {
                        viewModel.disconnect()
                    }
                }

                if !viewModel.readoutPreview.storedDTCs.isEmpty || !viewModel.readoutPreview.pendingDTCs.isEmpty || !viewModel.readoutPreview.permanentDTCs.isEmpty {
                    Section("故障コード") {
                        ForEach(viewModel.readoutPreview.storedDTCs) { dtc in
                            LabeledContent(dtc.code, value: "保存 / \(dtc.sourceScopeID)")
                        }
                        ForEach(viewModel.readoutPreview.pendingDTCs) { dtc in
                            LabeledContent(dtc.code, value: "保留 / \(dtc.sourceScopeID)")
                        }
                        ForEach(viewModel.readoutPreview.permanentDTCs) { dtc in
                            LabeledContent(dtc.code, value: "永久 / \(dtc.sourceScopeID)")
                        }
                    }
                }

                if !viewModel.readoutPreview.liveValues.isEmpty {
                    Section("ライブデータ") {
                        ForEach(viewModel.readoutPreview.liveValues) { value in
                            LabeledContent("\(value.monitorID) / PID \(value.pid)", value: "\(value.displayValue) / \(value.sourceScopeID)")
                        }
                    }
                }

                if !viewModel.readoutPreview.freezeFrameValues.isEmpty {
                    Section("フリーズフレーム") {
                        ForEach(viewModel.readoutPreview.freezeFrameValues) { value in
                            LabeledContent("\(value.monitorID) / PID \(value.pid)", value: "\(value.displayValue) / \(value.sourceScopeID)")
                        }
                    }
                }

                if !viewModel.readoutPreview.readiness.isEmpty {
                    Section("レディネス") {
                        ForEach(viewModel.readoutPreview.readiness) { readiness in
                            LabeledContent("ECU \(readiness.sourceScopeID)", value: readiness.milOn ? "MIL ON / DTC \(readiness.dtcCount)" : "MIL OFF / DTC \(readiness.dtcCount)")
                            Text("対応モニター \(readiness.supportedMonitorCount)件 / 未完了 \(readiness.incompleteMonitorCount)件 / \(readiness.ignitionType)")
                                .font(.footnote)
                                .foregroundStyle(.secondary)
                        }
                    }
                }

                if !viewModel.readoutPreview.ecuInfo.isEmpty {
                    Section("ECU情報") {
                        ForEach(viewModel.readoutPreview.ecuInfo) { info in
                            LabeledContent("\(info.infoID) / \(info.sourceScopeID)", value: info.value)
                            if !info.infoType.isEmpty {
                                Text("情報タイプ \(info.infoType)")
                                    .font(.footnote)
                                    .foregroundStyle(.secondary)
                            }
                        }
                    }
                }

                Section("4. 読取結果") {
                    Button("検証済みJSONを作成") {
                        viewModel.prepareArchiveExport()
                    }
                    .disabled(viewModel.archiveState != "Complete")
                    if let exportURL = viewModel.exportURL {
                        ShareLink(item: exportURL) {
                            Label("JSONを共有", systemImage: "square.and.arrow.up")
                        }
                    }
                }
            }
            .navigationTitle("車両読取")
        }
    }
}
