import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync(new URL("../script.js", import.meta.url), "utf8");
const extract = (name) => source.match(new RegExp(`function ${name}\\([^)]*\\) \\{[\\s\\S]*?\\r?\\n\\}`))?.[0] || assert.fail(`Missing ${name}`);
let checks = 0;
const check = (condition, message) => { assert.ok(condition, message); checks += 1; };
const context = vm.createContext({ NO_DATA: "未記録" });
vm.runInContext(["formatObdEcuSupportCapture", "formatObdEcuInfoItemLine", "buildObdEcuInfoDisplayLines",
  "formatObdBridgeEcuKeySummary", "summarizeObdExpectedItems", "formatObdExpectedItemPreview",
  "formatObdReadoutStatus", "formatReadoutErrorCodes"].map(extract).join("\n"), context);
for (const key of ["supportInfoTypesCaptured", "support_info_types_captured"]) {
  for (const [value, expected] of [[true, "取得済み"], [false, "未取得"], [undefined, "未確認"], [null, "未確認"], ["true", "未確認"], [1, "未確認"]]) {
    check(context.formatObdEcuSupportCapture({ [key]: value }) === expected, "Mode09 acquisition was inferred or lost");
  }
}
for (const empty of [null, {}, { items: [] }]) {
  check(context.buildObdEcuInfoDisplayLines(empty).length === 0, "Empty input fabricated ECU detail");
  check(context.formatObdEcuSupportCapture(empty) === "未確認", "Empty input became acquired");
}
const items = Array.from({ length: 10 }, (_, i) => ({ id: "calibration_id", label: `項目${i}`, value: `CAL-${i}`, sourceEcu: i % 2 ? "7E9" : "7E8", infoType: "04" }));
const labels = Array.from({ length: 9 }, (_, i) => `対応${i}`);
const snapshot = { items, itemCount: 10, supportInfoTypesCaptured: true, supportInfoTypesSummary: { count: 9, labels },
  ecuInfoEcuSnapshots: [
    { sourceEcu: "7E8", ecuInfoReadoutStatus: "unparsed", ecuInfoNegativeResponseService: "22", ecuInfoNegativeResponseCode: "78" },
    { sourceEcu: "7E8", ecuInfoReadoutStatus: "reported" },
    { sourceEcu: "7EA", ecuInfoReadoutStatus: "blocked", errorCodes: ["error1", "error2", "error3", "error4"] },
    { sourceEcu: "7EB", ecuInfoReadoutStatus: "unknown" }
  ] };
const before = JSON.stringify(snapshot);
const lines = context.buildObdEcuInfoDisplayLines(snapshot);
for (const item of items) check(lines.includes(context.formatObdEcuInfoItemLine(item)), "Item truncated or ECU source collapsed");
check(labels.every((label) => lines.some((line) => line.includes(label))), "Supported type labels truncated");
check(lines.includes("[7E8] 読取状態: 応答未解析") && lines.includes("[7E8] 読取状態: 取得済み"), "Repeated ECU outcomes were collapsed");
check(lines.includes("[7E8] 負応答: サービス 22 / NRC 78"), "Pending NRC disappeared or became failure");
check(lines.includes("[7EA] 読取状態: 読取拒否") && lines.includes("[7EB] 読取状態: 状態未確認"), "Metadata-only ECUs disappeared");
check(lines.includes("[7EA] 理由:error4"), "Error metadata truncated");
check(JSON.stringify(snapshot) === before, "Display mutated snapshot");
const summaryLines = context.buildObdEcuInfoDisplayLines({ ...snapshot,
  keyItemSummary: { totalCount: 10, capturedCount: 5, missingCount: 5, capturedLabels: labels, missingLabels: labels },
  expectedItems: [{ label: "取得項目", captured: true }, { label: "未取得項目", captured: false, diagnosticUse: "観察条件" }]
});
check(summaryLines.includes(`取得: ${labels.join(" / ")}`) && summaryLines.includes(`未取得: ${labels.join(" / ")}`), "Key item labels truncated");
check(summaryLines.includes("取得状況: 1/2") && summaryLines.includes("主要項目: 5/10"), "Expected item counts changed");
check(summaryLines.indexOf(context.formatObdEcuInfoItemLine(items.at(-1))) < summaryLines.findIndex((line) => line.startsWith("未取得用途:")), "Explanatory notes precede recorded values");
for (const status of ["blocked", "unparsed", "reported", "unknown"]) {
  const data = { items: [], ecu_info_ecu_snapshots: [{ source_ecu: "7E9", ecu_info_readout_status: status,
    ecu_info_negative_response_service: "09", ecu_info_negative_response_code: "11", error_codes: ["transport:timeout"] }] };
  const result = context.buildObdEcuInfoDisplayLines(data);
  check(result.includes(`[7E9] 読取状態: ${context.formatObdReadoutStatus(status)}`), "Snake-case metadata lost");
  check(result.includes("[7E9] 負応答: サービス 09 / NRC 11") && result.includes("[7E9] 理由:通信タイムアウト"), "Snake-case NRC/errors lost");
  check(result.includes("項目明細: 登録データなし"), "Empty metadata fabricated values");
}
for (const status of ["reported", "blocked", "unparsed"]) {
  check(context.buildObdEcuInfoDisplayLines({ ecuInfoReadoutStatus: status }).includes("項目明細: 登録データなし"), "Unscoped outcome hidden");
}
check(context.buildObdEcuInfoDisplayLines({ itemCount: 3 }).includes("記録項目数: 3 / 表示明細: 0"), "Count-only evidence became measured detail");
for (const [item, expected] of [
  [{ id: "zero", value: 0, source_ecu: "7E9", data_identifier: "F187" }, "[7E9] zero / DID 0xF187: 0"],
  [{ id: "flag", value: false }, "[ECU未記録] flag: false"],
  [{ id: "missing", value: null, raw: "MUST-NOT-RECOVER", result: "MUST-NOT-RECOVER" }, "[ECU未記録] missing: 未記録"],
  [{ id: "cal", value: ["A", "B", "C", "D", "E"] }, '[ECU未記録] cal: ["A","B","C","D","E"]'],
  [{ id: "object", value: { inner: { last: "retained" } } }, '[ECU未記録] object: {"inner":{"last":"retained"}}'],
  [{ label: "<img src=x>", value: "<b>literal</b>" }, "[ECU未記録] <img src=x>: <b>literal</b>"],
  [{ id: "vin", privacyClass: "sensitive_identifier", value: "PRIVATE", raw: "PRIVATE" }, "[ECU未記録] vin: 識別情報（非表示）"]
]) check(context.formatObdEcuInfoItemLine(item) === expected, "Item lost data, privacy or literal rendering");
check(context.buildObdEcuInfoDisplayLines({ sourceEcu: "7E8", items: [{ id: "unscoped", value: "X" }] }).includes("[ECU未記録] unscoped: X"), "Aggregate source was assigned to unscoped item");

