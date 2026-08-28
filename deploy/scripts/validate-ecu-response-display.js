import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync(new URL("../script.js", import.meta.url), "utf8");
const extract = (name) => source.match(new RegExp(`function ${name}\\([^)]*\\) \\{[\\s\\S]*?\\r?\\n\\}`))?.[0] || assert.fail(`Missing ${name}`);
let checks = 0;
const check = (condition, message) => { assert.ok(condition, message); checks += 1; };
const context = vm.createContext({});
vm.runInContext(extract("buildObdEcuResponseDisplayLines"), context);
for (const empty of [null, {}, { ecus: [] }]) check(context.buildObdEcuResponseDisplayLines(empty).length === 0, "Empty input fabricated ECU records");
for (const [status, label] of [["reported", "応答取得"], ["ok", "応答取得"], ["success", "応答取得"], ["positive_response", "肯定応答"],
  ["negative_response", "負応答"], ["pending_response", "応答保留"], ["no_response", "無応答"], ["blocked", "読取拒否"],
  ["unparsed", "応答未解析"], ["unknown", "状態未確認"], ["Positive Response", "肯定応答"], ["vendor-state", "未分類"], ["constructor", "未分類"], ["__proto__", "未分類"]]) {
  const input = { ecus: [{ id: "engine", name: "ECM", address: "7E8", status, dtcCount: 0, negativeResponseCount: 5, pendingNegativeResponseCount: 1 }] };
  const before = JSON.stringify(input);
  const lines = context.buildObdEcuResponseDisplayLines(input);
  check(lines.includes(`#1 [7E8] ECM / 記録状態: ${label} (${status})`), "Display reclassified status from counts or hid recorded status");
  check(lines.includes("#1 [7E8] 記録ID: engine"), "Name hid independent record identity");
  check(lines.some((line) => line.includes("報告DTC件数: 0")) && !lines.join(" ").includes("異常なし"), "Zero DTC was hidden or treated as healthy");
  check(JSON.stringify(input) === before, "Display changed ECU evidence");
}
for (const value of [null, undefined, "0", false, -1, NaN]) {
  const lines = context.buildObdEcuResponseDisplayLines({ ecus: [{ dtcCount: value, responseCount: value, negativeResponseCount: value, pendingNegativeResponseCount: value }] });
  check(lines.includes("#1 [ECUアドレス未記録] 報告DTC件数: 未記録 / 応答回数: 未記録"), "Missing or malformed counts became zero");
  check(lines.includes("#1 [ECUアドレス未記録] 記録の負応答集計: 未記録 / うち保留: 未記録"), "Unknown negative counts became zero");
}
const repeated = [
  { id: "engine", name: "ECM", address: "7E8", status: "pending_response", services: ["22"], responseServices: ["7F"], negativeRequestedServices: ["22"], negativeResponseLabels: ["response_pending"], negativeResponseCount: 1, pendingNegativeResponseCount: 1, readoutAttemptId: "attempt-1" },
  { id: "engine", name: "ECM", address: "7E8", status: "reported", services: ["22"], responseServices: ["62"], responseCount: 1, negativeResponseCount: 0, pendingNegativeResponseCount: 0, readoutAttemptId: "attempt-2" }
];
const rows = [...repeated, ...Array.from({ length: 8 }, (_, index) => ({ id: `ecu-${index}`, address: (0x7E9 + index).toString(16).toUpperCase(), name: "同名ECU", status: index === 7 ? "no_response" : "reported", services: ["01", "03", "09"], responseServices: ["41", "43", "49"] }))];
const lines = context.buildObdEcuResponseDisplayLines({ ecus: rows });
check(lines[0] === "応答記録: 10件", "Response rows were counted as distinct ECUs");
for (const [index, row] of rows.entries()) check(lines.some((line) => line.startsWith(`#${index + 1} [${row.address}] ${row.name} / 記録状態:`)), "Late or duplicate ECU response missing");
check(lines.includes("#1 [7E8] 記録サービス: 22 / 応答サービス: 7F") && lines.includes("#2 [7E8] 記録サービス: 22 / 応答サービス: 62"), "Recorded/response services conflated");
check(lines.includes("#1 [7E8] 記録の負応答集計: 1 / うち保留: 1") && lines.includes("#2 [7E8] 記録の負応答集計: 0 / うち保留: 0"), "Pending and successful outcomes merged");
check(lines.includes("#1 [7E8] 負応答対象サービス: 22") && lines.includes("#1 [7E8] 負応答記録: response_pending"), "Negative response context missing");
const aliases = { id: "alias", address: "7EA", dtc_count: 0, response_count: 0, negative_response_count: 0, pending_negative_response_count: 0,
  response_services: ["41", "43", "49", "46", "62", "59", "47"], negative_requested_services: ["01", "03", "09", "06", "22", "19", "07"],
  negative_response_labels: ["label1", "label2", "label3", "label4", "label5", "label6", "label7"],
  readout_section: "ecu_info_snapshot", readout_kind: "read_ecu_info", readout_attempt_id: "attempt-7", protocol: "UDS", captured_at: "2026-08-28T01:02:03.000Z" };
