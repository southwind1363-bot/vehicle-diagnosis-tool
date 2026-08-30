import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { execFile } from "node:child_process";
import { packageWorkstation } from "./package-workstation.js";
import { verifyWorkstationPackage } from "./verify-workstation-package.js";
import { formatJ2534NativePreflightResult, formatJ2534WorkstationInspection, parseJ2534PreflightSelection, runJ2534WorkstationPreflight } from "./inspect-workstation-j2534.js";

let checks = 0;
const check = (value, message) => { assert.ok(value, message); checks += 1; };
const root = fs.mkdtempSync(path.join(os.tmpdir(), "vehicle package & test-"));
let next = 0;
function fixture() {
  const sourceDirectory = path.join(root, `source-${next}`);
  const outputDirectory = path.join(root, `output-${next++}`);
  fs.mkdirSync(path.join(sourceDirectory, "scripts"), { recursive: true });
  fs.mkdirSync(path.join(sourceDirectory, "scripts", "native"), { recursive: true });
  const assets = ["./", "index.html", "style.css", "script.js", "obd-readonly.js", "local-bridge-readonly.js", "manifest.webmanifest", "service-worker.js"];
  for (const asset of assets.filter((asset) => asset !== "./")) fs.writeFileSync(path.join(sourceDirectory, asset), "fixture");
  fs.writeFileSync(path.join(sourceDirectory, "script.js"), 'const APP_VERSION = "1.0.0";');
  fs.writeFileSync(path.join(sourceDirectory, "service-worker.js"), 'const CACHE_VERSION = "1.0.0";');
  fs.writeFileSync(path.join(sourceDirectory, "offline-assets.json"), JSON.stringify({ version: "1.0.0", asset_count: assets.length, assets }));
  for (const entry of ["start-workstation.cmd", "verify-workstation.cmd", "inspect-workstation-j2534.cmd", "scripts/inspect-workstation-j2534.js", "scripts/verify-workstation-package.js", "scripts/start-local-workstation.js", "scripts/workstation-assets.js", "scripts/j2534-readonly-worker.js"]) fs.writeFileSync(path.join(sourceDirectory, entry), "fixture");
  fs.copyFileSync(new URL("./j2534-registered-driver-native-preflight.js", import.meta.url), path.join(sourceDirectory, "scripts", "j2534-registered-driver-native-preflight.js"));
  for (const name of ["J2534RegisteredDriverPreflight.cs", "J2534AuthenticodeVerifier.cs", "J2534RegisteredDriverPreflightWorker.cs"])
    fs.copyFileSync(new URL(`./native/${name}`, import.meta.url), path.join(sourceDirectory, "scripts", "native", name));
  const pkg = { name: "fixture", version: "1.0.0", type: "module", dependencies: { express: "1.0.0" } };
  const lock = { lockfileVersion: 3, packages: { "": { name: pkg.name, version: pkg.version, dependencies: pkg.dependencies } } };
  for (const name of ["node_modules/express", "node_modules/express/node_modules/nested"]) {
    fs.mkdirSync(path.join(sourceDirectory, name), { recursive: true });
    fs.writeFileSync(path.join(sourceDirectory, name, "package.json"), JSON.stringify({ name: path.basename(name), version: "1.0.0", dependencies: name === "node_modules/express" ? { nested: "1.0.0" } : {}, exports: name.endsWith("/nested") ? { "./item": "./index.js", "./package.json": "./package.json" } : undefined }));
    fs.writeFileSync(path.join(sourceDirectory, name, "index.js"), "module.exports = {};");
    fs.writeFileSync(path.join(sourceDirectory, name, "LICENSE"), "fixture-license");
    lock.packages[name] = { version: "1.0.0", resolved: "https://registry.npmjs.org/example/-/example-1.0.0.tgz" };
  }
  fs.writeFileSync(path.join(sourceDirectory, "package.json"), JSON.stringify(pkg));
  fs.writeFileSync(path.join(sourceDirectory, "package-lock.json"), JSON.stringify(lock));
  return { sourceDirectory, outputDirectory, lock };
}
const run = (code, args, environment = {}) => new Promise((resolve) => {
  const env = { ...process.env, ...environment, NODE_PATH: "" };
  delete env.NODE_OPTIONS;
  delete env.LOCAL_BRIDGE_REPLAY_LOG;
  const child = execFile(process.execPath, ["--input-type=module", "-e", code, ...args], { cwd: os.tmpdir(), env, windowsHide: true, timeout: 15000 },
    (error, stdout, stderr) => resolve({ code: error?.code ?? 0, output: stdout + stderr }));
  child.stdin.end();
});
try {
  const staticReady = { id: "fixture-ready", label: "Fixture VCI", driver_library_inspection_status: "inspected", driver_runtime_compatible: true, driver_readonly_api_ready: true, driver_library_bitness: 64 };
  for (const [device, expected] of [
    [staticReady, "静的検査済み（実機接続は未確認）"],
    [{ ...staticReady, driver_library_inspection_status: "missing" }, "DLLの静的検査が未完了"],
    [{ ...staticReady, driver_runtime_compatible: false, driver_library_bitness: 32 }, "32bit DLLは64bit Node.jsに直接ロードできません"],
    [{ ...staticReady, driver_readonly_api_ready: false }, "読取に必要なAPIを確認できません"]
  ]) {
    const report = formatJ2534WorkstationInspection([device], "win32");
    check(report.includes(expected) && report.includes("1. Fixture VCI"), "Driver readiness report lost its per-device result");
    check(report.includes("車両通信: 未実施 / DLL実行: 未実施") && report.includes("車種適合、車両応答を確認できません"), "Static inspection overstated connection or compatibility");
  }
  check(formatJ2534WorkstationInspection([], "win32").includes("登録ドライバーを検出できません"), "Missing registration was not explained");
  check(formatJ2534WorkstationInspection([], "linux").includes("Windows専用") && !formatJ2534WorkstationInspection([], "linux").includes("登録検出:"), "Unsupported OS reported a Windows registry result");
  const mixed = formatJ2534WorkstationInspection([staticReady, { ...staticReady, id: "blocked", driver_runtime_compatible: false }], "win32");
  check(mixed.includes("静的検査済み: 1件 / 要確認: 1件") && mixed.includes("構成が一致していません"), "A ready device hid a blocked driver");
  const privateInput = { ...staticReady, label: "Fixture\x1b\r\n\u202eVCI", driver_library_path: "C:/private/driver.dll", pairing_token: "private-token" };
  const before = JSON.stringify(privateInput);
  const sanitized = formatJ2534WorkstationInspection([privateInput], "win32");
  check(!/[\x1b\r\u202e]/.test(sanitized) && !sanitized.includes("C:/private") && !sanitized.includes("private-token"), "Inspection disclosed private fields or terminal control characters");
  check(JSON.stringify(privateInput) === before, "Formatting changed a driver result");
  check(parseJ2534PreflightSelection([], 2).status === "none"
    && parseJ2534PreflightSelection(["--preflight-index", "2"], 2).index === 1, "J2534 preflight selection did not preserve one-based explicit selection");
  for (const args of [["--preflight-index", "0"], ["--preflight-index", "3"], ["--preflight-index", "1", "extra"], ["--unknown", "1"], ["--preflight-index"]])
    check(parseJ2534PreflightSelection(args, 2).status === "invalid", `J2534 preflight selection accepted invalid arguments: ${args.join(" ")}`);
  const privatePreflight = formatJ2534NativePreflightResult({ verification_status: "rejected", blockers: ["native_preflight_timeout"], private_library_path: "C:/private/driver.dll", request_nonce: "private-nonce" }, privateInput, 0);
  check(privatePreflight.includes("非実行の事前検査を完了できませんでした") && privatePreflight.includes("native_preflight_timeout")
    && privatePreflight.includes("PassThruOpen: 未実施") && privatePreflight.includes("車両への送信: 未実施")
    && !privatePreflight.includes("C:/private") && !privatePreflight.includes("private-token") && !privatePreflight.includes("private-nonce"), "J2534 preflight result leaked private data or overstated execution");
  let selectedDeviceId = null;
  let selectedTimeout = null;
  const selectedReport = await runJ2534WorkstationPreflight([staticReady, { ...staticReady, id: "fixture-second", label: "Second VCI" }], 1, {
    createDescriptor: ({ enabled, selectedDeviceId: id }) => { check(enabled === true, "J2534 preflight did not require live discovery"); selectedDeviceId = id; return Object.freeze({ opaque: true }); },
    runPreflight: async (descriptor, options) => { check(descriptor.opaque === true, "J2534 preflight changed the issued descriptor"); selectedTimeout = options.timeout_ms; return { verification_status: "rejected", blockers: ["native_preflight_timeout"] }; }
  });
  check(selectedDeviceId === "fixture-second" && selectedTimeout === 5000 && selectedReport.passed === false
    && selectedReport.output.includes("2. Second VCI"), "J2534 preflight did not use only the explicitly selected registration or report rejection");
  for (const blocker of ["native_preflight_timeout", "native_preflight_worker_missing", "registered_driver_file_changed"]) {
    const rejected = await runJ2534WorkstationPreflight([staticReady], 0, {
      createDescriptor: () => Object.freeze({ opaque: true }),
      runPreflight: async () => ({ verification_status: "rejected", blockers: [blocker] })
    });
    check(rejected.passed === false && rejected.output.includes(blocker), `J2534 ${blocker} did not produce a failed CLI outcome`);
  }
  const verifiedPreflight = await runJ2534WorkstationPreflight([staticReady], 0, {
    createDescriptor: () => Object.freeze({ opaque: true }),
    runPreflight: async () => ({ verification_status: "verified_non_executable", blockers: [], fixed_drive_verified: true,
      final_path_matches: true, file_identity_stable: true, sha256_matches: true, size_matches: true,
      architecture_matches: true, runtime_architecture_matches: true, authenticode_status: "verified_file_policy", authenticode_network_retrieval_allowed: false })
  });
  check(verifiedPreflight.passed === true && verifiedPreflight.output.includes("非実行の事前検査に合格しました") && verifiedPreflight.output.includes("WinVerifyTrust / ネットワーク取得なし"), "Verified J2534 non-executing preflight did not produce a successful CLI outcome");
  const unsignedPreflight = await runJ2534WorkstationPreflight([staticReady], 0, {
    createDescriptor: () => Object.freeze({ opaque: true }),
    runPreflight: async () => ({ verification_status: "rejected", blockers: ["native_authenticode_not_trusted"], authenticode_status: "not_trusted", authenticode_network_retrieval_allowed: false })
  });
  check(unsignedPreflight.passed === false && unsignedPreflight.output.includes("Windowsの署名ポリシー") && unsignedPreflight.output.includes("native_authenticode_not_trusted"), "Untrusted J2534 driver did not produce a safe CLI rejection");
  await assert.rejects(() => runJ2534WorkstationPreflight([staticReady], -1, { createDescriptor: () => { throw new Error("must-not-run"); } }), /j2534_preflight_selection_invalid/);
  check(true, "Invalid J2534 selection reached descriptor issuance");
  const valid = fixture();
  fs.writeFileSync(path.join(valid.sourceDirectory, ".env"), "private-fixture");
  fs.writeFileSync(path.join(valid.sourceDirectory, "saved-case.json"), "private-fixture");
  fs.mkdirSync(path.join(valid.sourceDirectory, "node_modules", "extraneous"));
  fs.writeFileSync(path.join(valid.sourceDirectory, "node_modules", "extraneous", "private.txt"), "private-fixture");
  const result = packageWorkstation(valid);
  check(result.dependencyCount === 2 && result.includesNode === false, "Package metadata overstated runtime or dependencies");
  check(!fs.existsSync(path.join(result.directory, ".env")) && !fs.existsSync(path.join(result.directory, "saved-case.json"))
    && !fs.existsSync(path.join(result.directory, "node_modules", "extraneous")), "Package included unlisted private files");
  check(fs.readFileSync(path.join(result.directory, "node_modules/express/node_modules/nested/LICENSE"), "utf8") === "fixture-license", "Nested dependency or license was omitted");
  const packaged = JSON.parse(fs.readFileSync(path.join(result.directory, "package.json"), "utf8"));
  const instructions = fs.readFileSync(path.join(result.directory, "README.txt"), "utf8");
  check(instructions.includes("Node.js 22以降") && instructions.includes("24 LTS"), "Package instructions omitted the runtime prerequisite");
  check(instructions.includes("inspect-workstation-j2534.cmd") && fs.existsSync(path.join(result.directory, "scripts/inspect-workstation-j2534.js")), "Package omitted the standalone J2534 preparation check");
  check(["scripts/j2534-registered-driver-native-preflight.js", "scripts/native/j2534-preflight-workers.json", "scripts/native/j2534-registered-driver-preflight-x86.exe", "scripts/native/j2534-registered-driver-preflight-x64.exe"].every(relative => fs.existsSync(path.join(result.directory, relative))), "Package omitted the non-executing J2534 native preflight runtime");
  check(packaged.scripts.start === "node scripts/verify-workstation-package.js && node scripts/start-local-workstation.js"
    && packaged.scripts["workstation:dev"] === packaged.scripts.start && packaged.scripts["verify:package"] === "node scripts/verify-workstation-package.js"
    && Object.keys(packaged.scripts).length === 3, "Package retained unavailable development commands");
  const integrity = verifyWorkstationPackage(result.directory);
  check(integrity.fileCount + 1 === result.fileCount && integrity.appVersion === result.appVersion, "Integrity file count does not include every packaged file except the manifest itself");

  const preflightTarget = path.join(process.env.SystemRoot || process.env.WINDIR || "C:\\Windows", "System32", "version.dll");
  const preflightBytes = fs.readFileSync(preflightTarget);
  const packagedRunner = await import(`${pathToFileURL(path.join(result.directory, "scripts", "j2534-registered-driver-native-preflight.js")).href}?fixture=${Date.now()}`);
  const packagedPreflight = await packagedRunner.runJ2534NativePreflight({
    selected_device_id: "j2534-package-fixture-x64", descriptor_source: "live_windows_registry",
    private_library_path: preflightTarget, expected_sha256: createHash("sha256").update(preflightBytes).digest("hex"),
    expected_file_size: preflightBytes.length, expected_architecture: "x64"
  }, { timeout_ms: 5000 });

  check(packagedPreflight.verification_status === "verified_non_executable" && packagedPreflight.authenticode_status === "verified_file_policy" && packagedPreflight.authenticode_network_retrieval_allowed === false && packagedPreflight.execution_enabled === false
    && packagedPreflight.vehicle_communication_started === false && !JSON.stringify(packagedPreflight).includes(preflightTarget), "Packaged J2534 preflight did not complete through private IPC without exposing or executing the target");
  check(instructions.includes("verify-workstation.cmd") && instructions.includes("署名・真正性・実車適合の証明ではありません"), "Integrity instructions overclaim verification");
  const integrityPath = path.join(result.directory, "package-integrity.json");
  const originalManifest = fs.readFileSync(integrityPath);
  for (const relative of ["script.js", "node_modules/express/index.js", "node_modules/express/node_modules/nested/LICENSE", "package-info.json", "scripts/verify-workstation-package.js", "inspect-workstation-j2534.cmd", "scripts/inspect-workstation-j2534.js", "scripts/j2534-registered-driver-native-preflight.js", "scripts/native/j2534-preflight-workers.json", "scripts/native/j2534-registered-driver-preflight-x64.exe"]) {
    const target = path.join(result.directory, relative);
    const original = fs.readFileSync(target);
    const changed = Buffer.from(original);
    changed[0] ^= 1;
    fs.writeFileSync(target, changed);
    assert.throws(() => verifyWorkstationPackage(result.directory), (error) => error.code === "package_integrity_hash_mismatch" && error.file === relative);
    check(fs.readFileSync(target).equals(changed), "Verification changed a corrupt file");
    fs.writeFileSync(target, Buffer.concat([original, Buffer.from("extra")]));
    assert.throws(() => verifyWorkstationPackage(result.directory), /package_integrity_size_mismatch/);
    fs.unlinkSync(target);
    assert.throws(() => verifyWorkstationPackage(result.directory), /package_integrity_file_missing/);
    fs.writeFileSync(target, original);
    check(verifyWorkstationPackage(result.directory).fileCount === integrity.fileCount, "Restored package did not verify");
  }
  for (const mutate of [
    (m) => { m.schemaVersion = "unknown"; },
    (m) => { m.algorithm = "md5"; },
    (m) => { m.appVersion = 1; },
    (m) => { m.appVersion = "9.9.9"; },
    (m) => { m.files = []; },
    (m) => { m.files.push({ ...m.files[0], path: m.files[0].path.toUpperCase() }); },
    (m) => { m.files[0].size = true; },
    (m) => { m.files[0].size = -1; },
    (m) => { m.files[0].sha256 = "bad"; },
    (m) => { m.files = m.files.filter((entry) => entry.path !== "script.js"); },
    (m) => { m.files = m.files.filter((entry) => entry.path !== "style.css"); },
    (m) => { m.files = m.files.filter((entry) => entry.path !== "inspect-workstation-j2534.cmd"); },
    (m) => { m.files = m.files.filter((entry) => entry.path !== "scripts/inspect-workstation-j2534.js"); },
    (m) => { m.files = m.files.filter((entry) => entry.path !== "scripts/j2534-registered-driver-native-preflight.js"); },
    (m) => { m.files = m.files.filter((entry) => entry.path !== "scripts/native/j2534-preflight-workers.json"); },
    (m) => { m.files = m.files.filter((entry) => entry.path !== "scripts/native/j2534-registered-driver-preflight-x86.exe"); },
    (m) => { m.files.push({ ...m.files[0], path: "package-integrity.json" }); },
    ...["../outside.txt", "/outside.txt", "C:/outside.txt", "a\\b", "x/../y", "x//y", "x./y", "x:y"].map((entryPath) => (m) => { m.files.push({ ...m.files[0], path: entryPath }); })
  ]) {
    const manifest = JSON.parse(originalManifest);
    mutate(manifest);
    fs.writeFileSync(integrityPath, JSON.stringify(manifest));
    assert.throws(() => verifyWorkstationPackage(result.directory), /package_integrity_/);
    check(true, "Invalid integrity manifest was accepted");
  }
  fs.writeFileSync(integrityPath, "{");
  assert.throws(() => verifyWorkstationPackage(result.directory), /package_integrity_manifest_invalid/);
  fs.writeFileSync(integrityPath, " ".repeat(4 * 1024 * 1024 + 1));
  assert.throws(() => verifyWorkstationPackage(result.directory), /package_integrity_manifest_invalid/);
  fs.unlinkSync(integrityPath);
  assert.throws(() => verifyWorkstationPackage(result.directory), /package_integrity_file_missing/);
  fs.writeFileSync(integrityPath, originalManifest);
  const linkedDirectory = path.join(result.directory, "linked-files");
  fs.symlinkSync(valid.sourceDirectory, linkedDirectory, process.platform === "win32" ? "junction" : "dir");
  const linkedManifest = JSON.parse(originalManifest);
  linkedManifest.files.push({ ...linkedManifest.files.find((entry) => entry.path === "script.js"), path: "linked-files/script.js" });
  fs.writeFileSync(integrityPath, JSON.stringify(linkedManifest));
  assert.throws(() => verifyWorkstationPackage(result.directory), /package_integrity_link_not_allowed/);
  fs.writeFileSync(integrityPath, originalManifest);
  check(verifyWorkstationPackage(result.directory).fileCount === integrity.fileCount, "Unlisted files should not be read or included in copy verification");
  assert.throws(() => packageWorkstation(valid), /workstation_package_exists/);
  check(fs.readdirSync(valid.outputDirectory).length === 1, "Repeated packaging modified an existing package or leaked staging files");

  for (const kind of ["directory", "file", "junction", "busy", "mismatch", "missing", "secret", "source-link", "output-link", "registry"]) {
    const item = fixture();
    fs.mkdirSync(item.outputDirectory);
    const destination = path.join(item.outputDirectory, "vehicle-diagnosis-tool-1.0.0");
    if (kind === "directory") fs.mkdirSync(destination);
    if (kind === "file") fs.writeFileSync(destination, "retain");
    if (kind === "junction") fs.symlinkSync(valid.sourceDirectory, destination, process.platform === "win32" ? "junction" : "dir");
    if (kind === "busy") fs.writeFileSync(path.join(item.outputDirectory, ".workstation-1.0.0.lock"), "retain");
    if (kind === "mismatch") fs.writeFileSync(path.join(item.sourceDirectory, "node_modules/express/package.json"), '{"version":"2.0.0"}');
    if (kind === "missing") fs.unlinkSync(path.join(item.sourceDirectory, "node_modules/express/package.json"));
    if (kind === "secret") fs.writeFileSync(path.join(item.sourceDirectory, "node_modules/express/.env"), "retain");
    if (kind === "source-link") {
      fs.symlinkSync(valid.sourceDirectory, path.join(item.sourceDirectory, "linked"), process.platform === "win32" ? "junction" : "dir");
      item.sourceDirectory = path.join(item.sourceDirectory, "linked");
    }
    if (kind === "output-link") {
      fs.symlinkSync(valid.outputDirectory, path.join(item.outputDirectory, "linked"), process.platform === "win32" ? "junction" : "dir");
      item.outputDirectory = path.join(item.outputDirectory, "linked", "child");
    }
    if (kind === "registry") {
      item.lock.packages["node_modules/express"].resolved = "https://user:secret@registry.npmjs.org/example.tgz";
      fs.writeFileSync(path.join(item.sourceDirectory, "package-lock.json"), JSON.stringify(item.lock));
    }
    assert.throws(() => packageWorkstation(item), kind.endsWith("-link") ? /workstation_package_link_not_allowed/ : undefined);
    check(!fs.existsSync(item.outputDirectory) || !fs.readdirSync(item.outputDirectory).some((name) => name.startsWith(".workstation-staging-")), `${kind}: failed build leaked staging`);
    if (kind === "file") check(fs.readFileSync(destination, "utf8") === "retain", "Existing output was overwritten");
  }

  for (const asset of ["data/.env", "data/.npmrc", "data/session.key", "node_modules/extraneous/private.txt"]) {
    const item = fixture();
    const manifestPath = path.join(item.sourceDirectory, "offline-assets.json");
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    manifest.assets.push(asset);
    manifest.asset_count += 1;
    fs.mkdirSync(path.dirname(path.join(item.sourceDirectory, asset)), { recursive: true });
    fs.writeFileSync(path.join(item.sourceDirectory, asset), "private-fixture");
    fs.writeFileSync(manifestPath, JSON.stringify(manifest));
    assert.throws(() => packageWorkstation(item), /workstation_package_(private_file|asset_invalid)/);
    check(fs.readdirSync(item.outputDirectory).length === 0, "Manifest private entry leaked output");
  }
  for (const name of ["package.json", "package-lock.json", "offline-assets.json"]) {
    const item = fixture();
    const manifestPath = path.join(item.sourceDirectory, name);
    fs.unlinkSync(manifestPath);
    // Windows file symlinks require a privilege that ordinary workstation users lack.
    fs.symlinkSync(process.platform === "win32" ? valid.sourceDirectory : path.join(valid.sourceDirectory, name), manifestPath, process.platform === "win32" ? "junction" : "file");
    assert.throws(() => packageWorkstation(item), /workstation_package_link_not_allowed/);
    check(!fs.existsSync(item.outputDirectory), "Linked input manifest reached output creation");
  }

  const competing = fixture();
  const moduleUrl = new URL("./package-workstation.js", import.meta.url).href;
  const builder = `import {packageWorkstation} from ${JSON.stringify(moduleUrl)};try{packageWorkstation({sourceDirectory:process.argv[1],outputDirectory:process.argv[2]});console.log("created");}catch(error){console.log(error.message);process.exitCode=1;}`;
  const races = await Promise.all([run(builder, [competing.sourceDirectory, competing.outputDirectory]), run(builder, [competing.sourceDirectory, competing.outputDirectory])]);
  check(races.filter((value) => value.code === 0).length === 1 && races.some((value) => /workstation_package_(busy|exists)/.test(value.output)), "Concurrent builders did not protect publication");
  check(fs.readdirSync(competing.outputDirectory).length === 1, "Concurrent publication left locks or staging behind");

  const actual = packageWorkstation({ outputDirectory: path.join(root, "relocated") });
  const verified = await run(`import {pathToFileURL} from "node:url";import path from "node:path";const {verifyWorkstationPackage}=await import(pathToFileURL(path.join(process.argv[1],"scripts/verify-workstation-package.js")));console.log(verifyWorkstationPackage(process.argv[1]).appVersion);`, [actual.directory]);
  check(verified.code === 0 && verified.output.trim() === actual.appVersion, "Relocated verifier borrowed runtime files or failed offline");
  const entries = process.platform === "win32" ? ["cmd", "start", "workstation:dev"] : ["start", "workstation:dev"];
  const runEntry = (entry) => new Promise((resolve) => {
    const env = { ...process.env, NODE_PATH: "", PORT: "0", LOCAL_BRIDGE_PORT: "0" };
    for (const key of ["NODE_OPTIONS", "LOCAL_BRIDGE_REPLAY_LOG", "LOCAL_BRIDGE_PAIRING_TOKEN"]) delete env[key];
    const windows = process.platform === "win32";
    const command = entry === "inspect" ? '""inspect-workstation-j2534.cmd" --no-pause"'
      : entry === "inspect-invalid" ? '""inspect-workstation-j2534.cmd" --preflight-index 0 --no-pause"'
      : entry === "cmd" ? '""start-workstation.cmd" --no-pause"' : `"npm.cmd run ${entry}"`;
    const child = execFile(windows ? process.env.ComSpec || "cmd.exe" : "npm", windows ? ["/d", "/s", "/c", command] : ["run", entry],
      { cwd: actual.directory, env, windowsHide: true, windowsVerbatimArguments: windows, timeout: 20000 },
      (error, stdout, stderr) => resolve({ code: error?.code ?? 0, output: stdout + stderr }));
    child.stdin.end("q\n");
  });
  for (const entry of entries) {
    const launched = await runEntry(entry);
    check(launched.code === 0 && launched.output.includes("Package files match:") && launched.output.includes("診断画面:"), `${entry}: verified packaged startup failed: ${launched.output}`);
    check(launched.output.indexOf("Package files match:") < launched.output.indexOf("診断画面:"), `${entry}: started before package verification`);
  }
  if (process.platform === "win32") {
    const inspection = await runEntry("inspect");
    check(inspection.code === 0 && inspection.output.includes("J2534接続準備チェック"), `Packaged J2534 inspection failed: ${inspection.output}`);
    check(inspection.output.includes("Package files match:") && inspection.output.indexOf("Package files match:") < inspection.output.indexOf("J2534接続準備チェック"), "Driver inspection started before package verification");
    check(!inspection.output.includes("診断画面:") && !inspection.output.includes("ペアリング値") && inspection.output.includes("車両通信: 未実施 / DLL実行: 未実施"), "Driver inspection started a server or overstated vehicle access");
    check(!inspection.output.includes("J2534登録ドライバー 非実行事前検査"), "Non-interactive J2534 inspection ran preflight without explicit selection");
    const invalidInspection = await runEntry("inspect-invalid");
    check(invalidInspection.code === 2 && invalidInspection.output.includes("Package files match:")
      && invalidInspection.output.includes("検査番号を確認できません") && !invalidInspection.output.includes("DLLロード: 実施"), "Invalid packaged J2534 selection was not rejected after package verification");
  }
  const guardedEntries = process.platform === "win32" ? [...entries, "inspect"] : entries;
  for (const [relative, missing] of [["script.js", false], ["node_modules/express/index.js", false], ["package-integrity.json", true], ["package-info.json", true], ["scripts/verify-workstation-package.js", true], ["scripts/inspect-workstation-j2534.js", false]]) {
    const target = path.join(actual.directory, relative);
    const original = fs.readFileSync(target);
    try {
      if (missing) fs.unlinkSync(target);
      else fs.writeFileSync(target, 'throw new Error("dependency-loaded-before-check");');
      for (const entry of guardedEntries) {
        const blocked = await runEntry(entry);
        check(blocked.code !== 0 && !blocked.output.includes("診断画面:") && !blocked.output.includes("ペアリング値"), `${entry}: ${relative} failure started a server or disclosed a key`);
        check(!blocked.output.includes("dependency-loaded-before-check"), `${entry}: damaged dependency executed before verification`);
        if (entry === "inspect") check(!blocked.output.includes("J2534接続準備チェック"), "Failed verification reached driver inspection");
        check(missing ? !fs.existsSync(target) : fs.readFileSync(target, "utf8").startsWith("throw new Error"), `${entry}: failed verification repaired or removed files`);
      }
    } finally { fs.writeFileSync(target, original); }
  }
  if (process.platform === "win32") {
    const packageInfoPath = path.join(actual.directory, "package-info.json");
    const packageIntegrityPath = path.join(actual.directory, "package-integrity.json");
    const packageInfo = fs.readFileSync(packageInfoPath);
    const packageIntegrity = fs.readFileSync(packageIntegrityPath);
    try {
      fs.unlinkSync(packageInfoPath);
      fs.unlinkSync(packageIntegrityPath);
      const blocked = await runEntry("inspect");
      check(blocked.code === 1 && blocked.output.includes("Package verification files are missing")
        && !blocked.output.includes("J2534接続準備チェック"), "J2534 inspection failed open when both package verification files were missing");
    } finally {
      fs.writeFileSync(packageInfoPath, packageInfo);
      fs.writeFileSync(packageIntegrityPath, packageIntegrity);
    }
  }
  check(verifyWorkstationPackage(actual.directory).appVersion === actual.appVersion, "Startup failure tests did not restore the package");
  const smoke = `
    import assert from "node:assert/strict";
    import fs from "node:fs";
    import path from "node:path";
    import {pathToFileURL} from "node:url";
    import {validatePackagedDependencies} from ${JSON.stringify(moduleUrl)};
    const root=process.argv[1];
    validatePackagedDependencies(root);
    assert(fs.existsSync(path.join(root,"scripts/j2534-readonly-worker.js")));
    fs.writeFileSync(path.join(root,"saved-session.json"),"private-fixture");
    fs.writeFileSync(path.join(root,"data","saved-session.json"),"private-fixture");
    const {startLocalWorkstation}=await import(pathToFileURL(path.join(root,"scripts/start-local-workstation.js")));
    let app;
    try {
      app=await startLocalWorkstation({webPort:0,bridgePort:0,j2534RegistryText:""});
      const response=await fetch(app.webUrl);
      assert.equal(response.status,200);
      await response.arrayBuffer();
      for(const file of ["/saved-session.json","/data/saved-session.json","/package-info.json","/package-integrity.json","/verify-workstation.cmd","/inspect-workstation-j2534.cmd","/scripts/inspect-workstation-j2534.js","/scripts/verify-workstation-package.js","/node_modules/express/package.json","/scripts/start-local-workstation.js"]) {
        const denied=await fetch(app.webUrl+file);
        assert.equal(denied.status,404);
        assert.equal(await denied.text(),"");
      }
      console.log("static-private-denied");
      const health=await(await fetch(app.bridgeUrl+"/health")).json();
      assert.equal(health.vehicle_command_enabled,false);
      assert.equal(health.sample_readouts_enabled,false);
      console.log("isolated-ready");
    } finally {await app?.close();}
  `;
  const healthy = await run(smoke, [actual.directory]);
  check(healthy.code === 0 && healthy.output.includes("isolated-ready"), `Relocated package failed isolated startup: ${healthy.output}`);
  check(healthy.code === 0 && healthy.output.includes("static-private-denied"), "Relocated package exposed local-only files over HTTP");
  const manifestPath = path.join(actual.directory, "offline-assets.json");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  manifest.assets = manifest.assets.filter((asset) => asset !== "./");
  manifest.asset_count = manifest.assets.length;
  fs.writeFileSync(manifestPath, JSON.stringify(manifest));
  const withoutRootAlias = await run(smoke, [actual.directory]);
  check(withoutRootAlias.code === 0 && withoutRootAlias.output.includes("isolated-ready"), "Valid index.html-only manifest lost the launcher root URL");
  const dependency = path.join(actual.directory, "node_modules/accepts/index.js");
  fs.renameSync(dependency, `${dependency}.disabled`);
  const broken = await run(smoke, [actual.directory]);
  check(broken.code !== 0 && !broken.output.includes("isolated-ready"), "Relocated package borrowed a missing dependency from the development environment");
  fs.renameSync(`${dependency}.disabled`, dependency);
  const fallbackDirectory = path.join(root, "fallback");
  fs.mkdirSync(fallbackDirectory);
  fs.renameSync(path.join(actual.directory, "node_modules/accepts"), path.join(fallbackDirectory, "accepts"));
  const incompleteLockPath = path.join(actual.directory, "package-lock.json");
  const incompleteLock = JSON.parse(fs.readFileSync(incompleteLockPath, "utf8"));
  delete incompleteLock.packages["node_modules/accepts"];
  fs.writeFileSync(incompleteLockPath, JSON.stringify(incompleteLock));
  const fallback = await run(`import assert from "node:assert/strict";import path from "node:path";import Module,{createRequire} from "node:module";import {validatePackagedDependencies} from ${JSON.stringify(moduleUrl)};process.env.NODE_PATH=process.argv[2];Module._initPaths();const require=createRequire(path.join(process.argv[1],"node_modules/express/package.json"));assert.equal(require.resolve("accepts"),path.join(process.argv[2],"accepts/index.js"));assert.throws(()=>validatePackagedDependencies(process.argv[1]),/workstation_package_external_dependency/);console.log("fallback-rejected");`, [actual.directory, fallbackDirectory]);
  check(fallback.code === 0 && fallback.output.includes("fallback-rejected"), `External transitive dependency escaped confinement: ${fallback.output}`);
} finally {
  assert.equal(path.dirname(path.resolve(root)), path.resolve(os.tmpdir()));
  assert(path.basename(root).startsWith("vehicle package & test-"));
  fs.rmSync(root, { recursive: true, force: true });
}
console.log(`Workstation package checks: ${checks} / Errors: 0`);
