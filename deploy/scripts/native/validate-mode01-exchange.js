import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import vm from "node:vm";
import { createJ2534Mode01ResultConverter } from "../j2534-mode01-result-converter.js";

assert.equal(process.platform, "win32");
const context = vm.createContext({ window: {}, navigator: {} });
vm.runInContext(fs.readFileSync(new URL("../../obd-readonly.js", import.meta.url), "utf8"), context);
const obd = context.window.ObdReadOnly;
obd.configureMonitorDefinitions(JSON.parse(fs.readFileSync(new URL("../../data/obd-monitor-definitions.json", import.meta.url), "utf8")));
const convert = createJ2534Mode01ResultConverter(obd.decodeLivePidResponse);
const root = fs.mkdtempSync(path.join(os.tmpdir(), "mode01-exchange-"));
for (const [arch, framework] of [["x86", "Framework"], ["x64", "Framework64"]]) {
  const compiler = path.join(process.env.SystemRoot || "C:\\Windows", "Microsoft.NET", framework, "v4.0.30319", "csc.exe");
  const exe = path.join(root, `exchange-${arch}.exe`);
  const run = (file, args) => spawnSync(file, args, { cwd: root, shell: false, windowsHide: true,
    encoding: "utf8", timeout: 15000, maxBuffer: 65536 });
  const build = run(compiler, ["/nologo", "/warnaserror", "/define:J2534_DTC_DEVELOPMENT;J2534_MODE01_DEVELOPMENT", `/platform:${arch}`, `/out:${exe}`,
    fileURLToPath(new URL("./J2534Mode01Exchange.cs", import.meta.url)),
    fileURLToPath(new URL("./J2534Mode01Observation.cs", import.meta.url)),
    ...["J2534IdentityNative.cs", "J2534ReadRequestNative.cs", "J2534ReceiveNative.cs"].map(name => fileURLToPath(new URL(name, import.meta.url))),
    fileURLToPath(new URL("./J2534Mode01ExchangeTests.cs", import.meta.url))]);
  assert.equal(build.status, 0, build.stdout + build.stderr);
  const result = run(exe, []);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.equal(result.stderr, "");
  console.log(arch, result.stdout.trim());
  const expected = { request_ecu: 0x7e0, pid: 5 };
  const completed = run(exe, ["--fixture-output"]);
  const decoded = convert(completed, expected);
  assert.equal(decoded.status, "decoded", completed.stdout + completed.stderr);
  assert.equal(decoded.evidence.value, 90);
  assert.equal(decoded.evidence.supported_read.Status, 9);
  assert.equal(decoded.evidence.value_read.Status, 9);
  assert.equal(decoded.snapshot.source, "j2534_development_read");
  assert.equal(decoded.snapshot.vehicle_command_enabled, false);
  assert.equal(decoded.snapshot.would_transmit, false);
  const failed = run(exe, ["--fixture-output-failed-exit"]);
  assert.equal(failed.status, 1);
  assert.equal(failed.stdout, completed.stdout);
  assert.equal(convert(failed, expected).snapshot, null);
  assert.equal(convert(completed, { request_ecu: 0x7e1, pid: 5 }).snapshot, null);
  console.log(arch, "managed child output -> shared decoder: 11 checks passed (no native DLL)");
}
