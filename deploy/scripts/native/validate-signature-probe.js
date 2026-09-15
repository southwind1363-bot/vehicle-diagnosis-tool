import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";

assert.equal(process.platform, "win32");
const root = fs.mkdtempSync(path.join(os.tmpdir(), "signature-probe-"));
const source = fileURLToPath(new URL("./DevelopmentSignatureProbe.cs", import.meta.url));
const run = (file, args) => spawnSync(file, args, { cwd: root, windowsHide: true,
  shell: false, encoding: "utf8", timeout: 15000, maxBuffer: 65536 });
// Fixed artificial source, not a vendor DLL. Never load or execute this library.
const dummy = path.join(root, "Unsigned.cs");
fs.writeFileSync(dummy, "public class UnsignedFixture {}\n");
let checks = 0;
try {
  for (const [platform, framework] of [["x86", "Framework"], ["x64", "Framework64"]]) {
    const compiler = path.join(process.env.SystemRoot || "C:\\Windows", "Microsoft.NET", framework, "v4.0.30319", "csc.exe");
    const probe = path.join(root, `probe-${platform}.exe`);
    const fixture = path.join(root, `unsigned-${platform}.dll`);
    for (const [input, output, target] of [[source, probe, "exe"], [dummy, fixture, "library"]]) {
      const build = run(compiler, ["/nologo", "/warnaserror", `/platform:${platform}`, `/target:${target}`, `/out:${output}`, input]);
      assert.equal(build.status, 0, build.stdout + build.stderr); checks++;
    }
    const digest = createHash("sha256").update(fs.readFileSync(fixture)).digest("hex");
    const observed = run(probe, [fixture, digest]);
    assert.equal(observed.status, 0, observed.stdout + observed.stderr);
    assert.equal(observed.stderr, "");
    const data = JSON.parse(observed.stdout);
    assert.equal(data.signer_certificate_sha256, null); checks++;
    assert.equal(data.observation_status, "observed_only");
    assert.equal(data.wintrust_status, "0x800B0100"); // TRUST_E_NOSIGNATURE
    assert.equal(data.cache_only, true);
    assert.equal(data.scope, "embedded_file");
    assert.equal(data.file_sha256, digest.toUpperCase());
    assert.equal(data.publisher_verified, false);
    assert.equal(data.execution_enabled, false); checks += 9;
    for (const args of [[fixture, "0".repeat(64)], [fixture, digest, "extra"], ["unsigned.dll", digest], [fixture, "bad"]]) {
      const rejected = run(probe, args);
      assert.equal(rejected.status, 1);
      const value = JSON.parse(rejected.stdout);
      assert.equal(value.observation_status, "unverified");
      assert.equal(Object.hasOwn(value, "file_sha256"), false);
      assert.ok(!rejected.stdout.includes(root)); checks += 4;
    }
    // The worker has exited and its held file is released.
    const fd = fs.openSync(fixture, "r+"); fs.closeSync(fd); checks++;
    const memoryProbe = path.join(root, `memory-${platform}.exe`);
    const memorySource = fileURLToPath(new URL("./SignatureCertificateFixture.cs", import.meta.url));
    const memoryBuild = run(compiler, ["/nologo", "/warnaserror", `/platform:${platform}`, "/target:exe",
      "/main:SignatureCertificateFixture", `/out:${memoryProbe}`, source, memorySource]);
    assert.equal(memoryBuild.status, 0, memoryBuild.stdout + memoryBuild.stderr);
    const memoryResult = run(memoryProbe, []);
    assert.equal(memoryResult.status, 0, memoryResult.stdout + memoryResult.stderr);
    assert.match(memoryResult.stdout, /Certificate memory checks: 9/); checks += 11;
  }
  console.log(`Native signature probe: ${checks} checks passed; unsigned generated PE only; no DLL execution or signed-vendor validation`);
  console.log(`Artifacts: ${root}`);
} catch (error) {
  console.error(`Artifacts retained: ${root}`); throw error;
}
