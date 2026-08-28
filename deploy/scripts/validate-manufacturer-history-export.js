import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const core = vm.createContext({ window: {} });
vm.runInContext(fs.readFileSync(new URL("../obd-readonly.js", import.meta.url), "utf8"), core);
const obd = core.window.ObdReadOnly;
const app = fs.readFileSync(new URL("../script.js", import.meta.url), "utf8");
const downloadCode = app.match(/function downloadManufacturerSampleTemplate\([^)]*\) \{[\s\S]*?\r?\n\}/)?.[0];
assert.ok(downloadCode);
const errorCode = "manufacturer_sample_tsv_invalid_evidence_history";
let checks = 0;
const equal = (actual, expected, message) => { assert.deepEqual(actual, expected, message); checks += 1; };
const plain = (value) => JSON.parse(JSON.stringify(value));
const invalidCsv = "Readout,DTC,Status,ECU,Warm Up Cycle Count\nStored DTC,P0300,Stored,7E8,PRIVATE_INVALID_VALUE";
const session = obd.buildDiagnosticScanSessionFromCsv(invalidCsv);
const observations = plain(session.importClassification.dtcEvidenceFieldReport.invalidFieldObservations);
function blocked(input) {
  const before = JSON.stringify(input);
  for (const build of [obd.buildManufacturerSampleCollectionTemplateTsv, obd.buildManufacturerSampleCollectionExport]) {
    assert.throws(() => build(input), (error) => error.code === errorCode, "History-bearing session produced lossy TSV");
    checks += 1;
  }
  equal(JSON.stringify(input), before, "Blocked export mutated the session");
}
blocked(session);
let restored = session;
for (let cycle = 0; cycle < 3; cycle += 1) {
  const payload = JSON.stringify(obd.buildBridgeSessionExportPayload(restored));
  equal(payload.includes("PRIVATE_INVALID_VALUE"), false, "JSON save retained rejected raw evidence");
  restored = obd.buildDiagnosticScanSessionFromJson(payload);
  equal(plain(restored.importClassification.dtcEvidenceFieldReport.invalidFieldObservations), observations, "JSON roundtrip lost rejection history");
  equal(restored.dtcSnapshot.dtcs[0].code, "P0300", "JSON roundtrip lost DTC");
  equal(restored.vehicleCommandEnabled, false, "History preservation enabled commands");
  blocked(restored);
}
for (const classification of ["importClassification", "import_classification"]) {
  for (const reportKey of ["dtcEvidenceFieldReport", "dtc_evidence_field_report"]) {
    for (const key of ["invalidFieldObservations", "invalid_field_observations"]) {
      const input = { dtcSnapshot: { dtcs: [{ code: "P0300" }] }, [classification]: { [reportKey]: { [key]: observations } } };
      blocked(input);
    }
  }
}
const conflict = plain(session);
conflict.importClassification.dtcEvidenceFieldReport = { invalidFieldObservations: [] };
blocked(conflict);
const ecuOnly = obd.buildDiagnosticScanSessionFromCsv("Readout,ECU Response ID,Status,Aging Cycle Count\nECU Responses,7E8,reported,junk");
equal(ecuOnly.importClassification.dtcEvidenceFieldReport.invalidFieldObservations[0].scope, "ecu_response_row", "Fixture lost ECU response scope");
blocked(ecuOnly);
const repairedRow = plain(session);
repairedRow.dtcSnapshot.dtcs[0].dtcWarmUpCycleCount = "7";
blocked(repairedRow);
for (const report of [
  { invalidFieldObservations: [{ fieldId: "future_field", scope: "unknown" }] },
  { invalidFieldIds: ["dtc_warm_up_cycle_count"] }, { invalid_field_ids: ["dtc_warm_up_cycle_count"] },
  ...["invalidObservationCount", "invalid_observation_count", "invalidFieldCount", "invalid_field_count"].flatMap((key) => [1, "1"].map((value) => ({ [key]: value }))),
  { validationStatus: "invalid_evidence_excluded" }, { validation_status: "invalid_evidence_excluded" }
]) blocked({ importClassification: { dtcEvidenceFieldReport: report } });
for (const parentKey of [null, "coreSessionStatus", "core_session_status"]) {
  for (const summaryKey of ["readoutQualitySummary", "readout_quality_summary", "importedReadoutQualitySummary", "imported_readout_quality_summary"]) {
    for (const summary of [
      { invalidDtcEvidenceObservationCount: 1 }, { invalid_dtc_evidence_observation_count: "1" },
      { invalidDtcEvidenceFieldIds: ["dtc_warm_up_cycle_count"] }, { invalid_dtc_evidence_field_ids: ["dtc_warm_up_cycle_count"] },
      { dtcEvidenceValidationStatus: "invalid_evidence_excluded" }, { dtc_evidence_validation_status: "invalid_evidence_excluded" }
    ]) {
      const parent = { [summaryKey]: summary };
      blocked(parentKey ? { [parentKey]: parent } : parent);
    }
  }
}
const beyondLimit = plain(session);
beyondLimit.dtcSnapshot.dtcs = Array.from({ length: 501 }, (_, index) => ({ code: "P0300", ecu: `ECU${index}` }));
beyondLimit.importClassification.dtcEvidenceFieldReport.invalidFieldObservations[0].sourceEcu = "ECU500";
blocked(beyondLimit);
const ambiguous = plain(session);
ambiguous.dtcSnapshot.dtcs = [{ code: "P0300", ecu: "7E8", subcode: "01", capturedAt: "2026-08-28T01:00:00Z" }, { code: "P0300", ecu: "7E8", subcode: "02", capturedAt: "2026-08-28T02:00:00Z" }];
blocked(ambiguous);

