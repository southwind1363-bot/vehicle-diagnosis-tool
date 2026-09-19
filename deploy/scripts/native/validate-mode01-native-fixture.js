import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import vm from "node:vm";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { spawnSync, spawn } from "node:child_process";
import { buildJ2534NativeFixture } from "./build-j2534-native-fixture.js";
import { createJ2534Mode01FixtureSupervisor } from "../j2534-mode01-fixture-supervisor.js";

assert.equal(process.platform, "win32");
const context = vm.createContext({ window: {}, navigator: {} });
vm.runInContext(fs.readFileSync(new URL("../../obd-readonly.js", import.meta.url), "utf8"), context);
const obd = context.window.ObdReadOnly;
obd.configureMonitorDefinitions(JSON.parse(fs.readFileSync(new URL("../../data/obd-monitor-definitions.json", import.meta.url), "utf8")));
const env = { SystemRoot: process.env.SystemRoot, TEMP: os.tmpdir(), TMP: os.tmpdir() };
for (const [arch, framework] of [["x86", "Framework"], ["x64", "Framework64"]]) {
 for (const [suffix, pid, value] of [["", 5, 90], ["-rpm", 12, 2000.25], ["-rpm-zero", 12, 0],
   ["-unsupported", 5, null], ["-wrong-pid", 5, null], ["-incomplete", 5, null]]) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "mode01-native-"));
  const dll = buildJ2534NativeFixture(arch, `owned-dtc-mode01${suffix}`);
  fs.writeFileSync(path.join(root, "mode01.dll"), dll, { flag: "wx" });
  const digest = crypto.createHash("sha256").update(dll).digest("hex").toUpperCase();
  const source = path.join(root, "Digest.cs");
  fs.writeFileSync(source, `internal static class Mode01FixtureDigest { internal const string Value = "${digest}"; internal const byte Pid = ${pid}; }`, { flag: "wx" });
  const exe = path.join(root, "mode01-worker.exe");
  const compiler = path.join(process.env.SystemRoot, "Microsoft.NET", framework, "v4.0.30319", "csc.exe");
  const build = spawnSync(compiler, ["/nologo", "/warnaserror", `/platform:${arch}`, `/out:${exe}`,
    "/define:J2534_DTC_DEVELOPMENT;J2534_MODE01_DEVELOPMENT", source,
    ...["J2534IdentityNative.cs", "J2534ReadRequestNative.cs", "J2534ReceiveNative.cs", "J2534Mode01Exchange.cs",
      "J2534DtcExecutionLease.cs", "J2534GlobalMutexLease.cs",
      "J2534Mode01Observation.cs", "J2534Mode01FixtureWorker.cs"].map(name => fileURLToPath(new URL(name, import.meta.url)))],
  { cwd: root, env, windowsHide: true, encoding: "utf8", timeout: 15000 });
  assert.equal(build.status, 0, build.stdout + build.stderr);
  if (suffix === "") {
    const holderExe = path.join(root, "lease-holder.exe");
    const holderBuild = spawnSync(compiler, ["/nologo", "/warnaserror", `/platform:${arch}`, `/out:${holderExe}`,
      "/define:J2534_DTC_DEVELOPMENT;NATIVE_RECEIVE_FIXTURE_TESTS",
      ...["J2534DtcExecutionLease.cs", "J2534GlobalMutexLease.cs", "J2534DtcExecutionLeaseTests.cs"].map(name => fileURLToPath(new URL(name, import.meta.url)))],
    { cwd: root, env, windowsHide: true, encoding: "utf8", timeout: 15000 });
    assert.equal(holderBuild.status, 0, holderBuild.stdout + holderBuild.stderr);
    const holder = spawn(holderExe, ["active"], { cwd: root, env, windowsHide: true, timeout: 10000,
      killSignal: "SIGKILL", stdio: ["pipe", "pipe", "pipe"] });
    const closed = new Promise(resolve => holder.once("close", (code, signal) => resolve({ code, signal })));
    try {
      await new Promise((resolve, reject) => {
        let text = "";
        const timer = setTimeout(() => reject(new Error("lease holder readiness timeout")), 5000);
        holder.once("error", error => { clearTimeout(timer); reject(error); });
        holder.once("exit", () => { clearTimeout(timer); reject(new Error("lease holder exited before readiness")); });
        holder.stdout.on("data", chunk => {
          text += chunk.toString();
          if (text === "READY\r\n" || text === "READY\n") { clearTimeout(timer); resolve(); }
        });
      });
      const blocked = spawnSync(exe, ["--generated-mode01"], { cwd: root, env, windowsHide: true,
        encoding: "utf8", timeout: 15000, maxBuffer: 8192 });
      assert.equal(blocked.status, 8);
      assert.equal(blocked.stdout, "");
      assert.equal(blocked.stderr, "");
    } finally { holder.stdin.end("done\n"); }
    const released = await closed;
    assert.equal(released.code, 0); assert.equal(released.signal, null);
    console.log(arch, "Mode01 shared lease busy refusal and holder shutdown: 5 checks passed");
  }
  let exitCode;
  const run = createJ2534Mode01FixtureSupervisor({ expected: { request_ecu: 0x7e0, pid },
    decodeLivePidResponse: obd.decodeLivePidResponse, buildDiagnosticScanSession: obd.buildDiagnosticScanSession,
    spawnWorker: () => {
      const child = spawn(exe, ["--generated-mode01"], { cwd: root, env, windowsHide: true, shell: false, stdio: ["ignore", "pipe", "pipe"] });
      child.once("exit", code => { exitCode = code; });
      return child;
    } });
  const result = await run();
  if (value === null) {
    assert.equal(exitCode, 5, "Invalid response must be rejected, not crash the worker");
    assert.equal(result.status, "unavailable");
    assert.equal(result.session, null);
    assert.equal(result.completion.parsed_result, null);
    assert.equal((await run()).reason, "fixture_already_consumed");
    console.log(arch, suffix, "native rejection -> no session: 5 checks passed");
    continue;
  }
  assert.equal(result.status, "completed", JSON.stringify(result.completion));
  const output = JSON.parse(result.completion.parsed_result.stdout);
  assert.equal(output.value, value);
  assert.equal(output.supported_read.Status, 9);
  assert.equal(output.value_read.Status, 9);
  const restored = obd.buildDiagnosticScanSessionFromJson(JSON.stringify(obd.buildBridgeSessionExportPayload(result.session)));
  assert.equal(restored.source, "j2534_development_read");
  assert.deepEqual(restored.livePidSnapshot.monitorValues, result.session.livePidSnapshot.monitorValues);
  assert.equal((await run()).reason, "fixture_already_consumed");
  const wrongOrder = spawnSync(exe, ["--generated-mode01-out-of-order"], { cwd: root, env, windowsHide: true,
    encoding: "utf8", timeout: 15000, maxBuffer: 8192 });
  assert.equal(wrongOrder.status, 6);
  assert.equal(wrongOrder.stdout, "");
  assert.equal(wrongOrder.stderr, "");
  const changed = Buffer.from(dll); changed[0] ^= 1;
  fs.writeFileSync(path.join(root, "mode01.dll"), changed);
  const badDigest = spawnSync(exe, ["--generated-mode01"], { cwd: root, env, windowsHide: true,
    encoding: "utf8", timeout: 15000, maxBuffer: 8192 });
  assert.equal(badDigest.status, 1);
  assert.equal(badDigest.stdout, "");
  console.log(arch, suffix || "-coolant", "fixed native Mode01 DLL -> owner cleanup -> bounded child -> session restore: 12 checks passed; no vendor/VCI/vehicle");
 }
}
