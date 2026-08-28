import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync(new URL("../obd-readonly.js", import.meta.url), "utf8");
const context = vm.createContext({ window: {} });
vm.runInContext(source, context);
const obd = context.window.ObdReadOnly;
let checks = 0;
const equal = (actual, expected, message) => { assert.deepEqual(actual, expected, message); checks += 1; };
const plain = (value) => JSON.parse(JSON.stringify(value));
const fields = obd.getManufacturerSampleCollectionTemplate().optionalEvidenceColumns;
const reasonFor = (field) => ({ iso_8601_timestamp: "invalid_timestamp", nonnegative_integer_text: "invalid_integer", nonnegative_decimal_text: "invalid_number" }[field.validationRule] || "unsupported_unit");
const validFor = (field) => ({ iso_8601_timestamp: "2026-08-28T09:10:11.123+09:00", nonnegative_integer_text: "007", nonnegative_decimal_text: "12.50", distance_unit: "km", duration_unit: "ms" }[field.validationRule]);
const camel = (id) => id.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
const parse = (field, value) => obd.buildDiagnosticScanSessionFromCsv(`Readout,DTC,Status,ECU,${field.header}\nStored DTC,P0300,Stored,7E8,${value}`);
const report = (session) => session.importClassification.dtcEvidenceFieldReport;

for (const field of fields) {
  const value = validFor(field);
  const valid = parse(field, value);
  equal(valid.dtcSnapshot.dtcs[0][camel(field.id)], value, `Valid ${field.id} changed`);
  equal(report(valid).invalidObservationCount, 0, `Valid ${field.id} was flagged`);
  equal(report(parse(field, "")).invalidObservationCount, 0, `Missing ${field.id} was treated as invalid`);
  const limit = field.valueType === "unit_text" ? 24 : 80;
  const malformed = field.valueType === "unit_text" ? value.padEnd(limit, ".") + "junk" : "0".repeat(limit - 1) + "1junk";
  const invalid = parse(field, malformed);
  equal(invalid.dtcSnapshot.dtcs[0][camel(field.id)] ?? null, null, `Malformed ${field.id} was truncated into evidence`);
  equal(report(invalid).invalidObservationCount, 1, `Missing rejection record for ${field.id}`);
  const observation = report(invalid).invalidFieldObservations[0];
  equal(observation.fieldId, field.id, "Wrong rejected field");
  equal(observation.reason, reasonFor(field), "Wrong rejection reason");
  equal(observation.scope, "dtc_row", "Lost rejection scope");
  equal(observation.dtcCode, "P0300", "Lost rejection DTC");
  equal(observation.sourceEcu, "7E8", "Lost rejection ECU");
  equal(invalid.dtcSnapshot.dtcs[0].code, "P0300", "Rejected optional value removed DTC");
  equal(invalid.readoutQualitySummary.invalidDtcEvidenceObservationCount, 1, "Quality summary lost invalid evidence");
  equal(JSON.stringify(invalid).includes(malformed), false, "Rejected raw value leaked into session");
}

const countField = fields.find((field) => field.id === "dtc_warm_up_cycle_count");
const exportedSource = parse(countField, "0".repeat(79) + "1junk");
const initialReport = plain(report(exportedSource).invalidFieldObservations);
let reopened = exportedSource;
for (let cycle = 0; cycle < 3; cycle += 1) {
  reopened = obd.buildDiagnosticScanSessionFromJson(JSON.stringify(obd.buildBridgeSessionExportPayload(reopened)));
  equal(plain(report(reopened).invalidFieldObservations), initialReport, "Rejection evidence changed on reopen");
  equal(reopened.dtcSnapshot.dtcs[0].dtcWarmUpCycleCount ?? null, null, "Reopen restored rejected evidence");
  equal(reopened.vehicleCommandEnabled, false, "Validation enabled vehicle commands");
  equal(reopened.wouldTransmit, false, "Validation allowed transmission");
}

const extract = (name) => source.match(new RegExp(`function ${name}\\([^)]*\\) \\{[\\s\\S]*?\\r?\\n  \\}`))?.[0] || assert.fail(`Missing ${name}`);
const validation = vm.createContext({ DTC_EVIDENCE_FIELD_SCHEMA: fields, DTC_EVIDENCE_DISTANCE_UNITS: new Set(["km"]), DTC_EVIDENCE_DURATION_UNITS: new Set(["ms"]), redactSensitiveText: (text) => text });
vm.runInContext(["normalizeDtcEvidenceTimestampValue", "validateDtcEvidenceFieldValue"].map(extract).join("\n"), validation);
for (const field of fields) {
  for (const value of [true, false, [], [validFor(field)], {}]) {
    const result = validation.validateDtcEvidenceFieldValue(field.id, value);
    equal(result.valid, false, "Structured/boolean value was converted into evidence");
    equal(result.reason, reasonFor(field), "Malformed type lost field-specific reason");
  }
  for (const value of [null, undefined, "", "   "]) equal(validation.validateDtcEvidenceFieldValue(field.id, value).present, false, "Empty value became a rejection");
}
equal(validation.validateDtcEvidenceFieldValue(countField.id, "0".repeat(80)).valid, true, "Existing 80-character numeric boundary changed");
equal(validation.validateDtcEvidenceFieldValue(countField.id, "0".repeat(81)).valid, false, "Overlength number was silently truncated");
equal(validation.validateDtcEvidenceFieldValue(countField.id, 0).value, "0", "Numeric zero lost");
for (const [length, accepted] of [[80, true], [81, false]]) {
  const session = parse(countField, "0".repeat(length));
  equal(report(session).invalidObservationCount, accepted ? 0 : 1, "Public CSV numeric length boundary changed");
  equal(session.dtcSnapshot.dtcs[0].dtcWarmUpCycleCount ?? null, accepted ? "0".repeat(length) : null, "Public CSV numeric value was truncated");
}
const unitField = fields.find((field) => field.validationRule === "distance_unit");
for (const [length, accepted] of [[24, true], [25, false]]) {
  const unit = "k" + "-".repeat(length - 2) + "m";
  equal(validation.validateDtcEvidenceFieldValue(unitField.id, unit, 24).valid, accepted, "Unit boundary changed");
  equal(report(parse(unitField, unit)).invalidObservationCount, accepted ? 0 : 1, "Public CSV unit boundary changed");
  const exported = obd.buildManufacturerSampleCollectionExport({ manufacturerSampleReadinessSummary: { missingRequirementIds: [] }, dtcSnapshot: { dtcs: [{ code: "P0300", [camel(unitField.id)]: unit }] } });
  equal(exported.missingRequirementIds.includes("evidence_values_valid"), !accepted, "Export audit and CSV unit limit disagree");
}
const ecuCsv = `Readout,ECU Response ID,Status,Warm Up Cycle Count\nECU Responses,7E8,reported,${"0".repeat(79)}1junk`;
const ecuSession = obd.buildDiagnosticScanSessionFromCsv(ecuCsv);
equal(report(ecuSession).invalidObservationCount, 1, "ECU response rejection missing");
equal(report(ecuSession).invalidFieldObservations[0].scope, "ecu_response_row", "ECU response rejection misattributed to DTC");
equal(ecuSession.ecuResponseSummary.ecus[0].dtcWarmUpCycleCount ?? null, null, "ECU response retained truncated value");
console.log(`DTC evidence input checks: ${checks} / Errors: 0`);
