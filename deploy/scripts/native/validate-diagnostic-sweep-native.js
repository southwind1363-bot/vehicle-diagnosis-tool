import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import vm from "node:vm";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { buildJ2534NativeFixture } from "./build-j2534-native-fixture.js";
import "../validate-j2534-sweep-selection-handoff.js";
import { createDiagnosticSweepFixtureSpawn } from "./mode01-fixture-spawn.js";
import { createJ2534SweepSelectionHandoff } from "../j2534-sweep-selection-handoff.js";
import { createJ2534SelectedSweepFixtureSupervisor } from "../j2534-selected-sweep-fixture-supervisor.js";
import { createRegisteredSweepFixtureSupervisor } from "./sweep-registered-fixture-supervisor.js";

assert.equal(process.platform, "win32");
const context = vm.createContext({ window: {}, navigator: {} });
vm.runInContext(fs.readFileSync(new URL("../../obd-readonly.js", import.meta.url), "utf8"), context);
const obd = context.window.ObdReadOnly;
obd.configureMonitorDefinitions(JSON.parse(fs.readFileSync(new URL("../../data/obd-monitor-definitions.json", import.meta.url), "utf8")));
for (const [arch, framework] of [["x86", "Framework"], ["x64", "Framework64"]]) {
  for (const suffix of ["", "-stop-failure", "-disconnect-failure", "-close-failure",
    ...["03", "07", "0a", "00", "05", "0c"].flatMap(stage =>
      ["write", "read"].map(operation => `-${stage}-${operation}-failure`))]) {
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
    const descriptor = { root, architecture: arch, fixture_sha256: digest.toLowerCase(),
      worker_sha256: crypto.createHash("sha256").update(fs.readFileSync(exe)).digest("hex") };
    const command = ["--generated-diagnostic-sweep"];
    if (!suffix) {
      for (const invalid of [[], [...command, "extra"], ["--generated-mode01-pair"]]) {
        const refused = createDiagnosticSweepFixtureSpawn(descriptor);
        assert.throws(() => refused(invalid), /spawn_rejected/);
        assert.throws(() => refused(command), /spawn_consumed/);
      }
      for (const target of [exe, path.join(root, "sweep.dll")]) {
        const refused = createDiagnosticSweepFixtureSpawn(descriptor);
        const original = fs.readFileSync(target), changed = Buffer.from(original);
        changed[changed.length - 1] ^= 1;
        try {
          fs.writeFileSync(target, changed);
          assert.throws(() => refused(command), /spawn_rejected/);
        } finally { fs.writeFileSync(target, original); }
        assert.throws(() => refused(command), /spawn_consumed/);
      }
      assert.throws(() => createDiagnosticSweepFixtureSpawn({ ...descriptor, worker_sha256: "0".repeat(64) }), /descriptor_invalid/);
      assert.throws(() => createDiagnosticSweepFixtureSpawn({ ...descriptor, architecture: "arm64" }), /descriptor_invalid/);
    }
    const fixedSpawn = createDiagnosticSweepFixtureSpawn(descriptor);
    const secret = Object.freeze({});
    const selected = { selected_device_id: "j2534-0123456789abcdef", path: path.join(root, "sweep.dll"),
      sha256: digest, size: dll.length, architecture: arch };
    let now = 100, current = selected, launches = 0;
    const handoff = createJ2534SweepSelectionHandoff({ now: () => now,
      resolveDescriptor: d => d === secret ? current : null,
      revalidateDescriptor: d => d === secret ? current : null });
    const pinned = { path: selected.path, sha256: digest, size: dll.length, architecture: arch, request_ecu: 0x7e0 };
    const settings = { handoff, descriptor: secret, pinned,
      decodeDtcResponse: obd.decodeObdDtcResponse, decodeLivePidResponse: obd.decodeLivePidResponse,
      buildDiagnosticScanSession: obd.buildDiagnosticScanSession, normalizeBridgeLivePidSnapshot: obd.normalizeBridgeLivePidSnapshot,
      spawnWorker: args => { launches++; return fixedSpawn(args); } };
    if (!suffix) {
      // Use the actual imported registered factory, not an extracted resolver or
      // injected secret store. A look-alike descriptor must never reach spawn.
      for (const unissued of [{}, { ...selected }, JSON.parse(JSON.stringify(selected))]) {
        let injectedCalls = 0;
        const refused = createRegisteredSweepFixtureSupervisor({ ...settings,
          descriptor: unissued, spawnDescriptor: descriptor,
          handoff: { prepare() { injectedCalls++; return {}; }, consume() { injectedCalls++; return selected; } },
          spawnWorker() { injectedCalls++; throw new Error("injection_must_not_run"); } });
        const rejected = await refused();
        assert.equal(rejected.status, "unavailable");
        assert.equal(rejected.session, null);
        assert.equal(rejected.results, null);
        assert.equal(rejected.completion.worker_started, false);
        assert.equal(rejected.completion.parsed_result, null);
        assert.equal(injectedCalls, 0);
        assert.equal((await refused()).reason, "fixture_already_consumed");
        assert.ok(!JSON.stringify(rejected).includes(root));
      }
      console.log(arch, "actual registered factory rejects unissued descriptors before worker start");
      assert.deepEqual(fixedSpawn.pinned, pinned);
      assert.ok(Object.isFrozen(fixedSpawn) && Object.isFrozen(fixedSpawn.pinned));
      assert.throws(() => { fixedSpawn.pinned.size++; }, TypeError);
      for (const changed of [{ path: path.join(root, "other.dll") }, { sha256: "0".repeat(64) },
        { size: dll.length + 1 }, { architecture: arch === "x86" ? "x64" : "x86" },
        { request_ecu: 0x7e1 }, { extra: true }]) {
        assert.throws(() => createRegisteredSweepFixtureSupervisor({ ...settings,
          pinned: { ...pinned, ...changed }, spawnDescriptor: descriptor }), /sweep_fixture_build_mismatch/);
      }
      assert.equal(launches, 0);
      for (const change of [() => { now += 5000; }, () => { now--; },
        () => { current = { ...selected, size: selected.size + 1 }; },
        () => { current = { ...selected, sha256: "F".repeat(64) }; }]) {
        const refused = createJ2534SelectedSweepFixtureSupervisor(settings);
        change();
        assert.equal((await refused()).session, null);
        assert.equal((await refused()).reason, "fixture_already_consumed");
        assert.equal(launches, 0); now = 100; current = selected;
      }
      assert.equal((await createJ2534SelectedSweepFixtureSupervisor({ ...settings, descriptor: {} })()).session, null);
      assert.equal(launches, 0);
    }
    const parent = createJ2534SelectedSweepFixtureSupervisor(settings);
    const result = await parent();
    assert.equal(result.completion.worker_exited, true);
    assert.equal(result.status, suffix ? "unavailable" : "completed");
    if (suffix) {
      assert.equal(result.session, null); assert.equal(result.results, null);
      assert.equal(result.completion.parsed_result, null);
    }
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
    assert.equal(launches, 1);
    assert.throws(() => fixedSpawn(command), /spawn_consumed/);
    console.log(arch, suffix || "success", "generated DLL sweep -> bounded worker -> session/archive passed (no vendor/VCI/car)");
  }
}
