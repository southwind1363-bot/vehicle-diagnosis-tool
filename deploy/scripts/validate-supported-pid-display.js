import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync(new URL("../script.js", import.meta.url), "utf8");
const extract = (name) => source.match(new RegExp(`function ${name}\\([^)]*\\) \\{[\\s\\S]*?\\r?\\n\\}`))?.[0] || assert.fail(`Missing ${name}`);
let checks = 0;
const check = (condition, message) => { assert.ok(condition, message); checks += 1; };
const context = vm.createContext({ NO_DATA: "未記録" });
vm.runInContext(["buildObdSupportedPidDisplayLines", "formatObdReadoutStatus", "formatReadoutErrorCodes"].map(extract).join("\n"), context);
for (const empty of [null, {}, { supportedPids: [], supportedPidReadoutStatus: "unknown" }]) {
  check(context.buildObdSupportedPidDisplayLines(empty).length === 0, "Empty snapshot fabricated PID evidence");
}
const pids = Array.from({ length: 31 }, (_, i) => (i + 1).toString(16).toUpperCase().padStart(2, "0"));
for (const status of ["reported", "unparsed", "blocked", "unknown", undefined]) {
  for (const snake of [false, true]) {
    const snapshot = snake
      ? { source_ecu: "7E8", supported_pids: pids, supported_pid_page_bases: ["00", "20", "40"], supported_pid_readout_status: status, supported_pid_aggregation_scope: "single_ecu" }
      : { sourceEcu: "7E8", supportedPids: pids, supportedPidPageBases: ["00", "20", "40"], supportedPidReadoutStatus: status, supportedPidAggregationScope: "single_ecu" };
    const before = JSON.stringify(snapshot);
    const lines = context.buildObdSupportedPidDisplayLines(snapshot);
    const label = status === "reported" ? "対応PID" : "記録PID（対応未確認）";
    check(lines.includes(`[7E8] ${label}: 31件 / ${pids.join(", ")}`), "PID list truncated or uncertain records presented as supported");
    check(lines.includes("[7E8] 記録ページ: 00 / 20 / 40"), "Page bases lost or page00 treated as missing");
    check(lines.includes("記録上の集約範囲: 単一ECU"), "Scope alias lost");
    check(JSON.stringify(snapshot) === before, "Display mutated input");
  }
}
const children = [
  { sourceEcu: "7E8", supportedPids: pids, supportedPidPageBases: ["00"], supportedPidReadoutStatus: "reported" },
  { sourceEcu: "7E9", supportedPids: ["0C", "FE"], supportedPidPageBases: ["20"], supportedPidReadoutStatus: "reported" },
  { sourceEcu: "7E8", supportedPids: ["AA"], supportedPidPageBases: ["40"], supportedPidReadoutStatus: "unparsed", errorCodes: ["e1", "e2", "e3", "e4"] },
  { source_ecu: "7EA", supported_pids: ["BB"], supported_pid_readout_status: "blocked", error_codes: ["transport:timeout"] },
  { sourceEcu: "7EB", supportedPids: [], supportedPidReadoutStatus: "unknown" }
];
const raw = { supportedPids: ["0C", "FE"], supportedPidPageBases: ["00", "20"], supportedPidAggregationScope: "multiple_ecus_union",
  supportedPidReadoutStatus: "blocked", supportedPidEcuSnapshots: children, errorCodes: ["aggregate_error"] };
