import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync(new URL("../script.js", import.meta.url), "utf8");
const extract = (name) => source.match(new RegExp(`function ${name}\\([^)]*\\) \\{[\\s\\S]*?\\r?\\n\\}`))?.[0] || assert.fail(`Missing ${name}`);
let checks = 0;
const check = (condition, message) => { assert.ok(condition, message); checks += 1; };
const context = vm.createContext({ NO_DATA: "未記録" });
vm.runInContext(["formatObdOnboardMonitorTestLine", "buildObdOnboardMonitorDisplayLines", "formatObdBridgeOnboardMonitorSummary",
  "formatObdBridgeReadoutValue", "formatObdBridgeCompositeValue", "formatObdReadoutStatus"].map(extract).join("\n"), context);
for (const [status, label] of [["pass", "合格"], ["fail", "不合格"], ["unknown", "未判定"], [null, "未判定"],
  [undefined, "未判定"], ["", "未判定"], ["PASS", "未判定 (PASS)"], ["<img src=x>", "未判定 (<img src=x>)"]]) {
  for (const passed of [true, false, null]) {
    const item = { testId: "01", componentId: "02", sourceEcu: "7E8", value: 30, min: 0, max: 10, status, passed };
    const before = JSON.stringify(item);
    check(context.formatObdOnboardMonitorTestLine(item) === `[7E8] TID 01 / CID 02: 記録値 30 / 下限 0 / 上限 10 / 記録判定: ${label}`,
      "Display inferred a test status from passed flag or recalculated limits");
    check(JSON.stringify(item) === before, "Test line display mutated the recorded result");
  }
}
for (const [item, expected] of [
  [{ tid: 0, cid: 0, source_ecu: "7E9", value: 0, min: 0, max: 0, unit: "V", status: "pass" }, "[7E9] TID 0 / CID 0: 記録値 0 V / 下限 0 V / 上限 0 V / 記録判定: 合格"],
  [{ value: -40, min: -50, max: null }, "[ECU未記録] TID 未記録 / CID 未記録: 記録値 -40 / 下限 -50 / 上限 未記録 / 記録判定: 未判定"],
  [{ value: null, min: null, max: undefined }, "[ECU未記録] TID 未記録 / CID 未記録: 記録値 未記録 / 下限 未記録 / 上限 未記録 / 記録判定: 未判定"],
  [{ sourceEcu: "<ECU>", value: "<value>" }, "[<ECU>] TID 未記録 / CID 未記録: 記録値 <value> / 下限 未記録 / 上限 未記録 / 記録判定: 未判定"]
]) check(context.formatObdOnboardMonitorTestLine(item) === expected, "Display lost zero, limits, unknown fields or literal text");
for (const empty of [null, {}, { tests: [] }]) check(context.buildObdOnboardMonitorDisplayLines(empty).length === 0, "Empty readout fabricated results");
const tests = Array.from({ length: 9 }, (_, i) => ({ testId: "01", componentId: String(i), sourceEcu: i % 2 ? "7E9" : "7E8", value: i, status: "unknown" }));
for (const key of ["onboardMonitorEcuSnapshots", "onboard_monitor_ecu_snapshots"]) {
  const snapshot = { tests, testCount: 9, unknownCount: 9, [key]: [
    { sourceEcu: "7E8", onboardMonitorReadoutStatus: "reported" },
    { source_ecu: "7E9", onboard_monitor_readout_status: "unparsed" },
    { sourceEcu: "7EA", onboardMonitorReadoutStatus: "blocked" }
  ] };
  const before = JSON.stringify(snapshot);
  const lines = context.buildObdOnboardMonitorDisplayLines(snapshot);
  check(tests.every((test) => lines.includes(context.formatObdOnboardMonitorTestLine(test))), "Mode06 results were truncated");
  check(lines.includes("7E8: 取得済み") && lines.includes("7E9: 応答未解析") && lines.includes("7EA: 読取拒否"), "ECU readout states were hidden");
  check(lines.at(-1).includes("車種別の整備書") && lines.at(-1).includes("車両全体"), "Interpretation boundary was lost");
  check(JSON.stringify(snapshot) === before, "Display changed the snapshot");
}
check(context.formatObdBridgeOnboardMonitorSummary({ testCount: 3, passedCount: 1, failedCount: 1, unknownCount: 1 })
  === "3件 / 合格1 / 不合格1 / 未判定1", "Summary inferred failure means an out-of-range value");
