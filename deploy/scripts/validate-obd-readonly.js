import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync(new URL("../obd-readonly.js", import.meta.url), "utf8");
const monitorDefinitions = JSON.parse(
  fs.readFileSync(new URL("../data/obd-monitor-definitions.json", import.meta.url), "utf8")
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
const blockedBridgeResponse = obd.createLocalBridgeBlockedResponse("read_stored_dtc");
check(blockedBridgeResponse.ok === false && blockedBridgeResponse.blocked === true && blockedBridgeResponse.would_transmit === false, "ブリッジ遮断レスポンスが安全側ではありません");
check(Array.isArray(blockedBridgeResponse.data.dtcs) && blockedBridgeResponse.data.dtcs.length === 0, "遮断時DTCレスポンスが空データになっていません");
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

if (failures.length) {
  failures.forEach((failure) => console.error(`ERROR: ${failure}`));
  process.exitCode = 1;
} else {
  console.log("OBD read-only safety checks: 70");
  console.log("Errors: 0");
}
