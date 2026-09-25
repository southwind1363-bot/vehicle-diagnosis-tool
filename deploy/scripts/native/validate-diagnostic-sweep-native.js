import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import vm from "node:vm";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { spawnSync, spawn } from "node:child_process";
import { buildJ2534NativeFixture } from "./build-j2534-native-fixture.js";
import { createJ2534SweepSessionSupervisor } from "../j2534-sweep-session-supervisor.js";

assert.equal(process.platform, "win32");
const context = vm.createContext({ window: {}, navigator: {} });
vm.runInContext(fs.readFileSync(new URL("../../obd-readonly.js", import.meta.url), "utf8"), context);
const obd = context.window.ObdReadOnly;
obd.configureMonitorDefinitions(JSON.parse(fs.readFileSync(new URL("../../data/obd-monitor-definitions.json", import.meta.url), "utf8")));
for (const [arch, framework] of [["x86", "Framework"], ["x64", "Framework64"]]) {
  for (const suffix of ["", "-stop-failure", "-disconnect-failure", "-close-failure"]) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "sweep-native-"));
    const dll = buildJ2534NativeFixture(arch, `owned-dtc-mode01-sweep${suffix}`);
    fs.writeFileSync(path.join(root, "sweep.dll"), dll, { flag: "wx" });
    const digest = crypto.createHash("sha256").update(dll).digest("hex").toUpperCase();
    const pin = path.join(root, "Digest.cs");
    fs.writeFileSync(pin, `internal static class SweepFixtureDigest { internal const string Value = "${digest}"; internal const long Size = ${dll.length}; }`, { flag: "wx" });
    const exe = path.join(root, "sweep-worker.exe");
    const compiler = path.join(process.env.SystemRoot, "Microsoft.NET", framework, "v4.0.30319", "csc.exe");
    const args = ["/nologo", "/warnaserror", `/platform:${arch}`, `/out:${exe}`,
      "/define:J2534_DTC_DEVELOPMENT;J2534_MODE01_DEVELOPMENT;J2534_SWEEP_FIXTURE;PREFLIGHT_FIXTURE_TESTS", pin,
      ...["J2534IdentityNative.cs", "J2534ReadRequestNative.cs", "J2534ReceiveNative.cs", "J2534Mode01Exchange.cs",
        "J2534DtcExecutionLease.cs", "J2534GlobalMutexLease.cs", "WindowsDtcReadLibrary.cs", "J2534RegisteredDriverPreflight.cs",
        "J2534AuthenticodeVerifier.cs", "J2534Mode01Observation.cs", "J2534DiagnosticSweepExchange.cs",
        "J2534DiagnosticSweepOwned.cs", "J2534DiagnosticSweepObservation.cs", "J2534DiagnosticSweepFixtureWorker.cs"]
        .map(name => fileURLToPath(new URL(name, import.meta.url)))];
    const options = { cwd: root, env: { SystemRoot: process.env.SystemRoot, TEMP: os.tmpdir(), TMP: os.tmpdir() },
      shell: false, windowsHide: true, encoding: "utf8", timeout: 15000, maxBuffer: 65536 };
    if (!suffix) {
      const built = spawnSync(compiler, args.map(arg => arg.replace(";PREFLIGHT_FIXTURE_TESTS", "")), options);
      assert.equal(built.status, 0, built.stdout + built.stderr);
      const refused = spawnSync(exe, ["--generated-diagnostic-sweep"], options);
      assert.equal(refused.status, 1); assert.equal(refused.stdout, "");
    }
    const built = spawnSync(compiler, args, options);
    assert.equal(built.status, 0, built.stdout + built.stderr);
    for (const invalid of [[], ["--generated-mode01-pair"], ["--generated-diagnostic-sweep", "extra"]]) {
      const refused = spawnSync(exe, invalid, options);
      assert.equal(refused.status, 2); assert.equal(refused.stdout, "");
    }
    const parent = createJ2534SweepSessionSupervisor({ requestEcu: 0x7e0,
      decodeDtcResponse: obd.decodeObdDtcResponse, decodeLivePidResponse: obd.decodeLivePidResponse,
      buildDiagnosticScanSession: obd.buildDiagnosticScanSession, normalizeBridgeLivePidSnapshot: obd.normalizeBridgeLivePidSnapshot,
      spawnWorker: () => spawn(exe, ["--generated-diagnostic-sweep"], { ...options, stdio: ["ignore", "pipe", "pipe"] }) });
    const result = await parent();
    assert.equal(result.completion.worker_exited, true);
    assert.equal(result.status, suffix ? "unavailable" : "completed");
    if (suffix) { assert.equal(result.session, null); assert.equal(result.results, null); }
    else {
      assert.deepEqual(result.results.live.map(item => item.evidence.value), [90, 2000.25]);
      const restored = obd.buildDiagnosticScanSessionFromJson(JSON.stringify(obd.buildBridgeSessionExportPayload(result.session)));
      assert.equal(restored.dtcSnapshot.dtcs.length, 3);
      assert.deepEqual(restored.dtcSnapshot.dtcs, result.session.dtcSnapshot.dtcs);
      assert.deepEqual(restored.livePidSnapshot.monitorValues, result.session.livePidSnapshot.monitorValues);
      assert.equal(restored.source, "j2534_development_read");
      assert.equal(restored.vehicleCommandEnabled, false);
    }
    assert.equal((await parent()).session, null);
    console.log(arch, suffix || "success", "generated DLL sweep -> bounded worker -> session/archive passed (no vendor/VCI/car)");
  }
}
