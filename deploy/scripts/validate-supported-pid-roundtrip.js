import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const context = vm.createContext({ window: {} });
vm.runInContext(fs.readFileSync(new URL("../obd-readonly.js", import.meta.url), "utf8"), context);
const obd = context.window.ObdReadOnly;
let checks = 0;
const check = (condition, message) => { assert.ok(condition, message); checks += 1; };
const equal = (actual, expected, message) => { assert.deepEqual(actual, expected, message); checks += 1; };
const plain = (value) => JSON.parse(JSON.stringify(value));
const evidence = (snapshot) => plain({
  status: snapshot.supportedPidReadoutStatus,
  statusAlias: snapshot.supported_pid_readout_status,
  pids: snapshot.supportedPids,
  pidAliases: snapshot.supported_pids,
  pages: snapshot.supportedPidPageBases,
  pageAliases: snapshot.supported_pid_page_bases,
  ecus: snapshot.supportedPidEcuSnapshots,
  ecuAliases: snapshot.supported_pid_ecu_snapshots,
  errors: snapshot.errorCodes,
  errorAliases: snapshot.error_codes,
  summary: snapshot.supportedPidEcuAggregateSummary,
  scope: snapshot.supportedPidAggregationScope,
  supportedCount: snapshot.supportedCount,
  items: snapshot.items
});
const reported = { sourceEcu: "7E8", supportedPids: ["05", "0C"], supportedPidPageBases: ["00"], supportedPidReadoutStatus: "reported" };
const secondReported = { sourceEcu: "7E9", supportedPids: ["0C", "FE"], supportedPidPageBases: ["20"], supportedPidReadoutStatus: "reported" };
const unparsed = { sourceEcu: "7E8", supportedPids: ["AA"], supportedPidPageBases: ["40"], supportedPidReadoutStatus: "unparsed", errorCodes: ["e1", "e2", "e3", "e4"] };
const blocked = { sourceEcu: "7EA", supportedPids: ["BB"], supportedPidReadoutStatus: "blocked", errorCodes: ["transport:timeout"] };
const unknown = { sourceEcu: "7EB", supportedPids: [], supportedPidReadoutStatus: "unknown" };
const cases = [
  { name: "mixed blocked outcomes", status: "blocked", input: { supportedPidEcuSnapshots: [reported, secondReported, unparsed, blocked, unknown] } },
  { name: "unparsed outcomes without blocked", status: "unparsed", input: { supportedPidEcuSnapshots: [reported, unparsed, unknown] } },
  { name: "reported child with error", status: "unparsed", input: { supportedPidEcuSnapshots: [reported, { ...secondReported, errorCodes: ["ecu_timeout"] }] } },
  { name: "reported outcomes", status: "reported", input: { supportedPidEcuSnapshots: [reported, secondReported] } },
  { name: "pending then success", status: "unparsed", input: { supportedPidEcuSnapshots: [unparsed, reported] } },
  { name: "blocked parent without child refusal", status: "blocked", input: { supportedPidReadoutStatus: "blocked", supportedPidEcuSnapshots: [reported, unparsed] } },
  { name: "aggregate-only blocked", status: "blocked", input: { supportedPidReadoutStatus: "blocked", supportedPids: ["0C"] } },
  { name: "aggregate-only unparsed", status: "unparsed", input: { supportedPidReadoutStatus: "unparsed", supportedPids: ["0C"] } },
  { name: "reported empty", status: "reported", input: { supportedPidReadoutStatus: "reported", supportedPids: [] } },
  { name: "unknown empty", status: "unknown", input: { supportedPidReadoutStatus: "unknown", supportedPids: [] } }
];
const snakeAliases = (value) => {
  if (Array.isArray(value)) return value.map(snakeAliases);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`), snakeAliases(entry)]));
};

// Match the main validator's direct, untyped input path before testing normalized matrices.
for (const status of ["reported", "unknown", "unparsed", "blocked"]) {
  for (const snake of [false, true]) {
    for (const explicitTransportSafety of [false, true]) {
      const raw = {
        supportedPidReadoutStatus: status,
        supportedPids: [],
        ...(status === "reported" ? { ok: true } : {}),
        ...(status === "unparsed" ? { ok: false } : {}),
        ...(status === "blocked" ? { blocked: true } : {}),
        ...(explicitTransportSafety ? { wouldTransmit: false } : {})
      };
      const input = snake ? snakeAliases(raw) : raw;
      const before = JSON.stringify(input);
      const session = obd.buildDiagnosticScanSession({ supportedPidMatrix: input });
      const sessionBefore = JSON.stringify(session);
      const reopened = obd.buildDiagnosticScanSessionFromJson(JSON.stringify(obd.buildBridgeSessionExportPayload(session)));
      for (const result of [session, reopened]) {
        const matrix = result?.supportedPidMatrix;
        // Preserve the existing ok:false replay behavior for unknown input with only transport metadata.
        const expectedStatus = status === "unknown" && explicitTransportSafety && result === reopened ? "unparsed" : status;
        check(matrix?.supportedPidReadoutStatus === expectedStatus && matrix?.supported_pid_readout_status === expectedStatus,
          `Direct ${status} input changed status (snake=${snake}, transport=${explicitTransportSafety})`);
        check(status === "blocked" ? matrix.blocked === true : matrix.blocked !== true, `Direct ${status} block flag changed`);
        check(result.readoutCoverage?.itemById?.supported_pid_matrix?.status === (status === "reported" ? "empty" : "missing"),
          `Direct ${status} readout coverage changed`);
        check(result.vehicleCommandEnabled === false && result.vehicle_command_enabled === false
          && result.wouldTransmit === false && result.would_transmit === false, `Direct ${status} input enabled vehicle commands`);
        check(matrix.vehicleCommandEnabled !== true && matrix.wouldTransmit === false && matrix.would_transmit === false,
          `Direct ${status} snapshot enabled vehicle commands`);
      }
      check(JSON.stringify(input) === before && JSON.stringify(session) === sessionBefore, "Direct input/export mutated caller data");
    }
  }
}

for (const snake of [false, true]) {
  const raw = { ok: false, blocked: false, wouldTransmit: false, supportedPidReadoutStatus: "unparsed",
    supportedPidEcuSnapshots: [reported, unparsed, blocked, unknown] };
  const input = snake ? snakeAliases(raw) : raw;
  const before = JSON.stringify(input);
  const session = obd.buildDiagnosticScanSession({ supportedPidMatrix: input });
  const reopened = obd.buildDiagnosticScanSessionFromJson(JSON.stringify(obd.buildBridgeSessionExportPayload(session)));
  for (const result of [session, reopened]) {
    check(result?.supportedPidMatrix?.supportedPidReadoutStatus === "blocked", "Direct ECU refusal was erased by parent ok:false");
    check(result.supportedPidMatrix.supportedPidEcuSnapshots.some((row) => row.sourceEcu === "7EA"
      && row.supportedPidReadoutStatus === "blocked" && row.errorCodes.includes("transport:timeout")), "Direct ECU refusal evidence changed");
    check(result.vehicleCommandEnabled === false && result.wouldTransmit === false, "Direct ECU refusal enabled vehicle commands");
  }
  check(JSON.stringify(input) === before, "Direct ECU refusal input mutated");
}

for (const test of cases) {
  for (const snake of [false, true]) {
    const label = `${test.name} (${snake ? "snake" : "camel"})`;
    const input = plain(snake ? snakeAliases(test.input) : test.input);
    const inputBefore = JSON.stringify(input);
    const matrix = obd.buildSupportedPidMatrix(input);
    const expected = evidence(matrix);
    check(expected.status === test.status && expected.statusAlias === test.status, `${label}: initial status mismatch`);
    if (test.name === "mixed blocked outcomes") {
      equal(expected.pids, ["05", "0C", "FE"], "Failed child PIDs entered the confirmed union");
      equal(expected.pages, ["00", "20"], "Failed child pages entered the confirmed union");
      equal(expected.ecus.map((row) => row.supportedPidReadoutStatus), ["reported", "reported", "unparsed", "blocked", "unknown"], "Child outcomes collapsed");
      equal(expected.errors, ["e1", "e2", "e3", "e4", "transport:timeout"], "Child errors lost");
    }
    const matrixBefore = JSON.stringify(matrix);
    let session = obd.buildDiagnosticScanSession({ supportedPidMatrix: matrix });
    check(JSON.stringify(matrix) === matrixBefore && JSON.stringify(input) === inputBefore, `${label}: session construction mutated input`);
    for (let cycle = 0; cycle < 3; cycle += 1) {
      equal(evidence(session.supportedPidMatrix), expected, `${label}: session evidence drift at cycle ${cycle}`);
      check(session.vehicleCommandEnabled === false && session.vehicle_command_enabled === false
        && session.wouldTransmit === false && session.would_transmit === false, `${label}: vehicle commands enabled`);
      const before = JSON.stringify(session);
      const rebuilt = obd.buildDiagnosticScanSession(session);
      equal(evidence(rebuilt.supportedPidMatrix), expected, `${label}: direct session rebuild changed evidence`);
      const exported = obd.buildBridgeSessionExportPayload({ ...session, exportedAt: "2026-08-28T00:00:00.000Z" });
      check(JSON.stringify(session) === before, `${label}: rebuild/export mutated session`);
      const serialized = JSON.stringify(exported);
      const reopened = obd.buildDiagnosticScanSessionFromJson(serialized);
      check(Boolean(reopened), `${label}: export could not reopen`);
      check(JSON.stringify(exported) === serialized, `${label}: import mutated export`);
      equal(evidence(reopened.supportedPidMatrix), expected, `${label}: export/import evidence drift at cycle ${cycle}`);
      session = reopened;
    }
  }
}

// Exercise bridge failure metadata independently of saved-session wrappers.
for (const status of ["blocked", "unparsed"]) {
  const input = {
    ok: false, blocked: false, would_transmit: false,
    data: { supported_pid_readout_status: status, supported_pid_ecu_snapshots: [reported, unparsed, ...(status === "blocked" ? [blocked] : [])] }
  };
  const before = JSON.stringify(input);
  const matrix = obd.normalizeBridgeSupportedPidSnapshot(input);
  const expected = evidence(matrix);
  check(expected.status === status, `Bridge ${status} status changed`);
  const session = obd.buildDiagnosticScanSession({ supportedPidMatrix: matrix });
  equal(evidence(session.supportedPidMatrix), expected, `Bridge ${status} failure metadata overwrote child outcome`);
  const reopened = obd.buildDiagnosticScanSessionFromJson(JSON.stringify(obd.buildBridgeSessionExportPayload(session)));
  equal(evidence(reopened.supportedPidMatrix), expected, `Bridge ${status} round trip changed evidence`);
  check(JSON.stringify(input) === before, "Bridge normalization mutated input");
  check(reopened.vehicleCommandEnabled === false && reopened.wouldTransmit === false, "Bridge round trip enabled vehicle commands");
}

console.log(`Supported PID round-trip checks: ${checks} / Errors: 0`);
