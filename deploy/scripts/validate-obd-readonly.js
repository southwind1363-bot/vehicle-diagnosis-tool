import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync(new URL("../obd-readonly.js", import.meta.url), "utf8");
const monitorDefinitions = JSON.parse(
  fs.readFileSync(new URL("../data/obd-monitor-definitions.json", import.meta.url), "utf8")
);
const freezeFrameItems = JSON.parse(
  fs.readFileSync(new URL("../data/obd-freeze-frame-items-2026.json", import.meta.url), "utf8")
);
const readinessMonitors = JSON.parse(
  fs.readFileSync(new URL("../data/obd-readiness-monitors-2026.json", import.meta.url), "utf8")
);
const ecuInfoItems = JSON.parse(
  fs.readFileSync(new URL("../data/obd-ecu-info-items-2026.json", import.meta.url), "utf8")
);
const vehicleInterfaceCatalog = JSON.parse(
  fs.readFileSync(new URL("../data/vehicle-interface-catalog-2026.json", import.meta.url), "utf8")
);
const diagnosticCoverageRoadmap = JSON.parse(
  fs.readFileSync(new URL("../data/diagnostic-coverage-roadmap-2026.json", import.meta.url), "utf8")
);
const diagnosticCapabilityStatus = JSON.parse(
  fs.readFileSync(new URL("../data/diagnostic-capability-status-2026.json", import.meta.url), "utf8")
);
const diagnosticWorkflowsPractical = JSON.parse(
  fs.readFileSync(new URL("../data/diagnostic-workflows-practical-2026.json", import.meta.url), "utf8")
);
const context = {
  window: { isSecureContext: true },
  navigator: { serial: {} }
};

vm.createContext(context);
vm.runInContext(source, context);

const obd = context.window.ObdReadOnly;
const failures = [];

function check(condition, message) {
  if (!condition) failures.push(message);
}

check(obd?.policy?.transmitsVehicleCommands === false, "車両コマンド送信が禁止されていません");
check(obd?.policy?.storesRawInput === false, "入力原文の保存が禁止されていません");
check(obd?.policy?.uploadsRawInput === false, "入力原文の外部送信が禁止されていません");
check(obd?.policy?.blockedOperations?.includes("DTC消去"), "DTC消去が禁止一覧にありません");
check(obd?.policy?.hardwareConnectionEnabled === false, "実機接続が安全ゲート外で有効です");
check(obd?.policy?.connectionPreparationEnabled === true, "接続準備レイヤーが無効です");

