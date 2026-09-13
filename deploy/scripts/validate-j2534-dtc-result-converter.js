import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { spawn } from "node:child_process";
import { createBoundedFixtureWorker } from "./bounded-fixture-worker.js";
import { J2534_DTC_OUTPUT_LIMIT } from "./j2534-native-fixture-supervisor.js";
import { createJ2534DtcResultConverter } from "./j2534-dtc-result-converter.js";
import { createJ2534FixtureSessionBuilder } from "./j2534-fixture-session-builder.js";
const context = vm.createContext({ window: {}, navigator: {} });
vm.runInContext(fs.readFileSync(new URL("../obd-readonly.js", import.meta.url), "utf8"), context);
let calls = 0, checks = 0;
const convert = createJ2534DtcResultConverter(input => { calls++; return context.window.ObdReadOnly.decodeObdDtcResponse(input); });
const message = data => ({ ProtocolId: 6, RxStatus: 0, TxFlags: 0, Timestamp: 0, ExtraDataIndex: 0, Data: [0, 0, 7, 0xe8, ...data] });
const sample = () => ({ schema_version: "j2534-dtc-read-v1", worker_status: "worker_completed", cleanup_confirmed: true,
  request_ecu: 0x7e0, service: 3, read_result: { Status: 0, ReportedCount: 1, Messages: [message([0x43, 1, 0x71])] } });
const run = value => convert(JSON.stringify(value));
for (const status of [0, 9]) for (const service of [3, 7, 10]) {
  const input = sample(); input.service = service; input.read_result.Messages[0].Data[4] = service + 0x40;
  input.read_result.Status = status;
  const before = JSON.stringify(input), result = run(input);
  assert.equal(result.status, "decoded");
  assert.equal(result.snapshot.dtcs[0].code, "P0171");
  assert.equal(JSON.stringify(input), before);
  checks += 3;
}
const empty = sample(); empty.read_result.Messages[0] = message([0x43, 0, 0]);
assert.equal(run(empty).status, "decoded"); assert.equal(run(empty).snapshot.dtcs.length, 0); checks += 2;
const indicated = sample(); const start = message([]); start.RxStatus = 2;
indicated.read_result.Messages.unshift(start); indicated.read_result.ReportedCount = 2;
assert.equal(run(indicated).status, "decoded"); checks++;
for (const status of [0, 9]) for (const mutate of [
  v => v.worker_status = "worker_timed_out", v => v.cleanup_confirmed = false,
  v => v.read_result.Status = 8,
  v => v.read_result.ReportedCount = 0, v => v.request_ecu = 0x7df, v => v.service = 4,
  v => v.read_result.Messages[0].Data[3] = 0xe9,
  v => v.read_result.Messages[0].RxStatus = 8,
  v => v.read_result.Messages[0].ProtocolId = 5,
  v => v.read_result.Messages[0].ExtraDataIndex = 4,
  v => v.read_result.Messages[0].Data[4] = 0x47,
  v => v.read_result.Messages[0].Data.push(1),
  v => v.read_result.Messages[0].Data[5] = null,
  v => v.read_result.Messages[0].Timestamp = -1,
  v => v.read_result.Messages[0].Data = [0, 0, 7, 0xe8, 0, 0x43, 0, 0],
  v => v.read_result.Messages[0].Data = [0, 0, 7, 0xe8, 0x43, 0, 0, 1, 0x71],
  v => { v.read_result.Messages = []; v.read_result.ReportedCount = 0; },
  v => v.read_result.Messages[0] = start,
  v => { v.read_result.Messages.push(message([0x43, 0, 0])); v.read_result.ReportedCount = 2; },
  v => { v.read_result.Messages.push(start); v.read_result.ReportedCount = 2; },
]) {
  const value = sample(); value.read_result.Status = status; mutate(value); const before = calls;
  const result = run(value);
  assert.equal(result.status, "unavailable"); assert.equal(result.snapshot, null); assert.equal(calls, before); checks += 3;
}
for (const invalid of [null, "{", "x".repeat(400001)]) {
  assert.equal(convert(invalid).snapshot, null); checks++;
}
const throws = createJ2534DtcResultConverter(() => { throw new Error("private diagnostic data"); });
assert.deepEqual(throws(JSON.stringify(sample())), { status: "unavailable", reason: "conversion_failed", snapshot: null }); checks++;
for (const malformed of [null, {}, { schema_version: "dtc_snapshot_v1", dtc_readout_status: "unknown", dtcs: [] }]) {
  assert.equal(createJ2534DtcResultConverter(() => malformed)(JSON.stringify(sample())).reason, "invalid_decoder_result"); checks++;
}
console.log(`J2534 DTC result converter checks: ${checks} / synthetic inputs only / Errors: 0`);

