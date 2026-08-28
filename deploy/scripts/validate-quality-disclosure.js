import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync(new URL("../script.js", import.meta.url), "utf8");
const extract = (name) => source.match(new RegExp(`function ${name}\\([^)]*\\) \\{[\\s\\S]*?\\r?\\n\\}`))?.[0] || assert.fail(`Missing ${name}`);
const context = vm.createContext({ NO_DATA: "unrecorded" });
vm.runInContext(["readReadoutQualityDisplayCount", "formatDtcEvidenceFieldIds", "formatDtcEvidenceReasonCounts", "formatReadoutQualitySummary", "getImportedReadoutQualityForDisplay"].map(extract).join("\n"), context);
let checks = 0;
const equal = (actual, expected, message) => { assert.deepEqual(actual, expected, message); checks += 1; };
const format = (summary) => context.formatReadoutQualitySummary(summary);
equal(format({ dtcEvidenceValidationStatus: "invalid_evidence_excluded" }).includes("件数未記録"), true, "Status-only rejection was displayed as clear");
equal(format({ dtc_evidence_validation_status: "invalid_evidence_excluded" }).includes("件数未記録"), true, "Snake-case rejection was displayed as clear");
equal(format({ invalidDtcEvidenceFieldIds: ["dtc_warm_up_cycle_count", "dtc_first_detected_at"] }).includes("件数未記録"), true, "Field count was presented as observation count");
equal(format({}), "unrecorded", "Empty quality summary was displayed as clear");
equal(format({ issueCount: 0 }), "要確認なし", "Explicit zero issues changed");
equal(format({ issue_count: "0" }), "要確認なし", "Recorded string zero changed");
equal(format({ issueCount: 0, reviewRequired: true }), "要確認（項目未記録）", "Review flag was hidden by zero issue count");
equal(format({ issueCount: 0, issue_ids: ["unknown_quality_issue"] }), "要確認（項目未記録）", "Reported issue ID was hidden by zero count");
for (const value of [null, undefined, [], true, false, "bad"]) equal(format(value), "unrecorded", "Invalid summary looked clear");
for (const value of [null, undefined, "", " ", [], [1], {}, true, false, -1, 1.5, "1.0", "1e2", "0x10", Infinity, NaN]) {
  equal(format({ issueCount: value }), "unrecorded", "Malformed count became a displayed issue count");
}
for (const [key, label] of [["rawPidUndecodedCount", "RAW2"], ["readinessIncompleteCount", "RDY未完2"], ["ecuInfoMissingKeyCount", "ECU不足2"], ["onboardMonitorFailedCount", "M06失敗2"], ["webSerialResponseReviewCount", "通信応答2"]]) {
  equal(format({ [key]: 2 }), label, "Recorded quality count changed");
  equal(format({ [key]: "0002" }), label, "Recorded decimal count text changed");
  equal(format({ [key]: true }), "unrecorded", "Boolean quality count became one");
}
const evidence = { issueCount: 1, invalidDtcEvidenceObservationCount: 3, invalidDtcEvidenceFieldIds: ["dtc_warm_up_cycle_count"], invalidDtcEvidenceReasonCounts: { invalid_integer: 3 } };
const before = JSON.stringify(evidence);
equal(format(evidence), "DTC証跡除外3(暖機回数) 理由:整数形式3", "Known count/field/reason labels changed");
equal(JSON.stringify(evidence), before, "Formatting mutated evidence");
equal(context.formatDtcEvidenceReasonCounts({ invalid_integer: true }), "", "Boolean reason count became one");
equal(context.formatDtcEvidenceReasonCounts({ invalid_integer: [3] }), "", "Array reason count became three");
equal(context.formatDtcEvidenceReasonCounts({ invalid_integer: "3" }), "整数形式3", "Valid reason count text changed");
equal(context.formatDtcEvidenceFieldIds(["constructor"]), "constructor", "Unknown field exposed a prototype property");
equal(context.formatDtcEvidenceReasonCounts({ constructor: 2 }), "constructor2", "Unknown reason exposed a prototype property");
equal(format({ issueCount: 0, rawPidUndecodedCount: true }), "unrecorded", "Invalid subcount looked clear");
for (const [key, value] of [["dtcEvidenceValidationStatus", "invalid_evidence_excluded"], ["dtc_evidence_validation_status", "invalid_evidence_excluded"], ["invalidDtcEvidenceFieldIds", ["dtc_warm_up_cycle_count"]]]) {
  equal(format({ issueCount: 0, invalidDtcEvidenceObservationCount: 0, [key]: value }).includes("件数未記録"), true, "Conflicting zero count erased exclusion evidence");
}
for (const key of ["importedReadoutQualitySummary", "imported_readout_quality_summary"]) {
  const input = { readoutQualitySummary: { issueCount: 0 }, [key]: evidence };
  equal(context.getImportedReadoutQualityForDisplay(input), evidence, "Wrong summary selected for received quality");
  equal(format(input.readoutQualitySummary), "要確認なし", "Received count changed current quality display");
  equal(format(context.getImportedReadoutQualityForDisplay(input)).includes("DTC証跡除外3"), true, "Received quality was not disclosed");
  equal(context.getImportedReadoutQualityForDisplay({ [key]: {} }) !== null, true, "Existing empty received summary was silently omitted");
}
for (const value of [null, undefined, [], false, "not a summary"]) equal(context.getImportedReadoutQualityForDisplay({ importedReadoutQualitySummary: value }), null, "Invalid received summary became a display item");
equal(context.getImportedReadoutQualityForDisplay({ readoutQualitySummary: evidence }), null, "Current quality was copied into received quality");
const core = vm.createContext({ window: {} });
vm.runInContext(fs.readFileSync(new URL("../obd-readonly.js", import.meta.url), "utf8"), core);
const session = core.window.ObdReadOnly.buildDiagnosticScanSessionFromJson(JSON.stringify({ schema_version: "bridge_session_export_v1", session: { dtc_snapshot: { dtcs: [{ code: "P0300", status: "stored" }] }, readout_quality_summary: evidence } }));
const snapshot = JSON.stringify(session);
equal(format(context.getImportedReadoutQualityForDisplay(session)).includes("DTC証跡除外3"), true, "Saved JSON received quality not visible");
format(session.readoutQualitySummary);
equal(JSON.stringify(session), snapshot, "Display changed diagnosis, saved data, or safety flags");
equal(session.vehicleCommandEnabled, false, "Fixture enabled vehicle commands");
for (const name of ["renderObdDiagnosticFlowPanel", "renderObdDeveloperSessionSummary"]) {
  const body = extract(name);
  equal(body.includes('"受信品質"') && body.includes("getImportedReadoutQualityForDisplay(session)"), true, "Received quality missing from result surface");
}
equal(source.includes('notes.push(`受信品質 ${formatReadoutQualitySummary(importedReadoutQualitySummary, NO_DATA)}`)'), true, "Received quality missing from scanner notes");
console.log(`Quality disclosure checks: ${checks} / Errors: 0`);
