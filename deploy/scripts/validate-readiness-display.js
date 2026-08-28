import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync(new URL("../script.js", import.meta.url), "utf8");
const extract = (name) => source.match(new RegExp(`function ${name}\\([^)]*\\) \\{[\\s\\S]*?\\r?\\n\\}`))?.[0] || assert.fail(`Missing ${name}`);
let checks = 0;
const check = (condition, message) => { assert.ok(condition, message); checks += 1; };
const context = vm.createContext({ NO_DATA: "未記録" });
vm.runInContext(["formatObdReadinessMonitorLine", "buildObdReadinessDisplayLines", "formatObdReadoutStatus",
  "formatObdBridgeReadinessSummary", "summarizeObdBridgeReadiness"].map(extract).join("\n"), context);
for (const supported of [true, false, null, undefined, 0, 1, "true", "false"]) {
  for (const complete of [true, false, null, undefined, 0, 1, "true", "false"]) {
    const item = { id: "monitor", supported, complete, sourceEcu: "7E8" };
    const expected = supported === false ? "非対応" : supported !== true ? "対応状態不明"
      : complete === true ? "完了" : complete === false ? "未完了" : "完了状態不明";
    const before = JSON.stringify(item);
    check(context.formatObdReadinessMonitorLine(item) === `monitor: ${expected} [7E8]`, "Readiness display inferred boolean flags");
    check(JSON.stringify(item) === before, "Monitor display mutated source data");
  }
}
check(context.formatObdReadinessMonitorLine({ label: "<img src=x>", source_ecu: "<ECU>", diagnosticUse: "<note>" })
  === "<img src=x>: 対応状態不明 [<ECU>] / <note>", "Text or ECU alias was lost");
check(context.formatObdReadinessMonitorLine({}) === "項目: 対応状態不明 [ECU未記録]", "Missing metadata was inferred");
for (const empty of [null, {}, { monitors: [] }]) {
  check(context.buildObdReadinessDisplayLines(empty).length === 0, "Empty snapshot fabricated a readiness result");
}
const monitors = Array.from({ length: 9 }, (_, i) => ({ id: `Monitor${i}`, supported: true, complete: i !== 0, sourceEcu: "7E8" }));
const single = { sourceEcu: "7E8", readinessReadoutStatus: "reported", milOn: false, readinessIgnitionType: "spark", monitors,
  knownMonitors: Array.from({ length: 6 }, (_, i) => ({ id: `Missing${i}`, observed: false })) };
const singleBefore = JSON.stringify(single);
const singleLines = context.buildObdReadinessDisplayLines(single);
check(monitors.every((item) => singleLines.includes(context.formatObdReadinessMonitorLine(item))), "Completed or late monitors were hidden");
check(singleLines.some((line) => line.startsWith("MIL: OFF")) && singleLines.includes("PID 01 観測点火方式: 火花点火"), "MIL or ignition evidence was lost");
check(singleLines.some((line) => line.includes("Missing5")), "Missing monitor labels were truncated");
check(JSON.stringify(single) === singleBefore, "Readiness list mutated the snapshot");
const other = { source_ecu: "7E9", readiness_readout_status: "reported", milOn: true, readiness_ignition_type: "compression",
  monitors: [{ id: "Monitor0", supported: true, complete: true, source_ecu: "7E9" }] };
for (const key of ["readinessEcuSnapshots", "readiness_ecu_snapshots"]) {
  const multi = { monitors: [], [key]: [single, other, { sourceEcu: "7EA", readinessReadoutStatus: "blocked", monitors: [] }] };
  const before = JSON.stringify(multi);
  const lines = context.buildObdReadinessDisplayLines(multi);
  check(lines[0] === "ECU別 3系統 / 集約判定なし", "Multi-ECU results were combined");
  check(lines.includes("Monitor0: 未完了 [7E8]") && lines.includes("Monitor0: 完了 [7E9]"), "Same monitor from different ECUs was lost");
  check(lines.includes("7EA: 読取拒否") && lines.includes("監視項目: 登録データなし"), "Empty/blocked ECU was presented as complete");
  check(lines.some((line) => line.startsWith("MIL: ON")) && lines.includes("PID 01 観測点火方式: 圧縮着火"), "Per-ECU MIL or ignition was lost");
  check(JSON.stringify(multi) === before, "Multi-ECU display mutated source data");
}

// Exercise actual normalized readouts and exports, not only hand-built display rows.
const coreContext = vm.createContext({ window: {} });
vm.runInContext(fs.readFileSync(new URL("../obd-readonly.js", import.meta.url), "utf8"), coreContext);
const obd = coreContext.window.ObdReadOnly;
const response = { ok: true, blocked: false, would_transmit: false, data: { ecu_snapshots: [
  { source_ecu: "7E8", mil_on: false, monitors: [{ id: "misfire", label: "Misfire", supported: true, complete: false }] },
  { source_ecu: "7E9", mil_on: true, monitors: [{ id: "misfire", label: "Misfire", supported: true, complete: true }] }
] } };
const readinessSnapshot = obd.normalizeBridgeReadinessSnapshot(response);
const session = obd.buildDiagnosticScanSession({ readinessSnapshot });
const beforeSession = JSON.stringify(session);
const exportSession = () => JSON.stringify(obd.buildBridgeSessionExportPayload({ ...session, exportedAt: "2026-08-28T00:00:00.000Z" }));
const beforeExport = exportSession();
const lines = context.buildObdReadinessDisplayLines(session.readinessSnapshot);
check(lines.includes("Misfire: 未完了 [7E8]") && lines.includes("Misfire: 完了 [7E9]"), "Normalized multi-ECU readiness was not displayed");
check(JSON.stringify(session) === beforeSession && exportSession() === beforeExport, "Display changed exported diagnostic data");
const details = extract("renderObdBridgeSessionDetails");
check(details.includes("buildObdReadinessDisplayLines(readinessSnapshot)") && details.includes('sections.push(["レディネス", readinessLines])'), "Session view did not use the complete readiness list");
check(details.includes("item.textContent = line;"), "Readiness lines must be rendered as text");
console.log(`Readiness display checks: ${checks} / Errors: 0`);
