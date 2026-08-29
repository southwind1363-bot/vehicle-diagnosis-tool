import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";

const scriptsDirectory = path.dirname(fileURLToPath(import.meta.url));
const sources = ["J2534IdentityNative.cs", "J2534IdentityNativeTests.cs"]
  .map(name => path.join(scriptsDirectory, "native", name));

function execute(file, args) {
  const env = Object.fromEntries(Object.entries(process.env)
    .filter(([key]) => !["NODE_OPTIONS", "NODE_PATH"].includes(key.toUpperCase())));
  return new Promise(resolve => {
    execFile(file, args, {
      windowsHide: true, shell: false, timeout: 30000, maxBuffer: 65536, env,
    }, (error, stdout, stderr) => resolve({ error, stdout, stderr }));
  });
}

async function main() {
  assert.equal(process.platform, "win32", "Native binding validation requires Windows and .NET Framework compilers");
  const windows = process.env.SystemRoot || "C:\\Windows";
  const platforms = [
    { name: "x86", bits: 32, framework: "Framework" },
    { name: "x64", bits: 64, framework: "Framework64" },
  ];
  for (const platform of platforms) {
    platform.compiler = path.join(windows, "Microsoft.NET", platform.framework, "v4.0.30319", "csc.exe");
    assert.ok(fs.existsSync(platform.compiler), `Missing ${platform.name} .NET Framework compiler`);
  }
  const tempRoot = path.resolve(os.tmpdir());
  const directory = fs.mkdtempSync(path.join(tempRoot, "vehicle-j2534-native-"));
  let total = 0;
  try {
    for (const platform of platforms) {
      const executable = path.join(directory, `identity-test-${platform.name}.exe`);
      const compiled = await execute(platform.compiler, [
        "/nologo", "/target:exe", `/platform:${platform.name}`, "/optimize+", "/warnaserror+",
        `/out:${executable}`, ...sources,
      ]);
      assert.equal(compiled.error, null, `Compilation failed (${platform.name}): ${compiled.stdout}${compiled.stderr}`);
      const tested = await execute(executable, ["--self-test"]);
      assert.equal(tested.error, null, `Native tests failed (${platform.name}): ${tested.stdout}${tested.stderr}`);
      assert.equal(tested.stderr, "");
      const result = /^Native identity binding checks: (\d+) \/ bitness: (32|64) \/ vendor DLL executed: false \/ Errors: 0\s*$/.exec(tested.stdout);
      assert.ok(result, `Unexpected self-test output (${platform.name})`);
      assert.equal(Number(result[2]), platform.bits, "Wrong worker architecture");
      assert.ok(Number(result[1]) > 0);
      total += Number(result[1]);
      console.log(tested.stdout.trim());
      const rejected = await execute(executable, ["--driver-path", "forbidden.dll"]);
      assert.equal(rejected.error?.code, 2, "Test executable accepted runtime driver arguments");
      assert.equal(rejected.stdout, "");
      assert.equal(rejected.stderr, "");
      total += 3;
    }
  } finally {
    const resolved = path.resolve(directory);
    assert.equal(path.dirname(resolved), tempRoot, "Refusing cleanup outside test temp root");
    assert.ok(path.basename(resolved).startsWith("vehicle-j2534-native-"));
    fs.rmSync(resolved, { recursive: true, force: true });
  }
  console.log(`J2534 native binding checks: ${total} / independent native ABI: not tested / Errors: 0`);
}

main().catch(error => { console.error(error.message); process.exitCode = 1; });
