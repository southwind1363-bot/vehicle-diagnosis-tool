import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync(new URL("../obd-readonly.js", import.meta.url), "utf8");
const context = vm.createContext({ window: {} });
vm.runInContext(source, context);
const obd = context.window.ObdReadOnly;
let checks = 0;
const equal = (actual, expected, message) => { assert.deepEqual(actual, expected, message); checks += 1; };
const base = { code: "P0300", status: "stored", ecu: "7E8", requestedService: "03", responseService: "43", ecuResponseStatus: "reported" };
const invalid = [undefined, null, "", " ", true, false, [], [1], {}, -1, 1.5, NaN, Infinity, "0x10", "0b10", "1junk", "1.0", "1e2", "+1", "-0", "-1e-999", "1e-999", "1.000000000000000001"];
const countKeys = ["responseCount", "response_count"];
const waitKeys = ["responseWaitMs", "response_wait_ms", "responseTimeoutMs", "response_timeout_ms", "waitTimeoutMs", "wait_timeout_ms"];
for (const [keys, field, maximum] of [[countKeys, "responseCount", 10000], [waitKeys, "responseWaitMs", 600000]]) {
  for (const key of keys) {
    for (const value of [...invalid, maximum + 1, String(maximum + 1)]) {
      const input = { ...base, [key]: value };
      const before = JSON.stringify(input);
      const row = obd.normalizeDtcSnapshot({ dtcs: [input] }).dtcs[0];
      equal(row[field] ?? null, null, `${key} accepted invalid count/wait ${String(value)}`);
      equal(JSON.stringify(input), before, "Count/wait normalization mutated its input");
    }
    for (const [value, expected] of [[0, 0], [1, 1], [maximum, maximum], ["0", 0], [" 0001 ", 1], [String(maximum), maximum]]) {
      const row = obd.normalizeDtcSnapshot({ dtcs: [{ ...base, [key]: value }] }).dtcs[0];
      equal(row[field], expected, `${key} lost a valid bounded integer`);
    }
  }
}
for (const [field, alias] of [["responseCount", "response_count"], ["responseWaitMs", "response_wait_ms"]]) {
  equal(obd.normalizeDtcSnapshot({ dtcs: [{ ...base, [field]: true, [alias]: 2 }] }).dtcs[0][field] ?? null, null, "Invalid primary alias unexpectedly changed precedence");
  equal(obd.normalizeDtcSnapshot({ dtcs: [{ ...base, [field]: 0, [alias]: 2 }] }).dtcs[0][field], 0, "Zero primary alias lost precedence");
}