const analysis = obd.analyzeScannerText("P0171 p0300 JTDKN3DU0A0123456 P0171");
check(analysis.codes.join(",") === "P0171,P0300", "DTC抽出または重複除外が不正です");
check(analysis.hadSensitiveIdentifier === true, "車台番号候補を検出できません");
check(analysis.retainedRawText === false, "入力原文を保持する設定になっています");
check(obd.getCapability().hardwareConnectionEnabled === false, "実機接続が予期せず有効です");
check(obd.getCapability().connectionPreparationEnabled === true, "接続準備状態を取得できません");
check(obd.configureMonitorDefinitions(monitorDefinitions) === true, "外部モニター辞書を読み込めません");
check(obd.getMonitorDefinitions().length >= 130, "データモニター辞書が130項目未満です");
check(obd.getCapability().monitorDefinitionCount === monitorDefinitions.length, "辞書件数を取得できません");
check(obd.configureFreezeFrameItems(freezeFrameItems) === true, "フリーズフレーム項目辞書を読み込めません");
check(obd.getFreezeFrameItems().length >= 12, "フリーズフレーム項目辞書が不足しています");
check(obd.getFreezeFrameItems().some((item) => item.monitorId === "control_module_voltage"), "フリーズフレーム項目に制御モジュール電圧がありません");
check(obd.configureReadinessMonitors(readinessMonitors) === true, "レディネスモニター辞書を読み込めません");
check(obd.getReadinessMonitors().length >= 14, "レディネスモニター辞書が不足しています");
check(obd.getReadinessMonitors().some((item) => item.id === "evaporative_system"), "EVAPレディネスモニターがありません");
check(obd.configureEcuInfoItems(ecuInfoItems) === true, "ECU情報項目辞書を読み込めません");
check(obd.getEcuInfoItems().length >= 7, "ECU情報項目辞書が不足しています");
check(obd.getEcuInfoItems().some((item) => item.id === "calibration_verification_number"), "CVN情報項目がありません");
check(obd.getCapability().freezeFrameItemCount === freezeFrameItems.length, "フリーズフレーム辞書件数を取得できません");
check(obd.getCapability().readinessMonitorCount === readinessMonitors.length, "レディネス辞書件数を取得できません");
check(obd.getCapability().ecuInfoItemCount === ecuInfoItems.length, "ECU情報辞書件数を取得できません");
check(obd.configureVehicleInterfaceCatalog(vehicleInterfaceCatalog) === true, "VCI候補カタログを読み込めません");
const interfaceCatalog = obd.getVehicleInterfaceCatalog();
check(interfaceCatalog.length >= 4, "VCI候補カタログが不足しています");
check(interfaceCatalog.some((item) => item.id === "user-vci-techstream-j2534" && item.interfaceFamily === "j2534-passthru"), "Techstream/J2534候補がありません");
check(interfaceCatalog.some((item) => item.id === "user-vci-elm327" && item.readScopeCandidates.includes("Mode 03 保存DTC")), "ELM327候補の読取範囲が不足しています");
check(interfaceCatalog.some((item) => item.id === "user-vci-rcmall-mks-canable-v2-pro" && item.tooling.includes("SavvyCAN")), "CANable/SavvyCAN候補がありません");
check(interfaceCatalog.every((item) => item.connectionEnabled === false && item.vehicleCommandEnabled === false), "VCI候補で通信または車両コマンドが有効です");
check(interfaceCatalog.every((item) => Array.isArray(item.verificationRequired) && item.verificationRequired.length >= 4), "VCI候補の検証条件が不足しています");
check(diagnosticCoverageRoadmap.length >= 6, "診断データ網羅ロードマップが不足しています");
check(diagnosticCoverageRoadmap.some((item) => item.id === "coverage-body-b" && item.current_count_note.includes("0件")), "B系未整備状態がロードマップにありません");
check(diagnosticCoverageRoadmap.some((item) => item.id === "coverage-chassis-c" && item.current_count_note.includes("0件")), "C系未整備状態がロードマップにありません");
check(diagnosticCoverageRoadmap.some((item) => item.id === "coverage-oem-enhanced-dtc" && item.blocked_until.length), "メーカー固有DTCの確認待ち条件が不足しています");
check(diagnosticCapabilityStatus.length >= 6, "診断機能完成度マトリクスが不足しています");
check(diagnosticCapabilityStatus.some((item) => item.id === "capability-bidirectional" && item.progress_percent <= 5), "双方向制御の安全ゲート状態が不足しています");
check(diagnosticCapabilityStatus.some((item) => item.id === "capability-local-bridge" && item.missing.includes("実際のローカルブリッジアプリ")), "ローカルブリッジ未実装状態が不足しています");
check(diagnosticCapabilityStatus.every((item) => item.safety_gate), "診断機能完成度に安全ゲートがありません");
check(diagnosticWorkflowsPractical.length >= 7, "実用診断フローが不足しています");
check(diagnosticWorkflowsPractical.some((item) => item.id === "workflow-evap-leak-p0440-p0456" && item.monitor_ids.includes("commanded_evap_purge")), "EVAP診断フローにパージ指令PIDがありません");
check(diagnosticWorkflowsPractical.some((item) => item.id === "workflow-egr-flow-p0401-p0402" && item.monitor_ids.includes("commanded_egr")), "EGR診断フローにEGR指令PIDがありません");
check(diagnosticWorkflowsPractical.some((item) => item.id === "workflow-power-supply-p0560-p0563" && item.monitor_ids.includes("control_module_voltage")), "電源診断フローに制御モジュール電圧PIDがありません");
check(diagnosticWorkflowsPractical.every((item) => item.service_manual_required === true), "実用診断フローに整備書確認必須がありません");
const operationPlan = obd.getVehicleOperationPlan();
check(operationPlan.length >= 4, "接続後機能の準備計画が不足しています");
check(operationPlan.some((item) => item.id === "read_dtc"), "DTC読取準備がありません");
check(operationPlan.some((item) => item.id === "clear_dtc" && item.commandClass === "state-changing"), "DTC消去の安全ゲート定義がありません");
const blockedClear = obd.requestVehicleOperation("clear_dtc");
check(blockedClear.ok === false && blockedClear.blocked === true, "DTC消去が安全ゲートで拒否されていません");
const connectionProfile = obd.getVehicleConnectionProfile();
check(connectionProfile.transportEnabled === false, "通信トランスポートが安全ゲート外で有効です");
check(connectionProfile.failClosed === true, "通信トランスポートが失敗時安全停止になっていません");
check(connectionProfile.baudRateCandidates.includes(38400), "通信速度候補が不足しています");
const interlock = obd.getVehicleDamagePreventionInterlock();
check(interlock.failClosed === true, "車両破損防止ゲートが失敗時安全停止になっていません");
check(interlock.outboundTransportEnabled === false, "アウトバウンド送信が安全ゲート外で有効です");
check(interlock.allowsPhysicalVehicleCommands === false, "実車コマンドが許可されています");
check(interlock.defaultDecision === "block", "安全ゲートの既定動作が拒否ではありません");
check(interlock.blockedServiceModes.includes("04"), "DTC消去サービスが遮断対象にありません");
check(interlock.blockedServiceModes.includes("2F"), "入出力制御サービスが遮断対象にありません");
check(interlock.preEnableChecklist.length >= 6, "有効化前チェックリストが不足しています");
const preparedRequests = obd.getPreparedVehicleRequests();
check(preparedRequests.length >= 7, "通信準備リクエストが不足しています");
check(preparedRequests.some((item) => item.id === "read_stored_dtc" && item.service === "03"), "保存DTC読取の準備がありません");
check(preparedRequests.some((item) => item.id === "monitor_supported_pids" && item.service === "01"), "対応PID確認の準備がありません");
check(preparedRequests.some((item) => item.id === "clear_dtc_request" && item.service === "04" && item.stateChanging), "DTC消去要求の安全ゲート準備がありません");
const blockedPreparedClear = obd.requestPreparedVehicleRequest("clear_dtc_request");
check(blockedPreparedClear.ok === false && blockedPreparedClear.blocked === true && blockedPreparedClear.wouldTransmit === false && blockedPreparedClear.failClosed === true, "DTC消去要求が送信不可で拒否されていません");
const blockedPreparedRead = obd.requestPreparedVehicleRequest("read_stored_dtc");
check(blockedPreparedRead.ok === false && blockedPreparedRead.blocked === true && blockedPreparedRead.wouldTransmit === false, "DTC読取要求が安全ゲートで停止していません");
const interfaceRoadmap = obd.getAdvancedInterfaceRoadmap();
check(interfaceRoadmap.length >= 6, "高度インターフェースの準備順が不足しています");
check(interfaceRoadmap[0].id === "web_serial_obd", "最初の段階がWeb Serialではありません");
check(interfaceRoadmap.some((item) => item.id === "local_bridge" && item.requiresLocalBridge === true), "ローカルブリッジ段階がありません");
check(interfaceRoadmap.some((item) => item.id === "j2534_passthru" && item.requiresLocalBridge === true), "J2534段階がありません");
check(interfaceRoadmap.some((item) => item.id === "uds_canfd"), "UDS/CAN FD段階がありません");
check(interfaceRoadmap.some((item) => item.id === "doip"), "DoIP段階がありません");
check(interfaceRoadmap.every((item) => item.vehicleCommandEnabled === false), "高度インターフェースで実車コマンドが有効です");
const blockedJ2534 = obd.requestAdvancedInterface("j2534_passthru");
check(blockedJ2534.ok === false && blockedJ2534.blocked === true && blockedJ2534.wouldTransmit === false, "J2534準備要求が安全に拒否されていません");
const bridgeContract = obd.getLocalBridgeContract();
check(bridgeContract.connectionEnabled === false, "ローカルブリッジ接続が有効になっています");
check(bridgeContract.vehicleCommandEnabled === false, "ローカルブリッジ経由の実車コマンドが有効です");
check(bridgeContract.requiresPairingToken === true, "ローカルブリッジのペアリング条件が不足しています");
check(bridgeContract.allowedReadIntents.includes("read_stored_dtc"), "保存DTC読取Intentがありません");
check(bridgeContract.blockedWriteIntents.includes("clear_dtc"), "DTC消去Intentが遮断対象にありません");
check(bridgeContract.logPolicy.storeRawFrames === false, "ローカルブリッジ契約が生フレーム保存を許可しています");
const blockedBridgeRead = obd.evaluateLocalBridgeRequest({ request_id: "test", api_version: "v1", intent: "read_stored_dtc", timestamp: "2026-06-28T00:00:00Z", pairing_token: "dummy" });
check(blockedBridgeRead.blocked === true && blockedBridgeRead.wouldTransmit === false && blockedBridgeRead.knownReadIntent === true, "ローカルブリッジ読取Intentが安全に停止していません");
const blockedBridgeClear = obd.evaluateLocalBridgeRequest({ request_id: "test", api_version: "v1", intent: "clear_dtc", timestamp: "2026-06-28T00:00:00Z", pairing_token: "dummy" });
check(blockedBridgeClear.blocked === true && blockedBridgeClear.wouldTransmit === false && blockedBridgeClear.blockedWriteIntent === true, "ローカルブリッジ変更系Intentが安全に停止していません");
const bridgeSchemas = obd.getLocalBridgeResponseSchemas();
check(bridgeSchemas.length >= 5, "ローカルブリッジ応答型が不足しています");
check(bridgeSchemas.some((item) => item.intent === "bridge_status" && item.safeDefault.status === "not_connected"), "ブリッジ状態の安全な既定値がありません");
check(bridgeSchemas.some((item) => item.intent === "read_live_pid_snapshot" && Array.isArray(item.safeDefault.values)), "ライブPID応答型がありません");
const bridgeStatus = obd.normalizeBridgeConnectionStatus({
  ok: true,
  blocked: false,
  would_transmit: false,
  data: {
    bridge_version: "0.1.0",
    api_version: "v1",
    status: "ready",
    paired: true,
    vci_connected: true,
    vehicle_connected: true
  }
});
check(bridgeStatus.displayStatus === "読取準備モデル", "ブリッジ接続状態の表示モデルが不正です");
check(bridgeStatus.connectionEnabled === false, "ブリッジ接続状態モデルが接続有効になっています");
check(bridgeStatus.vehicleCommandEnabled === false, "ブリッジ接続状態モデルが車両コマンド有効になっています");
check(bridgeStatus.retainedRawText === false, "ブリッジ接続状態モデルが原文保持になっています");
const bridgeVciList = obd.normalizeBridgeVciList({
  ok: true,
  blocked: false,
  would_transmit: false,
  data: {
    driver_status: "installed",
    selected_device_id: "vci-1",
    devices: [
      { id: "vci-1", label: "Sample VCI", vendor: "Example", serial_number: "SHOULD_NOT_EXPORT", connected: true }
    ]
  }
});
check(bridgeVciList.deviceCount === 1, "VCI一覧の表示モデル件数が不正です");
check(bridgeVciList.devices[0].selected === true, "VCI一覧の選択状態が不正です");
check(!("serial_number" in bridgeVciList.devices[0]), "VCI一覧が生識別子を保持しています");
check(bridgeVciList.connectionEnabled === false && bridgeVciList.vehicleCommandEnabled === false, "VCI一覧モデルが通信有効になっています");
const blockedBridgeResponse = obd.createLocalBridgeBlockedResponse("read_stored_dtc");
check(blockedBridgeResponse.ok === false && blockedBridgeResponse.blocked === true && blockedBridgeResponse.would_transmit === false, "ブリッジ遮断レスポンスが安全側ではありません");
check(Array.isArray(blockedBridgeResponse.data.dtcs) && blockedBridgeResponse.data.dtcs.length === 0, "遮断時DTCレスポンスが空データになっていません");
const bridgeDtcSnapshot = obd.normalizeBridgeDtcSnapshot({
  ok: true,
  blocked: false,
  would_transmit: false,
  data: {
    protocol: "ISO15765-4",
    ecu_responses: [{ ecu: "7E8", status: "ok", dtcs: ["P0171"] }],
    dtcs: [{ code: "P0171" }, { dtc: "P0300" }, "p0171"],
    captured_at: "2026-06-28T00:00:00Z"
  }
});
check(bridgeDtcSnapshot.codes.join(",") === "P0171,P0300", "ブリッジDTC応答を既存DTC配列へ変換できません");
check(bridgeDtcSnapshot.retainedRawText === false, "ブリッジDTC変換が原文保持になっています");
check(bridgeDtcSnapshot.wouldTransmit === false, "ブリッジDTC変換が送信済み扱いになっています");
const outboundRead = obd.evaluateOutboundSafety({ service: "03", stateChanging: false });
check(outboundRead.blocked === true && outboundRead.wouldTransmit === false && outboundRead.failClosed === true, "読取系アウトバウンドが安全ゲートで停止していません");
const outboundClear = obd.evaluateOutboundSafety({ service: "04", stateChanging: true });
check(outboundClear.blocked === true && outboundClear.wouldTransmit === false && outboundClear.stateChanging === true, "状態変更アウトバウンドが安全ゲートで停止していません");