const api = context.window.ObdReadOnly;
let sessionCalls = 0;
const buildSession = createJ2534FixtureSessionBuilder(input => { sessionCalls++; return api.buildDiagnosticScanSession(input); });
const completed = value => ({ execution_status: "worker_completed", worker_started: true, worker_exited: true,
  termination_requested: false, termination_signal_sent: false, errors: [],
  parsed_result: { fixture_only: true, vehicle_communication: false, ...run(value) } });
for (const status of [0, 9]) for (const value of [sample(), empty, indicated]) {
  value.read_result.Status = status;
  const input = completed(value), before = JSON.stringify(input);
  const built = buildSession(input);
  assert.equal(built.fixture_only, true); assert.equal(built.vehicle_communication, false);
  const archive = api.buildBridgeSessionExportPayload(built.session);
  const restored = api.buildDiagnosticScanSessionFromJson(JSON.stringify(archive));
  assert.equal(restored.source, "j2534_development_read");
  assert.equal(restored.dtcSnapshot.source, "j2534_development_read");
  assert.deepEqual(restored.dtcSnapshot.dtcs, built.session.dtcSnapshot.dtcs);
  assert.equal(restored.dtcSnapshot.dtc_readout_status, "reported");
  assert.equal(archive.vehicle_command_enabled, false); assert.equal(archive.retained_raw_text, false);
  assert.equal(JSON.stringify(input), before);
}
for (const mutate of [
  v => v.execution_status = "worker_failed", v => v.worker_started = false, v => v.worker_exited = false,
  v => v.termination_requested = true, v => v.termination_signal_sent = true,
  v => v.errors.push("worker_timeout"), v => v.parsed_result.fixture_only = false,
  v => v.parsed_result.vehicle_communication = true, v => v.parsed_result.snapshot = null,
  v => v.parsed_result.status = "unavailable", v => v.parsed_result.snapshot.source = "web_serial",
]) {
  const input = completed(sample()); mutate(input); const before = sessionCalls;
  assert.equal(buildSession(input), null); assert.equal(sessionCalls, before);
}
assert.equal(buildSession(Object.defineProperty({}, "execution_status", { get() { throw new Error("private"); } })), null);
console.log("J2534 fixture session handoff and archive roundtrip: passed / no user files used");

// Actual child pipe delivery, not vendor DLL/vehicle data. The old summary cap
// must reject this valid padded response; the dedicated DTC cap must preserve it.
const longInput = sample();
longInput.read_result.Status = 9;
longInput.read_result.Messages[0].Data.push(...Array(4092).fill(0));
const longJson = JSON.stringify(longInput);
assert.ok(Buffer.byteLength(longJson) > 4096);
for (const [limit, output, expected] of [
  [4096, longJson, "worker_failed"],
  [J2534_DTC_OUTPUT_LIMIT, longJson, "worker_completed"],
  [J2534_DTC_OUTPUT_LIMIT, " ".repeat(J2534_DTC_OUTPUT_LIMIT + 1), "worker_failed"],
]) {
  let parsedCalls = 0;
  const runChild = createBoundedFixtureWorker({ outputLimit: limit, rejectStderr: true,
    spawnWorker() {
      const child = spawn(process.execPath, ["--input-type=module", "-e", "process.stdin.pipe(process.stdout)"],
        { windowsHide: true, shell: false, stdio: ["pipe", "pipe", "pipe"] });
      child.stdin.on("error", () => {}); // Parent may stop an over-limit child.
      child.stdin.end(output);
      return child;
    },
    parseOutput(json) { parsedCalls++; return convert(json); }
  });
  const result = await runChild({ timeout: 5000 });
  assert.equal(result.execution_status, expected);
  assert.equal(result.worker_exited, true);
  if (expected === "worker_completed") {
    assert.equal(result.parsed_result.status, "decoded");
    assert.equal(result.parsed_result.snapshot.dtcs[0].code, "P0171");
    assert.equal(parsedCalls, 1);
  } else {
    assert.equal(result.parsed_result, null);
    assert.ok(result.errors.includes("worker_output_limit"));
    assert.equal(parsedCalls, 0);
  }
}
console.log("J2534 bounded result pipe: long response retained, summary and oversized output rejected");