const valid = obd.buildDiagnosticScanSessionFromCsv(invalidCsv.replace("PRIVATE_INVALID_VALUE", "0"));
equal(obd.buildManufacturerSampleCollectionExport(valid).exportedRowCount, 1, "Valid CSV cannot be exported");
equal(obd.buildManufacturerSampleCollectionTemplateTsv().split("\n").length, 2, "Empty template blocked");
for (const value of [0, "0", null, undefined, false, true, [], [1], "", " ", "0x10"]) {
  const input = {
    importClassification: { dtcEvidenceFieldReport: { invalidObservationCount: value, invalidFieldObservations: [], reviewRequired: true } },
    readoutQualitySummary: { invalidDtcEvidenceObservationCount: value, readyForInterpretation: false }
  };
  equal(obd.buildManufacturerSampleCollectionTemplateTsv(input).split("\n").length, 2, "Unrelated review or coerced count blocked template");
}
const rawInvalid = { dtcSnapshot: { dtcs: [{ code: "P0300", dtcWarmUpCycleCount: [7] }] } };
equal(obd.buildManufacturerSampleCollectionExport(rawInvalid).tsv.includes("invalid_integer"), true, "Raw-value validation was disabled");

function client(input, build = obd.buildManufacturerSampleCollectionExport) {
  const calls = { blobs: 0, urls: 0, clicks: 0, appended: 0, revoked: 0 };
  const status = { textContent: "" };
  const context = vm.createContext({
    window: { ObdReadOnly: { buildManufacturerSampleCollectionExport: build } },
    obdDevSession: { lastSession: input }, obdImportStatus: status,
    Blob: class extends Blob { constructor(parts, options) { super(parts, options); calls.blobs += 1; } },
    URL: { createObjectURL() { calls.urls += 1; return "blob:test"; }, revokeObjectURL() { calls.revoked += 1; } },
    document: { createElement() { return { click() { calls.clicks += 1; }, remove() {} }; }, body: { appendChild() { calls.appended += 1; } } },
    setTimeout(callback) { callback(); }
  });
  vm.runInContext(downloadCode, context);
  context.downloadManufacturerSampleTemplate();
  return { calls, status };
}
const denied = client(session);
equal(denied.calls, { blobs: 0, urls: 0, clicks: 0, appended: 0, revoked: 0 }, "Blocked UI allocated or downloaded a lossy file");
equal(denied.status.textContent.includes("JSON"), true, "Blocked UI did not offer lossless JSON save");
const allowed = client(valid);
equal(allowed.calls, { blobs: 1, urls: 1, clicks: 1, appended: 1, revoked: 1 }, "Normal TSV download changed");
const failed = client(valid, () => { throw new Error("PRIVATE_FAILURE_DETAIL"); });
equal(failed.calls.blobs, 0, "Failed exporter created a file");
equal(failed.status.textContent.includes("PRIVATE_FAILURE_DETAIL"), false, "UI leaked raw export failure details");
console.log(`Manufacturer history export checks: ${checks} / Errors: 0`);
