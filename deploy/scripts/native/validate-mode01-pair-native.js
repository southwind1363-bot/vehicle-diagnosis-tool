import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import vm from "node:vm";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { spawnSync, spawn } from "node:child_process";
import { buildJ2534NativeFixture } from "./build-j2534-native-fixture.js";
import { createJ2534Mode01PairSessionSupervisor } from "../j2534-mode01-pair-session-supervisor.js";

assert.equal(process.platform, "win32");
const context = vm.createContext({ window: {}, navigator: {} });
vm.runInContext(fs.readFileSync(new URL("../../obd-readonly.js", import.meta.url), "utf8"), context);
const obd = context.window.ObdReadOnly;
obd.configureMonitorDefinitions(JSON.parse(fs.readFileSync(new URL("../../data/obd-monitor-definitions.json", import.meta.url), "utf8")));
const env = { SystemRoot: process.env.SystemRoot, TEMP: os.tmpdir(), TMP: os.tmpdir() };
for (const [arch, framework] of [["x86", "Framework"], ["x64", "Framework64"]]) {
  for (const suffix of ["", "-stop-failure", "-disconnect-failure", "-close-failure"]) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "mode01-native-"));
    const dll = buildJ2534NativeFixture(arch, `owned-dtc-mode01-pair${suffix}`);
    fs.writeFileSync(path.join(root, "mode01.dll"), dll, { flag: "wx" });
    const digest = crypto.createHash("sha256").update(dll).digest("hex").toUpperCase();
    const pin = path.join(root, "Digest.cs");
    fs.writeFileSync(pin, `internal static class Mode01PairFixtureDigest { internal const string Value = "${digest}"; internal const long Size = ${dll.length}; }`, { flag: "wx" });
    const exe = path.join(root, "pair-worker.exe");
    const compiler = path.join(process.env.SystemRoot, "Microsoft.NET", framework, "v4.0.30319", "csc.exe");
    const args = ["/nologo", "/warnaserror", `/platform:${arch}`, `/out:${exe}`,
      "/define:J2534_DTC_DEVELOPMENT;J2534_MODE01_DEVELOPMENT;J2534_MODE01_PAIR_FIXTURE;PREFLIGHT_FIXTURE_TESTS", pin,
      ...["J2534IdentityNative.cs", "J2534ReadRequestNative.cs", "J2534ReceiveNative.cs", "J2534Mode01Exchange.cs",
        "J2534DtcExecutionLease.cs", "J2534GlobalMutexLease.cs", "WindowsDtcReadLibrary.cs", "J2534RegisteredDriverPreflight.cs",
        "J2534AuthenticodeVerifier.cs", "J2534Mode01Observation.cs", "J2534Mode01PairExchange.cs", "J2534Mode01PairFixtureWorker.cs"]
        .map(name => fileURLToPath(new URL(name, import.meta.url)))];
    const options = { cwd: root, env, shell: false, windowsHide: true, encoding: "utf8", timeout: 15000, maxBuffer: 65536 };
    if (suffix === "") {
      const built = spawnSync(compiler, args.map(arg => arg.replace(";PREFLIGHT_FIXTURE_TESTS", "")), options);
      assert.equal(built.status, 0, built.stdout + built.stderr);
      const refused = spawnSync(exe, ["--generated-mode01-pair"], options);
      assert.equal(refused.status, 1); assert.equal(refused.stdout, ""); assert.equal(refused.stderr, "");
    }
    const built = spawnSync(compiler, args, options);
    assert.equal(built.status, 0, built.stdout + built.stderr);
    for (const invalid of [[], ["--generated-mode01"], ["--generated-mode01-pair", "extra"]]) {
      const refused = spawnSync(exe, invalid, options);
      assert.equal(refused.status, 2); assert.equal(refused.stdout, "");
    }
    if (suffix === "") {
      // Only our generated temp fixture is altered; no vendor file is accessed.
      const changed = Buffer.from(dll); changed[changed.length - 1] ^= 1;
      fs.writeFileSync(path.join(root, "mode01.dll"), changed);
      try {
        const refused = spawnSync(exe, ["--generated-mode01-pair"], options);
        assert.equal(refused.status, 1); assert.equal(refused.stdout, ""); assert.equal(refused.stderr, "");
      } finally { fs.writeFileSync(path.join(root, "mode01.dll"), dll); }
    }
    const parent = createJ2534Mode01PairSessionSupervisor({ requestEcu: 0x7e0,
      buildDiagnosticScanSession: obd.buildDiagnosticScanSession,
      normalizeBridgeLivePidSnapshot: obd.normalizeBridgeLivePidSnapshot,
      decodeLivePidResponse: obd.decodeLivePidResponse,
      spawnWorker: () => spawn(exe, ["--generated-mode01-pair"], { cwd: root, env, shell: false,
        windowsHide: true, stdio: ["ignore", "pipe", "pipe"] }) });
    const outcome = await parent();
    assert.equal(outcome.completion.worker_exited, true);
    if (suffix === "") {
      assert.equal(outcome.status, "completed", JSON.stringify(outcome.completion));
      assert.deepEqual(outcome.results.map(item => item.evidence.value), [90, 2000.25]);
      assert.ok(outcome.results.every(item => item.snapshot.source === "j2534_development_read"
        && item.snapshot.vehicle_command_enabled === false && item.snapshot.would_transmit === false));
      const archive = JSON.stringify(obd.buildBridgeSessionExportPayload(outcome.session));
      if (arch === "x64" && process.argv.includes("--ui-artifact")) {
        const artifact = path.join(root, "mode01-pair-ui-session.json");
        fs.writeFileSync(artifact, archive, { flag: "wx" });
        console.log("Pair UI artifact:", artifact);
      }
      const restored = obd.buildDiagnosticScanSessionFromJson(archive);
      assert.deepEqual(restored.livePidSnapshot.monitorValues, outcome.session.livePidSnapshot.monitorValues);
      for (const session of [outcome.session, restored]) {
        assert.equal(session.source, "j2534_development_read");
        assert.equal(session.vehicleCommandEnabled, false);
        assert.equal(session.livePidSnapshot.source, "j2534_development_read");
        assert.deepEqual(Array.from(session.livePidSnapshot.monitorValues, item => Number(item.value)).sort((a, b) => a - b), [90, 2000.25]);
        assert.equal(session.supportedPidMatrix.source, "j2534_development_read");
        assert.deepEqual(Array.from(session.supportedPidMatrix.supportedPids), ["05", "0C"]);
        assert.equal(session.supportedPidMatrix.supportedPidEcuSnapshots[0].sourceEcu, "7E8");
        assert.notEqual(session.dtcSnapshot.dtcReadoutStatus, "reported");
      }
      // Reuse only generated artificial stdout, never user/vehicle data.
      for (const build of [() => { throw new Error("fixture"); }, () => null,
        input => ({ ...obd.buildDiagnosticScanSession(input), vehicleCommandEnabled: true })]) {
        const rejected = createJ2534Mode01PairSessionSupervisor({ requestEcu: 0x7e0,
          decodeLivePidResponse: obd.decodeLivePidResponse,
          normalizeBridgeLivePidSnapshot: obd.normalizeBridgeLivePidSnapshot,
          buildDiagnosticScanSession: build,
          spawnWorker: () => spawn(process.execPath, ["-e", "process.stdout.write(process.argv[1])",
            outcome.completion.parsed_result.stdout], { windowsHide: true, shell: false,
            stdio: ["ignore", "pipe", "pipe"] }) });
        const failed = await rejected();
        assert.equal(failed.status, "unavailable");
        assert.equal(failed.session, null); assert.equal(failed.results, null);
        assert.equal((await rejected()).reason, "fixture_already_consumed");
      }
      console.log(arch, "pair archive round-trip and session-builder refusal passed; no vehicle data");
    } else {
      assert.equal(outcome.completion.execution_status, "worker_failed");
      assert.equal(outcome.results, null);
      assert.equal(outcome.session, null);
    }
    assert.equal((await parent()).reason, "fixture_already_consumed");
    console.log(arch, `generated pair${suffix}: fixed native ABI -> owned cleanup -> bounded parent passed`);
  }
}
