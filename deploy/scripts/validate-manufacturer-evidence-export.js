import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const context = vm.createContext({ window: {} });
vm.runInContext(fs.readFileSync(new URL("../obd-readonly.js", import.meta.url), "utf8"), context);
const obd = context.window.ObdReadOnly;
const template = obd.getManufacturerSampleCollectionTemplate();
let checks = 0;
const equal = (actual, expected, message) => { assert.deepEqual(actual, expected, message); checks += 1; };
const plain = (value) => JSON.parse(JSON.stringify(value));
const camel = (id) => id.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
const base = {
  code: "P0300", status: "stored", ecu: "7E8", vehicleModelCode: "TEST-1", vehicleModelYear: "2026",
  capturedAt: "2026-08-28T01:00:00.000Z", protocol: "ISO15765-4", scanSessionId: "scan-export", readoutAttemptId: "attempt-export",
  readoutRoute: "local_bridge", networkBus: "CAN", networkChannel: "1", gatewayRoute: "direct",
  adapterFamily: "J2534", adapterName: "Test VCI", adapterFirmwareVersion: "1.0",
  dtcReadoutCategory: "stored", requestedService: "03", responseService: "43", ecuResponseStatus: "reported", responseCount: 1, responseWaitMs: 120
};
const sessionFor = (overrides = {}) => ({
  vehicleProfile: { maker: "Test Maker" }, manufacturerSampleReadinessSummary: { missingRequirementIds: [] },
  dtcSnapshot: { dtcs: [{ ...base, ...overrides }] }
});
const exportRow = (overrides = {}) => obd.buildManufacturerSampleCollectionExport(sessionFor(overrides));
const cell = (bundle, id, row = 1) => bundle.tsv.split("\n")[row].split("\t")[template.columns.findIndex((column) => column.id === id)];
const fields = template.optionalEvidenceColumns;
const validFor = (field) => ({ iso_8601_timestamp: "2026-08-28T01:00:00.000Z", nonnegative_integer_text: "007", nonnegative_decimal_text: "12.50", distance_unit: "km", duration_unit: "ms" }[field.validationRule]);
const reasonFor = (field) => ({ iso_8601_timestamp: "invalid_timestamp", nonnegative_integer_text: "invalid_integer", nonnegative_decimal_text: "invalid_number" }[field.validationRule] || "unsupported_unit");
equal(exportRow().contractCompleteForSampleReview, true, "Complete baseline failed export audit");

for (const field of fields) {
  const key = camel(field.id);
  const valid = validFor(field);
  equal(cell(exportRow({ [key]: valid }), field.id), valid, "Valid evidence changed during export");
  for (const value of [null, undefined, "", "   "]) {
    const bundle = exportRow({ [key]: value });
    equal(cell(bundle, field.id), "", "Missing optional evidence became a marker");
    equal(bundle.contractCompleteForSampleReview, true, "Missing optional evidence became invalid");
  }
  for (const value of [[valid], [], {}, true, false, "0".repeat(199) + "1junk"]) {
    const input = sessionFor({ [key]: value });
    const before = JSON.stringify(input);
    const bundle = obd.buildManufacturerSampleCollectionExport(input);
    equal(bundle.contractCompleteForSampleReview, false, "Invalid source evidence passed export audit");
    equal(bundle.missingRequirementIds.includes("evidence_values_valid"), true, "Missing source rejection requirement");
    equal(cell(bundle, field.id), reasonFor(field), "Rejected evidence needs a value-free marker");
    equal(JSON.stringify(input), before, "Export mutated the source session");
    const imported = obd.buildDiagnosticScanSessionFromCsv(bundle.tsv);
    equal(imported.dtcSnapshot.dtcs[0].code, "P0300", "Rejected optional evidence removed DTC");
    equal(imported.dtcSnapshot.dtcs[0][key] ?? null, null, "Rejected evidence returned through TSV");
    const report = imported.importClassification.dtcEvidenceFieldReport;
    equal(report.invalidObservationCount, 1, "TSV reimport lost rejection");
    equal(report.invalidFieldObservations[0].reason, reasonFor(field), "TSV reimport changed rejection reason");
    equal(report.invalidFieldObservations[0].sourceEcu, "7E8", "TSV rejection lost ECU");
  }
}

