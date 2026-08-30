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
                    LabeledContent("読取種別", value: viewModel.readoutProfileLabel)
                    LabeledContent("車両通信", value: viewModel.vehicleCommunicationStatusLabel)
                    LabeledContent("読取範囲", value: viewModel.readoutCompletionLabel)
                    LabeledContent("ECU応答範囲", value: viewModel.reportedReadoutScopeLabel)
                    LabeledContent("読取時刻範囲", value: viewModel.captureRangeLabel)
                    if !viewModel.missingReadoutLabels.isEmpty {
                        Text("未取得: \(viewModel.missingReadoutLabels.joined(separator: " / "))")
                            .font(.footnote)
                            .foregroundStyle(.secondary)
                    }
                    if let errorMessage = viewModel.errorMessage {
                        Text(errorMessage)
                            .foregroundStyle(.red)
                    }
                }

                Section("1. BLEアダプター") {
                    Text("iPhoneではBLE GATT対応のELM327だけを使います。Bluetooth Classic専用のELM327 miniはこの経路では使えません。")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                    Text("名称や広告サービスだけではELM327適合を確定しません。接続後のGATT特性とATI応答まで確認します。")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                    Text(viewModel.peripheralScanStatusLabel)
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                    Button("近くのアダプターを検索") {
                        viewModel.startPeripheralScan()
                    }
                    ForEach(viewModel.peripherals) { peripheral in
                        Button {
                            viewModel.selectPeripheral(peripheral)
                        } label: {
                            VStack(alignment: .leading, spacing: 4) {
                                HStack {
                                    Text(peripheral.displayName.isEmpty ? "名称未取得のアダプター" : peripheral.displayName)
                                    Spacer()
                                    if viewModel.selectedPeripheralID == peripheral.id {
                                        Image(systemName: "checkmark")
                                    }
                                }
                                Text(ReadoutCoordinatorViewModel.peripheralDetailLabel(peripheral))
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
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
                    LabeledContent("GATT候補") {
                        Text(viewModel.characteristicCompatibilityLabel)
                            .multilineTextAlignment(.trailing)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    Picker("送信", selection: $viewModel.selectedTransmitID) {
                        Text("選択してください").tag("")
                        ForEach(viewModel.transmitCharacteristicChoices) { choice in
                            Text(choice.label).tag(choice.id)
                        }
                    }
                    Picker("受信", selection: $viewModel.selectedReceiveID) {
                        Text("選択してください").tag("")
                        ForEach(viewModel.receiveCharacteristicChoices) { choice in
                            Text(choice.label).tag(choice.id)
                        }
                    }
                    Button("読取用の通信特性を確定") {
                        viewModel.configureReadCharacteristics()
                    }
                    .disabled(!viewModel.canConfigure)
                }

                Section("3. アダプター確認") {
                    Text("ATコマンド応答と現在のアダプター設定だけを確認します。車両へのOBD要求は送らず、車両適合やECU通信成立は判定しません。")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                    LabeledContent("確認結果", value: viewModel.adapterPreflightStatusLabel)
                    Button("アダプターのみ確認") {
                        viewModel.beginAdapterPreflight()
                    }
                    .disabled(!viewModel.canStartReadout)
                }

                Section("4. 読取専用スキャン") {
                    Text("DTC、フリーズフレーム、レディネス、ECU情報、対応PID、標準PIDを読取ります。消去、アクティブテスト、書込みは送信しません。")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                    Button("初回読取を開始") {
                        viewModel.beginInitialReadout()
                    }
                    .disabled(!viewModel.canStartReadout)
                    Button("クイック読取") {
                        viewModel.beginQuickReadout()
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

                if !viewModel.readoutPreview.emptyReadouts.isEmpty {
                    Section("読取済み・空結果") {
                        ForEach(viewModel.readoutPreview.emptyReadouts) { readout in
                            LabeledContent(
                                viewModel.readoutLabel(intent: readout.intent, readoutID: readout.readoutID),
                                value: "0件 / \(readout.sourceScopeID)"
                            )
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

                if !viewModel.readoutPreview.liveTextValues.isEmpty {
                    Section("ライブ状態") {
                        ForEach(viewModel.readoutPreview.liveTextValues) { value in
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

                if !viewModel.readoutPreview.freezeFrameTextValues.isEmpty {
                    Section("フリーズフレーム状態") {
                        ForEach(viewModel.readoutPreview.freezeFrameTextValues) { value in
                            LabeledContent("\(value.monitorID) / PID \(value.pid)", value: "\(value.displayValue) / \(value.sourceScopeID)")
                        }
                    }
                }

                if !viewModel.readoutPreview.freezeFrameTriggerDTCs.isEmpty {
                    Section("フリーズフレーム発生DTC") {
                        ForEach(viewModel.readoutPreview.freezeFrameTriggerDTCs) { dtc in
                            LabeledContent(dtc.code, value: dtc.sourceScopeID)
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

                if !viewModel.readoutPreview.onboardMonitors.isEmpty {
                    Section("Mode 06 監視結果") {
                        ForEach(viewModel.readoutPreview.onboardMonitors) { monitor in
                            LabeledContent("TID \(monitor.testID) / CID \(monitor.componentID) / \(monitor.sourceScopeID)", value: monitor.displayRange)
                        }
                    }
                }

                if !viewModel.readoutPreview.supportedPIDs.isEmpty {
                    Section("対応PID") {
                        ForEach(viewModel.readoutPreview.supportedPIDs) { supported in
                            DisclosureGroup("ECU \(supported.sourceScopeID) / \(supported.pids.count)項目") {
                                Text(supported.pids.joined(separator: ", "))
                                    .font(.footnote)
                                    .textSelection(.enabled)
                            }
                        }
                    }
                }

                if !viewModel.readoutPreview.readoutFailures.isEmpty {
                    Section("取得できなかった項目") {
                        ForEach(viewModel.readoutPreview.readoutFailures) { failure in
                            LabeledContent(
                                viewModel.readoutLabel(intent: failure.intent, readoutID: failure.readoutID),
                                value: failure.errorCodes.map { viewModel.readoutFailureLabel($0) }.joined(separator: " / ")
                            )
                        }
                    }
                }

                Section("5. 読取結果") {
                    Button("検証済みJSONを作成") {
                        viewModel.prepareArchiveExport()
                    }
                    .disabled(!viewModel.canExportArchive)
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
