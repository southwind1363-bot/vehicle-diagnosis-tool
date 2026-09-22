import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { spawnSync, spawn } from "node:child_process";
import vm from "node:vm";
import { createJ2534Mode01PairFixtureSupervisor } from "../j2534-mode01-pair-fixture-supervisor.js";

assert.equal(process.platform, "win32");
const context = vm.createContext({ window: {}, navigator: {} });
vm.runInContext(fs.readFileSync(new URL("../../obd-readonly.js", import.meta.url), "utf8"), context);
const obd = context.window.ObdReadOnly;
obd.configureMonitorDefinitions(JSON.parse(fs.readFileSync(new URL("../../data/obd-monitor-definitions.json", import.meta.url), "utf8")));
const root = fs.mkdtempSync(path.join(os.tmpdir(), "mode01-pair-"));
for (const [arch, framework] of [["x86", "Framework"], ["x64", "Framework64"]]) {
  const compiler = path.join(process.env.SystemRoot || "C:\\Windows", "Microsoft.NET", framework, "v4.0.30319", "csc.exe");
  const exe = path.join(root, `pair-${arch}.exe`);
  const run = (file, args) => spawnSync(file, args, { cwd: root, shell: false, windowsHide: true,
    encoding: "utf8", timeout: 15000, maxBuffer: 65536 });
  const built = run(compiler, ["/nologo", "/warnaserror", "/define:J2534_DTC_DEVELOPMENT;J2534_MODE01_DEVELOPMENT",
    `/platform:${arch}`, `/out:${exe}`, ...["J2534Mode01PairExchange.cs", "J2534Mode01PairExchangeTests.cs",
      "J2534Mode01Exchange.cs", "J2534Mode01Observation.cs", "J2534IdentityNative.cs",
      "J2534ReadRequestNative.cs", "J2534ReceiveNative.cs"].map(name => fileURLToPath(new URL(name, import.meta.url)))]);
  assert.equal(built.status, 0, built.stdout + built.stderr);
  const result = run(exe, []);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.equal(result.stderr, "");
  console.log(arch, result.stdout.trim());
  let validOutput;
  for (const argument of ["--fixture-output", "--fixture-failed-exit", "--fixture-cleanup-failure"]) {
    let starts = 0;
    const worker = createJ2534Mode01PairFixtureSupervisor({ requestEcu: 0x7e0,
      decodeLivePidResponse: obd.decodeLivePidResponse, spawnWorker: request => {
        starts++;
        assert.deepEqual(request, { request_ecu: 0x7e0, pids: [5, 12] });
        assert.ok(Object.isFrozen(request) && Object.isFrozen(request.pids));
        return spawn(exe, [argument], { cwd: root, shell: false, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
      } });
    const pending = worker();
    assert.equal((await worker()).reason, "fixture_already_consumed");
    const outcome = await pending;
    assert.equal(outcome.completion.worker_exited, true);
    if (argument === "--fixture-output") {
      assert.equal(outcome.status, "completed");
      validOutput = outcome.completion.parsed_result.stdout;
      assert.deepEqual(outcome.results.map(item => item.evidence.value), [90, 2000.25]);
      for (const item of outcome.results) {
        assert.equal(item.snapshot.source, "j2534_development_read");
        assert.equal(item.snapshot.vehicle_command_enabled, false);
        assert.equal(item.snapshot.would_transmit, false);
      }
    } else {
      assert.equal(outcome.status, "unavailable");
      assert.equal(outcome.results, null);
    }
    assert.equal((await worker()).reason, "fixture_already_consumed");
    assert.equal(starts, 1);
  }
  console.log(arch, "fixed managed pair child -> bounded parent: success/failed exit/cleanup refusal passed (no DLL)");
  const mutations = [
    envelope => { envelope.extra = true; },
    envelope => { envelope.observations.pop(); },
    envelope => { envelope.observations.reverse(); },
    envelope => { envelope.observations[1].request_ecu++; },
    envelope => { envelope.observations[1].cleanup_confirmed = false; },
    envelope => { envelope.observations[1].value++; },
    envelope => { envelope.observations[1].supported_read.Messages[0].Timestamp++; },
    envelope => { envelope.observations[1].value_read.Messages[0].Data.pop(); }
  ];
  for (const mutate of mutations) {
    const envelope = JSON.parse(validOutput); mutate(envelope);
    const worker = createJ2534Mode01PairFixtureSupervisor({ requestEcu: 0x7e0,
      decodeLivePidResponse: obd.decodeLivePidResponse,
      spawnWorker: () => spawn(process.execPath, ["-e", "process.stdout.write(process.argv[1])", JSON.stringify(envelope)],
        { cwd: root, shell: false, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] }) });
    const outcome = await worker();
    assert.equal(outcome.completion.execution_status, "worker_completed");
    assert.equal(outcome.status, "unavailable"); assert.equal(outcome.results, null);
    assert.equal((await worker()).reason, "fixture_already_consumed");
  }
  const cancelled = createJ2534Mode01PairFixtureSupervisor({ requestEcu: 0x7e0,
    decodeLivePidResponse: obd.decodeLivePidResponse, spawnWorker: () => { throw new Error("must not spawn"); } });
  const controller = new AbortController(); controller.abort();
  assert.equal((await cancelled({ signal: controller.signal })).reason, "fixture_cancelled");
  assert.equal((await cancelled()).reason, "fixture_already_consumed");
  console.log(arch, "pair parent rejects 8 malformed/mismatched envelopes and consumes pre-cancellation");
}