for (const [id, key, maximum] of [["response_count", "responseCount", 10000], ["response_wait_ms", "responseWaitMs", 600000]]) {
  for (const value of [[1], [], {}, true, false, maximum + 1, "0".repeat(199) + "1junk", "1e2", "1.0"]) {
    const bundle = exportRow({ [key]: value });
    equal(cell(bundle, id), "invalid_integer", "Invalid attempt evidence became an exported number");
    equal(bundle.missingRequirementIds.includes("response_attempt_context"), true, "Invalid attempt passed export audit");
    const imported = obd.buildDiagnosticScanSessionFromCsv(bundle.tsv);
    equal(imported.dtcSnapshot.dtcs[0][key] ?? null, null, "TSV reimport converted invalid attempt into a number");
    equal(imported.readoutQualitySummary.dtcEvidenceResponseAttemptContextComplete, false, "TSV reimport completed invalid attempt");
  }
  for (const value of [0, maximum, " 0001 ", "0".repeat(220) + "1"]) {
    const bundle = exportRow({ [key]: value });
    equal(cell(bundle, id), String(Number(value)), "Valid attempt integer lost precision through text truncation");
  }
  const primary = sessionFor({ [id]: [], [key]: 2 });
  primary.readoutQualitySummary = { [camel(`dtc_evidence_${id}`)]: 3 };
  equal(cell(obd.buildManufacturerSampleCollectionExport(primary), id), "invalid_integer", "Invalid primary evidence fell back to valid alias or summary");
  const missing = sessionFor({ [key]: null });
  missing.readoutQualitySummary = { [camel(`dtc_evidence_${id}`)]: 3 };
  equal(cell(obd.buildManufacturerSampleCollectionExport(missing), id), "3", "Missing row evidence lost existing single-row summary fallback");
  missing.dtcSnapshot.dtcs.push({ ...base, code: "P0301", [key]: null });
  const multi = obd.buildManufacturerSampleCollectionExport(missing);
  equal(cell(multi, id, 1), "", "Multi-row export inherited summary evidence");
  equal(cell(multi, id, 2), "", "Second row inherited summary evidence");
  const blank = sessionFor({ [id]: " ", [key]: 2, [camel(`dtc_evidence_${id}`)]: 4 });
  equal(cell(obd.buildManufacturerSampleCollectionExport(blank), id), "4", "Blank primary changed existing key precedence");
}

const opaque = { toString() { throw new Error("Rejected evidence must not be coerced"); } };
for (const key of ["dtcWarmUpCycleCount", "responseCount", "responseWaitMs"]) {
  const bundle = exportRow({ [key]: opaque });
  equal(bundle.contractCompleteForSampleReview, false, "Opaque source evidence passed audit");
}
const secret = "DO_NOT_RETAIN_REJECTED_EVIDENCE";
const privateBundle = exportRow({ dtcWarmUpCycleCount: secret, responseCount: secret });
equal(privateBundle.tsv.includes(secret), false, "TSV retained rejected raw evidence");
equal(JSON.stringify(obd.buildDiagnosticScanSessionFromCsv(privateBundle.tsv)).includes(secret), false, "TSV reimport retained rejected raw evidence");
equal(cell(exportRow({ dtcWarmUpCycleCount: 0 }), "dtc_warm_up_cycle_count"), "0", "Optional primitive zero disappeared");

const invalidAll = Object.fromEntries(fields.map((field) => [camel(field.id), [validFor(field)]]));
let restored = obd.buildDiagnosticScanSessionFromCsv(exportRow(invalidAll).tsv);
const observations = plain(restored.importClassification.dtcEvidenceFieldReport.invalidFieldObservations);
for (let cycle = 0; cycle < 3; cycle += 1) {
  restored = obd.buildDiagnosticScanSessionFromJson(JSON.stringify(obd.buildBridgeSessionExportPayload(restored)));
  equal(plain(restored.importClassification.dtcEvidenceFieldReport.invalidFieldObservations), observations, "JSON roundtrip changed TSV rejection records");
  equal(restored.vehicleCommandEnabled, false, "Export enabled vehicle commands");
  equal(restored.wouldTransmit, false, "Export enabled transmission");
}
const mixed = sessionFor();
mixed.dtcSnapshot.dtcs.push({ ...base, code: "P0301", ecu: "7E9", dtcWarmUpCycleCount: [7] });
const mixedBundle = obd.buildManufacturerSampleCollectionExport(mixed);
equal(mixedBundle.completeRowCount, 1, "Invalid row contaminated valid row audit");
equal(plain(mixedBundle.incompleteRowNumbers), [2], "Wrong invalid row number");
equal(mixedBundle.tsv.split("\n")[0], template.columnHeaders.join("\t"), "Export changed existing column contract");
equal(mixedBundle.vehicleCommandEnabled, false, "Export bundle enabled commands");
console.log(`Manufacturer evidence export checks: ${checks} / Errors: 0`);
