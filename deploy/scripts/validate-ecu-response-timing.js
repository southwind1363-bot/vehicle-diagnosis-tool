import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const context = vm.createContext({ window: {} });
vm.runInContext(fs.readFileSync(new URL("../obd-readonly.js", import.meta.url), "utf8"), context);
const obd = context.window.ObdReadOnly;
let checks = 0;
const equal = (actual, expected, message) => { assert.deepEqual(actual, expected, message); checks += 1; };
const plain = (value) => JSON.parse(JSON.stringify(value));
const aliases = ["response_time_ms", "responseTimeMs", "response_time", "responseTime", "latency_ms", "latencyMs", "elapsed_ms", "elapsedMs"];
const normalize = (row) => obd.normalizeEcuResponseSummary({ ecus: [{ id: "ECM", address: "7E8", status: "reported", ...row }] }).ecus[0];
const invalid = [undefined, null, "", "  ", false, true, [], [0], [12], {}, -1, "-1", "-0", "-1e-999", "1e-999", NaN, Infinity, -Infinity, "NaN", "Infinity", "12 ms", "12junk", "0x10", "0b10", "1,000"];
for (const key of aliases) {
  for (const value of invalid) {
    const row = normalize({ [key]: value });
    equal(row.responseTimeMs, null, `${key} must not coerce invalid/missing duration ${String(value)}`);
    equal(row.response_time_ms, null, "Timing aliases must agree");
  }
  for (const [value, expected] of [[0, 0], [12.5, 12.5], ["0", 0], ["0e-999", 0], ["+0", 0], [" 12.50 ", 12.5], [".5", 0.5], ["1.25e2", 125]]) {
    const row = normalize({ [key]: value });
    equal(row.responseTimeMs, expected, `${key} lost valid duration`);
    equal(row.response_time_ms, expected, "Timing aliases must agree");
  }
}
equal(normalize({}).responseTimeMs, null, "Omitted duration became zero");
for (const value of invalid) equal(normalize({ response_time_ms: value, responseTimeMs: 12.5 }).responseTimeMs, 12.5, "Invalid earlier alias masked valid measured duration");
equal(normalize({ response_time_ms: 0, responseTimeMs: 12.5 }).responseTimeMs, 0, "Explicit zero lost alias precedence");
equal(normalize({ response_time_ms: 10, responseTimeMs: 12.5 }).responseTimeMs, 10, "Valid alias priority changed");
equal(normalize({ responseWaitMs: 500 }).responseTimeMs, null, "Configured wait limit became measured latency");

const raw = { ecus: [
  { id: "ECM", address: "7E8", status: "reported", responseTimeMs: null, responseWaitMs: 500, responseCount: 1 },
  { id: "ECM", address: "7E8", status: "reported", responseTimeMs: 0, responseWaitMs: 500, responseCount: 1 },
  { id: "ECM", address: "7E8", status: "reported", responseTimeMs: 12.5, responseWaitMs: 500, responseCount: 1 },
  { id: "ABS", address: "7E9", status: "no_response", responseTimeMs: "", responseWaitMs: 500, responseCount: 2 }
] };
const before = JSON.stringify(raw);
const evidence = (session) => plain(session.ecuResponseSummary.ecus.map((row) => ({ id: row.id, status: row.status, responseTimeMs: row.responseTimeMs, response_time_ms: row.response_time_ms, responseWaitMs: row.responseWaitMs, responseCount: row.responseCount })));
const expected = [
  { id: "ECM", status: "reported", responseTimeMs: null, response_time_ms: null, responseWaitMs: 500, responseCount: 1 },
  { id: "ECM", status: "reported", responseTimeMs: 0, response_time_ms: 0, responseWaitMs: 500, responseCount: 1 },
  { id: "ECM", status: "reported", responseTimeMs: 12.5, response_time_ms: 12.5, responseWaitMs: 500, responseCount: 1 },
  { id: "ABS", status: "no_response", responseTimeMs: null, response_time_ms: null, responseWaitMs: 500, responseCount: 2 }
];
const csv = "Readout,ECU Response ID,Status,Response Time ms,Response Count,Response Wait Ms\nECU Responses,7E8,reported,,1,500\nECU Responses,7E9,no_response,0,2,500\nECU Responses,7EA,reported,12.5,1,500";
const csvSession = obd.buildDiagnosticScanSessionFromCsv(csv);
equal(plain(csvSession.ecuResponseSummary.ecus.map((row) => row.responseTimeMs)), [null, 0, 12.5], "CSV blank and measured zero collapsed");
for (const value of ["", " ", "false", "-1", "-0", "-1e-999", "1e-999", "0x10", "12ms", "Infinity", "123456789012345678901234junk"]) {
  const session = obd.buildDiagnosticScanSessionFromCsv(`Readout,ECU Response ID,Status,Response Time ms\nECU Responses,7E8,reported,${value}`);
  equal(session?.ecuResponseSummary?.ecus?.[0]?.responseTimeMs, null, "CSV invalid duration became a measurement");
}
const missingColumn = obd.buildDiagnosticScanSessionFromCsv("Readout,ECU Response ID,Status\nECU Responses,7E8,reported");
equal(missingColumn?.ecuResponseSummary?.ecus?.[0]?.responseTimeMs, null, "Absent CSV timing column became zero");

const sessions = [
  obd.buildDiagnosticScanSession({ ecuResponseSummary: raw }),
  obd.buildDiagnosticScanSessionFromJson(JSON.stringify({ ecu_response_summary: raw })),
  obd.buildDiagnosticScanSessionFromJson(JSON.stringify({ ecu_responses: raw.ecus })),
  obd.buildBridgeSessionSummary({ ecuResponseSummary: raw })
];
for (let session of sessions) {
  for (let cycle = 0; cycle < 3; cycle += 1) {
    equal(evidence(session), expected, "Unknown, zero and fractional timing records must remain distinct");
    equal(session.vehicleCommandEnabled, false, "Timing normalization enabled vehicle commands");
    equal(session.retainedRawText, false, "Timing normalization retained raw input");
    const original = JSON.stringify(session);
    const payload = obd.buildBridgeSessionExportPayload(session);
    equal(JSON.stringify(session), original, "Export mutated the source session");
    session = obd.buildDiagnosticScanSessionFromJson(JSON.stringify(payload));
  }
}
let reopenedCsv = csvSession;
for (let cycle = 0; cycle < 3; cycle += 1) {
  reopenedCsv = obd.buildDiagnosticScanSessionFromJson(JSON.stringify(obd.buildBridgeSessionExportPayload(reopenedCsv)));
  equal(plain(reopenedCsv.ecuResponseSummary.ecus.map((row) => row.responseTimeMs)), [null, 0, 12.5], "CSV timing changed on JSON reopen");
}
equal(JSON.stringify(raw), before, "Normalization mutated input rows");
console.log(`ECU response timing checks: ${checks} / Errors: 0`);
