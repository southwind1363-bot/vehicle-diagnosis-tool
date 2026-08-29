import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { buildJ2534NativeFixture } from "./native/build-j2534-native-fixture.js";
import { createJ2534NativeFixtureSupervisor, parseJ2534NativeFixtureOutput } from "./j2534-native-fixture-supervisor.js";

const scriptsDirectory = path.dirname(fileURLToPath(import.meta.url));
const sources = ["J2534IdentityNative.cs", "J2534IdentityNativeTests.cs"]
  .map(name => path.join(scriptsDirectory, "native", name));
const preflightSources = ["J2534RegisteredDriverPreflight.cs", "J2534NativePreflightFixtureWorker.cs"]
  .map(name => path.join(scriptsDirectory, "native", name));
const productionPreflightSources = ["J2534RegisteredDriverPreflight.cs", "J2534RegisteredDriverPreflightWorker.cs"]
  .map(name => path.join(scriptsDirectory, "native", name));

function execute(file, args, input = null) {
  const env = Object.fromEntries(Object.entries(process.env)
    .filter(([key]) => !/^(NODE_(OPTIONS|PATH)|COR_|CORECLR_|COMPLUS_)/i.test(key)));
  return new Promise(resolve => {
    const child = execFile(file, args, {
      windowsHide: true, shell: false, timeout: 30000, maxBuffer: 65536, env,
    }, (error, stdout, stderr) => resolve({ error, stdout, stderr }));
    if (input !== null) child.stdin.end(input, "utf8");
  });
}

function validateFixturePe(buffer, platform, expectedNames) {
  assert.equal(buffer.readUInt16LE(0), 0x5a4d, "Fixture has no DOS signature");
  const pe = buffer.readUInt32LE(0x3c);
  assert.equal(buffer.toString("binary", pe, pe + 4), "PE\0\0");
  assert.equal(buffer.readUInt16LE(pe + 4), platform.name === "x64" ? 0x8664 : 0x14c);
  assert.equal(buffer.readUInt16LE(pe + 6), 3, "Fixture section count changed");
  const optional = pe + 24;
  const is64 = platform.name === "x64";
  assert.equal(buffer.readUInt16LE(optional), is64 ? 0x20b : 0x10b);
  assert.equal(buffer.readUInt32LE(optional + 16), 0, "Fixture gained an entry point");
  assert.equal(buffer.readUInt16LE(optional + 70) & 0x140, 0x140, "Fixture lost ASLR/NX flags");
  const directories = optional + (is64 ? 112 : 96);
  const exportRva = buffer.readUInt32LE(directories);
  const exportSize = buffer.readUInt32LE(directories + 4);
  assert.equal(buffer.readUInt32LE(directories + 8), 0, "Fixture gained imports");
  assert.equal(buffer.readUInt32LE(directories + 48), 0, "Fixture gained debug data");
  assert.equal(buffer.readUInt32LE(directories + 72), 0, "Fixture gained TLS");
  assert.equal(buffer.readUInt32LE(directories + 40), 0x3000, "Fixture lost relocation data");
  assert.equal(buffer.readUInt32LE(directories + 44), 12, "Fixture relocation size changed");
  const sectionTable = optional + (is64 ? 0xf0 : 0xe0);
  [[".text", 0x60000020], [".rdata", 0x40000040], [".reloc", 0x42000040]].forEach(([name, characteristics], index) => {
    const offset = sectionTable + index * 40;
    assert.equal(buffer.toString("ascii", offset, offset + 8).replace(/\0+$/, ""), name);
    assert.equal(buffer.readUInt32LE(offset + 36), characteristics, `${name} permissions changed`);
  });
  const rvaToOffset = value => {
    for (let index = 0; index < 3; index++) {
      const offset = sectionTable + index * 40;
      const virtual = buffer.readUInt32LE(offset + 12);
      const size = buffer.readUInt32LE(offset + 16);
      if (value >= virtual && value < virtual + size) return buffer.readUInt32LE(offset + 20) + value - virtual;
    }
    throw new Error("Fixture RVA is outside its sections");
  };
  const exportOffset = rvaToOffset(exportRva);
  const functionCount = buffer.readUInt32LE(exportOffset + 20);
  const nameCount = buffer.readUInt32LE(exportOffset + 24);
  assert.equal(functionCount, nameCount);
  const functionsOffset = rvaToOffset(buffer.readUInt32LE(exportOffset + 28));
  const namesOffset = rvaToOffset(buffer.readUInt32LE(exportOffset + 32));
  const names = [];
  for (let index = 0; index < nameCount; index++) {
    const functionRva = buffer.readUInt32LE(functionsOffset + index * 4);
    assert.ok(functionRva < exportRva || functionRva >= exportRva + exportSize, "Fixture export became a forwarder");
    let nameOffset = rvaToOffset(buffer.readUInt32LE(namesOffset + index * 4));
    let end = nameOffset;
    while (end < buffer.length && buffer[end] !== 0) end++;
    assert.ok(end < buffer.length, "Fixture export name is unterminated");
    names.push(buffer.toString("ascii", nameOffset, end));
  }
  assert.deepEqual(names, [...names].sort(), "Fixture exports are not sorted");
  assert.deepEqual(names, expectedNames, "Fixture export inventory changed");
  const relocOffset = rvaToOffset(0x3000);
  assert.equal(buffer.readUInt32LE(relocOffset), 0x1000);
  assert.equal(buffer.readUInt32LE(relocOffset + 4), 12);
  assert.equal(buffer.readUInt16LE(relocOffset + 8), 0);
  assert.equal(buffer.readUInt16LE(relocOffset + 10), 0);
}