const aliasLines = context.buildObdEcuResponseDisplayLines({ ecus: [aliases] });
check(aliasLines.includes("#1 [7EA] 報告DTC件数: 0 / 応答回数: 0"), "Snake-case zero count lost");
check(aliasLines.some((line) => line.endsWith("41, 43, 49, 46, 62, 59, 47")) && aliasLines.some((line) => line.endsWith("label7")), "Service or negative label list truncated");
check(aliasLines.includes("#1 [7EA] 読取区分: ecu_info_snapshot / 読取種別: read_ecu_info / 試行ID: attempt-7 / 通信: UDS / 記録時刻: 2026-08-28T01:02:03.000Z"), "Response context aliases lost");
const literalLines = context.buildObdEcuResponseDisplayLines({ ecus: [{ id: "<id>", name: "<img src=x>", address: "<ecu>", status: "<state>", negativeResponseLabels: ["<label>"] }] });
check(literalLines.includes("#1 [<ecu>] <img src=x> / 記録状態: 未分類 (<state>)"), "Literal evidence altered");
check(context.buildObdEcuResponseDisplayLines({ ecus: [{ id: "ecu_1" }] })[1].includes("[ECUアドレス未記録]"), "Generated record ID treated as real address");

const coreContext = vm.createContext({ window: {} });
vm.runInContext(fs.readFileSync(new URL("../obd-readonly.js", import.meta.url), "utf8"), coreContext);
const obd = coreContext.window.ObdReadOnly;
const packetSession = obd.buildScanSessionFromObdText("7E8 04 41 0C 1A F8");
const packetLines = context.buildObdEcuResponseDisplayLines(packetSession.ecuResponseSummary);
check(packetLines.some((line) => line.includes("記録サービス: 41 / 応答サービス: 41")), "Packet response SID mislabeled as request SID");
check(!packetLines.join(" ").includes("要求サービス"), "Response service was converted into a request");
const precise = obd.buildDiagnosticScanSession({ ecuResponseSummary: { ecus: [
  { ...repeated[1], capturedAt: "2026-08-28T01:02:03.001Z" },
  { ...repeated[1], capturedAt: "2026-08-28T01:02:03.002Z" }
] } });
const preciseLines = context.buildObdEcuResponseDisplayLines(precise.ecuResponseSummary);
check(preciseLines[0] === "応答記録: 2件" && preciseLines.some((line) => line.includes("03.001Z")) && preciseLines.some((line) => line.includes("03.002Z")), "Subsecond response records collapsed");
const session = obd.buildDiagnosticScanSession({ ecuResponseSummary: { ecus: rows } });
const before = JSON.stringify(session);
const exportSession = () => JSON.stringify(obd.buildBridgeSessionExportPayload({ ...session, exportedAt: "2026-08-28T00:00:00.000Z" }));
const beforeExport = exportSession();
const normalizedLines = context.buildObdEcuResponseDisplayLines(session.ecuResponseSummary);
check(normalizedLines.some((line) => line.startsWith("#10 ")), "Normalized late response lost");
check(normalizedLines.some((line) => line.includes("応答保留 (pending_response)")) && normalizedLines.some((line) => line.includes("応答取得 (reported)")), "Normalized outcomes collapsed");
check(JSON.stringify(session) === before && exportSession() === beforeExport, "Display mutated diagnostic session/export");
const reopened = obd.buildDiagnosticScanSessionFromJson(beforeExport);
check(Boolean(reopened), "Saved ECU response session did not reopen");
check(JSON.stringify(context.buildObdEcuResponseDisplayLines(reopened.ecuResponseSummary)) === JSON.stringify(normalizedLines), "ECU response evidence changed on reopen");
const details = extract("renderObdBridgeSessionDetails");
check(details.includes("buildObdEcuResponseDisplayLines(session?.ecuResponseSummary || session?.ecu_response_summary)") && details.includes('sections.push(["ECU応答", ecuResponseLines])'), "Complete response display not wired");
check(details.includes("item.textContent = line;"), "Response evidence must render as text");
console.log(`ECU response display checks: ${checks} / Errors: 0`);
