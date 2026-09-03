import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync(new URL("../script.js", import.meta.url), "utf8");
const coreSource = fs.readFileSync(new URL("../obd-readonly.js", import.meta.url), "utf8");
const context = vm.createContext({ window: {}, navigator: {} });
vm.runInContext(coreSource, context);
let checks = 0;
const check = (condition, message) => { assert.ok(condition, message); checks += 1; };
const element = () => ({ children: [], append(...items) { this.children.push(...items); }, appendChild(item) { this.children.push(item); } });
context.document = { createElement: element };
context.obdOperationGrid = element();
for (const name of ["getObdOperationImplementationStatus", "renderObdOperationPlan"]) {
  const match = source.match(new RegExp(`function ${name}\\([^)]*\\) \\{[\\s\\S]*?\\r?\\n\\}`));
  assert.ok(match, `Missing ${name}`);
  vm.runInContext(match[0], context);
}
const api = context.window.ObdReadOnly;
const items = api.getVehicleOperationPlan();
const before = JSON.stringify(items);
context.renderObdOperationPlan(items);
check(context.obdOperationGrid.children.length === 7, "Operation list lost a supported operation");
for (const [index, item] of items.entries()) {
  const card = context.obdOperationGrid.children[index];
  const badge = card.children[0].children[1];
  const button = card.children.at(-1);
  const expected = item.commandClass === "state-changing"
    ? "実行通信未実装" : "PC ELM327実装済み・実機確認待ち";
  check(badge.textContent === expected && button.textContent === expected, `${item.id}: misleading implementation status`);
  check(button.disabled === true, `${item.id}: informational status enabled execution`);
  if (item.commandClass === "state-changing") {
    check(card.children[2].textContent.includes("実車送信なし"), `${item.id}: safety boundary disappeared`);
    const evidence = Object.fromEntries(api.getServiceOperationReadinessRequirements(item.id).map((check) => [check.evidenceKey, true]));
    check(api.buildServiceOperationReadiness(item.id, evidence).canExecute === false, `${item.id}: complete checklist enabled execution`);
  }
}
check(JSON.stringify(items) === before, "Rendering changed the operation contract");
const changing = items.find((item) => item.commandClass === "state-changing");
for (const value of [true, undefined, "false"]) {
  context.window.ObdReadOnly = { getServiceExperimentContract: () => ({ executionTransportImplemented: value }) };
  check(context.getObdOperationImplementationStatus(changing) === "実行未開放", "Unverified transport status implied operation availability");
}
context.window.ObdReadOnly = undefined;
check(context.getObdOperationImplementationStatus(changing) === "実行未開放", "Missing module implied operation availability");
check(context.getObdOperationImplementationStatus({ id: "future", commandClass: "read" }) === "準備状況未確認", "Unknown operation inherited ELM support");
check(!source.includes("安全検証が終わるまで車両への送信は無効にしています。"), "Blanket transmission claim contradicts existing Web Serial readout");
const display = vm.createContext({
  obdDevSession: {}, obdSerialConnectPending: false, obdSerialDisconnectOperation: null,
  obdVehicleInput: { value: "Test vehicle" }, getSelectedObdInterfaceLabel: () => "Test VCI",
  resolveObdInterfaceId: () => "user-vci-elm327", getObdInterfaceReadoutRoute: () => ({ route: "native_connector_required" }),
  obdScanVehicleValue: {}, obdScanInterfaceValue: {}, obdScanConnectionValue: {},
  obdSimpleConnectVehicle: {}, obdSimpleConnectInterface: {}, obdSimpleConnectRoute: {}, obdSimpleConnectInstruction: {},
  obdBridgeOperation: null, ensureObdVehicleSelection: () => true,
  window: { ObdReadOnly: { getVehicleInterfaceCatalog: () => [] } },
  obdDevStatus: {}, clearRequestedInterfaceSelection: () => {}, renderObdDeveloperGate: () => {}
});
for (const name of ["getObdSimpleConnectionLabel", "renderObdSimpleScannerContext", "getObdNativeConnectionPreparationNote", "prepareSelectedObdInterface"]) {
  vm.runInContext(source.match(new RegExp(`function ${name}\\([^)]*\\) \\{[\\s\\S]*?\\r?\\n\\}`))[0], display);
}
for (const [session, pending, ending, label] of [
  [{ connectionState: "disconnected" }, false, null, "未接続"],
  [{ connectionState: "selecting" }, true, null, "機器選択中"],
  [{ connectionState: "opening" }, true, null, "接続中"],
  [{ connectionState: "initializing", port: {}, initializing: true }, true, null, "初期化中"],
  [{ connectionState: "ready", port: {} }, false, null, "接続済み"],
  [{ connectionState: "reading", port: {} }, false, null, "読取中"],
  [{ connectionState: "ready", port: {}, coreScanInProgress: true }, false, null, "読取中"],
  [{ connectionState: "ready", port: {}, readInProgress: true }, false, null, "読取中"],
  [{ connectionState: "disconnecting", port: {}, coreScanInProgress: true }, false, {}, "終了処理中"],
  [{ connectionState: "disconnecting" }, false, null, "終了処理中"],
  [{ connectionState: "disconnecting" }, false, { cleanupFailed: true }, "終了未確認"],
  [{ connectionState: "initializing", port: {}, initializing: true }, true, { cleanupFailed: true }, "終了未確認"],
  [{ connectionState: "unknown", port: {} }, false, null, "接続状態未確認"],
  [{ connectionState: "ready" }, false, null, "未接続"]
]) {
  display.obdDevSession = { ...session, lastSession: { dtcSnapshot: { codes: ["P0300"] } } };
  display.obdSerialConnectPending = pending;
  display.obdSerialDisconnectOperation = ending;
  const before = JSON.stringify([display.obdDevSession, ending]);
  display.renderObdSimpleScannerContext();
  check(display.obdScanConnectionValue.textContent === label, `Connection display should be ${label}`);
  check(JSON.stringify([display.obdDevSession, ending]) === before, "Connection rendering changed transport/session state");
}
for (const id of ["user-vci-elm327", "user-vci-thinkcar-bluetooth", "future-interface"]) {
  display.resolveObdInterfaceId = () => id;
  const note = display.getObdNativeConnectionPreparationNote(id);
  check(note.includes("検証済み") === (id === "user-vci-elm327"), "Unimplemented native connector inherited ELM validation");
  if (id === "user-vci-thinkcar-bluetooth") check(note.includes("THINKCAR用iPhoneコネクタは未実装") && note.includes("直接通信は開始しません"), "THINKCAR notice hid implementation/transmission limits");
  display.prepareSelectedObdInterface();
  check(display.obdDevStatus.textContent.includes(note), "Preparation action omitted the selected adapter's native status");
  display.renderObdSimpleScannerContext();
  check(display.obdSimpleConnectInstruction.textContent === note, "Connect screen did not show native limitations before action");
}
for (const [route, expected] of [["desktop_web_serial", "COMポート"], ["desktop_local_bridge", "車両通信を開始するものではありません"], ["unconfirmed", "未確認"]]) {
  display.getObdInterfaceReadoutRoute = () => ({ route });
  display.renderObdSimpleScannerContext();
  check(display.obdSimpleConnectInstruction.textContent.includes(expected), "Connection instruction described the wrong route");
}
const gate = source.match(/function renderObdDeveloperGate\([^\n]*\) \{[\s\S]*?\r?\n\}/)[0];
check(gate.split("getObdNativeConnectionPreparationNote(selectedInterfaceId)").length === 3, "Ready/idle gate messages must use adapter-specific native status");
console.log(`Operation availability checks: ${checks} / Errors: 0`);