check(source.includes('onboard_monitor_test_failed: "Mode06に不合格の記録あり"') && !source.includes('onboard_monitor_test_failed: "Mode06で範囲外あり"'), "Failure warning inferred a limit comparison from a recorded failure");
for (const status of ["reported", "blocked", "unparsed", "unknown"]) {
  const summary = { testCount: 3, passedCount: 1, failedCount: 1, unknownCount: 1, tests: [], sourceEcu: "7E8", onboardMonitorReadoutStatus: status };
  const before = JSON.stringify(summary);
  const lines = context.buildObdOnboardMonitorDisplayLines(summary);
  check(lines[0] === "記録された集計（検査明細なし）: 3件 / 合格1 / 不合格1 / 未判定1", "Count-only evidence was hidden or presented as measured tests");
  check(lines.includes("検査明細: 登録データなし") && !lines.some((line) => line.includes("記録値")), "Count-only evidence fabricated test values");
  check(lines.includes(`7E8: ${context.formatObdReadoutStatus(status)}`), "Count-only evidence lost readout disposition");
  check(JSON.stringify(summary) === before, "Count-only display changed stored counts");
}
const mixed = { tests: [tests[0]], testCount: 1, unknownCount: 1, onboardMonitorEcuSnapshots: [
  { sourceEcu: "7E8", tests: [tests[0]], testCount: 1, unknownCount: 1, onboardMonitorReadoutStatus: "reported" },
  { sourceEcu: "7E9", tests: [], testCount: 2, failedCount: 2, onboardMonitorReadoutStatus: "reported" }
] };
const mixedLines = context.buildObdOnboardMonitorDisplayLines(mixed);
check(mixedLines.includes("7E9: 記録された集計（検査明細なし）: 2件 / 不合格2") && mixedLines.includes(context.formatObdOnboardMonitorTestLine(tests[0])), "Mixed detail/summary ECU results were hidden or combined");
check(!mixedLines.some((line) => line.startsWith("7E8: 記録された集計")), "Measured ECU was mislabeled as summary-only");
const coreContext = vm.createContext({ window: {} });
vm.runInContext(fs.readFileSync(new URL("../obd-readonly.js", import.meta.url), "utf8"), coreContext);
const obd = coreContext.window.ObdReadOnly;
const snapshot = obd.normalizeBridgeOnboardMonitorSnapshot({ ok: true, blocked: false, would_transmit: false, data: { ecu_snapshots: [
  { source_ecu: "7E8", tests: [{ test_id: "01", component_id: "01", value: 0, min: 0, max: 10 }] },
  { source_ecu: "7E9", tests: [{ test_id: "01", component_id: "01", value: 20, status: "unknown" }] },
  { source_ecu: "7EA", onboard_monitor_readout_status: "blocked", tests: [] }
] } });
const session = obd.buildDiagnosticScanSession({ onboardMonitorSnapshot: snapshot });
const before = JSON.stringify(session);
const exportSession = () => JSON.stringify(obd.buildBridgeSessionExportPayload({ ...session, exportedAt: "2026-08-28T00:00:00.000Z" }));
const beforeExport = exportSession();
const lines = context.buildObdOnboardMonitorDisplayLines(session.onboardMonitorSnapshot);
check(lines.some((line) => line.startsWith("[7E8] TID 01 / CID 01:") && line.endsWith("記録判定: 合格")), "Normalized passing test was lost");
check(lines.some((line) => line.startsWith("[7E9] TID 01 / CID 01:") && line.endsWith("記録判定: 未判定")), "Unknown test became a failure due to passed:false");
check(lines.includes("7EA: 読取拒否"), "Blocked ECU missing from normalized display");
check(JSON.stringify(session) === before && exportSession() === beforeExport, "Mode06 display changed diagnostic data or export");
for (const input of [
  { testCount: 3, passedCount: 1, failedCount: 1, unknownCount: 1 },
  { failedCount: 1, tests: [{ testId: "01", componentId: "01", value: null, status: "fail" }] }
]) {
  const originalSession = obd.buildDiagnosticScanSession({ onboardMonitorSnapshot: input });
  const imported = obd.buildDiagnosticScanSessionFromJson(JSON.stringify(obd.buildBridgeSessionExportPayload(originalSession)));
  const before = JSON.stringify(imported);
  const importedLines = context.buildObdOnboardMonitorDisplayLines(imported.onboardMonitorSnapshot);
  check(importedLines[0].startsWith("記録された集計（検査明細なし）:"), "Reimported count-only result was not distinguished from test detail");
  check(imported.onboardMonitorSnapshot.tests.length === 0 && !importedLines.some((line) => line.includes("記録値")), "Missing measurement was fabricated during display");
  check(JSON.stringify(imported) === before, "Imported session changed during summary presentation");
}
const details = extract("renderObdBridgeSessionDetails");
check(details.includes("buildObdOnboardMonitorDisplayLines(onboardMonitorSnapshot)") && details.includes('sections.push(["Mode06", monitorLines])'), "Detailed view does not use full Mode06 display");
check(details.includes("item.textContent = line;"), "Mode06 must render literal text");
console.log(`Mode06 display checks: ${checks} / Errors: 0`);
