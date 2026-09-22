import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

assert.equal(process.platform, "win32");
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
}