const build = (overrides) => obd.buildDiagnosticScanSession({ dtcSnapshot: { dtc_readout_status: "reported", dtcs: [{ ...base, responseCount: 1, responseWaitMs: 300, ...overrides }] } });
for (const overrides of [{ responseCount: true }, { responseWaitMs: [300] }, { responseCount: "0x10" }, { responseCount: false, responseWaitMs: false }]) {
  let session = build(overrides);
  for (let cycle = 0; cycle < 3; cycle += 1) {
    equal(session.readoutQualitySummary.dtcEvidenceResponseAttemptContextComplete, false, "Invalid attempt evidence became complete");
    equal(session.dtcSnapshot.dtcs[0].code, "P0300", "Attempt validation dropped the DTC");
    equal(session.dtcSnapshot.dtcs[0].status, "stored", "Attempt validation reclassified the DTC");
    equal(session.vehicleCommandEnabled, false, "Attempt validation enabled vehicle commands");
    equal(session.wouldTransmit, false, "Attempt validation allowed transmission");
    session = obd.buildDiagnosticScanSessionFromJson(JSON.stringify(obd.buildBridgeSessionExportPayload(session)));
  }
}
for (const overrides of [{}, { responseCount: "1", responseWaitMs: "300" }, { responseCount: 10000, responseWaitMs: 600000 }]) {
  const session = build(overrides);
  equal(session.readoutQualitySummary.dtcEvidenceResponseAttemptContextComplete, true, "Valid attempt evidence became incomplete");
}
equal(build({ responseCount: 0 }).readoutQualitySummary.dtcEvidenceResponseAttemptContextComplete, false, "Reported response accepted zero attempts");
equal(build({ responseCount: 1, responseWaitMs: 0 }).readoutQualitySummary.dtcEvidenceResponseAttemptContextComplete, true, "Existing explicit zero-wait semantics changed");
equal(build({ responseCount: 0, responseWaitMs: 0, responseService: null, ecuResponseStatus: "no_response" }).readoutQualitySummary.dtcEvidenceResponseAttemptContextComplete, true, "Existing no-response zero-attempt semantics changed");
const importedQuality = { dtcEvidenceRequestedService: "03", dtcEvidenceResponseService: "43", dtcEvidenceEcuResponseStatus: "reported", dtcEvidenceResponseCount: true, dtcEvidenceResponseWaitMs: [300], dtcEvidenceResponseAttemptContextComplete: true };
for (const key of ["readoutQualitySummary", "importedReadoutQualitySummary"]) {
  let session = obd.buildDiagnosticScanSession({ [key]: importedQuality });
  for (let cycle = 0; cycle < 3; cycle += 1) {
    equal(session.importedReadoutQualitySummary.dtcEvidenceResponseAttemptContextComplete, false, "Imported summary laundered invalid evidence into a complete flag");
    equal(session.importedReadoutQualitySummary.dtcEvidenceResponseCount, null, "Imported invalid count became a number");
    equal(session.importedReadoutQualitySummary.dtcEvidenceResponseWaitMs, null, "Imported invalid wait became a number");
    session = obd.buildDiagnosticScanSessionFromJson(JSON.stringify(obd.buildBridgeSessionExportPayload(session)));
  }
}
for (const value of ["true", "0x10", "1.0", "1e2", "-1e-999", "000000000001junk", "000000000000000000000300junk"]) {
  const csv = `Readout,DTC,Status,ECU,Requested Service,Response Service,ECU Response Status,Response Count,Response Wait Ms\nStored DTC,P0300,Stored,7E8,03,43,reported,${value},${value}`;
  const session = obd.buildDiagnosticScanSessionFromCsv(csv);
  equal(session.dtcSnapshot.dtcs[0].responseCount ?? null, null, "CSV count was coerced or truncated into an integer");
  equal(session.dtcSnapshot.dtcs[0].responseWaitMs ?? null, null, "CSV wait was coerced or truncated into an integer");
  equal(session.readoutQualitySummary.dtcEvidenceResponseAttemptContextComplete, false, "CSV invalid attempt became complete");
}
const validCsv = obd.buildDiagnosticScanSessionFromCsv("Readout,DTC,Status,ECU,Requested Service,Response Service,ECU Response Status,Response Count,Response Wait Ms\nStored DTC,P0300,Stored,7E8,03,43,reported,2,300");
equal(validCsv.readoutQualitySummary.dtcEvidenceResponseAttemptContextComplete, true, "Valid CSV attempt evidence became incomplete");
for (const key of waitKeys) {
  for (const value of [true, false, [300], "0x10", "1e2"]) {
    const row = obd.normalizeEcuResponseSummary({ ecus: [{ id: "7E8", status: "reported", [key]: value }] }).ecus[0];
    equal(row.responseWaitMs, null, "ECU response wait accepted invalid evidence");
  }
}
const inheritedCsv = obd.buildDiagnosticScanSessionFromCsv([
  "Stored DTC", "DTC\tStatus\tECU\tRequested Service\tResponse Service\tECU Response Status", "P0300\tStored\t7E8\t03\t43\treported",
  "Stored DTC ECU Responses", "ECU\tStatus\tRequested Service\tResponse Service\tResponse Count\tResponse Wait Ms", "7E8\tResponded\t03\t43\t000000000001junk\t000000000000000000000300junk"
].join("\n"));
equal(inheritedCsv.dtcSnapshot.dtcs[0].responseCount ?? null, null, "Malformed ECU response count was inherited by a DTC");
equal(inheritedCsv.dtcSnapshot.dtcs[0].responseWaitMs ?? null, null, "Malformed ECU response wait was inherited by a DTC");
equal(inheritedCsv.readoutQualitySummary.dtcEvidenceResponseAttemptContextComplete, false, "Malformed ECU response evidence completed DTC attempt context");
console.log(`Response attempt numeric checks: ${checks} / Errors: 0`);
