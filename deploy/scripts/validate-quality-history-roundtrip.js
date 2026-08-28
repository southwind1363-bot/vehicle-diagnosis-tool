import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const context = vm.createContext({ window: {} });
vm.runInContext(fs.readFileSync(new URL("../obd-readonly.js", import.meta.url), "utf8"), context);
const obd = context.window.ObdReadOnly;
let checks = 0;
const equal = (actual, expected, message) => { assert.deepEqual(actual, expected, message); checks += 1; };
const plain = (value) => JSON.parse(JSON.stringify(value));
const original = obd.buildDiagnosticScanSessionFromCsv("Readout,DTC,Status,ECU,Warm Up Cycle Count\nStored DTC,P0300,Stored,7E8,junk");
delete original.importClassification;
delete original.import_classification;
const payload = plain(obd.buildBridgeSessionExportPayload(original));
const quality = payload.session.readout_quality_summary;
equal(quality.invalidDtcEvidenceObservationCount, 1, "Fixture lost the original reported count before JSON import");
let restored = obd.buildDiagnosticScanSessionFromJson(JSON.stringify(payload));
for (let cycle = 0; cycle < 3; cycle += 1) {
  equal(restored.importedReadoutQualitySummary?.invalidDtcEvidenceObservationCount, 1, "JSON import discarded reported invalid evidence count");
  equal(plain(restored.importedReadoutQualitySummary.invalidDtcEvidenceFieldIds), ["dtc_warm_up_cycle_count"], "JSON import lost reported invalid field IDs");
  equal(restored.importedReadoutQualitySummary.invalidDtcEvidenceReasonCounts.invalid_integer, 1, "JSON import lost reported rejection reasons");
  equal(restored.readoutQualitySummary.invalidDtcEvidenceObservationCount, 0, "Historical summary was injected into current acquired evidence");
  equal(restored.importClassification.dtcEvidenceFieldReport?.invalidObservationCount ?? 0, 0, "Summary fabricated detailed observations");
  equal(plain(restored.importClassification.dtcEvidenceFieldReport?.invalidFieldObservations ?? []), [], "Summary fabricated observation rows");
  equal(restored.importedReadoutQualityComparisonSummary.dtcEvidenceResolutionStatus, "not_comparable", "Missing detailed history was classified as repaired");
  equal(restored.importedReadoutQualityComparisonSummary.invalidDtcEvidenceObservationDelta, -1, "Summary difference was added or miscounted");
  equal(restored.importedReadoutQualityComparisonSummary.dtcEvidenceResolutionComparisonAvailable, false, "Missing detailed history became comparable");
  equal(plain(restored.importedReadoutQualityComparisonSummary.resolvedInvalidDtcEvidenceIssueKeys), [], "Missing detail became resolved issues");
  equal(restored.dtcSnapshot.dtcs[0].code, "P0300", "Quality history changed DTC");
  equal(restored.dtcSnapshot.dtcs[0].status, "stored", "Quality history reclassified DTC");
  equal(restored.vehicleCommandEnabled, false, "History preservation enabled commands");
  equal(restored.wouldTransmit, false, "History preservation enabled transmission");
  for (const build of [obd.buildManufacturerSampleCollectionTemplateTsv, obd.buildManufacturerSampleCollectionExport]) {
    assert.throws(() => build(restored), (error) => error.code === "manufacturer_sample_tsv_invalid_evidence_history");
    checks += 1;
  }
  restored = obd.buildDiagnosticScanSessionFromJson(JSON.stringify(obd.buildBridgeSessionExportPayload(restored)));
}

const fromSummary = (summary, key = "readout_quality_summary", extra = {}) => obd.buildDiagnosticScanSessionFromJson(JSON.stringify({
  schema_version: "bridge_session_export_v1",
  session: { source: "scanner_csv_import", dtc_snapshot: { dtcs: [{ code: "P0300", status: "stored", ecu: "7E8" }] }, [key]: summary, ...extra }
}));
for (const key of ["readoutQualitySummary", "readout_quality_summary"]) {
  for (const summary of [
    { invalidDtcEvidenceObservationCount: 1 }, { invalid_dtc_evidence_observation_count: "1" },
    { invalidDtcEvidenceFieldIds: ["dtc_warm_up_cycle_count"] }, { invalid_dtc_evidence_field_ids: ["dtc_warm_up_cycle_count"] },
    { dtcEvidenceValidationStatus: "invalid_evidence_excluded" }, { dtc_evidence_validation_status: "invalid_evidence_excluded" }
  ]) {
    const session = fromSummary(summary, key);
    equal(Boolean(session.importedReadoutQualitySummary), true, "Summary alias was discarded");
    assert.throws(() => obd.buildManufacturerSampleCollectionExport(session), (error) => error.code === "manufacturer_sample_tsv_invalid_evidence_history");
    checks += 1;
  }
  for (const summary of [null, {}, { reviewRequired: true }, { invalidDtcEvidenceObservationCount: 0 }, { invalidDtcEvidenceObservationCount: true }, { invalidDtcEvidenceObservationCount: [1] }]) {
    equal(fromSummary(summary, key).importedReadoutQualitySummary ?? null, null, "Unrelated review or coerced value created an imported history");
  }
}
for (const key of ["importedReadoutQualitySummary", "imported_readout_quality_summary"]) {
  const explicit = fromSummary(quality, "readout_quality_summary", { [key]: { invalidDtcEvidenceObservationCount: 2 } });
  equal(explicit.importedReadoutQualitySummary.invalidDtcEvidenceObservationCount, 2, "Fallback merged or overwrote explicit imported history");
  const empty = fromSummary(quality, "readout_quality_summary", { [key]: {} });
  equal(empty.importedReadoutQualitySummary.invalidDtcEvidenceObservationCount, 0, "Explicit empty imported summary lost precedence");
  for (const absent of [null, undefined]) equal(fromSummary(quality, "readout_quality_summary", { [key]: absent }).importedReadoutQualitySummary.invalidDtcEvidenceObservationCount, 1, "Absent imported summary prevented fallback");
}
const sourceConflict = fromSummary({}, "readoutQualitySummary", { readout_quality_summary: quality });
equal(sourceConflict.importedReadoutQualitySummary ?? null, null, "Source summary alias precedence changed");
const importedConflict = fromSummary(quality, "readout_quality_summary", { importedReadoutQualitySummary: {}, imported_readout_quality_summary: { invalidDtcEvidenceObservationCount: 2 } });
equal(importedConflict.importedReadoutQualitySummary.invalidDtcEvidenceObservationCount, 0, "Imported summary alias precedence changed");
const untrusted = obd.buildDiagnosticScanSessionFromJson(JSON.stringify({ dtcs: [{ code: "P0300" }], readout_quality_summary: quality }));
equal(untrusted.importedReadoutQualitySummary ?? null, null, "Arbitrary JSON gained trusted saved-summary privileges");
equal(payload.session.readout_quality_summary.invalidDtcEvidenceObservationCount, 1, "Import mutated the parsed source payload");
console.log(`Quality history round-trip checks: ${checks} / Errors: 0`);