const monitorAnalysis = obd.analyzeScannerText([
  "Engine RPM: 780 rpm",
  "冷却水温：88 C",
  "STFT B1: -3.1 %",
  "Control Module Voltage: 14.2 V",
  "Fuel System Status: Closed loop",
  "DPF Status: Regeneration active",
  "Unknown Value: 99"
].join("\n"));
check(monitorAnalysis.monitorValues.length === 6, "対応モニター値の抽出件数が不正です");
check(monitorAnalysis.monitorValues.find((item) => item.id === "engine_speed")?.value === 780, "エンジン回転数を抽出できません");
check(monitorAnalysis.monitorValues.find((item) => item.id === "coolant_temp")?.unit === "°C", "冷却水温の単位が不正です");
check(monitorAnalysis.monitorValues.find((item) => item.id === "stft_b1")?.value === -3.1, "負の燃料補正値を抽出できません");
check(monitorAnalysis.monitorValues.find((item) => item.id === "fuel_system_status")?.value === "Closed loop", "文字状態値を抽出できません");
check(monitorAnalysis.monitorValues.find((item) => item.id === "dpf_status")?.value === "Regeneration active", "後処理状態を抽出できません");
check(!monitorAnalysis.monitorValues.some((item) => item.id === "unknown"), "未定義値を取り込んでいます");
check(monitorAnalysis.retainedRawText === false, "モニター入力原文を保持する設定になっています");