const coreContext = vm.createContext({ window: {} });
vm.runInContext(fs.readFileSync(new URL("../obd-readonly.js", import.meta.url), "utf8"), coreContext);
const obd = coreContext.window.ObdReadOnly;
const normalized = obd.normalizeBridgeEcuInfoSnapshot({ ok: true, blocked: false, would_transmit: false, data: { ecu_snapshots: [
  { source_ecu: "7E8", ecu_info_readout_status: "reported", items: [...items.filter((item) => item.sourceEcu === "7E8"), { id: "vin", info_type: "02", value: "JH4KA8260MC000001" }] },
  { source_ecu: "7E9", ecu_info_readout_status: "reported", items: items.filter((item) => item.sourceEcu === "7E9") },
  { source_ecu: "7EA", ecu_info_readout_status: "blocked", items: [] }
] } });
const session = obd.buildDiagnosticScanSession({ ecuInfoSnapshot: normalized });
const sessionBefore = JSON.stringify(session);
const exportedBefore = JSON.stringify(obd.buildBridgeSessionExportPayload({ ...session, exportedAt: "2026-08-28T00:00:00.000Z" }));
const normalizedLines = context.buildObdEcuInfoDisplayLines(session.ecuInfoSnapshot);
check(normalizedLines.some((line) => line.includes("CAL-9")), "Normalized last item missing");
check(!normalizedLines.join(" ").includes("JH4KA8260MC000001"), "Normalized identifier exposed");
check(normalizedLines.includes("[7EA] 読取状態: 読取拒否"), "Normalized blocked ECU missing");
check(JSON.stringify(session) === sessionBefore, "Display changed diagnostic session");
check(JSON.stringify(obd.buildBridgeSessionExportPayload({ ...session, exportedAt: "2026-08-28T00:00:00.000Z" })) === exportedBefore, "Display changed exported data");
const reopened = obd.buildDiagnosticScanSessionFromJson(exportedBefore);
check(reopened && context.buildObdEcuInfoDisplayLines(reopened.ecuInfoSnapshot).some((line) => line.includes("CAL-9")), "Reopened detail missing");
const details = extract("renderObdBridgeSessionDetails");
check(details.includes("buildObdEcuInfoDisplayLines(ecuInfoSnapshot)") && details.includes('sections.push(["ECU情報", ecuInfoLines])'), "ECU detail helper not wired");
check(details.includes("item.textContent = line;"), "ECU information must render as literal text");
check(extract("renderObdDeveloperSessionSummary").includes('["Mode09対応タイプ00", formatObdEcuSupportCapture(ecuInfoSnapshot)]'), "Summary still infers acquisition");
console.log(`ECU info display checks: ${checks} / Errors: 0`);