for (const key of ["supportedPidEcuSnapshots", "supported_pid_ecu_snapshots"]) {
  const snapshot = { ...raw, supportedPidEcuSnapshots: undefined, [key]: children };
  const before = JSON.stringify(snapshot);
  const lines = context.buildObdSupportedPidDisplayLines(snapshot);
  check(lines.includes("記録上の集約範囲: 複数ECUの和集合"), "Union scope lost");
  check(lines.includes("明細: 識別済みECU 4 / 応答 5"), "ECU count conflated with response count");
  check(lines.includes("集約記録PID: 2件 / 0C, FE"), "Display rebuilt aggregate from children");
  check(lines.includes("[7E8] 対応PID: 31件 / " + pids.join(", ")) && lines.includes("[7E9] 対応PID: 2件 / 0C, FE"), "Same PID across ECUs collapsed");
  check(lines.includes("[7E8] 記録PID（対応未確認）: 1件 / AA"), "Repeated ECU unresolved response hidden");
  check(lines.includes("[7EA] 記録PID（対応未確認）: 1件 / BB"), "Blocked ECU data promoted to supported");
  check(lines.includes("[7EB] 記録PID（対応未確認）: 0件 / 記録なし"), "Unknown ECU missing");
  check(lines.includes("[7E8] 理由:e4") && lines.includes("[7EA] 理由:通信タイムアウト") && lines.includes("全体: 理由:aggregate_error"), "Error metadata lost or truncated");
  check(JSON.stringify(snapshot) === before, "ECU grouping mutated data");
}
for (const status of ["reported", "unparsed", "blocked"]) {
  const lines = context.buildObdSupportedPidDisplayLines({ supportedPidReadoutStatus: status });
  check(lines.includes("集約記録PID: 0件 / 記録なし") && !lines.join(" ").includes("非対応"), "No record became unsupported");
}
check(context.buildObdSupportedPidDisplayLines({ supportedPidPageBases: ["00"] }).includes("集約記録ページ: 00"), "Page-only evidence hidden");
check(context.buildObdSupportedPidDisplayLines({ errorCodes: ["e1"] }).includes("全体: 理由:e1"), "Error-only evidence hidden");
check(context.buildObdSupportedPidDisplayLines({ supportedPids: ["0C"] }).some((line) => line.startsWith("[ECU未記録]")), "Missing source was fabricated");
check(context.buildObdSupportedPidDisplayLines({ supportedPids: ["<PID>"], sourceEcu: "<ECU>" }).some((line) => line.includes("[<ECU>]") && line.includes("<PID>")), "Literal text was altered");

const coreContext = vm.createContext({ window: {} });
vm.runInContext(fs.readFileSync(new URL("../obd-readonly.js", import.meta.url), "utf8"), coreContext);
const obd = coreContext.window.ObdReadOnly;
const repeatedEcu = obd.buildSupportedPidMatrix({ supportedPidEcuSnapshots: [children[0], children[2]] });
const repeatedLines = context.buildObdSupportedPidDisplayLines(repeatedEcu);
check(repeatedLines.includes("明細: 識別済みECU 1 / 応答 2"), "Repeated response was reported as another ECU");
check(repeatedLines.some((line) => line.startsWith("記録上の集約範囲:")), "Recorded aggregation scope presented as independently verified");
const matrix = obd.buildSupportedPidMatrix(raw);
const session = obd.buildDiagnosticScanSession({ supportedPidMatrix: matrix });
const before = JSON.stringify(session);
const exported = () => JSON.stringify(obd.buildBridgeSessionExportPayload({ ...session, exportedAt: "2026-08-28T00:00:00.000Z" }));
const beforeExport = exported();
const normalizedLines = context.buildObdSupportedPidDisplayLines(session.supportedPidMatrix);
check(normalizedLines.some((line) => line.startsWith("集約記録PID:") && line.includes("FE") && !line.includes("AA") && !line.includes("BB")), "Failed ECU data contaminated confirmed union");
check(normalizedLines.includes("[7E8] 記録PID（対応未確認）: 1件 / AA") && normalizedLines.includes("[7EA] 記録PID（対応未確認）: 1件 / BB"), "Normalized unresolved records hidden");
check(normalizedLines.some((line) => line.startsWith("[7E8] 対応PID:") && line.includes("1F")), "Late normalized PID hidden");
check(JSON.stringify(session) === before && exported() === beforeExport, "Display changed session/export");
const reopened = obd.buildDiagnosticScanSessionFromJson(beforeExport);
check(Boolean(reopened), "Saved session could not reopen");
assert.deepEqual(context.buildObdSupportedPidDisplayLines(reopened.supportedPidMatrix), normalizedLines, "Saved/reopened display changed evidence");
check(session.vehicleCommandEnabled !== true && session.vehicle_command_enabled !== true, "Display enabled commands");
const details = extract("renderObdBridgeSessionDetails");
check(details.includes("buildObdSupportedPidDisplayLines(supportedPidMatrix)") && details.includes('sections.push(["対応PID", supportedPidLines])'), "PID display helper not wired");
check(details.includes("item.textContent = line;"), "PID display must use literal text");
const summary = extract("renderObdDeveloperSessionSummary");
check(summary.includes('["対応PID（辞書一致）", supportedPidMatrix?.supportedCount ?? 0]') && summary.includes('["記録PID", (supportedPidMatrix?.supportedPids || supportedPidMatrix?.supported_pids || []).length]'), "Dictionary matches and recorded PID count conflated");
console.log(`Supported PID display checks: ${checks} / Errors: 0`);