const bridgePidSnapshot = obd.normalizeBridgeLivePidSnapshot({
  ok: true,
  blocked: false,
  would_transmit: false,
  data: {
    protocol: "ISO15765-4",
    supported_pids: ["0C", "05"],
    values: [
      { id: "engine_speed", value: 760, unit: "rpm" },
      { pid: "05", value: 88, unit: "°C" },
      { id: "fuel_system_status", value: "Closed loop" },
      { id: "unknown_pid", value: "not-a-number" }
    ],
    captured_at: "2026-06-28T00:01:00Z"
  }
});
check(bridgePidSnapshot.monitorValues.length === 3, "ブリッジPID応答の整形件数が不正です");
check(bridgePidSnapshot.monitorValues.find((item) => item.id === "engine_speed")?.value === 760, "ブリッジ回転数を整形できません");
check(bridgePidSnapshot.monitorValues.find((item) => item.id === "coolant_temp")?.value === 88, "ブリッジPIDから辞書項目へ紐付けできません");
check(bridgePidSnapshot.monitorValues.find((item) => item.id === "fuel_system_status")?.value === "Closed loop", "ブリッジ文字PIDを整形できません");
check(bridgePidSnapshot.monitorInsights.length > 0, "ブリッジPIDから相関ヒントを生成できません");
check(bridgePidSnapshot.retainedRawText === false, "ブリッジPID変換が原文保持になっています");
const bridgeSummary = obd.buildBridgeSessionSummary({ dtcSnapshot: bridgeDtcSnapshot, livePidSnapshot: bridgePidSnapshot });
check(bridgeSummary.codes.join(",") === "P0171,P0300", "ブリッジセッション要約へDTCを引き継げません");
check(bridgeSummary.monitorValues.length === 3, "ブリッジセッション要約へPID値を引き継げません");
check(bridgeSummary.connectionStatus.displayStatus === "未接続", "ブリッジセッション要約の接続状態が不正です");
check(Array.isArray(bridgeSummary.vciDevices) && bridgeSummary.vciDevices.length === 0, "ブリッジセッション要約のVCI初期値が不正です");
check(bridgeSummary.exportRequired === true, "ブリッジセッション要約がエクスポート前提ではありません");
check(bridgeSummary.retainedRawText === false, "ブリッジセッション要約が原文保持になっています");
const bridgeExportPayload = obd.buildBridgeSessionExportPayload({
  connectionStatus: bridgeStatus,
  vciList: bridgeVciList,
  dtcSnapshot: bridgeDtcSnapshot,
  livePidSnapshot: bridgePidSnapshot,
  exportedAt: "2026-06-28T00:02:00Z"
});
check(bridgeExportPayload.schema_version === "bridge_session_export_v1", "ブリッジエクスポート形式のバージョンが不正です");
check(bridgeExportPayload.connection_enabled === false, "ブリッジエクスポートが接続有効になっています");
check(bridgeExportPayload.vehicle_command_enabled === false, "ブリッジエクスポートが車両コマンド有効になっています");
check(bridgeExportPayload.retained_raw_frames === false && bridgeExportPayload.retained_raw_text === false, "ブリッジエクスポートが原文保持になっています");
check(bridgeExportPayload.session.dtc_codes.join(",") === "P0171,P0300", "ブリッジエクスポートへDTCを引き継げません");
check(bridgeExportPayload.session.monitor_values.length === 3, "ブリッジエクスポートへPID値を引き継げません");
check(bridgeExportPayload.safety.blocked_write_intents.includes("clear_dtc"), "ブリッジエクスポートの安全メタ情報が不足しています");
const bridgeDiagnosticImport = obd.buildBridgeDiagnosticImport({
  connectionStatus: bridgeStatus,
  vciList: bridgeVciList,
  dtcSnapshot: bridgeDtcSnapshot,
  livePidSnapshot: bridgePidSnapshot
});
check(bridgeDiagnosticImport.importType === "bridge_diagnostic_snapshot", "ブリッジ診断取込の種別が不正です");
check(bridgeDiagnosticImport.codes.join(",") === "P0171,P0300", "ブリッジ診断取込へDTCを引き継げません");
check(bridgeDiagnosticImport.monitorValues.length === 3, "ブリッジ診断取込へPID値を引き継げません");
check(bridgeDiagnosticImport.monitorInsights.length > 0, "ブリッジ診断取込へ相関ヒントを引き継げません");
check(bridgeDiagnosticImport.bridgeSession.vciDevices.length === 1, "ブリッジ診断取込へVCI表示モデルを引き継げません");
check(bridgeDiagnosticImport.exportPayload.schema_version === "bridge_session_export_v1", "ブリッジ診断取込のエクスポート形式が不正です");
check(bridgeDiagnosticImport.hadSensitiveIdentifier === false, "ブリッジ診断取込が識別情報検出扱いになっています");
check(bridgeDiagnosticImport.retainedRawText === false, "ブリッジ診断取込が原文保持になっています");
check(bridgeDiagnosticImport.wouldTransmit === false && bridgeDiagnosticImport.vehicleCommandEnabled === false, "ブリッジ診断取込が送信可能扱いになっています");
const mergedDiagnosticInput = obd.mergeDiagnosticInputs({
  scannerText: [
    "P0171 JTDKN3DU0A0123456",
    "Engine RPM: 650 rpm",
    "Control Module Voltage: 12.1 V"
  ].join("\n"),
  bridgeImport: bridgeDiagnosticImport
});
check(mergedDiagnosticInput.importType === "combined_diagnostic_inputs", "統合診断入力の種別が不正です");
check(mergedDiagnosticInput.codes.join(",") === "P0171,P0300", "統合診断入力でDTCを重複除外できません");
check(mergedDiagnosticInput.monitorValues.find((item) => item.id === "engine_speed")?.source === "local_bridge", "統合診断入力でブリッジ値を優先できません");
check(mergedDiagnosticInput.monitorValues.find((item) => item.id === "control_module_voltage")?.source === "scanner_text", "統合診断入力で貼り付け値を保持できません");
check(mergedDiagnosticInput.monitorInsights.length > 0, "統合診断入力の相関ヒントがありません");
check(mergedDiagnosticInput.bridgeSession.vciDevices.length === 1, "統合診断入力にブリッジセッションがありません");
check(mergedDiagnosticInput.bridgeExportPayload.schema_version === "bridge_session_export_v1", "統合診断入力にブリッジエクスポートがありません");
check(mergedDiagnosticInput.hadSensitiveIdentifier === true, "統合診断入力が貼り付け側の識別情報候補を引き継げません");
check(mergedDiagnosticInput.retainedRawText === false, "統合診断入力が原文保持になっています");
check(mergedDiagnosticInput.wouldTransmit === false && mergedDiagnosticInput.vehicleCommandEnabled === false, "統合診断入力が送信可能扱いになっています");
const decodedStoredDtc = obd.decodeObdDtcResponse({ raw: "43 01 71 03 00 00 00", protocol: "ISO15765-4" });
check(decodedStoredDtc.codes.join(",") === "P0171,P0300", "OBD保存DTC応答をDTCコードへデコードできません");
check(decodedStoredDtc.retainedRawText === false, "OBD DTCデコードが原文保持になっています");
const decodedPendingDtc = obd.decodeObdDtcResponse({ raw: "47 01 71 00 00" });
const decodedPermanentDtc = obd.decodeObdDtcResponse({ raw: "4A 03 00 00 00" });
check(decodedPendingDtc.dtcs.find((item) => item.code === "P0171")?.status === "pending", "保留DTC種別を保持できません");
check(decodedPermanentDtc.dtcs.find((item) => item.code === "P0300")?.status === "permanent", "永久DTC種別を保持できません");
const mergedDtcSnapshot = obd.mergeDtcSnapshots(decodedStoredDtc, decodedPendingDtc, decodedPermanentDtc);
check(mergedDtcSnapshot.dtcs.some((item) => item.code === "P0171" && item.status === "stored"), "保存DTCを統合できません");
check(mergedDtcSnapshot.dtcs.some((item) => item.code === "P0171" && item.status === "pending"), "保留DTCを統合できません");
check(mergedDtcSnapshot.dtcs.some((item) => item.code === "P0300" && item.status === "permanent"), "永久DTCを統合できません");
const decodedSupportedPids = obd.decodeSupportedPidResponse({ raw: "41 00 18 18 00 00" });
check(decodedSupportedPids.supportedPids.includes("04") && decodedSupportedPids.supportedPids.includes("0C"), "対応PIDビットマップをデコードできません");
check(decodedSupportedPids.supportedCount >= 4, "対応PIDマトリクスへ対応状態を反映できません");
const decodedLivePids = obd.decodeLivePidResponse({ raw: "41 01 82 07 22 00 41 03 01 00 41 12 02 41 13 31 41 1D 55 41 1E 01 41 1C 06 41 51 04 41 14 80 90 41 34 80 00 7F 00 41 0C 1A F8 41 05 7B 41 0D 28 41 42 34 98 41 11 80 41 21 01 F4 41 22 03 E8 41 23 00 C8 41 2F 99 41 32 FF 38 41 3C 13 88 41 43 01 FE 41 44 80 00 41 45 40 41 46 5A 41 52 80 41 5C 64 41 5D 69 80 41 5E 00 C8 41 61 87 41 62 82 41 63 01 F4 41 64 7D 82 87 8C 91 41 69 80 90 41 6A 66 41 6C 99 41 8E 7B" });
check(decodedLivePids.monitorValues.find((item) => item.id === "engine_speed")?.value === 1726, "回転数PIDをデコードできません");
check(decodedLivePids.monitorValues.find((item) => item.id === "coolant_temp")?.value === 83, "冷却水温PIDをデコードできません");
check(decodedLivePids.monitorValues.find((item) => item.id === "vehicle_speed")?.value === 40, "車速PIDをデコードできません");
check(decodedLivePids.monitorValues.find((item) => item.id === "control_module_voltage")?.value === 13.464, "制御モジュール電圧PIDをデコードできません");
check(decodedLivePids.monitorValues.find((item) => item.id === "monitor_status")?.value === "mil_on;dtc_count=2;ignition=spark", "Monitor status PID was not decoded");
check(decodedLivePids.monitorValues.find((item) => item.id === "monitor_status_mil")?.value === "mil_on", "Monitor status MIL value was not decoded");
check(decodedLivePids.monitorValues.find((item) => item.id === "monitor_status_dtc_count")?.value === 2, "Monitor status DTC count was not decoded");
check(decodedLivePids.monitorValues.find((item) => item.id === "monitor_status_ignition_type")?.value === "spark", "Monitor status ignition type was not decoded");
check(decodedLivePids.monitorValues.find((item) => item.id === "fuel_system_status")?.value === "closed_loop_using_oxygen_sensor", "Fuel system status PID was not decoded");
check(decodedLivePids.monitorValues.find((item) => item.id === "secondary_air_status")?.value === "downstream_of_catalytic_converter", "Secondary air status PID was not decoded");
check(decodedLivePids.monitorValues.find((item) => item.id === "oxygen_sensors_present")?.value === "b1s1,b2s1,b2s2", "O2 sensor location PID was not decoded");
check(decodedLivePids.monitorValues.find((item) => item.id === "oxygen_sensors_present_4banks")?.value === "b1s1,b2s1,b3s1,b4s1", "Four-bank O2 sensor location PID was not decoded");
check(decodedLivePids.monitorValues.find((item) => item.id === "auxiliary_input_status")?.value === "pto_active", "Auxiliary input status PID was not decoded");
check(decodedLivePids.monitorValues.find((item) => item.id === "obd_standard")?.value === "eobd", "OBD standard PID was not decoded");
check(decodedLivePids.monitorValues.find((item) => item.id === "fuel_type")?.value === "diesel", "Fuel type PID was not decoded");
check(decodedLivePids.monitorValues.find((item) => item.id === "o2_b1s1_voltage")?.value === 0.64, "O2 sensor voltage PID was not decoded");
check(decodedLivePids.monitorValues.find((item) => item.id === "o2_b1s1_stft")?.value === 12.5, "O2 sensor short trim PID was not decoded");
check(decodedLivePids.monitorValues.find((item) => item.id === "wide_o2_b1s1_current_ratio")?.value === 1, "Wide O2 current-style equivalence ratio PID was not decoded");
check(decodedLivePids.monitorValues.find((item) => item.id === "wide_o2_b1s1_current")?.value === -1, "Wide O2 current PID was not decoded");
check(decodedLivePids.monitorValues.find((item) => item.id === "throttle_position")?.value === 50.196, "Throttle PID was not decoded");
check(decodedLivePids.monitorValues.find((item) => item.id === "distance_with_mil")?.value === 500, "Distance-with-MIL PID was not decoded");
check(decodedLivePids.monitorValues.find((item) => item.id === "fuel_rail_pressure_vacuum")?.value === 79, "Fuel rail pressure vacuum PID was not decoded");
check(decodedLivePids.monitorValues.find((item) => item.id === "fuel_rail_pressure")?.value === 2000, "Fuel rail pressure PID was not decoded");
check(decodedLivePids.monitorValues.find((item) => item.id === "fuel_level")?.value === 60, "Fuel level PID was not decoded");
check(decodedLivePids.monitorValues.find((item) => item.id === "evap_vapor_pressure")?.value === -50, "EVAP vapor pressure PID was not decoded");
check(decodedLivePids.monitorValues.find((item) => item.id === "catalyst_temp_b1s1")?.value === 460, "Catalyst temperature PID was not decoded");
check(decodedLivePids.monitorValues.find((item) => item.id === "absolute_load")?.value === 200, "Absolute load PID was not decoded");
check(decodedLivePids.monitorValues.find((item) => item.id === "commanded_equivalence_ratio")?.value === 1, "Commanded equivalence ratio PID was not decoded");
check(decodedLivePids.monitorValues.find((item) => item.id === "relative_throttle_position")?.value === 25.098, "Relative throttle PID was not decoded");
check(decodedLivePids.monitorValues.find((item) => item.id === "ambient_air_temp")?.value === 50, "Ambient air temperature PID was not decoded");
check(decodedLivePids.monitorValues.find((item) => item.id === "ethanol_percentage")?.value === 50.196, "Ethanol percentage PID was not decoded");
check(decodedLivePids.monitorValues.find((item) => item.id === "engine_oil_temp")?.value === 60, "Engine oil temperature PID was not decoded");
check(decodedLivePids.monitorValues.find((item) => item.id === "fuel_injection_timing")?.value === 1, "Fuel injection timing PID was not decoded");
check(decodedLivePids.monitorValues.find((item) => item.id === "engine_fuel_rate")?.value === 10, "Engine fuel rate PID was not decoded");
check(decodedLivePids.monitorValues.find((item) => item.id === "driver_demand_torque")?.value === 10, "Driver demand torque PID was not decoded");
check(decodedLivePids.monitorValues.find((item) => item.id === "actual_engine_torque")?.value === 5, "Actual engine torque PID was not decoded");
check(decodedLivePids.monitorValues.find((item) => item.id === "engine_reference_torque")?.value === 500, "Engine reference torque PID was not decoded");
check(decodedLivePids.monitorValues.find((item) => item.id === "engine_percent_torque_idle")?.value === 0, "Engine percent torque idle point was not decoded");
check(decodedLivePids.monitorValues.find((item) => item.id === "engine_percent_torque_point1")?.value === 5, "Engine percent torque point 1 was not decoded");
check(decodedLivePids.monitorValues.find((item) => item.id === "engine_percent_torque_point2")?.value === 10, "Engine percent torque point 2 was not decoded");
check(decodedLivePids.monitorValues.find((item) => item.id === "engine_percent_torque_point3")?.value === 15, "Engine percent torque point 3 was not decoded");
check(decodedLivePids.monitorValues.find((item) => item.id === "engine_percent_torque_point4")?.value === 20, "Engine percent torque point 4 was not decoded");
check(decodedLivePids.monitorValues.find((item) => item.id === "commanded_egr_pid69")?.value === 50.196, "PID 69 commanded EGR was not decoded");
check(decodedLivePids.monitorValues.find((item) => item.id === "egr_error_pid69")?.value === 12.5, "PID 69 EGR error was not decoded");
check(decodedLivePids.monitorValues.find((item) => item.id === "commanded_diesel_intake_air_flow")?.value === 40, "Commanded diesel intake air flow PID was not decoded");
check(decodedLivePids.monitorValues.find((item) => item.id === "commanded_throttle_control")?.value === 60, "Commanded throttle control PID was not decoded");
check(decodedLivePids.monitorValues.find((item) => item.id === "engine_friction_torque")?.value === -2, "Engine friction torque PID was not decoded");
check(decodedLivePids.wouldTransmit === false && decodedLivePids.retainedRawText === false, "ライブPIDデコードが送信または原文保持扱いです");
const decodedFreezeFrame = obd.decodeFreezeFrameResponse({ raw: "42 02 00 01 71 42 0C 00 1A F8 42 05 00 7B" });
check(decodedFreezeFrame.triggerDtc === "P0171", "フリーズフレーム応答から起点DTCをデコードできません");
check(decodedFreezeFrame.monitorValues.find((item) => item.id === "engine_speed")?.value === 1726, "フリーズフレーム回転数をデコードできません");
check(decodedFreezeFrame.monitorValues.find((item) => item.id === "coolant_temp")?.value === 83, "フリーズフレーム水温をデコードできません");
check(decodedFreezeFrame.retainedRawText === false, "フリーズフレームデコードが原文保持になっています");
const decodedEcuInfo = obd.decodeEcuInfoResponse({ raw: "49 02 01 4A 54 44 4B 4E 33 44 55 30 41 30 31 32 33 34 35 36 49 04 01 43 41 4C 2D 31 32 33 34 49 0A 01 45 6E 67 69 6E 65 20 45 43 55" });
check(decodedEcuInfo.hadSensitiveIdentifier === true, "Mode 09 VINを識別情報として検出できません");
check(!JSON.stringify(decodedEcuInfo).includes("JTDKN3DU0A0123456"), "Mode 09デコードにVIN生値が残っています");
check(decodedEcuInfo.items.find((item) => item.id === "calibration_id")?.value === "CAL-1234", "Mode 09 CALIDをデコードできません");
check(decodedEcuInfo.items.find((item) => item.id === "ecu_name")?.value === "Engine ECU", "Mode 09 ECU名をデコードできません");
const decodedReadiness = obd.decodeReadinessResponse({ raw: "41 01 81 07 22 00" });
check(decodedReadiness.milOn === true, "レディネス応答からMIL状態を読めません");
check(decodedReadiness.monitors.find((item) => item.id === "catalyst")?.complete === false, "触媒レディネス未完了をデコードできません");
check(decodedReadiness.monitors.find((item) => item.id === "evaporative_system")?.supported === false, "EVAPレディネス対応ビットをデコードできません");
check(decodedReadiness.retainedRawText === false, "レディネスデコードが原文保持になっています");
const decodedOnboardMonitor = obd.decodeOnboardMonitorResponse({ raw: "46 01 01 00 64 00 32 00 C8 46 02 01 01 2C 00 32 00 C8" });
check(decodedOnboardMonitor.schemaVersion === "onboard_monitor_snapshot_v1", "Mode 06 snapshot schema is invalid");
check(decodedOnboardMonitor.testCount === 2, "Mode 06 test count is invalid");
check(decodedOnboardMonitor.tests.find((item) => item.testId === "01" && item.componentId === "01")?.status === "pass", "Mode 06 pass status was not decoded");
check(decodedOnboardMonitor.tests.find((item) => item.testId === "02" && item.componentId === "01")?.status === "fail", "Mode 06 fail status was not decoded");
check(decodedOnboardMonitor.failedCount === 1, "Mode 06 failed count is invalid");
check(decodedOnboardMonitor.retainedRawText === false, "Mode 06 decoder retained raw text");
const decodedScanSession = obd.buildDecodedObdScanSession({
  session_id: "decoded-test",
  storedDtcResponse: { raw: "43 01 71 03 00 00 00" },
  pendingDtcResponse: { raw: "47 01 71 00 00" },
  permanentDtcResponse: { raw: "4A 03 00 00 00" },
  supportedPidResponse: { raw: "41 00 18 18 00 00" },
  livePidResponse: { raw: "41 0C 1A F8 41 05 7B" },
  freezeFrameResponse: { raw: "42 02 00 01 71 42 0C 00 1A F8" },
  readinessResponse: { raw: "41 01 81 07 22 00" },
  onboardMonitorResponse: { raw: "46 01 01 00 64 00 32 00 C8" },
  ecuInfoResponse: { raw: "49 04 01 43 41 4C 2D 31 32 33 34" }
});
check(decodedScanSession.schemaVersion === "scan_session_v1", "デコード済みOBDセッション形式が不正です");
check(decodedScanSession.dtcSnapshot.codes.includes("P0171"), "デコード済みOBDセッションへDTCを統合できません");
check(decodedScanSession.dtcSnapshot.dtcs.some((item) => item.status === "pending"), "デコード済みOBDセッションへ保留DTCを統合できません");
check(decodedScanSession.dtcSnapshot.dtcs.some((item) => item.status === "permanent"), "デコード済みOBDセッションへ永久DTCを統合できません");
check(decodedScanSession.livePidSnapshot.monitorValues.find((item) => item.id === "engine_speed")?.value === 1726, "デコード済みOBDセッションへライブPIDを統合できません");
check(decodedScanSession.freezeFrameSnapshot.triggerDtc === "P0171", "デコード済みOBDセッションへフリーズフレームを統合できません");
check(decodedScanSession.readinessSnapshot.milOn === true, "デコード済みOBDセッションへレディネスを統合できません");
check(decodedScanSession.onboardMonitorSnapshot.testCount === 1, "デコード済みOBDセッションへMode 06を統合できません");
check(decodedScanSession.ecuInfoSnapshot.items.find((item) => item.id === "calibration_id")?.value === "CAL-1234", "デコード済みOBDセッションへECU情報を統合できません");
check(decodedScanSession.wouldTransmit === false && decodedScanSession.retainedRawFrames === false, "デコード済みOBDセッションが送信または生フレーム保持扱いです");
const obdTextLog = [
  ">03",
  "7E8 06 43 01 71 03 00 00 00",
  ">07",
  "7E8 04 47 01 71 00 00",
  ">0A",
  "7E8 04 4A 03 00 00 00",
  ">0100",
  "7E8 06 41 00 18 18 00 00",
  ">0101",
  "7E8 06 41 01 81 07 22 00",
  ">010C",
  "7E8 04 41 0C 1A F8",
  ">0105",
  "7E8 03 41 05 7B",
  ">0202",
  "7E8 05 42 02 00 01 71",
  ">020C",
  "7E8 04 42 0C 00 1A F8",
  ">0601",
  "7E8 09 46 01 01 00 64 00 32 00 C8",
  ">0904",
  "7E8 10 0A 49 04 01 43 41 4C 2D 31 32 33 34"
].join("\n");
const classifiedObdText = obd.classifyObdResponseLines(obdTextLog);
check(classifiedObdText.schemaVersion === "obd_response_line_classification_v1", "OBD log classification schema is invalid");
check(classifiedObdText.bucketCounts.storedDtcResponses === 1, "OBD log stored DTC response was not classified");
check(classifiedObdText.bucketCounts.pendingDtcResponses === 1, "OBD log pending DTC response was not classified");
check(classifiedObdText.bucketCounts.permanentDtcResponses === 1, "OBD log permanent DTC response was not classified");
check(classifiedObdText.bucketCounts.livePidResponses === 2, "OBD log live PID responses were not classified");
check(classifiedObdText.bucketCounts.onboardMonitorResponses === 1, "OBD log Mode 06 response was not classified");
check(classifiedObdText.retainedRawText === false && classifiedObdText.wouldTransmit === false, "OBD log classification retained raw text or allowed transmit");
const textScanSession = obd.buildScanSessionFromObdText(obdTextLog, { session_id: "obd-text-test", protocol: "ISO15765-4" });
check(textScanSession.schemaVersion === "scan_session_v1", "OBD text log was not converted to scan session");
check(textScanSession.importClassification.bucketCounts.freezeFrameResponses === 2, "OBD text scan session did not keep freeze-frame bucket count");
check(textScanSession.dtcSnapshot.dtcs.some((item) => item.code === "P0171" && item.status === "stored"), "OBD text scan session did not include stored DTC");
check(textScanSession.dtcSnapshot.dtcs.some((item) => item.code === "P0171" && item.status === "pending"), "OBD text scan session did not include pending DTC");
check(textScanSession.dtcSnapshot.dtcs.some((item) => item.code === "P0300" && item.status === "permanent"), "OBD text scan session did not include permanent DTC");
check(textScanSession.livePidSnapshot.monitorValues.find((item) => item.id === "engine_speed")?.value === 1726, "OBD text scan session did not decode engine RPM");
check(textScanSession.livePidSnapshot.monitorValues.find((item) => item.id === "coolant_temp")?.value === 83, "OBD text scan session did not decode coolant temperature");
check(textScanSession.freezeFrameSnapshot.triggerDtc === "P0171", "OBD text scan session did not decode freeze-frame trigger DTC");
check(textScanSession.readinessSnapshot.milOn === true, "OBD text scan session did not decode readiness");
check(textScanSession.onboardMonitorSnapshot.tests[0]?.status === "pass", "OBD text scan session did not decode Mode 06");
check(textScanSession.ecuInfoSnapshot.items.find((item) => item.id === "calibration_id")?.value === "CAL-1234", "OBD text scan session did not decode CALID");
check(textScanSession.retainedRawText === false && textScanSession.retainedRawFrames === false && textScanSession.wouldTransmit === false, "OBD text scan session retained raw text/frames or allowed transmit");
const scanSession = obd.buildDiagnosticScanSession({
  session_id: "shop-test-1",
  dtcSnapshot: { dtcs: [{ code: "P0171", status: "stored", ecu: "7E8" }, "P0300"] },
  livePidSnapshot: bridgePidSnapshot,
  freezeFrame: {
    trigger_dtc: "P0171",
    values: [
      { id: "engine_speed", value: 2200, unit: "rpm" },
      { id: "coolant_temp", value: 84, unit: "°C" }
    ]
  },
  readiness: {
    mil_on: true,
    monitors: [
      { id: "catalyst", label: "触媒", supported: true, complete: false },
      { id: "misfire", label: "失火", supported: true, complete: true }
    ]
  },
  onboardMonitor: {
    tests: [
      { test_id: "01", component_id: "01", value: 100, min: 50, max: 200 },
      { test_id: "02", component_id: "01", value: 300, min: 50, max: 200 }
    ]
  },
  ecuInfo: {
    values: [
      { id: "vin", info_type: "02", value: "JTDKN3DU0A0123456" },
      { id: "calibration_id", info_type: "04", value: "CAL-1234" },
      { id: "calibration_verification_number", info_type: "06", value: "CVN-ABCD" },
      { id: "ecu_name", info_type: "0A", value: "Engine ECU" }
    ]
  },
  ecus: [{ ecu: "7E8", status: "ok", dtcs: ["P0171"] }],
  supportedPids: ["0C", "05", "03"]
});
check(scanSession.schemaVersion === "scan_session_v1", "診断機セッション形式が不正です");
check(scanSession.dtcSnapshot.codes.join(",") === "P0171,P0300", "診断機セッションへDTCを統合できません");
check(scanSession.freezeFrameSnapshot.triggerDtc === "P0171", "フリーズフレームの起点DTCを保持できません");
check(scanSession.freezeFrameSnapshot.monitorValues.length === 2, "フリーズフレーム値をPID辞書へ整形できません");
check(scanSession.freezeFrameSnapshot.expectedItemCount === freezeFrameItems.length, "フリーズフレーム期待項目辞書をセッションへ反映できません");
check(scanSession.readinessSnapshot.incompleteCount === 1, "レディネス未完了数を集計できません");
check(scanSession.readinessSnapshot.knownMonitorCount === readinessMonitors.length, "レディネス辞書をセッションへ反映できません");
check(scanSession.readinessSnapshot.monitors.find((item) => item.id === "catalyst")?.diagnosticUse.includes("P0420"), "レディネス診断用途を参照できません");
check(scanSession.onboardMonitorSnapshot.failedCount === 1, "Mode 06 failed count was not reflected into scan session");
check(scanSession.warnings.includes("onboard_monitor_test_failed"), "Mode 06 failed warning was not reflected into scan session");
check(scanSession.ecuInfoSnapshot.expectedItemCount === ecuInfoItems.length, "ECU情報辞書をセッションへ反映できません");
check(scanSession.ecuInfoSnapshot.hadSensitiveIdentifier === true, "VIN候補を識別情報として検出できません");
check(scanSession.ecuInfoSnapshot.items.find((item) => item.id === "vin")?.retainedRawValue === false, "VIN生値を保持しています");
check(!JSON.stringify(scanSession.ecuInfoSnapshot).includes("JTDKN3DU0A0123456"), "ECU情報スナップショットにVIN生値が残っています");
check(scanSession.ecuInfoSnapshot.items.find((item) => item.id === "calibration_id")?.value === "CAL-1234", "CALIDを保持できません");
check(scanSession.ecuResponseSummary.ecus[0].dtcCount === 1, "ECU応答サマリーへDTC件数を反映できません");
check(scanSession.supportedPidMatrix.supportedCount >= 3, "対応PIDマトリクスを作成できません");
check(scanSession.retainedRawFrames === false && scanSession.vehicleCommandEnabled === false && scanSession.wouldTransmit === false, "診断機セッションが送信または生フレーム保持扱いです");

if (failures.length) {
  failures.forEach((failure) => console.error(`ERROR: ${failure}`));
  process.exitCode = 1;
} else {
  console.log("OBD read-only safety checks: 289");
  console.log("Errors: 0");
}
