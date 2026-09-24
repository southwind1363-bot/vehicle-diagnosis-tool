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
import { createJ2534SelectedMode01PairFixtureSupervisor } from "../j2534-selected-mode01-pair-fixture-supervisor.js";
import { createJ2534Mode01PairSelectionHandoff } from "../j2534-mode01-pair-selection-handoff.js";
import { createMode01PairFixtureSpawn } from "./mode01-fixture-spawn.js";
import { createRegisteredMode01PairFixtureSupervisor } from "./mode01-pair-registered-fixture-supervisor.js";

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
    const selectedArgs = ["--selected-generated-mode01-pair", path.join(root, "mode01.dll"), digest,
      String(dll.length), arch, "2016", "5", "12"];
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
      const refused = spawnSync(exe, selectedArgs, options);
      assert.equal(refused.status, 1); assert.equal(refused.stdout, ""); assert.equal(refused.stderr, "");
    }
    const built = spawnSync(compiler, args, options);
    assert.equal(built.status, 0, built.stdout + built.stderr);
    for (const invalid of [[], ["--generated-mode01"], ["--generated-mode01-pair", "extra"]]) {
      const refused = spawnSync(exe, invalid, options);
      assert.equal(refused.status, 2); assert.equal(refused.stdout, "");
    }
    for (let index = 0; index < selectedArgs.length; index++) {
      const invalid = [...selectedArgs]; invalid[index] += "x";
      const refused = spawnSync(exe, invalid, options);
      assert.equal(refused.status, 2); assert.equal(refused.stdout, "");
    }
    for (const invalid of [selectedArgs.slice(0, -1), [...selectedArgs, "extra"],
      [...selectedArgs.slice(0, 6), "12", "5"]]) {
      const refused = spawnSync(exe, invalid, options);
      assert.equal(refused.status, 2); assert.equal(refused.stdout, "");
    }
    if (suffix === "") {
      // Only our generated temp fixture is altered; no vendor file is accessed.
      const changed = Buffer.from(dll); changed[changed.length - 1] ^= 1;
      fs.writeFileSync(path.join(root, "mode01.dll"), changed);
      try {
        const refused = spawnSync(exe, selectedArgs, options);
        assert.equal(refused.status, 1); assert.equal(refused.stdout, ""); assert.equal(refused.stderr, "");
      } finally { fs.writeFileSync(path.join(root, "mode01.dll"), dll); }
    }
    const pinned = { path: selectedArgs[1], sha256: digest, size: dll.length, architecture: arch, request_ecu: 0x7e0 };
    const descriptor = Object.freeze({});
    let now = 100, current = { selected_device_id: "j2534-0123456789abcdef",
      path: pinned.path, sha256: digest, size: dll.length, architecture: arch }, launches = 0;
    const handoff = createJ2534Mode01PairSelectionHandoff({ now: () => now,
      resolveDescriptor: d => d === descriptor ? current : null,
      revalidateDescriptor: d => d === descriptor ? current : null });
    const spawnDescriptor = { root, architecture: arch, fixture_sha256: digest.toLowerCase(),
      worker_sha256: crypto.createHash("sha256").update(fs.readFileSync(exe)).digest("hex") };
    const fixedSpawn = createMode01PairFixtureSpawn(spawnDescriptor);
    const settings = { handoff, descriptor, pinned,
      buildDiagnosticScanSession: obd.buildDiagnosticScanSession,
      normalizeBridgeLivePidSnapshot: obd.normalizeBridgeLivePidSnapshot,
      decodeLivePidResponse: obd.decodeLivePidResponse,
      spawnWorker: argv => { launches++; assert.deepEqual(argv, selectedArgs); assert.ok(Object.isFrozen(argv));
        return fixedSpawn(argv); } };
    // The real composition must reject an unissued descriptor with valid fixed
    // build files, before registry lookup or child creation. Injection is ignored.
    const unissued = createRegisteredMode01PairFixtureSupervisor({ ...settings, descriptor: {}, spawnDescriptor });
    const blocked = await unissued();
    assert.equal(blocked.session, null); assert.equal(blocked.results, null);
    assert.equal(blocked.completion.worker_started, false);
    assert.equal((await unissued()).reason, "fixture_already_consumed");
    for (const change of [() => { now += 5000; }, () => { current = { ...current, size: current.size + 1 }; },
      () => { current = { ...current, sha256: "F".repeat(64) }; }]) {
      const saved = current, savedNow = now;
      const refused = createJ2534SelectedMode01PairFixtureSupervisor(settings);
      change();
      const result = await refused();
      assert.equal(result.status, "unavailable"); assert.equal(result.session, null); assert.equal(result.results, null);
      assert.equal((await refused()).reason, "fixture_already_consumed");
      assert.equal(launches, 0);
      current = saved; now = savedNow;
    }
    // A consistent but different selection must still fail the independent builder pin.
    const saved = current; current = { ...current, size: current.size + 1 };
    const mismatched = await createJ2534SelectedMode01PairFixtureSupervisor(settings)();
    assert.equal(mismatched.status, "unavailable"); assert.equal(launches, 0); current = saved;
    for (const invalid of [{ ...pinned, request_ecu: 0x7e1 }, { ...pinned, size: 0 },
      { ...pinned, sha256: digest.toLowerCase() }, { ...pinned, architecture: "arm64" },
      { ...pinned, extra: true }, { ...pinned, path: "relative.dll" }]) {
      assert.throws(() => createJ2534SelectedMode01PairFixtureSupervisor({ ...settings, pinned: invalid }),
        /mode01_pair_fixture_selection_invalid/);
    }
    const cancelled = createJ2534SelectedMode01PairFixtureSupervisor(settings);
    assert.equal((await cancelled({ signal: AbortSignal.abort() })).reason, "fixture_cancelled");
    assert.equal((await cancelled()).reason, "fixture_already_consumed"); assert.equal(launches, 0);
    const parent = createJ2534SelectedMode01PairFixtureSupervisor(settings);
    pinned.path = "C:\\changed-after-prepare\\mode01.dll"; // Parent owns its independent copy.
    const outcome = await parent();
    assert.equal(launches, 1);
    assert.throws(() => fixedSpawn(selectedArgs), /spawn_consumed/);
    const badArguments = createMode01PairFixtureSpawn(spawnDescriptor);
    assert.throws(() => badArguments([...selectedArgs.slice(0, 6), "12", "5"]), /spawn_rejected/);
    assert.throws(() => badArguments(selectedArgs), /spawn_consumed/);
    // Only artificial files under this generated temp root are touched.
    const configGuard = createMode01PairFixtureSpawn(spawnDescriptor);
    fs.writeFileSync(`${exe}.config`, "<configuration/>", { flag: "wx" });
    try {
      assert.throws(() => createMode01PairFixtureSpawn(spawnDescriptor), /descriptor_invalid/);
      assert.throws(() => configGuard(selectedArgs), /spawn_rejected/);
    } finally { fs.unlinkSync(`${exe}.config`); }
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
