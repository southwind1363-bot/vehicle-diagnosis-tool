import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { spawnSync, spawn } from "node:child_process";
import vm from "node:vm";
import { createJ2534SweepFixtureSupervisor } from "../j2534-sweep-fixture-supervisor.js";

assert.equal(process.platform, "win32");
const context = vm.createContext({ window: {}, navigator: {} });
vm.runInContext(fs.readFileSync(new URL("../../obd-readonly.js", import.meta.url), "utf8"), context);
const obd = context.window.ObdReadOnly;
obd.configureMonitorDefinitions(JSON.parse(fs.readFileSync(new URL("../../data/obd-monitor-definitions.json", import.meta.url), "utf8")));
const root = fs.mkdtempSync(path.join(os.tmpdir(), "diagnostic-sweep-"));
const sources = ["J2534DiagnosticSweepExchange.cs", "J2534DiagnosticSweepExchangeTests.cs",
  "J2534DiagnosticSweepOwned.cs", "J2534DiagnosticSweepOwnedTests.cs",
  "J2534DiagnosticSweepObservation.cs",
  "J2534Mode01Exchange.cs", "J2534Mode01Observation.cs", "J2534ReceiveNative.cs", "J2534IdentityNative.cs",
  "J2534ReadRequestNative.cs"];
for (const [arch, framework] of [["x86", "Framework"], ["x64", "Framework64"]]) {
  const compiler = path.join(process.env.SystemRoot || "C:\\Windows", "Microsoft.NET", framework, "v4.0.30319", "csc.exe");
  const exe = path.join(root, `sweep-${arch}.exe`);
  const run = (file, args) => spawnSync(file, args, { cwd: root, shell: false,
    windowsHide: true, encoding: "utf8", timeout: 15000, maxBuffer: 65536 });
  const built = run(compiler, ["/nologo", "/warnaserror", "/define:J2534_DTC_DEVELOPMENT;J2534_MODE01_DEVELOPMENT",
    `/platform:${arch}`, `/out:${exe}`, ...sources.map(name => fileURLToPath(new URL(name, import.meta.url)))]);
  assert.equal(built.status, 0, built.stdout + built.stderr);
  const result = run(exe, []);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.equal(result.stderr, "");
  console.log(arch, result.stdout.trim());
  const output = run(exe, ["--fixture-output"]);
  assert.equal(output.status, 0, output.stdout + output.stderr);
  assert.equal(output.stderr, "");
  const observation = JSON.parse(output.stdout);
  assert.deepEqual(Object.keys(observation).sort(), ["cleanup_confirmed", "dtc_reads", "fixture_only", "observations", "request_ecu"]);
  assert.equal(observation.fixture_only, true);
  assert.equal(observation.cleanup_confirmed, true);
  assert.equal(observation.request_ecu, 0x7e0);
  assert.deepEqual(observation.dtc_reads.map(item => item.service), [3, 7, 10]);
  assert.deepEqual(observation.observations.map(item => item.value), [90, 2000.25]);
  assert.deepEqual(observation.observations[0].supported_read, observation.observations[1].supported_read);
  const receipts = [...observation.dtc_reads.map(item => item.read_result), observation.observations[0].supported_read,
    ...observation.observations.map(item => item.value_read)];
  receipts.forEach((read, index) => {
    assert.equal(read.Status, 9); assert.equal(read.ReportedCount, 1);
    assert.equal(read.Messages[0].Timestamp, index + 1);
    assert.equal(read.Messages[0].ProtocolId, 6);
    assert.deepEqual(read.Messages[0].Data.slice(0, 4), [0, 0, 7, 232]);
  });
  console.log(arch, "six original receipts preserved in internal JSON (not parent-supervised)");
  const supervise = spawnWorker => createJ2534SweepFixtureSupervisor({ requestEcu: 0x7e0, spawnWorker,
    decodeLivePidResponse: obd.decodeLivePidResponse, decodeDtcResponse: obd.decodeObdDtcResponse });
  const options = { cwd: root, shell: false, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] };
  const parent = supervise(request => {
    assert.deepEqual(request, { request_ecu: 0x7e0, services: [3, 7, 10], pids: [0, 5, 12] });
    assert.ok(Object.isFrozen(request) && Object.isFrozen(request.services) && Object.isFrozen(request.pids));
    return spawn(exe, ["--fixture-output"], options);
  });
  const pending = parent();
  assert.equal((await parent()).reason, "fixture_already_consumed");
  const success = await pending;
  assert.equal(success.status, "completed");
  assert.equal(success.results.dtc.length, 3);
  assert.ok(success.results.dtc.every(item => item.snapshot.dtc_readout_status === "reported" && item.snapshot.dtcs.length === 0));
  assert.deepEqual(success.results.live.map(item => item.evidence.value), [90, 2000.25]);
  for (const mutate of [
    value => { value.cleanup_confirmed = false; }, value => { value.request_ecu++; },
    value => { value.dtc_reads.reverse(); }, value => { value.dtc_reads.pop(); },
    value => { value.dtc_reads[0].read_result.Messages[0].Data[3]++; },
    value => { value.dtc_reads[1].read_result.Status = 1; },
    value => { value.observations.reverse(); }, value => { value.observations[1].value++; },
    value => { value.observations[1].supported_read.Messages[0].Timestamp++; },
    value => { value.extra = true; }
  ]) {
    const changed = JSON.parse(output.stdout); mutate(changed);
    const reject = supervise(() => spawn(process.execPath, ["-e", "process.stdout.write(process.argv[1])", JSON.stringify(changed)], options));
    const outcome = await reject();
    assert.equal(outcome.completion.worker_exited, true);
    assert.equal(outcome.status, "unavailable"); assert.equal(outcome.results, null);
  }
  for (const ending of ["process.exitCode=1", "process.stderr.write('fixture error')"]) {
    const reject = supervise(() => spawn(process.execPath, ["-e", `process.stdout.write(process.argv[1]);${ending}`, output.stdout], options));
    const outcome = await reject();
    assert.equal(outcome.status, "unavailable"); assert.equal(outcome.results, null);
  }
  const cancelled = supervise(() => { throw new Error("must not spawn"); });
  const abort = new AbortController(); abort.abort();
  assert.equal((await cancelled({ signal: abort.signal })).reason, "fixture_cancelled");
  assert.equal((await cancelled()).reason, "fixture_already_consumed");
  console.log(arch, "bounded sweep parent: managed child success, 10 malformed results, failed exit/stderr/cancellation rejected");
}
