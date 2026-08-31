import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { buildJ2534NativeFixture } from "./native/build-j2534-native-fixture.js";
import {
  createJ2534NativeFixtureSupervisor,
  createJ2534VerifiedIdentityFixtureSupervisor,
  parseJ2534NativeFixtureOutput,
  parseJ2534UdsTransportFixtureOutput,
  parseJ2534VerifiedIdentityFixtureOutput
} from "./j2534-native-fixture-supervisor.js";
import { createJ2534NativeQuarantineStore } from "./j2534-native-quarantine.js";
import { buildUdsReadAdapterCompletionManifest } from "../local-bridge-readonly.js";

const scriptsDirectory = path.dirname(fileURLToPath(import.meta.url));
const sources = ["J2534IdentityNative.cs", "J2534IdentityNativeTests.cs"]
  .map(name => path.join(scriptsDirectory, "native", name));
const preflightSources = ["J2534RegisteredDriverPreflight.cs", "J2534AuthenticodeVerifier.cs", "J2534NativePreflightFixtureWorker.cs"]
  .map(name => path.join(scriptsDirectory, "native", name));
const productionPreflightSources = ["J2534RegisteredDriverPreflight.cs", "J2534AuthenticodeVerifier.cs", "J2534GlobalMutexLease.cs", "J2534RegisteredDriverPreflightWorker.cs"]
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
  const udsTransportFixtureSource = fs.readFileSync(path.join(scriptsDirectory, "native", "J2534UdsTransportFixtureWorker.cs"), "utf8");
  assert.ok(!/(?:DllImport|LoadLibrary|GetProcAddress|PassThru|VehicleDiagnosis\.Native)/.test(udsTransportFixtureSource), "UDS transport fixture gained a native or vehicle communication API");
  total++;
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
        `/out:${productionPreflightLibrary}`, ...productionPreflightSources.slice(0, 2),
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
      const mutexFixture = path.join(platformDirectory, "j2534-global-mutex-tests.exe");
      createdFiles.push(mutexFixture);
      const mutexCompile = await execute(platform.compiler, [
        "/nologo", "/target:exe", "/platform:" + platform.name, "/optimize+", "/warnaserror+",
        "/out:" + mutexFixture,
        path.join(scriptsDirectory, "native", "J2534GlobalMutexLease.cs"),
        path.join(scriptsDirectory, "native", "J2534GlobalMutexLeaseTests.cs")
      ]);
      assert.equal(mutexCompile.error, null, "Global mutex fixture compilation failed: " + mutexCompile.stdout + mutexCompile.stderr);
      const mutexResult = await execute(mutexFixture, []);
      assert.equal(mutexResult.error, null, "Global mutex process fixture failed: " + mutexResult.stdout + mutexResult.stderr);
      assert.equal(mutexResult.stdout.trim(), "global-mutex-process-checks-ok");
      total += 3;
      const verifiedIdentityWorker = path.join(platformDirectory, "j2534-verified-identity-fixture.exe");
      createdFiles.push(verifiedIdentityWorker);
      const verifiedIdentityCompile = await execute(platform.compiler, [
        "/nologo", "/target:exe", `/platform:${platform.name}`, "/optimize+", "/warnaserror+",
        "/define:PREFLIGHT_FIXTURE_TESTS", `/out:${verifiedIdentityWorker}`,
        path.join(scriptsDirectory, "native", "J2534RegisteredDriverPreflight.cs"),
        path.join(scriptsDirectory, "native", "J2534AuthenticodeVerifier.cs"),
        path.join(scriptsDirectory, "native", "J2534GlobalMutexLease.cs"),
        path.join(scriptsDirectory, "native", "J2534IdentityNative.cs"),
        path.join(scriptsDirectory, "native", "J2534VerifiedIdentityFixtureWorker.cs")
      ]);
      assert.equal(verifiedIdentityCompile.error, null, `Verified identity fixture compilation failed (${platform.name}): ${verifiedIdentityCompile.stdout}${verifiedIdentityCompile.stderr}`);
      total++;
      const preflightDescriptor = name => {
        const target = path.join(platformDirectory, name);
        const bytes = fs.readFileSync(target);
        return { sha256: createHash("sha256").update(bytes).digest("hex"), size: bytes.length };
      };
      const verifiedDescriptor = preflightDescriptor("success.dll");
      const verifiedArgs = scenario => ["--fixture", scenario, verifiedDescriptor.sha256, String(verifiedDescriptor.size),
        platform.name, `verified-${platform.name}-nonce`, `verified-device-${platform.name}`];
      const verifiedRun = await execute(verifiedIdentityWorker, verifiedArgs("success"));
      assert.equal(verifiedRun.error, null, `Verified identity fixture failed (${platform.name}): ${verifiedRun.stdout}${verifiedRun.stderr}`);
      assert.equal(verifiedRun.stderr, "");
      const verifiedResponse = JSON.parse(verifiedRun.stdout);
      assert.equal(verifiedResponse.contract_version, "j2534-verified-identity-fixture-v1");
      assert.equal(verifiedResponse.verification_status, "verified_non_executable");
      assert.deepEqual(verifiedResponse.blockers, []);
      assert.equal(verifiedResponse.global_mutex_status, "held_for_identity_lifecycle");
      assert.equal(verifiedResponse.verified_file_handle_status, "held_through_identity_lifecycle");
      assert.equal(verifiedResponse.identity_lifecycle_status, "completed");
      assert.equal(verifiedResponse.callback_completed, true);
      assert.equal(verifiedResponse.fixture_write_blocked, true);
      assert.equal(verifiedResponse.fixture_rename_blocked, true);
      assert.equal(verifiedResponse.fixture_delete_blocked, true);
      assert.equal(verifiedResponse.module_reference, "released");
      assert.deepEqual(verifiedResponse.versions, { firmware: "fixture-fw", dll: "fixture-dll", api: "04.04" });
      assert.equal(verifiedResponse.vendor_dll_executed, false);
      assert.equal(verifiedResponse.vehicle_communication, false);
      assert.equal(verifiedResponse.vehicle_command_enabled, false);
      total += 15;
      const verifiedSupervisorDescriptor = {
        temp_root: directory,
        architecture: platform.name,
        worker: {
          path: verifiedIdentityWorker,
          sha256: createHash("sha256").update(fs.readFileSync(verifiedIdentityWorker)).digest("hex")
        },
        fixture: { path: path.join(platformDirectory, "success.dll"), ...verifiedDescriptor }
      };
      const verifiedQuarantineDirectory = fs.mkdtempSync(path.join(tempRoot,
        "vehicle-j2534-quarantine-verified-" + platform.name + "-"));
      try {
        const verifiedQuarantineStore = createJ2534NativeQuarantineStore(verifiedQuarantineDirectory);
        for (const controls of [null, [], { unknown: true }, { quarantineStore: {} }, { requireTrialConfirmation: "true" }])
          assert.throws(() => createJ2534VerifiedIdentityFixtureSupervisor(verifiedSupervisorDescriptor, controls),
            /verified_identity_supervisor_controls_invalid/);
        assert.throws(() => createJ2534VerifiedIdentityFixtureSupervisor({
          ...verifiedSupervisorDescriptor, worker: { ...verifiedSupervisorDescriptor.worker, path: verifiedIdentityWorker + ".other" }
        }), /verified_identity_descriptor_invalid/);
        total += 6;
        const verifiedSupervisor = createJ2534VerifiedIdentityFixtureSupervisor(verifiedSupervisorDescriptor, {
          quarantineStore: verifiedQuarantineStore, requireTrialConfirmation: true
        });
        const request = scenario => ({
          mode: "verified_identity_fixture", scenario,
          request_nonce: "supervised-" + platform.name + "-nonce",
          selected_device_id: "supervised-device-" + platform.name,
          interactive_trial_confirmation: true
        });
        const confirmationMissing = await verifiedSupervisor.run({
          ...request("success"), interactive_trial_confirmation: undefined
        });
        assert.equal(confirmationMissing.execution_status, "request_blocked");
        assert.deepEqual(confirmationMissing.errors, ["native_identity_trial_confirmation_required"]);
        assert.equal(confirmationMissing.worker_started, false);
        const originalSystemRoot = process.env.SystemRoot;
        const originalWindir = process.env.WINDIR;
        delete process.env.SystemRoot; delete process.env.WINDIR;
        let supervisedSuccess;
        try { supervisedSuccess = await verifiedSupervisor.run(request("success")); }
        finally {
          if (originalSystemRoot !== undefined) process.env.SystemRoot = originalSystemRoot;
          if (originalWindir !== undefined) process.env.WINDIR = originalWindir;
        }
        assert.equal(supervisedSuccess.execution_status, "worker_completed");
        assert.equal(supervisedSuccess.verified_identity_execution_confirmed, true);
        assert.equal(supervisedSuccess.fixture_cleanup_status, "confirmed");
        assert.equal(supervisedSuccess.result.request_nonce, request("success").request_nonce);
        assert.equal(supervisedSuccess.result.selected_device_id, request("success").selected_device_id);
        assert.equal(supervisedSuccess.result.global_mutex_status, "held_for_identity_lifecycle");
        assert.equal(supervisedSuccess.result.verified_file_handle_status, "held_through_identity_lifecycle");
        assert.equal(supervisedSuccess.vendor_dll_executed, false);
        assert.equal(supervisedSuccess.vehicle_communication, false);
        assert.equal(supervisedSuccess.vehicle_command_enabled, false);
        assert.equal(verifiedQuarantineStore.read().quarantined, false);
        const parserContext = {
          architecture: platform.name, scenario: "success",
          request_nonce: request("success").request_nonce, selected_device_id: request("success").selected_device_id
        };
        const encodedVerified = JSON.stringify(supervisedSuccess.result);
        for (const mutate of [
          value => { value.request_nonce = "different-nonce"; },
          value => { value.global_mutex_status = "released"; },
          value => { value.vehicle_command_enabled = true; },
          value => { value.private_library_path = "C:/forbidden/vendor.dll"; }
        ]) {
          const invalid = JSON.parse(encodedVerified); mutate(invalid);
          assert.equal(parseJ2534VerifiedIdentityFixtureOutput(JSON.stringify(invalid), parserContext), null);
        }
        const heldRun = verifiedSupervisor.run({ ...request("hold"), timeout_ms: 10000 });
        await new Promise(resolve => setTimeout(resolve, 300));
        const busy = await verifiedSupervisor.run(request("success"));
        assert.equal(busy.execution_status, "worker_busy");
        const blockedDuringIdentity = await execute(mutexFixture, ["probe"]);
        assert.equal(blockedDuringIdentity.error?.code, 3, "Global mutex was not held through supervised identity lifecycle");
        assert.equal(blockedDuringIdentity.stdout.trim(), "busy");
        const heldResponse = await heldRun;
        assert.equal(heldResponse.execution_status, "worker_completed");
        assert.equal(heldResponse.fixture_cleanup_status, "confirmed");
        assert.equal(heldResponse.result.verified_file_handle_status, "held_through_identity_lifecycle");
        const releasedAfterIdentity = await execute(mutexFixture, ["probe"]);
        assert.equal(releasedAfterIdentity.error, null, "Global mutex was not released after supervised identity lifecycle");
        assert.equal(releasedAfterIdentity.stdout.trim(), "acquired");
        const fixturePath = verifiedSupervisorDescriptor.fixture.path;
        const fixtureOriginal = fs.readFileSync(fixturePath);
        const fixtureChanged = Buffer.from(fixtureOriginal); fixtureChanged[fixtureChanged.length - 1] ^= 1;
        fs.writeFileSync(fixturePath, fixtureChanged);
        const changedDescriptor = await verifiedSupervisor.run(request("success"));
        assert.equal(changedDescriptor.execution_status, "worker_failed");
        assert.deepEqual(changedDescriptor.errors, ["worker_spawn_failed"]);
        assert.equal(changedDescriptor.worker_started, false);
        fs.writeFileSync(fixturePath, fixtureOriginal);
        const timedOut = await verifiedSupervisor.run({ ...request("hold"), timeout_ms: 1000 });
        assert.equal(timedOut.execution_status, "worker_timed_out");
        assert.equal(timedOut.fixture_cleanup_status, "unconfirmed");
        assert.equal(timedOut.worker_exited, true);
        assert.equal(verifiedQuarantineStore.read().reason, "cleanup_unconfirmed");
        const recreated = createJ2534VerifiedIdentityFixtureSupervisor(verifiedSupervisorDescriptor, {
          quarantineStore: createJ2534NativeQuarantineStore(verifiedQuarantineDirectory), requireTrialConfirmation: true
        });
        const quarantined = await recreated.run(request("success"));
        assert.equal(quarantined.execution_status, "worker_quarantined");
        assert.deepEqual(quarantined.errors, ["native_identity_quarantine_not_clear"]);
        assert.equal(quarantined.worker_started, false);
        total += 40;
      } finally {
        const entries = fs.readdirSync(verifiedQuarantineDirectory);
        assert.ok(entries.every(name => name === "j2534-native-quarantine-v1.json"));
        for (const name of entries) fs.unlinkSync(path.join(verifiedQuarantineDirectory, name));
        fs.rmdirSync(verifiedQuarantineDirectory);
      }
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
      assert.equal(preflightSuccess.authenticode_status, "verified_fixture_only");
      assert.equal(preflightSuccess.authenticode_network_retrieval_allowed, false);
      assert.equal(preflightSuccess.fixture_identity_mutation_rejected, true);
      assert.equal(preflightSuccess.fixture_file_id_128_mutation_rejected, true);
      total += 20;
      const signedSystemLibrary = path.join(process.env.SystemRoot || process.env.WINDIR || "C:\\Windows",
        platform.name === "x86" ? "SysWOW64" : "System32", "version.dll");
      const signedSystemBytes = fs.readFileSync(signedSystemLibrary);
      const privateWorkerRequest = {
        contract_version: "j2534-native-preflight-request-v2", operation: "verify_registered_driver_non_executable",
        request_nonce: `native-worker-${platform.name}-nonce-000000000001`, selected_device_id: `j2534-worker-${platform.name}`,
        descriptor_version: "j2534-registered-driver-descriptor-v1", descriptor_source: "live_windows_registry",
        private_library_path: signedSystemLibrary, expected_sha256: createHash("sha256").update(signedSystemBytes).digest("hex"),
        expected_file_size: signedSystemBytes.length, expected_architecture: platform.name,
        execution_enabled: false, vehicle_command_enabled: false
      };
      const directWorker = await execute(productionPreflightWorker, [], JSON.stringify(privateWorkerRequest));
      assert.equal(directWorker.error, null, `Production preflight worker failed (${platform.name}): ${directWorker.stdout}${directWorker.stderr}`);
      assert.equal(directWorker.stderr, "");
      assert.ok(!directWorker.stdout.includes(platformDirectory), "Production preflight worker exposed its private path");
      const directResponse = JSON.parse(directWorker.stdout);
      assert.equal(directResponse.contract_version, "j2534-native-preflight-response-v2");
      assert.equal(directResponse.operation, privateWorkerRequest.operation);
      assert.equal(directResponse.request_nonce, privateWorkerRequest.request_nonce);
      assert.equal(directResponse.descriptor_source, privateWorkerRequest.descriptor_source);
      assert.equal(directResponse.expected_architecture, privateWorkerRequest.expected_architecture);
      assert.equal(directResponse.vehicle_communication_started, false);
      assert.equal(directResponse.would_transmit, false);
      assert.equal(directResponse.authenticode_status, "verified_file_policy");
      assert.equal(directResponse.authenticode_network_retrieval_allowed, false);
      assert.equal(directResponse.global_mutex_status, "acquired_for_preflight");
      total += 12;
      const unsignedRequest = {
        ...privateWorkerRequest, request_nonce: `native-worker-${platform.name}-nonce-unsigned-0001`,
        private_library_path: path.join(platformDirectory, "success.dll"),
        expected_sha256: preflightDescriptor("success.dll").sha256,
        expected_file_size: preflightDescriptor("success.dll").size
      };
      const unsignedWorker = await execute(productionPreflightWorker, [], JSON.stringify(unsignedRequest));
      assert.equal(unsignedWorker.error, null);
      const unsignedResponse = JSON.parse(unsignedWorker.stdout);
      assert.equal(unsignedResponse.verification_status, "rejected");
      assert.deepEqual(unsignedResponse.blockers, ["native_authenticode_not_trusted"]);
      assert.equal(unsignedResponse.authenticode_status, "not_trusted");
      assert.equal(unsignedResponse.global_mutex_status, "acquired_for_preflight");
      assert.equal(unsignedResponse.dll_load_attempted, false);
      total += 6;
      const invalidWorkerRequests = [
        { ...privateWorkerRequest, extra: true },
        { ...privateWorkerRequest, contract_version: "j2534-native-preflight-request-v1" },
        { ...privateWorkerRequest, operation: "load_registered_driver" },
        { ...privateWorkerRequest, private_library_path: "relative-driver.dll" },
        { ...privateWorkerRequest, expected_sha256: "A".repeat(64) },
        { ...privateWorkerRequest, expected_file_size: 0 },
        { ...privateWorkerRequest, expected_file_size: 64 * 1024 * 1024 + 1 },
        { ...privateWorkerRequest, expected_architecture: "arm64" },
        { ...privateWorkerRequest, execution_enabled: true },
        { ...privateWorkerRequest, vehicle_command_enabled: true }
      ];
      for (const invalidRequest of invalidWorkerRequests) {
        const invalidWorker = await execute(productionPreflightWorker, [], JSON.stringify(invalidRequest));
        assert.equal(invalidWorker.error?.code, 2);
        assert.equal(invalidWorker.stdout, "");
        assert.equal(invalidWorker.stderr, "");
        total += 3;
      }
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
      for (const field of ["fixture_write_blocked", "fixture_rename_blocked", "fixture_delete_blocked", "fixture_handle_released", "fixture_identity_mutation_rejected", "fixture_file_id_128_mutation_rejected"])
        assert.equal(shareLockPreflight[field], true, `Native preflight did not enforce ${field}`);
      total += 7;
      const rejectedPreflightArgs = await execute(preflightWorker, ["--fixture", "success"]);
      assert.equal(rejectedPreflightArgs.error?.code, 2);
      assert.equal(rejectedPreflightArgs.stdout, "");
      assert.equal(rejectedPreflightArgs.stderr, "");
      total += 3;
      const preflightSourceText = [...new Set([...preflightSources, ...productionPreflightSources])].map(source => fs.readFileSync(source, "utf8")).join("\n");
      assert.ok(!/LoadLibraryExW\s*\(|GetProcAddress\s*\(|PassThruOpen\s*\(/.test(preflightSourceText), "Native preflight source gained a DLL execution API");
      const preflightImports = [...preflightSourceText.matchAll(/private static extern [^;]+?\s+(\w+)\s*\(/g)].map(match => match[1]).sort();
      assert.deepEqual(preflightImports, ["CreateFileW", "GetDriveTypeW", "GetFileInformationByHandle", "GetFileInformationByHandleEx", "GetFinalPathNameByHandleW", "WinVerifyTrust"].sort(), "Native preflight P/Invoke allowlist changed");
      total += 2;

      const udsTransportWorker = path.join(platformDirectory, "j2534-uds-transport-fixture-worker.exe");
      createdFiles.push(udsTransportWorker);
      const udsTransportCompile = await execute(platform.compiler, [
        "/nologo", "/target:exe", `/platform:${platform.name}`, "/optimize+", "/warnaserror+", `/out:${udsTransportWorker}`,
        path.join(scriptsDirectory, "native", "J2534UdsTransportFixtureWorker.cs"),
      ]);
      assert.equal(udsTransportCompile.error, null, `UDS transport fixture compilation failed (${platform.name}): ${udsTransportCompile.stdout}${udsTransportCompile.stderr}`);
      const rejectedUdsTransportWorker = await execute(udsTransportWorker, ["--fixture", "../driver.dll"]);
      assert.equal(rejectedUdsTransportWorker.error?.code, 2);
      assert.equal(rejectedUdsTransportWorker.stdout, "");
      assert.equal(rejectedUdsTransportWorker.stderr, "");
      total += 4;
      const expectedCompletionStatuses = {
        positive: "response_received", "positive-29bit": "response_received", negative: "negative_response",
        pending: "pending", timeout: "timeout", "transport-error": "transport_error", cancelled: "cancelled"
      };
      for (const [scenario, expectedStatus] of Object.entries(expectedCompletionStatuses)) {
        const execution = await execute(udsTransportWorker, ["--fixture", scenario]);
        const parsed = parseJ2534UdsTransportFixtureOutput(execution.stdout, scenario, platform.name);
        const completion = buildUdsReadAdapterCompletionManifest(parsed?.transport_result);
        assert.equal(execution.error, null);
        assert.equal(execution.stderr, "");
        assert.equal(parsed?.fixture_only, true);
        assert.equal(parsed?.vendor_dll_executed, false);
        assert.equal(parsed?.vehicle_communication_started, false);
        assert.equal(parsed?.transport_result?.retained_raw_frames, false);
        assert.equal(parsed?.transport_result?.would_transmit, false);
        assert.equal(completion?.status, expectedStatus);
        assert.equal(completion?.vehicle_command_enabled, false);
        total += 10;
      }
      const positiveUdsFixture = await execute(udsTransportWorker, ["--fixture", "positive"]);
      for (const mutate of [
        value => { value.vendor_dll_executed = true; },
        value => { value.vehicle_communication_started = true; },
        value => { value.architecture = opposite; },
        value => { value.scenario = "negative"; },
        value => { value.transport_result_candidate.raw_frames = ["reject"]; },
        value => { value.transport_result_candidate.status = "negative_response"; },
        value => { value.transport_result_candidate.readout_attempt_id = "wrong-attempt"; },
        value => { value.private_path = "C:/private/driver.dll"; }
      ]) {
        const invalid = JSON.parse(positiveUdsFixture.stdout); mutate(invalid);
        assert.equal(parseJ2534UdsTransportFixtureOutput(JSON.stringify(invalid), "positive", platform.name), null);
        total++;
      }
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
      const quarantineDirectory = fs.mkdtempSync(path.join(tempRoot, `vehicle-j2534-quarantine-${platform.name}-`));
      try {
        const quarantineStore = createJ2534NativeQuarantineStore(quarantineDirectory);
        const protectedDescriptor = { ...descriptor, worker: fileDescriptor("j2534-native-fixture-worker.exe") };
        for (const controls of [null, [], { unknown: true }, { quarantineStore: {} }, { requireTrialConfirmation: "true" }])
          assert.throws(() => createJ2534NativeFixtureSupervisor(protectedDescriptor, controls), /native_fixture_supervisor_controls_invalid/);
        total += 5;
        const protectedSupervisor = createJ2534NativeFixtureSupervisor(protectedDescriptor, {
          quarantineStore, requireTrialConfirmation: true
        });
        const confirmationMissing = await protectedSupervisor.run({ mode: "native_fixture", scenario: "success" });
        assert.equal(confirmationMissing.execution_status, "request_blocked");
        assert.deepEqual(confirmationMissing.errors, ["native_identity_trial_confirmation_required"]);
        assert.equal(confirmationMissing.worker_started, false);
        const protectedSuccess = await protectedSupervisor.run({
          mode: "native_fixture", scenario: "success", interactive_trial_confirmation: true
        });
        assert.equal(protectedSuccess.execution_status, "worker_completed");
        assert.equal(protectedSuccess.fixture_cleanup_status, "confirmed");
        assert.equal(quarantineStore.read().quarantined, false);
        const protectedHang = await protectedSupervisor.run({
          mode: "native_fixture", scenario: "hang", timeout_ms: 1000, interactive_trial_confirmation: true
        });
        assert.equal(protectedHang.execution_status, "worker_timed_out");
        assert.equal(protectedHang.fixture_cleanup_status, "unconfirmed");
        assert.equal(quarantineStore.read().reason, "cleanup_unconfirmed");
        const recreatedSupervisor = createJ2534NativeFixtureSupervisor(protectedDescriptor, {
          quarantineStore: createJ2534NativeQuarantineStore(quarantineDirectory), requireTrialConfirmation: true
        });
        const quarantinedRun = await recreatedSupervisor.run({
          mode: "native_fixture", scenario: "success", interactive_trial_confirmation: true
        });
        assert.equal(quarantinedRun.execution_status, "worker_quarantined");
        assert.deepEqual(quarantinedRun.errors, ["native_identity_quarantine_not_clear"]);
        assert.equal(quarantinedRun.worker_started, false);
        total += 12;
      } finally {
        const quarantineEntries = fs.readdirSync(quarantineDirectory);
        assert.ok(quarantineEntries.every(name => name === "j2534-native-quarantine-v1.json"));
        for (const name of quarantineEntries) fs.unlinkSync(path.join(quarantineDirectory, name));
        fs.rmdirSync(quarantineDirectory);
      }
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
      && !production.includes("J2534VerifiedIdentityFixtureWorker")
      && !production.includes("J2534UdsTransportFixtureWorker")
      && !production.includes("j2534-native-preflight-fixture-v1") && !production.includes("j2534-verified-identity-fixture-v1"), "Development native worker reached a production entry point");
    total++;
  }
  const distributionSources = ["../offline-assets.json", "./workstation-assets.js", "./package-workstation.js"]
    .map(relative => fs.readFileSync(new URL(relative, import.meta.url), "utf8")).join("\n");
  assert.ok(!distributionSources.includes("J2534NativePreflightFixtureWorker")
    && !distributionSources.includes("J2534UdsTransportFixtureWorker")
    && !distributionSources.includes("J2534VerifiedIdentityFixtureWorker")
    && !distributionSources.includes("j2534-native-preflight-fixture-v1")
    && !distributionSources.includes("j2534-verified-identity-fixture-v1"), "Native preflight fixture reached a public or PC package manifest");
  total++;
  console.log(`J2534 native binding checks: ${total} / independent native fixture ABI: tested / real VCI compatibility: not tested / vehicle communication: not performed / Errors: 0`);
}

main().catch(error => { console.error(error.message); process.exitCode = 1; });
