import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { createJ2534Mode01ResultConverter } from "./j2534-mode01-result-converter.js";
import { createJ2534Mode01SessionBuilder } from "./j2534-mode01-session-builder.js";
import { createJ2534Mode01FixtureSupervisor } from "./j2534-mode01-fixture-supervisor.js";
const context = vm.createContext({ window: {}, navigator: {} });
vm.runInContext(fs.readFileSync(new URL("../obd-readonly.js", import.meta.url), "utf8"), context);
const obd = context.window.ObdReadOnly;
obd.configureMonitorDefinitions(JSON.parse(fs.readFileSync(new URL("../data/obd-monitor-definitions.json", import.meta.url), "utf8")));
const convert = createJ2534Mode01ResultConverter(obd.decodeLivePidResponse);
const read = bytes => ({ Status: 9, ReportedCount: 1, Messages: [{ ProtocolId: 6, RxStatus: 0, TxFlags: 0,
  Timestamp: 7, ExtraDataIndex: 0, Data: [0, 0, 7, 232, ...bytes] }] });
const sample = (pid = 5) => ({ fixture_only: true, cleanup_confirmed: true, request_ecu: 2016, pid,
  value: pid === 5 ? 90 : 2000, supported_read: read([65, 0, 8, 16, 0, 0]),
  value_read: read(pid === 5 ? [65, 5, 130] : [65, 12, 31, 64]) });
const completion = input => ({ status: 0, signal: null, error: null, stderr: "", stdout: JSON.stringify(input) });
let checks = 0;
for (const pid of [5, 12]) {
  const input = sample(pid), before = JSON.stringify(input);
  const result = convert(completion(input), { request_ecu: 2016, pid });
  assert.equal(result.status, "decoded");
  assert.equal(result.snapshot.source, "j2534_development_read");
  assert.equal(result.snapshot.monitor_values.length, 1);
  assert.equal(result.evidence.value_read.Status, 9);
  assert.equal(JSON.stringify(input), before); checks += 5;
}
for (const mutate of [x => x.cleanup_confirmed = false, x => x.fixture_only = false,
  x => x.value = 91, x => x.pid = 12, x => x.supported_read.Messages[0].Data[6] = 0,
  x => x.value_read.Status = 16, x => x.value_read.ReportedCount = 0,
  x => x.value_read.Messages[0].Data[3] = 233, x => x.value_read.Messages[0].Data.push(0),
  x => x.value_read.Messages[0].RxStatus = 8, x => x.value_read.Messages[0].TxFlags = 64,
  x => x.value_read.Messages[0].ExtraDataIndex = 4, x => x.extra = true]) {
  const input = sample(); mutate(input);
  assert.equal(convert(completion(input), { request_ecu: 2016, pid: 5 }).snapshot, null); checks++;
}
for (const change of [{ status: 1 }, { status: null }, { signal: "SIGTERM" }, { error: {} }, { stderr: "error" }, { stdout: "x".repeat(8193) }]) {
  assert.equal(convert({ ...completion(sample()), ...change }, { request_ecu: 2016, pid: 5 }).snapshot, null); checks++;
}
const zero = sample(); zero.value = 0; zero.value_read.Messages[0].Data[6] = 40;
assert.equal(convert(completion(zero), { request_ecu: 2016, pid: 5 }).status, "decoded"); checks++;
console.log(`Mode01 result checks: ${checks}; synthetic completions, no driver or vehicle`);

let sessionCalls = 0;
const buildSession = createJ2534Mode01SessionBuilder({ decodeLivePidResponse: obd.decodeLivePidResponse,
  buildDiagnosticScanSession: input => { sessionCalls++; return obd.buildDiagnosticScanSession(input); } });
for (const input of [sample(5), sample(12), zero]) {
  const expected = { request_ecu: 2016, pid: input.pid };
  const built = buildSession(completion(input), expected);
  assert.equal(built.fixture_only, true);
  assert.equal(built.vehicle_communication, false);
  const archive = obd.buildBridgeSessionExportPayload(built.session);
  const restored = obd.buildDiagnosticScanSessionFromJson(JSON.stringify(archive));
  assert.equal(restored.source, "j2534_development_read");
  assert.deepEqual(restored.livePidSnapshot.monitorValues, built.session.livePidSnapshot.monitorValues);
  assert.equal(restored.livePidSnapshot.monitorValues.length, 1);
  assert.notEqual(restored.dtcSnapshot.dtc_readout_status, "reported");
  assert.notEqual(restored.dtcSnapshot.dtcReadoutStatus, "reported");
  assert.equal(archive.vehicle_command_enabled, false);
  assert.equal(archive.retained_raw_text, false);
  const before = sessionCalls;
  assert.equal(buildSession({ ...completion(input), status: 1 }, expected), null);
  assert.equal(buildSession(completion(input), { ...expected, request_ecu: 2017 }), null);
  assert.equal(sessionCalls, before);
}
console.log("Mode01 session handoff and existing JSON round trip: 36 checks passed");

const supervised = () => ({ execution_status: "worker_completed", worker_started: true, worker_exited: true,
  termination_requested: false, termination_signal_sent: false, errors: [], parsed_result: { stdout: JSON.stringify(sample()) } });
assert.ok(buildSession.fromSupervisedCompletion(supervised(), { request_ecu: 2016, pid: 5 }));
for (const mutate of [c => c.execution_status = "worker_failed", c => c.worker_started = false,
  c => c.worker_exited = false, c => c.termination_requested = true, c => c.termination_signal_sent = true,
  c => c.errors.push("worker_termination_unconfirmed"), c => c.parsed_result = null,
  c => c.parsed_result.stdout = "{", c => c.parsed_result.extra = true]) {
  const c = supervised(); mutate(c); const before = sessionCalls;
  assert.equal(buildSession.fromSupervisedCompletion(c, { request_ecu: 2016, pid: 5 }), null);
  assert.equal(sessionCalls, before);
}
console.log("Mode01 supervised completion handoff: 19 checks passed (artificial completion states)");

let spawns = 0;
const supervisorOptions = { expected: { request_ecu: 2016, pid: 5 }, decodeLivePidResponse: obd.decodeLivePidResponse,
  buildDiagnosticScanSession: obd.buildDiagnosticScanSession, spawnWorker: () => { spawns++; throw new Error("fixture spawn failed"); } };
const cancelled = createJ2534Mode01FixtureSupervisor(supervisorOptions);
const abort = new AbortController(); abort.abort();
assert.equal((await cancelled({ signal: abort.signal })).reason, "fixture_cancelled");
assert.equal((await cancelled()).reason, "fixture_already_consumed");
assert.equal(spawns, 0);
const failedSpawn = createJ2534Mode01FixtureSupervisor(supervisorOptions);
const failedOutcome = await failedSpawn();
assert.equal(failedOutcome.session, null);
assert.deepEqual(failedOutcome.completion.errors, ["worker_spawn_failed"]);
assert.equal((await failedSpawn()).reason, "fixture_already_consumed");
assert.equal(spawns, 1);
for (const expected of [null, {}, { request_ecu: 2015, pid: 5 }, { request_ecu: 2016, pid: 4 },
  { request_ecu: 2016, pid: 5, extra: true }]) {
  assert.throws(() => createJ2534Mode01FixtureSupervisor({ ...supervisorOptions, expected }), /mode01_fixture_configuration_invalid/);
}
console.log("Mode01 supervisor cancellation/spawn failure/configuration: 12 checks passed; no process used");