function fixtureNames(scenario) {
  if (scenario === "decorated-open-only") return ["_PassThruOpen@8"];
  return ["PassThruClose", "PassThruOpen", "PassThruReadVersion"].filter(name =>
    !(scenario === "missing-open" && name === "PassThruOpen")
    && !(scenario === "missing-read" && name === "PassThruReadVersion")
    && !(scenario === "missing-close" && name === "PassThruClose"));
}

function containsDll(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).some(entry => entry.isDirectory()
    ? containsDll(path.join(directory, entry.name)) : entry.name.toLowerCase().endsWith(".dll"));
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
  const rootIdentity = fs.statSync(directory);
  const createdFiles = [];
  const createdDirectories = [];
  const createdLinks = [];
  const assertIdentity = (target, identity) => {
    const current = fs.lstatSync(target);
    assert.ok(!current.isSymbolicLink() && current.isDirectory(), "Test directory identity changed");
    assert.equal(current.dev, identity.dev, "Test directory device changed");
    assert.equal(current.ino, identity.ino, "Test directory identity changed");
  };
  const writeCreatedFile = (target, contents) => {
    fs.writeFileSync(target, contents, { flag: "wx" }); createdFiles.push(target);
    assert.deepEqual(fs.readFileSync(target), contents, "Generated fixture changed after writing");
  };
  let total = 0;
  try {
    assert.throws(() => buildJ2534NativeFixture("arm64", "success"), /native_fixture_option_rejected/);
    assert.throws(() => buildJ2534NativeFixture("x64", "decorated-open-only"), /native_fixture_option_rejected/);
    total += 2;
    for (const platform of platforms) {
      const platformDirectory = path.join(directory, platform.name);
      fs.mkdirSync(platformDirectory); createdDirectories.push({ path: platformDirectory, identity: fs.statSync(platformDirectory) });
      for (const scenario of ["success", "open-failure", "overrun", "hang", "crash", "missing-open", "missing-read", "missing-close"])
      {
        const fixture = buildJ2534NativeFixture(platform.name, scenario);
        validateFixturePe(fixture, platform, fixtureNames(scenario)); total++;
        writeCreatedFile(path.join(platformDirectory, `${scenario}.dll`), fixture);
      }
      if (platform.name === "x86")
      {
        const decorated = buildJ2534NativeFixture("x86", "decorated-open-only");
        validateFixturePe(decorated, platform, fixtureNames("decorated-open-only")); total++;
        writeCreatedFile(path.join(platformDirectory, "decorated-open-only.dll"), decorated);
      }
      const opposite = platform.name === "x86" ? "x64" : "x86";
      writeCreatedFile(path.join(platformDirectory, "wrong-architecture.dll"), buildJ2534NativeFixture(opposite, "success"));
      writeCreatedFile(path.join(platformDirectory, "malformed.dll"), Buffer.from("not a PE library", "ascii"));
      writeCreatedFile(path.join(platformDirectory, "empty.dll"), Buffer.alloc(0));
      const oversizedPath = path.join(platformDirectory, "oversized.dll");
      const oversizedHandle = fs.openSync(oversizedPath, "wx");
      try { fs.ftruncateSync(oversizedHandle, 64 * 1024 * 1024 + 1); }
      finally { fs.closeSync(oversizedHandle); }
      createdFiles.push(oversizedPath);
      const junctionPath = path.join(platformDirectory, "junction");
      fs.symlinkSync(platformDirectory, junctionPath, "junction");
      createdLinks.push(junctionPath);
      const first = buildJ2534NativeFixture(platform.name, "success");
      const second = buildJ2534NativeFixture(platform.name, "success");
      assert.equal(createHash("sha256").update(first).digest("hex"), createHash("sha256").update(second).digest("hex"), "Fixture generation is not reproducible");
      total++;

      const executable = path.join(platformDirectory, "identity-test.exe");
      createdFiles.push(executable);
      const compiled = await execute(platform.compiler, [
        "/nologo", "/target:exe", `/platform:${platform.name}`, "/optimize+", "/warnaserror+",
        `/out:${executable}`, ...sources,
      ]);
      assert.equal(compiled.error, null, `Compilation failed (${platform.name}): ${compiled.stdout}${compiled.stderr}`);
      const tested = await execute(executable, ["--self-test"]);
      assert.equal(tested.error, null, `Native tests failed (${platform.name}): ${tested.stdout}${tested.stderr}`);
      assert.equal(tested.stderr, "");
      const result = /^Native identity binding checks: (\d+) \/ bitness: (32|64) \/ generated fixture DLL executed: true \/ vendor DLL executed: false \/ Errors: 0\s*$/.exec(tested.stdout);
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

      const preflightWorker = path.join(platformDirectory, "j2534-native-preflight-fixture-worker.exe");
      createdFiles.push(preflightWorker);
      const preflightCompile = await execute(platform.compiler, [
        "/nologo", "/target:exe", `/platform:${platform.name}`, "/optimize+", "/warnaserror+",
        "/define:PREFLIGHT_FIXTURE_TESTS",
        `/out:${preflightWorker}`, ...preflightSources,
      ]);
      assert.equal(preflightCompile.error, null, `Native preflight compilation failed (${platform.name}): ${preflightCompile.stdout}${preflightCompile.stderr}`);
      const productionPreflightLibrary = path.join(platformDirectory, "j2534-registered-driver-preflight.dll");
      createdFiles.push(productionPreflightLibrary);
      const productionPreflightCompile = await execute(platform.compiler, [
        "/nologo", "/target:library", `/platform:${platform.name}`, "/optimize+", "/warnaserror+",
        `/out:${productionPreflightLibrary}`, preflightSources[0],
      ]);
      assert.equal(productionPreflightCompile.error, null, `Production native preflight compilation failed (${platform.name}): ${productionPreflightCompile.stdout}${productionPreflightCompile.stderr}`);
      total++;
      const productionPreflightWorker = path.join(platformDirectory, "j2534-registered-driver-preflight.exe");
      createdFiles.push(productionPreflightWorker);
      const productionWorkerCompile = await execute(platform.compiler, [
        "/nologo", "/target:exe", `/platform:${platform.name}`, "/optimize+", "/warnaserror+",
        "/reference:System.Runtime.Serialization.dll", `/out:${productionPreflightWorker}`, ...productionPreflightSources,
      ]);
      assert.equal(productionWorkerCompile.error, null, `Production native preflight worker compilation failed (${platform.name}): ${productionWorkerCompile.stdout}${productionWorkerCompile.stderr}`);
      total++;
      const preflightDescriptor = name => {
        const target = path.join(platformDirectory, name);
        const bytes = fs.readFileSync(target);
        return { sha256: createHash("sha256").update(bytes).digest("hex"), size: bytes.length };
      };
      const runPreflight = async (scenario, fileName = "success.dll", expectedSize = null) => {
        const expected = fileName === "oversized.dll"
          ? { sha256: "0".repeat(64), size: 1 }
          : preflightDescriptor(fileName);
        const processResult = await execute(preflightWorker, [
          "--fixture", scenario, expected.sha256, String(expectedSize === null ? expected.size : expectedSize),
          platform.name, `nonce-${platform.name}-fixture`, `j2534-fixture-${platform.name}`
        ]);
        assert.equal(processResult.error, null, `Native preflight failed (${platform.name}/${scenario}): ${processResult.stdout}${processResult.stderr}`);
        assert.equal(processResult.stderr, "");
        assert.ok(!processResult.stdout.includes(platformDirectory) && !processResult.stdout.includes("\\\\?\\"), "Native preflight exposed a private path");
        return JSON.parse(processResult.stdout);
      };
      const preflightSuccess = await runPreflight("success");
      assert.equal(preflightSuccess.contract_version, "j2534-native-preflight-fixture-v1");
      assert.equal(preflightSuccess.verification_status, "verified_non_executable");
      assert.deepEqual(preflightSuccess.blockers, []);
      for (const field of ["fixed_drive_verified", "final_path_matches", "file_identity_stable", "sha256_matches", "size_matches", "architecture_matches", "runtime_architecture_matches"])
        assert.equal(preflightSuccess[field], true, `Native preflight did not verify ${field}`);
      for (const field of ["dll_load_attempted", "get_proc_address_attempted", "pass_thru_open_attempted", "vehicle_connection_attempted", "vehicle_command_enabled", "execution_enabled"])
        assert.equal(preflightSuccess[field], false, `Native preflight enabled ${field}`);
      assert.equal(preflightSuccess.fixture_identity_mutation_rejected, true);
      total += 17;
      const privateWorkerRequest = {
        contract_version: "j2534-native-preflight-request-v1", operation: "verify_registered_driver_non_executable",
        request_nonce: `native-worker-${platform.name}-nonce-000000000001`, selected_device_id: `j2534-worker-${platform.name}`,
        descriptor_version: "j2534-registered-driver-descriptor-v1", descriptor_source: "live_windows_registry",
        private_library_path: path.join(platformDirectory, "success.dll"), expected_sha256: preflightDescriptor("success.dll").sha256,
        expected_file_size: preflightDescriptor("success.dll").size, expected_architecture: platform.name,
        execution_enabled: false, vehicle_command_enabled: false
      };
      const directWorker = await execute(productionPreflightWorker, [], JSON.stringify(privateWorkerRequest));
      assert.equal(directWorker.error, null, `Production preflight worker failed (${platform.name}): ${directWorker.stdout}${directWorker.stderr}`);
      assert.equal(directWorker.stderr, "");
      assert.ok(!directWorker.stdout.includes(platformDirectory), "Production preflight worker exposed its private path");
      const directResponse = JSON.parse(directWorker.stdout);
      assert.equal(directResponse.verification_status, "verified_non_executable");
      assert.equal(directResponse.request_nonce, privateWorkerRequest.request_nonce);
      assert.equal(directResponse.vehicle_communication_started, false);
      assert.equal(directResponse.would_transmit, false);
      total += 7;
      const extraKeyWorker = await execute(productionPreflightWorker, [], JSON.stringify({ ...privateWorkerRequest, extra: true }));
      assert.equal(extraKeyWorker.error?.code, 2);
      assert.equal(extraKeyWorker.stdout, "");
      assert.equal(extraKeyWorker.stderr, "");
      total += 3;
      const rejectedPreflights = [
        ["sha-mismatch", "success.dll", null, "native_file_sha256_mismatch"],
        ["size-mismatch", "success.dll", null, "native_file_size_mismatch"],
        ["machine-mismatch", "success.dll", null, "native_file_architecture_mismatch"],
        ["wrong-architecture", "wrong-architecture.dll", null, "native_file_architecture_mismatch"],
        ["runtime-machine-mismatch", "wrong-architecture.dll", null, "native_runtime_architecture_mismatch"],
        ["malformed-pe", "malformed.dll", null, "native_file_invalid_pe"],
        ["empty", "empty.dll", 1, "native_file_empty"],
        ["oversized", "oversized.dll", 1, "native_file_too_large"],
        ["relative-path", "success.dll", null, "native_library_path_rejected"],
        ["junction", "success.dll", null, "native_final_path_mismatch"]
      ];
      for (const [scenario, fileName, expectedSize, blocker] of rejectedPreflights) {
        const rejectedPreflight = await runPreflight(scenario, fileName, expectedSize);
        assert.equal(rejectedPreflight.verification_status, "rejected");
        assert.deepEqual(rejectedPreflight.blockers, [blocker]);
        assert.equal(rejectedPreflight.dll_load_attempted, false);
        assert.equal(rejectedPreflight.execution_enabled, false);
        total += 4;
      }
      const shareLockPreflight = await runPreflight("share-lock");
      assert.equal(shareLockPreflight.verification_status, "verified_non_executable");
      for (const field of ["fixture_write_blocked", "fixture_rename_blocked", "fixture_delete_blocked", "fixture_handle_released", "fixture_identity_mutation_rejected"])
        assert.equal(shareLockPreflight[field], true, `Native preflight did not enforce ${field}`);
      total += 6;
      const rejectedPreflightArgs = await execute(preflightWorker, ["--fixture", "success"]);
      assert.equal(rejectedPreflightArgs.error?.code, 2);
      assert.equal(rejectedPreflightArgs.stdout, "");
      assert.equal(rejectedPreflightArgs.stderr, "");
      total += 3;
      const preflightSourceText = [...new Set([...preflightSources, ...productionPreflightSources])].map(source => fs.readFileSync(source, "utf8")).join("\n");
      assert.ok(!/LoadLibraryExW\s*\(|GetProcAddress\s*\(|PassThruOpen\s*\(/.test(preflightSourceText), "Native preflight source gained a DLL execution API");
      const preflightImports = [...preflightSourceText.matchAll(/private static extern [^;]+?\s+(\w+)\s*\(/g)].map(match => match[1]).sort();
      assert.deepEqual(preflightImports, ["CreateFileW", "GetDriveTypeW", "GetFileInformationByHandle", "GetFinalPathNameByHandleW"].sort(), "Native preflight P/Invoke allowlist changed");
      total += 2;

      const worker = path.join(platformDirectory, "j2534-native-fixture-worker.exe");
      createdFiles.push(worker);
      const workerCompile = await execute(platform.compiler, [
        "/nologo", "/target:exe", `/platform:${platform.name}`, "/optimize+", "/warnaserror+", `/out:${worker}`,
        sources[0], path.join(scriptsDirectory, "native", "J2534NativeFixtureWorker.cs"),
      ]);
      assert.equal(workerCompile.error, null, `Native worker compilation failed (${platform.name}): ${workerCompile.stdout}${workerCompile.stderr}`);
      const rejectedWorker = await execute(worker, ["--fixture", "../driver.dll"]);
      assert.equal(rejectedWorker.error?.code, 2); assert.equal(rejectedWorker.stdout, ""); assert.equal(rejectedWorker.stderr, ""); total += 3;
      const fileDescriptor = name => {
        const target = path.join(platformDirectory, name);
        return { path: target, sha256: createHash("sha256").update(fs.readFileSync(target)).digest("hex") };
      };
      const descriptor = {
        temp_root: directory, architecture: platform.name, worker: fileDescriptor("j2534-native-fixture-worker.exe"),
        fixtures: Object.fromEntries(["success", "open-failure", "overrun", "hang", "crash"].map(name => [name, fileDescriptor(`${name}.dll`)]))
      };
      const supervisor = createJ2534NativeFixtureSupervisor(descriptor);
      assert.throws(() => createJ2534NativeFixtureSupervisor({ ...descriptor, temp_root: platformDirectory }), /native_fixture_descriptor_invalid/); total++;
      descriptor.worker.path = path.join(platformDirectory, "forbidden-worker.exe");
      process.env.COR_ENABLE_PROFILING = "1"; process.env.COR_PROFILER = "{00000000-0000-0000-0000-000000000001}";
      for (const [scenario, expected] of [["success", "completed"], ["open-failure", "open_failed"], ["overrun", "corrupted"]]) {
        const supervised = await supervisor.run({ mode: "native_fixture", scenario });
        assert.equal(supervised.execution_status, "worker_completed"); assert.equal(supervised.result.lifecycle.status, expected);
        assert.equal(supervised.native_fixture_execution_confirmed, true); assert.equal(supervised.vendor_dll_executed, false);
        total += 4;
        if (scenario === "success") {
          const encoded = JSON.stringify(supervised.result);
          for (const mutate of [
            value => { value.vendor_dll_executed = true; }, value => { value.architecture = opposite; },
            value => { value.lifecycle.steps.close.attempted = false; }, value => { value.lifecycle.module_reference = "retained"; },
            value => { value.lifecycle.versions.api = "x".repeat(80); }, value => { value.lifecycle.versions.api = " 04.04"; },
            value => { value.private_path = "C:/private/driver.dll"; }
          ]) {
            const invalid = JSON.parse(encoded); mutate(invalid);
            assert.equal(parseJ2534NativeFixtureOutput(JSON.stringify(invalid), "success", platform.name), null); total++;
          }
        }
      }
      for (const scenario of ["hang", "result-then-hang"]) {
        const supervised = await supervisor.run({ mode: "native_fixture", scenario, timeout_ms: 1000 });
        assert.equal(supervised.execution_status, "worker_timed_out"); assert.equal(supervised.result, null);
        assert.equal(supervised.native_fixture_execution_confirmed, false); assert.equal(supervised.fixture_cleanup_status, "unconfirmed"); total += 4;
      }
      const crashed = await supervisor.run({ mode: "native_fixture", scenario: "crash", timeout_ms: 3000 });
      assert.equal(crashed.execution_status, "worker_failed"); assert.equal(crashed.result, null); assert.equal(crashed.fixture_cleanup_status, "unconfirmed"); total += 3;
      const controller = new AbortController();
      const hanging = supervisor.run({ mode: "native_fixture", scenario: "hang", timeout_ms: 3000, signal: controller.signal });
      await new Promise(resolve => setTimeout(resolve, 100));
      const busy = await supervisor.run({ mode: "native_fixture", scenario: "success" });
      assert.equal(busy.execution_status, "worker_busy"); controller.abort();
      const cancelled = await hanging;
      assert.equal(cancelled.execution_status, "worker_cancelled"); assert.equal(cancelled.worker_exited, true); total += 3;
      const successPath = path.join(platformDirectory, "success.dll");
      const original = fs.readFileSync(successPath); const changed = Buffer.from(original); changed[changed.length - 1] ^= 1;
      fs.writeFileSync(successPath, changed);
      const tampered = await supervisor.run({ mode: "native_fixture", scenario: "success" });
      assert.equal(tampered.execution_status, "worker_failed"); assert.deepEqual(tampered.errors, ["worker_spawn_failed"]); total += 2;
      fs.writeFileSync(successPath, original);
      for (const options of [{}, { mode: "native_fixture", scenario: "../driver.dll" }, { mode: "native_fixture", scenario: "success", worker_path: "other.exe" }]) {
        const blocked = await supervisor.run(options);
        assert.equal(blocked.execution_status, "request_blocked"); assert.equal(blocked.worker_started, false); total += 2;
      }
      delete process.env.COR_ENABLE_PROFILING; delete process.env.COR_PROFILER;
    }
  } finally {
    const resolved = path.resolve(directory);
    assert.equal(path.dirname(resolved), tempRoot, "Refusing cleanup outside test temp root");
    assert.ok(path.basename(resolved).startsWith("vehicle-j2534-native-"));
    assertIdentity(resolved, rootIdentity);
    for (const child of createdDirectories) assertIdentity(child.path, child.identity);
    for (const link of createdLinks.reverse()) if (fs.existsSync(link)) fs.unlinkSync(link);
    for (const file of createdFiles.reverse()) if (fs.existsSync(file)) fs.unlinkSync(file);
    for (const child of createdDirectories.reverse()) {
      assert.deepEqual(fs.readdirSync(child.path), [], "Refusing to remove a test directory containing unknown files");
      fs.rmdirSync(child.path);
    }
    assert.deepEqual(fs.readdirSync(resolved), [], "Refusing to remove a test root containing unknown files");
    fs.rmdirSync(resolved);
  }
  assert.equal(containsDll(path.join(scriptsDirectory, "native")), false, "Generated fixture DLL remained in the repository");
  for (const relative of ["../local-bridge-readonly.js", "./j2534-readonly-worker.js", "./package-workstation.js"]) {
    const production = fs.readFileSync(new URL(relative, import.meta.url), "utf8");
    assert.ok(!production.includes("j2534-native-fixture-supervisor") && !production.includes("bounded-fixture-worker")
      && !production.includes("J2534NativeFixtureWorker") && !production.includes("J2534NativePreflightFixtureWorker")
      && !production.includes("j2534-native-preflight-fixture-v1"), "Development native worker reached a production entry point");
    total++;
  }
  const distributionSources = ["../offline-assets.json", "./workstation-assets.js", "./package-workstation.js"]
    .map(relative => fs.readFileSync(new URL(relative, import.meta.url), "utf8")).join("\n");
  assert.ok(!distributionSources.includes("J2534NativePreflightFixtureWorker")
    && !distributionSources.includes("j2534-native-preflight-fixture-v1"), "Native preflight fixture reached a public or PC package manifest");
  total++;
  console.log(`J2534 native binding checks: ${total} / independent native fixture ABI: tested / real VCI compatibility: not tested / vehicle communication: not performed / Errors: 0`);
}

main().catch(error => { console.error(error.message); process.exitCode = 1; });
