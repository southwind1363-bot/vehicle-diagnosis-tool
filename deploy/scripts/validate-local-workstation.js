import assert from "node:assert/strict";
import http from "node:http";
import fs from "node:fs";
import vm from "node:vm";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { webcrypto } from "node:crypto";
import { startLocalWorkstation } from "./start-local-workstation.js";
import { validateWorkstationAssets } from "./workstation-assets.js";

let checks = 0;
const check = (condition, message) => { assert.ok(condition, message); checks += 1; };
const options = { webPort: 0, bridgePort: 0, pairingToken: "workstation-test-token", j2534RegistryText: "" };
const appSource = fs.readFileSync(new URL("../script.js", import.meta.url), "utf8");
const indexSource = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");

async function validateWorkstationConsoleExit() {
  const launcherPath = fileURLToPath(new URL("../start-workstation.cmd", import.meta.url));
  const starterPath = fileURLToPath(new URL("./start-local-workstation.js", import.meta.url));
  for (const { command, direct = false, closeBeforeReady = false, keepInputOpen = false } of [
    { command: "q\nq\n", keepInputOpen: true }, { command: " EXIT \r\n", keepInputOpen: true },
    { command: "", direct: true }, { command: "unfinished", direct: true },
    { command: "", direct: true, closeBeforeReady: true }
  ]) {
    const environment = { ...process.env, PORT: "0", LOCAL_BRIDGE_PORT: "0", LOCAL_BRIDGE_PAIRING_TOKEN: options.pairingToken };
    delete environment.LOCAL_BRIDGE_REPLAY_LOG;
    const ready = deferred();
    let child;
    let output = "";
    const exited = new Promise((resolve) => {
      const windows = process.platform === "win32" && !direct;
      child = execFile(windows ? process.env.ComSpec || "cmd.exe" : process.execPath,
        windows ? ["/d", "/s", "/c", `""${launcherPath}" --no-pause"`] : [starterPath],
        { cwd: os.tmpdir(), env: environment, windowsHide: true, windowsVerbatimArguments: windows, timeout: 15000 },
        (error, stdout) => resolve({ code: error?.code ?? 0, output: stdout }));
      child.stdin.on("error", () => {});
      child.stdout.on("data", (chunk) => {
        output += chunk.toString();
        const urls = output.match(/http:\/\/127\.0\.0\.1:\d+/g);
        if (urls?.length >= 2) ready.resolve(urls);
      });
      if (closeBeforeReady) child.stdin.end();
    });
    const pendingRequests = [];
    try {
      const urls = await Promise.race([ready.promise, exited.then(() => null)]);
      check(urls?.length >= 2, "Console launcher exited before both local servers were ready");
      if (!closeBeforeReady) {
        child.stdin.write("continue\n");
        const page = await fetch(urls[0], { signal: AbortSignal.timeout(5000) });
        await page.arrayBuffer();
        const health = await (await fetch(`${urls[1]}/health`, { signal: AbortSignal.timeout(5000) })).json();
        check(page.status === 200 && health.vehicle_command_enabled === false && health.sample_readouts_enabled === false, "Console launcher stopped on unrelated input or enabled vehicle commands");
      }
      if (!closeBeforeReady && (command.includes("EXIT") || command === "")) {
        // Incomplete bodies keep both HTTP servers busy while shutdown is requested.
        for (const endpoint of [`${urls[0]}/local-bridge/v1/request`, `${urls[1]}/v1/request`]) {
          const request = http.request(endpoint, { method: "POST", headers: { "Content-Type": "application/json" } });
          pendingRequests.push(request);
          request.on("error", () => {});
          const connected = new Promise((resolve, reject) => {
            request.once("error", reject);
            request.once("socket", (socket) => socket.connecting ? socket.once("connect", resolve) : resolve());
          });
          request.write("{");
          await connected;
        }
      }
      if (keepInputOpen) child.stdin.write(command);
      else if (!child.stdin.writableEnded) child.stdin.end(command);
      const result = await exited;
      check(result.code === 0 && (result.output.match(/診断画面と確認ブリッジを終了しました。/g) || []).length === 1, "Console shutdown failed, timed out, or ran more than once");
      const rebound = await startLocalWorkstation({ ...options, webPort: Number(new URL(urls[0]).port), bridgePort: Number(new URL(urls[1]).port) });
      try {
        check(rebound.webServer.listening && rebound.bridgeServer.listening, "Console shutdown did not release both ports for the next start");
      } finally { await rebound.close(); }
    } finally {
      pendingRequests.forEach((request) => request.destroy());
      if (!child.stdin.destroyed && !child.stdin.writableEnded) child.stdin.end("q\n");
      await exited;
    }
  }
}

async function validateWindowsLauncher(occupiedWebPort) {
  if (process.platform !== "win32") return;
  const launcherPath = fileURLToPath(new URL("../start-workstation.cmd", import.meta.url));
  const run = (file, env = {}, noPause = true) => new Promise((resolve) => {
    const environment = { ...process.env, NODE_PATH: "" };
    delete environment.LOCAL_BRIDGE_REPLAY_LOG;
    delete environment.LOCAL_BRIDGE_PAIRING_TOKEN;
    const child = execFile(process.env.ComSpec || "cmd.exe", ["/d", "/s", "/c", `""${file}"${noPause ? " --no-pause" : ""}"`], {
      cwd: os.tmpdir(), windowsHide: true, windowsVerbatimArguments: true, timeout: 15000,
      env: { ...environment, ...env }
    }, (error, stdout, stderr) => resolve({ code: error?.code ?? 0, output: stdout + stderr }));
    child.stdin.end("\n");
  });
  const missingNode = await run(launcherPath, { PATH: "" });
  check(missingNode.code === 1 && missingNode.output.includes("Node.js was not found"), "Windows launcher did not explain missing Node.js or preserve its failure code");
  const replay = await run(launcherPath, { LOCAL_BRIDGE_REPLAY_LOG: "must-not-be-read.log" });
  check(replay.code === 1 && replay.output.includes("ローカル起動に失敗しました") && !replay.output.includes("診断画面:"), "Windows launcher bypassed replay protection or depended on the caller's working directory");
  const conflict = await run(launcherPath, { PORT: String(occupiedWebPort), LOCAL_BRIDGE_PORT: "0" });
  check(conflict.code === 1 && conflict.output.includes("起動先ポートは使用中") && !conflict.output.includes("ペアリング値"), "Windows launcher hid a port conflict or exposed a pairing key after failed startup");

  const fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), "vehicle launcher & test-"));
  try {
    const fixtureLauncher = path.join(fixtureDir, "start-workstation.cmd");
    fs.copyFileSync(launcherPath, fixtureLauncher);
    const missingDependency = await run(fixtureLauncher);
    check(missingDependency.code === 1 && missingDependency.output.includes("Required packages are missing"), "Windows launcher did not explain missing dependencies");
    // A finite child verifies forwarding without starting a second long-lived server.
    fs.mkdirSync(path.join(fixtureDir, "node_modules", "express"), { recursive: true });
    fs.writeFileSync(path.join(fixtureDir, "node_modules", "express", "index.js"), "");
    fs.mkdirSync(path.join(fixtureDir, "scripts"));
    fs.writeFileSync(path.join(fixtureDir, "scripts", "start-local-workstation.js"), 'console.log("launcher-child"); process.exitCode = Number(process.env.LAUNCHER_TEST_EXIT);');
    for (const code of [0, 7]) {
      const child = await run(fixtureLauncher, { LAUNCHER_TEST_EXIT: String(code) });
      check(child.code === code && child.output.includes("launcher-child"), `Windows launcher lost child exit ${code} or mishandled spaces and shell characters in its folder`);
    }
    const pausedFailure = await run(fixtureLauncher, { LAUNCHER_TEST_EXIT: "7" }, false);
    check(pausedFailure.code === 7 && pausedFailure.output.includes("launcher-child"), "Windows launcher lost the child failure code after the default pause");
  } finally {
    assert.equal(path.dirname(path.resolve(fixtureDir)), path.resolve(os.tmpdir()));
    assert(path.basename(fixtureDir).startsWith("vehicle launcher & test-"));
    fs.rmSync(fixtureDir, { recursive: true, force: true });
  }
}

async function validateWorkstationAssetPreflight() {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), "vehicle assets & test-"));
  let next = 0;
  const fixture = () => {
    const directory = path.join(fixtureRoot, String(next++));
    fs.mkdirSync(path.join(directory, "data"), { recursive: true });
    const assets = ["./", "index.html", "style.css", "script.js", "obd-readonly.js", "local-bridge-readonly.js", "manifest.webmanifest", "service-worker.js", "data/readout.json"];
    for (const asset of assets.filter((asset) => asset !== "./")) fs.writeFileSync(path.join(directory, asset), "fixture");
    fs.writeFileSync(path.join(directory, "script.js"), 'const APP_VERSION = "test-1";');
    fs.writeFileSync(path.join(directory, "service-worker.js"), 'const CACHE_VERSION = "test-1";');
    const manifest = { version: "test-1", asset_count: assets.length, assets };
    const save = () => fs.writeFileSync(path.join(directory, "offline-assets.json"), JSON.stringify(manifest));
    save();
    return { directory, manifest, save };
  };
  const rejects = (item, asset) => {
    assert.throws(() => validateWorkstationAssets(item.directory), (error) => error.code === "workstation_assets_invalid" && error.asset === asset);
    check(true, `Incomplete workstation rejected: ${asset}`);
  };
  try {
    const valid = fixture();
    assert.deepEqual(validateWorkstationAssets(valid.directory), { version: "test-1", assetCount: 9 });
    check(true, "Complete local assets passed startup inspection");
    for (const asset of ["offline-assets.json", "script.js", "data/readout.json"]) {
      const item = fixture();
      fs.unlinkSync(path.join(item.directory, asset));
      rejects(item, asset);
    }
    for (const asset of ["script.js", "data/readout.json"]) {
      const item = fixture();
      fs.writeFileSync(path.join(item.directory, asset), "");
      rejects(item, asset);
    }
    for (const [asset, content] of [["offline-assets.json", "{"], ["script.js", 'const APP_VERSION = "old";'],
      ["service-worker.js", 'const CACHE_VERSION = "old";'], ["script.js", 'const APP_VERSION = "test-1"; const APP_VERSION = "test-1";']]) {
      const item = fixture();
      fs.writeFileSync(path.join(item.directory, asset), content);
      rejects(item, asset);
    }
    for (const asset of ["../outside.json", "/index.html", "https://example.invalid/file", "data\\readout.json", "data/%2e%2e/file", "data/../file", "data//file", "data/./file", "data/file.", "script.js?x=1", "script.js#x", "C:/file", "SCRIPT.js", ""]) {
      const item = fixture();
      item.manifest.assets.push(asset);
      item.manifest.asset_count += 1;
      item.save();
      rejects(item, "offline-assets.json");
    }
    for (const mutate of [(value) => { value.asset_count += 1; }, (value) => { value.version = null; },
      (value) => { value.assets = value.assets.map((asset) => asset === "style.css" ? "STYLE.CSS" : asset); },
      (value) => { value.assets = value.assets.filter((asset) => asset !== "obd-readonly.js"); value.asset_count -= 1; }]) {
      const item = fixture();
      mutate(item.manifest);
      item.save();
      rejects(item, "offline-assets.json");
    }
    const directoryAsset = fixture();
    fs.unlinkSync(path.join(directoryAsset.directory, "data/readout.json"));
    fs.mkdirSync(path.join(directoryAsset.directory, "data/readout.json"));
    rejects(directoryAsset, "data/readout.json");
    const nonregular = fixture();
    const nonregularPath = fs.realpathSync(path.join(nonregular.directory, "data/readout.json"));
    const originalStat = fs.statSync;
    const originalOpen = fs.openSync;
    let openedNonregular = false;
    try {
      fs.statSync = (file, ...args) => file === nonregularPath ? { isFile: () => false } : originalStat(file, ...args);
      fs.openSync = (file, ...args) => {
        if (file === nonregularPath) openedNonregular = true;
        return originalOpen(file, ...args);
      };
      rejects(nonregular, "data/readout.json");
      check(!openedNonregular, "Preflight opened a nonregular file before rejecting it");
    } finally {
      fs.statSync = originalStat;
      fs.openSync = originalOpen;
    }
    const oversized = fixture();
    fs.truncateSync(path.join(oversized.directory, "data/readout.json"), 64 * 1024 * 1024 + 1);
    rejects(oversized, "data/readout.json");
    const linked = fixture();
    fs.symlinkSync(path.join(valid.directory, "data"), path.join(linked.directory, "linked"), process.platform === "win32" ? "junction" : "dir");
    linked.manifest.assets.push("linked/readout.json");
    linked.manifest.asset_count += 1;
    linked.save();
    rejects(linked, "linked/readout.json");

    for (const missing of ["data/readout.json", "local-bridge-readonly.js", "offline-assets.json"]) {
      const cli = fixture();
      fs.mkdirSync(path.join(cli.directory, "scripts"));
      for (const name of ["start-local-workstation.js", "workstation-assets.js"]) {
        fs.copyFileSync(new URL(`./${name}`, import.meta.url), path.join(cli.directory, "scripts", name));
      }
      fs.writeFileSync(path.join(cli.directory, "package.json"), '{"type":"module"}');
      fs.writeFileSync(path.join(cli.directory, "local-bridge-readonly.js"), 'export function createLocalBridgeApp() { console.log("BRIDGE_CREATED"); throw new Error("unexpected_bridge_creation"); }');
      const expressDirectory = path.join(cli.directory, "node_modules", "express");
      fs.mkdirSync(expressDirectory, { recursive: true });
      fs.writeFileSync(path.join(expressDirectory, "package.json"), '{"type":"module","exports":"./index.js"}');
      fs.writeFileSync(path.join(expressDirectory, "index.js"), 'export default function express() { throw new Error("unexpected_web_creation"); }');
      fs.unlinkSync(path.join(cli.directory, missing));
      const environment = { ...process.env, PORT: "0", LOCAL_BRIDGE_PORT: "0", LOCAL_BRIDGE_PAIRING_TOKEN: options.pairingToken };
      delete environment.LOCAL_BRIDGE_REPLAY_LOG;
      const result = await new Promise((resolve) => {
        const child = execFile(process.execPath, [path.join(cli.directory, "scripts", "start-local-workstation.js")],
          { cwd: os.tmpdir(), env: environment, windowsHide: true, timeout: 5000 },
          (error, stdout, stderr) => resolve({ code: error?.code ?? 0, output: stdout + stderr }));
        child.stdin.end();
      });
      check(result.code === 1 && result.output.includes("ローカル資材") && result.output.includes(missing)
        && !result.output.includes("BRIDGE_CREATED") && !result.output.includes("診断画面:") && !result.output.includes(options.pairingToken),
        "Incomplete startup did not stop before bridge creation or exposed connection information");
    }
  } finally {
    assert.equal(path.dirname(path.resolve(fixtureRoot)), path.resolve(os.tmpdir()));
    assert(path.basename(fixtureRoot).startsWith("vehicle assets & test-"));
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
}

async function validatePortableNpmScripts() {
  const manifest = JSON.parse(fs.readFileSync(new URL("../package.json", import.meta.url), "utf8"));
  assert.deepEqual(manifest.scripts, {
    start: "node server.js", dev: "node server.js",
    "workstation:dev": "node scripts/start-local-workstation.js",
    "validate:workstation": "node scripts/validate-local-workstation.js",
    "validate:offline": "node scripts/validate-offline-cache.js",
    "validate:case-storage": "node scripts/validate-case-storage.js",
    "validate:serial": "node scripts/validate-serial-lifecycle.js",
    "validate:session-export": "node scripts/validate-session-export.js",
    "bridge:dev": "node local-bridge-readonly.js",
    "bridge:j2534:dev": "node scripts/start-j2534-readonly-bridge.js",
    "inspect:j2534": "node scripts/inspect-j2534-drivers.js",
    "review:j2534-worker": "node scripts/j2534-readonly-worker.js",
    "review:j2534-host": "node scripts/review-j2534-host.js",
    "validate:data": "node scripts/validate-data.js",
    "validate:dtc-import": "node scripts/validate-verified-dtc-import.js",
    "validate:obd": "node scripts/validate-obd-readonly.js",
    "validate:bridge": "node scripts/validate-local-bridge-readonly.js",
    "validate:release": "npm run validate:obd && npm run validate:bridge && npm run validate:workstation && npm run validate:offline && npm run validate:data",
    "report:coverage": "node scripts/report-dtc-coverage.js",
    "import:dtc:sample": 'node scripts/import-verified-dtc-csv.js --input scripts/fixtures/verified-dtc-sample.csv --source "検証用サンプル" --source-url "https://example.invalid/verified-dtc-sample" --source-date "2026-05-31"'
  });
  check(true, "Portable npm scripts retained their entries, arguments, and release order");
  for (const [name, command] of Object.entries(manifest.scripts)) {
    if (name === "validate:release") continue;
    const entry = command.match(/^node ([a-z0-9/-]+\.js)(?: |$)/i)?.[1];
    check(Boolean(entry) && fs.existsSync(new URL(`../${entry}`, import.meta.url)),
      `${name}: npm command requires a machine-specific runtime or has no script entry`);
  }
  if (process.platform !== "win32") return;
  const fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), "vehicle npm & test-"));
  try {
    const binDir = path.join(fixtureDir, "node_modules", ".bin");
    const probe = path.join(fixtureDir, "runtime-probe.cjs");
    const resultPath = path.join(fixtureDir, "result.json");
    fs.mkdirSync(binDir, { recursive: true });
    fs.writeFileSync(probe, 'require("node:fs").writeFileSync(process.env.RUNTIME_PROBE_RESULT, JSON.stringify({ args: process.argv.slice(2), cwd: process.cwd() })); process.exitCode = Number(process.env.RUNTIME_PROBE_EXIT);');
    fs.writeFileSync(path.join(binDir, "node.cmd"), `@"${process.execPath}" "${probe}" %*\r\n`);
    const cases = [
      ["start", ["server.js"], 0],
      ["bridge:j2534:dev", ["scripts/start-j2534-readonly-bridge.js"], 7],
      ["import:dtc:sample", ["scripts/import-verified-dtc-csv.js", "--input", "scripts/fixtures/verified-dtc-sample.csv", "--source", "検証用サンプル", "--source-url", "https://example.invalid/verified-dtc-sample", "--source-date", "2026-05-31"], 0]
    ];
    fs.writeFileSync(path.join(fixtureDir, "package.json"), JSON.stringify({ private: true,
      scripts: Object.fromEntries(cases.map(([name]) => [name, manifest.scripts[name]])) }));
    for (const [name, args, code] of cases) {
      const entry = path.join(fixtureDir, args[0]);
      fs.mkdirSync(path.dirname(entry), { recursive: true });
      // A bypassed PATH wrapper must never start a real server or hardware process.
      fs.writeFileSync(entry, 'process.exitCode = 99;');
      if (fs.existsSync(resultPath)) fs.unlinkSync(resultPath);
      const result = await new Promise((resolve) => {
        execFile(process.env.ComSpec || "cmd.exe", ["/d", "/s", "/c", `npm.cmd --prefix "${fixtureDir}" run "${name}" --silent`], {
          cwd: os.tmpdir(), windowsHide: true, windowsVerbatimArguments: true, timeout: 15000,
          env: { ...process.env, RUNTIME_PROBE_RESULT: resultPath, RUNTIME_PROBE_EXIT: String(code),
            npm_config_update_notifier: "false", npm_config_logs_max: "0", npm_config_script_shell: process.env.ComSpec || "cmd.exe" }
        }, (error) => resolve({ code: error?.code ?? 0 }));
      });
      check(result.code === code && fs.existsSync(resultPath), `${name}: npm bypassed the PATH runtime or lost its exit code`);
      assert.deepEqual(JSON.parse(fs.readFileSync(resultPath, "utf8")), { args, cwd: fixtureDir });
      check(true, `${name}: portable npm invocation preserved arguments`);
    }
  } finally {
    assert.equal(path.dirname(path.resolve(fixtureDir)), path.resolve(os.tmpdir()));
    assert(path.basename(fixtureDir).startsWith("vehicle npm & test-"));
    fs.rmSync(fixtureDir, { recursive: true, force: true });
  }
}

const clientSource = appSource.slice(appSource.indexOf("async function runObdLocalBridgeRead("), appSource.indexOf("const WEB_SERIAL_ADAPTER_ERROR_LINES"));
function createClient(webUrl, token, fetchRequest = fetch) {
  const context = vm.createContext({
    location: new URL(webUrl), obdDevSession: { bridgeEndpoint: null },
    obdDevModeUnlocked: true, obdBridgePairingToken: "", obdBridgeOperation: null, obdScannerImportOperation: null,
    // Serial lifecycle behavior is covered by validate-serial-lifecycle.js.
    obdSerialRevision: 0, obdSerialResultOwner: null, obdSerialConnectPending: false, obdSerialDisconnectOperation: null, disconnectObdDeveloperVci: async () => {},
    obdBridgePairingControls: {}, obdBridgePairingInput: { value: "" },
    obdBridgePairingApplyButton: {}, obdBridgePairingClearButton: {}, obdBridgePairingStatus: {},
    obdDevPasswordInput: { value: "" }, obdDevStatus: {},
    sessionStorage: { setItem: () => {}, removeItem: () => {} }, OBD_DEV_MODE_KEY: "test-mode",
    renderObdDeveloperGate: () => {}, clearRequestedInterfaceSelection: () => {},
    renderObdSessionExportControls: () => {},
    obdAccessUnlocked: true, obdAccessPasswordInput: { value: "" },
    OBD_ACCESS_MODE_KEY: "test-access", renderObdAccessGate: () => {},
    localStorage: { getItem: () => token }, window: { crypto: webcrypto }, crypto: webcrypto,
    fetch: fetchRequest, AbortController, setTimeout, clearTimeout, performance
  });
  const constants = ["OBD_DEV_TOKEN_KEY", "OBD_LOCAL_BRIDGE_PORTS", "OBD_LOCAL_BRIDGE_PATHS", "OBD_LOCAL_BRIDGE_TIMEOUT_MS"]
    .map((name) => appSource.match(new RegExp(`const ${name} = [^;]+;`))?.[0]).join("\n");
  vm.runInContext(`${constants}\n${clientSource}`, context);
  context.renderObdSessionExportControls = () => {
    context.exportControlSession = context.obdDevSession.lastSession;
    context.exportControlImportBusy = Boolean(context.obdScannerImportOperation);
  };
  vm.runInContext(appSource.match(/function createId\(\) \{[\s\S]*?\r?\n\}/)[0], context);
  vm.runInContext(appSource.slice(appSource.indexOf("function invalidateObdScannerImport("), appSource.indexOf("async function pasteObdScannerImport(")), context);
  vm.runInContext(appSource.slice(appSource.indexOf("async function probeObdLocalBridge("), appSource.indexOf("async function listObdLocalBridgeVci(")), context);
  context.renderObdDeveloperGate = () => {
    context.obdDevStatus.textContent = "DEFAULT_GATE";
    context.renderObdBridgePairingControls();
  };
  for (const name of ["unlockObdDeveloperMode", "lockObdDeveloperMode", "lockObdAccess"]) {
    vm.runInContext(appSource.match(new RegExp(`function ${name}\\(\\) \\{[\\s\\S]*?\\r?\\n\\}`))[0], context);
  }
  for (const name of ["startInterfaceCandidateCheck", "startGeneralBridgeCheck", "previewSelectedObdInterface", "prepareSelectedObdInterface", "loadObdInterfacePreviewSample", "connectObdDeveloperVci"]) {
    vm.runInContext(appSource.match(new RegExp(`(?:async )?function ${name}\\([^)]*\\) \\{[\\s\\S]*?\\r?\\n\\}`))[0], context);
  }
  return context;
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}

function startPendingScannerAcquisition(client, kind, input = { value: "selected.json", files: [{ name: "selected.json", size: 100, type: "application/json" }] }) {
  if (kind === "file") {
    let reader;
    client.FileReader = class {
      constructor() { reader = this; }
      readAsText() {}
    };
    client.importObdScannerFile({ currentTarget: input });
    return {
      input,
      complete: async (value) => { reader.result = value; reader.onload(); },
      fail: async () => { reader.onerror(); }
    };
  }
  const clipboard = deferred();
  client.navigator = { clipboard: { readText: () => clipboard.promise } };
  const pending = client.pasteObdScannerImport();
  return {
    complete: async (value) => { clipboard.resolve(value); await pending; },
    fail: async () => { clipboard.reject(new Error("clipboard_denied")); await pending; }
  };
}

async function validateScannerAcquisitionOrder(webUrl) {
  for (const kind of ["file", "clipboard"]) {
    for (const action of ["clear", "analyze", "internal-merge", "access-lock", "details-lock", "new-session", "manual-input", "edit-back", "vehicle-change", "empty-scan"]) {
      for (const outcome of ["success", "error"]) {
        const client = addScannerImportHarness(createClient(webUrl, options.pairingToken));
        const previous = { source: "previous" };
        client.obdDevSession.lastSession = previous;
        if (action === "empty-scan") {
          client.obdScannerText.value = "";
          client.obdDevSession.lastSession = null;
          Object.assign(client.obdDevSession, { connectionState: "ready", port: {}, reader: {}, writer: {}, readLoopActive: true });
          client.obdSerialResultOwner = { revision: client.obdSerialRevision, expectedLastSession: null };
        }
        const pending = startPendingScannerAcquisition(client, kind);
        if (action === "clear") client.clearObdScannerImport();
        if (action === "analyze") client.analyzeObdScannerImport();
        if (action === "internal-merge") client.analyzeObdScannerImport({ mergeWithCurrentSession: true });
        if (action === "access-lock") client.lockObdAccess();
        if (action === "details-lock") client.lockObdDeveloperMode();
        if (action === "new-session") client.obdDevSession.lastSession = { source: "new-readout" };
        if (["manual-input", "edit-back"].includes(action)) {
          client.editScannerText("edited input");
          if (action === "edit-back") client.editScannerText("valid import");
        }
        if (action === "vehicle-change") client.syncObdVehicleInput();
        if (action === "empty-scan") check(client.beginWebSerialReadoutProfile("initial_diagnostic") === true, "Ready simulated serial connection must admit an empty scan");
        const expectedText = client.obdScannerText.value;
        const expectedSession = client.obdDevSession.lastSession;
        const expectedStatus = client.obdImportStatus.textContent;
        if (outcome === "success") await pending.complete("old input");
        else await pending.fail();
        check(client.obdScannerText.value === expectedText && client.obdDevSession.lastSession === expectedSession && client.obdImportStatus.textContent === expectedStatus && client.obdScannerImportOperation === null, `${kind} ${outcome} restored input or status after ${action}`);
      }
    }
    for (const newerKind of ["file", "clipboard"]) {
      const client = addScannerImportHarness(createClient(webUrl, options.pairingToken));
      const older = startPendingScannerAcquisition(client, kind);
      const newer = startPendingScannerAcquisition(client, newerKind, older.input);
      await older.complete("old input");
      check(client.obdScannerText.value === "valid import" && (!newer.input || newer.input.value === "selected.json"), `${kind} old completion reset the newer ${newerKind} input`);
      await newer.complete("new input");
      const imported = client.obdDevSession.lastSession;
      const status = client.obdImportStatus.textContent;
      await older.fail();
      check(client.obdScannerText.value === "new input" && imported && client.obdDevSession.lastSession === imported && client.obdImportStatus.textContent === status, `Newer ${newerKind} import was not preserved after older ${kind} failure`);
    }
    for (const selection of ["cancel", "invalid-type", "oversize"]) {
      const client = addScannerImportHarness(createClient(webUrl, options.pairingToken));
      const pending = startPendingScannerAcquisition(client, kind);
      const file = selection === "cancel" ? null : { name: selection === "invalid-type" ? "file.exe" : "large.json", size: selection === "oversize" ? 2000001 : 1 };
      client.importObdScannerFile({ currentTarget: { value: "new-file", files: file ? [file] : [] } });
      const status = client.obdImportStatus.textContent;
      await pending.complete("pending input");
      check(selection === "cancel" ? client.obdScannerText.value === "pending input" : client.obdScannerText.value === "valid import" && client.obdImportStatus.textContent === status, `${selection} mishandled a pending ${kind} acquisition`);
    }
    for (const outcome of ["empty", "error", "parser-error"]) {
      const client = addScannerImportHarness(createClient(webUrl, options.pairingToken));
      const previous = { source: "previous" };
      client.obdDevSession.lastSession = previous;
      if (outcome === "parser-error") client.window.ObdReadOnly.buildDiagnosticScanSession = () => { throw new Error("private parser detail"); };
      const pending = startPendingScannerAcquisition(client, kind);
      if (outcome === "error") await pending.fail();
      else await pending.complete(outcome === "empty" ? "  " : "new input");
      const status = client.obdImportStatus.textContent;
      check(client.obdDevSession.lastSession === previous && client.obdScannerImportOperation === null && status && !status.includes("private") && (outcome !== "parser-error" || status.includes("解析できません")), `${kind} ${outcome} lost its failure message or changed the session`);
    }
  }
  for (const failure of ["constructor", "read"]) {
    const client = addScannerImportHarness(createClient(webUrl, options.pairingToken));
    client.FileReader = class {
      constructor() { if (failure === "constructor") throw new Error("failed"); }
      readAsText() { throw new Error("failed"); }
    };
    const input = { value: "selected.json", files: [{ name: "selected.json", size: 1 }] };
    client.importObdScannerFile({ currentTarget: input });
    check(client.obdScannerImportOperation === null && input.value === "" && client.obdImportStatus.textContent.includes("ファイルを読めません"), `Synchronous FileReader ${failure} failure escaped cleanup`);
  }
}

async function validateScannerParserIntegration(webUrl) {
  const core = vm.createContext({ window: {}, console });
  vm.runInContext(fs.readFileSync(new URL("../obd-readonly.js", import.meta.url), "utf8"), core);
  const obd = core.window.ObdReadOnly;
  const session = obd.buildDiagnosticScanSession({ dtcSnapshot: { dtcs: [{ code: "P0171", status: "stored", ecu: "7E8" }] } });
  const json = JSON.stringify(obd.buildBridgeSessionExportPayload(session));
  for (const kind of ["file", "clipboard"]) {
    const client = addScannerImportHarness(createClient(webUrl, options.pairingToken));
    client.window.ObdReadOnly = obd;
    client.buildObdDtcDisplayKey = (dtc) => JSON.stringify(dtc);
    client.createObdDtcCard = (dtc) => dtc;
    client.obdDetectedCodes.appendChild = () => {};
    const pending = startPendingScannerAcquisition(client, kind);
    await pending.complete(json);
    const imported = client.obdDevSession.lastSession;
    check(imported?.dtcSnapshot?.dtcs?.some((dtc) => dtc.code === "P0171" && dtc.ecu === "7E8" && dtc.status === "stored") && imported.vehicleCommandEnabled === false && client.obdScannerImportOperation === null, `${kind} acquisition failed to preserve a real exported DTC session`);
    const stale = startPendingScannerAcquisition(client, kind);
    client.clearObdScannerImport();
    await stale.complete(json);
    check(client.obdDevSession.lastSession === imported && client.obdScannerText.value === "", `${kind} stale acquisition reparsed a real archived session after clear`);
  }
}

function addScannerImportHarness(client, format = "json") {
  const source = appSource.match(/function analyzeObdScannerImport\(options = \{\}\) \{[\s\S]*?\r?\n\}/)[0];
  vm.runInContext(source, client);
  for (const name of ["clearObdScannerImport", "importObdScannerFile", "pasteObdScannerImport", "normalizeObdScannerImportFileText", "beginWebSerialReadoutProfile", "syncObdVehicleInput", "isCurrentObdSerialOperation", "continueObdSerialOperation"]) {
    vm.runInContext(appSource.match(new RegExp(`(?:async )?function ${name}\\([^)]*\\) \\{[\\s\\S]*?\\r?\\n\\}`))[0], client);
  }
  // Stub parser results and display helpers; exercise the complete handler's session ownership and bridge lifecycle.
  for (const name of new Set([...source.matchAll(/\b(format\w+)\(/g)].map((match) => match[1]))) client[name] = () => "";
  for (const name of ["getSessionNextReadoutCandidates", "getObdFreezeFrameTriggerEntries", "getNonBlockingWarningLabels", "readCoreSessionAliasArray"]) client[name] = () => [];
  for (const name of ["renderObdImportToolHints", "renderObdMonitorValues", "renderObdWorkflowGuide", "renderObdDeveloperSessionSummary", "appendObdAnalysisReadoutSummary"]) client[name] = () => {};
  for (const name of ["buildSelectedObdReadoutInterface", "buildSelectedObdVehicleProfile", "buildSelectedObdVehicleApplicability", "getReadoutCoverageDisplay"]) client[name] = () => null;
  client.buildCoreReadinessHeadline = () => "";
  client.buildCoreAnalysisPendingStatus = () => "PENDING";
  client.hasBridgeDiagnosticImportPipelineSupport = () => true;
  client.hasBridgeMergeDiagnosticInputsSupport = () => true;
  client.hasBridgeDiagnosticScanSessionSupport = () => true;
  client.NO_DATA = "";
  client.OEM_SCANNER_TOOL_HINTS = new Set();
  client.obdScannerText = { value: "valid import", focus: () => {} };
  const handlers = {};
  client.obdScannerText.addEventListener = (name, handler) => { handlers[name] = handler; };
  vm.runInContext(appSource.match(/^obdScannerText\.addEventListener\("input",[^\r\n]+/m)[0], client);
  client.editScannerText = (text) => { client.obdScannerText.value = text; handlers.input(); };
  client.buildSelectedObdObservationContext = () => null;
  client.hideResult = () => {};
  client.selectedVehicleValue = () => "";
  client.selectedObdVehicleYear = () => "";
  client.syncVehicleSelectionSummary = () => {};
  client.renderObdConnectionGuide = () => {};
  for (const name of ["obdVehicleMakerSelect", "obdVehicleModelSelect", "obdVehicleModelCodeSelect", "obdVehicleProductionDateInput", "obdVehicleEngineCodeSelect", "obdVehicleManualInput", "obdVehicleInput", "obdVehicleSelectionSummary"]) client[name] = { value: "" };
  for (const name of ["obdDetectedCodes", "obdMonitorGrid", "obdMonitorInsightList", "obdImportStatus", "obdMonitorStatus", "obdMonitorCount"]) client[name] = {};
  const analysis = { source: "imported", codes: [], monitorValues: [], monitorInsights: [] };
  client.window = { ObdReadOnly: {
    buildDiagnosticScanSessionFromJson: () => format === "json" ? analysis : null,
    buildDiagnosticScanSessionFromCsv: () => format === "csv" ? analysis : null,
    analyzeScannerText: () => analysis,
    buildBridgeDiagnosticImport: () => ({}),
    mergeDiagnosticInputs: () => analysis,
    buildDiagnosticScanSession: (input) => ({ ...analysis, ...(input.scan_session || input) })
  } };
  return client;
}

async function validateScannerImportOwnership(webUrl) {
  const response = (init) => new Response(JSON.stringify({ request_id: JSON.parse(init.body).request_id, ok: true, blocked: false, would_transmit: false, data: {}, errors: [] }));
  for (const format of ["json", "csv", "text"]) {
    const ready = deferred();
    const client = addScannerImportHarness(createClient(webUrl, options.pairingToken, async (url, init) => {
      await ready.promise;
      return response(init);
    }), format);
    let accepted = 0;
    const pending = client.runObdLocalBridgeRead("Old read", "read_stored_dtc", {}, () => {
      accepted += 1;
      client.obdDevSession.lastSession = { source: "old-response" };
    });
    let imported;
    try {
      client.analyzeObdScannerImport();
      imported = client.obdDevSession.lastSession;
      check(client.exportControlSession === imported && client.exportControlImportBusy === false, `${format}: successful import did not refresh export controls for the new session`);
    } finally {
      ready.resolve();
      await pending;
    }
    check(imported && client.obdDevSession.lastSession === imported && accepted === 0 && client.obdBridgeOperation === null, `${format} import was overwritten by an older bridge response`);
  }
  for (const scenario of ["rejected", "empty", "builder-error", "internal-merge"]) {
    const ready = deferred();
    const client = addScannerImportHarness(createClient(webUrl, options.pairingToken, async (url, init) => {
      await ready.promise;
      return response(init);
    }), scenario === "internal-merge" ? "text" : "json");
    const previous = { source: "previous" };
    client.obdDevSession.lastSession = previous;
    if (scenario === "rejected") client.window.ObdReadOnly.buildDiagnosticScanSessionFromJson = () => ({ accepted: false, errors: ["invalid_file"] });
    if (scenario === "empty") client.obdScannerText.value = "";
    if (scenario === "builder-error") client.window.ObdReadOnly.buildDiagnosticScanSession = () => { throw new Error("invalid_session"); };
    let accepted = 0;
    const pending = client.runObdLocalBridgeRead("Preserved read", "read_stored_dtc", {}, () => { accepted += 1; });
    try {
      if (scenario === "builder-error") assert.throws(() => client.analyzeObdScannerImport(), /invalid_session/);
      else client.analyzeObdScannerImport({ mergeWithCurrentSession: scenario === "internal-merge" });
      check(client.obdBridgeOperation?.cancelled === false, `${scenario} unnecessarily cancelled the pending bridge read`);
      if (scenario !== "internal-merge") check(client.obdDevSession.lastSession === previous, `${scenario} replaced the current session`);
    } finally {
      ready.resolve();
      await pending;
    }
    check(accepted === 1 && client.obdBridgeOperation === null, `${scenario} prevented the pending read from completing`);
  }
  for (const entry of ["file", "clipboard", "clear"]) {
    const ready = deferred();
    const client = addScannerImportHarness(createClient(webUrl, options.pairingToken, async (url, init) => {
      await ready.promise;
      return response(init);
    }));
    const previous = { source: "previous" };
    client.obdDevSession.lastSession = previous;
    let accepted = 0;
    const pending = client.runObdLocalBridgeRead("Old read", "read_stored_dtc", {}, () => {
      accepted += 1;
      client.obdImportStatus.textContent = "OLD_RESULT";
    });
    let expectedStatus;
    let expectedSession;
    try {
      if (entry === "file") {
        let reader;
        client.FileReader = class {
          constructor() { reader = this; }
          readAsText() {}
        };
        const input = { value: "selected.json", files: [{ name: "selected.json", size: 100, type: "application/json" }] };
        client.importObdScannerFile({ currentTarget: input });
        check(client.obdBridgeOperation?.cancelled === false && client.obdDevSession.lastSession === previous, "Starting file acquisition cancelled the read before validation");
        reader.result = "valid import";
        reader.onload();
        check(input.value === "", "Completed file import retained its file input");
      } else if (entry === "clipboard") {
        const clipboard = deferred();
        client.navigator = { clipboard: { readText: () => clipboard.promise } };
        const pasting = client.pasteObdScannerImport();
        check(client.obdBridgeOperation?.cancelled === false, "Clipboard permission wait cancelled the bridge read");
        clipboard.resolve("valid import");
        await pasting;
      } else {
        client.clearObdScannerImport();
        check(client.obdScannerText.value === "" && client.obdDevSession.lastSession === previous, "Clear removed the retained session or failed to clear the input");
      }
      expectedStatus = client.obdImportStatus.textContent;
      expectedSession = client.obdDevSession.lastSession;
      check(client.obdBridgeOperation?.cancelled === true, `${entry} did not cancel the older bridge operation`);
    } finally {
      ready.resolve();
      await pending;
    }
    check(accepted === 0 && client.obdDevSession.lastSession === expectedSession && client.obdImportStatus.textContent === expectedStatus, `${entry} result was changed by a late bridge response`);
  }
}

async function validateBridgeResponseEnvelopes(webUrl) {
  const valid = { request_id: "expected", ok: true, blocked: false, would_transmit: false, errors: [], data: {} };
  const invalid = [null, [], "response", {},
    ...[{ request_id: "old-request" }, { request_id: null }, { ok: "true" }, { blocked: "false" },
      { would_transmit: true }, { would_transmit: null }, { errors: "failure" }, { errors: [{}] },
      { errors: ["pairing_token_mismatch"] }, { blocked: true }, { data: null }, { data: [] }, { data: "data" }]
      .map((change) => ({ ...valid, ...change }))
  ];
  for (const field of Object.keys(valid)) {
    const missing = { ...valid };
    delete missing[field];
    invalid.push(missing);
  }
  for (const envelope of invalid) {
    const client = createClient(webUrl, options.pairingToken, async () => Response.json(envelope));
    await assert.rejects(client.fetchObdLocalBridgeEndpoint(webUrl, { request_id: "expected" }), /bridge_response_invalid/);
    check(client.obdDevSession.bridgeEndpoint === null, "Invalid response selected a bridge endpoint");
  }
  for (const envelope of [valid, { ...valid, ok: false, errors: ["vci_not_detected"] }, { ...valid, ok: false, blocked: true, errors: ["pairing_token_mismatch"], data: null }]) {
    const client = createClient(webUrl, options.pairingToken, async () => Response.json(envelope));
    const response = await client.fetchObdLocalBridgeEndpoint(webUrl, { request_id: "expected" });
    check(JSON.stringify(response) === JSON.stringify(envelope), "Valid negative response lost its original error information");
  }
  let rejectResponse = true;
  let accepted = 0;
  const client = createClient(webUrl, options.pairingToken, async (url, init) => Response.json({ ...valid, request_id: rejectResponse ? "old-request" : JSON.parse(init.body).request_id }));
  client.obdDevSession.bridgeEndpoint = `${webUrl}/previous`;
  client.obdDevSession.lastSession = { source: "retained-session" };
  await client.runObdLocalBridgeRead("DTC", "read_stored_dtc", {}, () => { accepted += 1; });
  check(accepted === 0 && client.obdBridgeOperation === null && client.obdDevSession.bridgeEndpoint === `${webUrl}/previous` && client.obdDevSession.lastSession.source === "retained-session", "Invalid read response replaced data or retained the busy state");
  check(client.obdDevStatus.textContent.includes("応答形式または要求ID"), "Invalid response did not explain the compatibility failure");
  rejectResponse = false;
  await client.runObdLocalBridgeRead("DTC", "read_stored_dtc", {}, () => { accepted += 1; });
  check(accepted === 1, "Valid retry was rejected after an invalid response");
  let normalized = 0;
  const probe = createClient(webUrl, options.pairingToken, async (url, init) => Response.json({ ...valid, request_id: JSON.parse(init.body).request_id, ok: false, blocked: true, data: null, errors: ["bridge_pairing_token_not_configured"] }));
  probe.window = { ObdReadOnly: { normalizeBridgeConnectionStatus: () => { normalized += 1; return {}; } } };
  probe.obdDevSession.bridgeEndpoint = `${webUrl}/previous`;
  probe.obdDevSession.bridgeStatus = "previous-status";
  probe.obdDevSession.adapterIdentity = "previous-adapter";
  await probe.probeObdLocalBridge();
  check(normalized === 0 && probe.obdDevSession.bridgeStatus === "previous-status" && probe.obdDevSession.adapterIdentity === "previous-adapter" && probe.obdDevSession.bridgeEndpoint === `${webUrl}/previous`, "Negative status response replaced the previous connection metadata");
  check(probe.obdBridgeOperation === null && probe.obdDevStatus.textContent.includes("接続キーが未設定"), "Negative probe did not report its error or release the busy state");
  const fallbackBodies = [];
  const fallback = createClient(webUrl, options.pairingToken, async (url, init) => {
    const request = JSON.parse(init.body);
    fallbackBodies.push(request);
    return Response.json({ ...valid, request_id: fallbackBodies.length === 1 ? "wrong-id" : request.request_id });
  });
  await fallback.sendObdLocalBridgeStatusIntent("bridge_status");
  check(fallbackBodies.length === 2 && fallbackBodies[0].request_id === fallbackBodies[1].request_id && fallback.obdDevSession.bridgeEndpoint !== `${webUrl}/local-bridge/v1/request`, "Invalid first response prevented discovery or selected the wrong endpoint");
  let negativeRequests = 0;
  const negative = createClient(webUrl, options.pairingToken, async (url, init) => {
    negativeRequests += 1;
    return Response.json({ ...valid, request_id: JSON.parse(init.body).request_id, ok: false, errors: ["vci_not_detected"] });
  });
  await negative.runObdLocalBridgeRead("DTC", "read_stored_dtc", {}, () => { accepted += 1; });
  check(negativeRequests === 1 && accepted === 1 && negative.obdDevStatus.textContent.includes("VCI未検出"), "Valid negative response retried transport or reached the success callback");
  let adapterNormalizations = 0;
  const optional = createClient(webUrl, options.pairingToken, async (url, init) => {
    const request = JSON.parse(init.body);
    return Response.json({ ...valid, request_id: request.request_id, ...(request.intent === "adapter_identity" ? { ok: false, blocked: true, errors: ["intent_not_implemented"], data: null } : {}) });
  });
  optional.window = { ObdReadOnly: {
    normalizeBridgeConnectionStatus: () => ({ displayStatus: "VALID_STATUS" }),
    normalizeBridgeAdapterIdentity: () => { adapterNormalizations += 1; return { adapterName: "INVALID_ADAPTER" }; }
  } };
  optional.obdDevSession.adapterIdentity = "previous-adapter";
  optional.renderObdDeveloperSessionSummary = () => {};
  optional.appendObdDeveloperLog = () => {};
  await optional.probeObdLocalBridge();
  check(adapterNormalizations === 0 && optional.obdDevSession.bridgeStatus.displayStatus === "VALID_STATUS" && optional.obdDevSession.adapterIdentity === null && optional.obdDevStatus.textContent.includes("識別未取得"), "Negative optional adapter response was normalized or hid a valid bridge status");
}

async function validateBridgeResponseDeadlines(webUrl) {
  for (const phase of ["headers", "body"]) {
    for (const abortAvailable of [true, false]) {
      for (const offset of [-1, 0, 1]) {
        const started = deferred();
        const ready = deferred();
        const envelope = { request_id: "deadline-test", ok: true, blocked: false, errors: [], data: {}, would_transmit: false };
        let now = 100;
        let bodyReads = 0;
        let signal;
        const timers = new Set();
        const client = createClient(webUrl, options.pairingToken, async (url, init) => {
          signal = init.signal;
          if (phase === "headers") { started.resolve(); await ready.promise; }
          return { ok: true, json: async () => {
            bodyReads += 1;
            if (phase === "body") { started.resolve(); await ready.promise; }
            return envelope;
          } };
        });
        if (!abortAvailable) client.AbortController = undefined;
        client.performance = { now: () => now };
        client.setTimeout = (callback) => { timers.add(callback); return callback; };
        client.clearTimeout = (timer) => timers.delete(timer);
        const operation = client.beginObdBridgeOperation();
        const pending = client.fetchObdLocalBridgeEndpoint(webUrl, { request_id: "deadline-test" }, operation)
          .then((value) => ({ value }), (error) => ({ error }));
        await started.promise;
        now += vm.runInContext("OBD_LOCAL_BRIDGE_TIMEOUT_MS", client) + offset;
        check(client.obdBridgeOperation === operation && client.beginObdBridgeOperation() === null,
          `${phase}/${abortAvailable}/${offset}: unsettled response released the busy slot`);
        // Do not fire the timer: a delayed event loop must not admit an expired response.
        ready.resolve();
        const result = await pending;
        const expired = offset >= 0;
        check(expired ? result.error?.message === "local_bridge_timeout" : result.value === envelope,
          `${phase}/${abortAvailable}/${offset}: response deadline boundary was not enforced`);
        check(bodyReads === (expired && phase === "headers" ? 0 : 1)
          && (!abortAvailable || signal.aborted === expired) && timers.size === 0
          && client.obdBridgeOperation === operation && client.obdDevSession.bridgeEndpoint === null,
          `${phase}/${abortAvailable}/${offset}: deadline handling parsed stale data or changed ownership`);
        client.finishObdBridgeOperation(operation, "");
      }
    }
  }
  for (const cancelled of [false, true]) {
    let now = 0;
    let adopted = 0;
    const signals = [];
    const client = createClient(webUrl, options.pairingToken, async (url, init) => {
      signals.push(init.signal);
      if (signals.length === 1) {
        now += vm.runInContext("OBD_LOCAL_BRIDGE_TIMEOUT_MS", client);
        if (cancelled) client.cancelObdBridgeOperation();
      }
      return Response.json({ request_id: JSON.parse(init.body).request_id, ok: true, blocked: false,
        errors: [], data: { attempt: signals.length }, would_transmit: false });
    });
    client.performance = { now: () => now };
    client.setTimeout = () => 1;
    client.clearTimeout = () => {};
    const previous = { id: "retained-session" };
    client.obdDevSession.lastSession = previous;
    await client.runObdLocalBridgeRead("Deadline fallback", "list_vci", {}, (response) => { adopted = response.data.attempt; });
    check(signals.length === (cancelled ? 1 : 2) && adopted === (cancelled ? 0 : 2)
      && signals[0].aborted && (cancelled || (signals[1] !== signals[0] && !signals[1].aborted))
      && client.obdBridgeOperation === null && client.obdDevSession.lastSession === previous,
      `${cancelled}: deadline fallback reused expiry, adopted a late result, or ignored cancellation`);
  }
  for (const failure of ["http", "json", "network", "cancel", "replaced"]) {
    for (const expired of [false, true]) {
      const ready = deferred();
      const started = deferred();
      const original = new Error("original_failure");
      let now = 0;
      let signal;
      const client = createClient(webUrl, options.pairingToken, async (url, init) => {
        signal = init.signal;
        if (failure !== "json") { started.resolve(); await ready.promise; }
        if (failure === "network") throw original;
        return { ok: failure !== "http", status: 503, json: async () => {
          if (failure === "json") { started.resolve(); await ready.promise; }
          throw original;
        } };
      });
      client.performance = { now: () => now };
      client.setTimeout = () => 1;
      client.clearTimeout = () => {};
      const operation = client.beginObdBridgeOperation();
      const pending = client.fetchObdLocalBridgeEndpoint(webUrl, { request_id: "failure-test" }, operation)
        .then(() => null, (error) => error);
      await started.promise;
      now = expired ? vm.runInContext("OBD_LOCAL_BRIDGE_TIMEOUT_MS", client) : 1;
      if (failure === "cancel") client.cancelObdBridgeOperation();
      if (failure === "replaced") client.obdBridgeOperation = { cancelled: false };
      ready.resolve();
      const error = await pending;
      const cancelled = failure === "cancel" || failure === "replaced";
      const expected = cancelled ? "local_bridge_cancelled" : expired ? "local_bridge_timeout"
        : failure === "http" ? "HTTP 503" : original.message;
      check(error?.message === expected && (cancelled || signal.aborted === expired),
        `${failure}/${expired}: cancellation, deadline, or original error precedence changed`);
      const owner = client.obdBridgeOperation;
      client.finishObdBridgeOperation(operation, "");
      check(client.obdBridgeOperation === (failure === "replaced" ? owner : null),
        `${failure}/${expired}: stale completion released a replacement operation`);
    }
  }
}

async function validateBridgeOperationLifecycle(webUrl) {
  const successResponse = (init) => new Response(JSON.stringify({ request_id: JSON.parse(init.body).request_id, ok: true, blocked: false, data: {}, errors: [], would_transmit: false }));
  const ready = deferred();
  let sent = 0;
  let accepted = 0;
  const client = createClient(webUrl, options.pairingToken, async (url, init) => {
    sent += 1;
    await ready.promise;
    return successResponse(init);
  });
  const first = client.runObdLocalBridgeRead("First", "list_vci", {}, () => { accepted += 1; });
  const progressMessage = client.obdDevStatus.textContent;
  client.obdDevSession.requestedInterfaceId = "original-interface";
  client.startInterfaceCandidateCheck({ id: "different-interface" });
  client.startGeneralBridgeCheck();
  client.previewSelectedObdInterface();
  client.prepareSelectedObdInterface();
  client.loadObdInterfacePreviewSample("user-vci-elm327");
  await client.connectObdDeveloperVci();
  check(client.obdDevSession.requestedInterfaceId === "original-interface" && client.obdDevStatus.textContent === progressMessage, "Busy caller changed interface, preview, or status before the operation guard");
  const duplicate = client.runObdLocalBridgeRead("Duplicate", "list_vci", {}, () => { accepted += 1; });
  const duplicateProbe = client.probeObdLocalBridge();
  client.obdBridgePairingInput.value = "replacement-pairing-key";
  client.applyObdBridgePairingToken();
  try {
    check(sent === 1 && client.obdBridgePairingToken === "" && client.obdBridgePairingApplyButton.disabled, "Duplicate operation or pairing change was accepted during a bridge request");
  } finally {
    ready.resolve();
    await first;
    await duplicate;
    await duplicateProbe;
  }
  check(accepted === 1 && client.obdBridgeOperation === null && !client.obdBridgePairingApplyButton.disabled, "Successful operation did not release its busy slot");
  await client.runObdLocalBridgeRead("Retry", "list_vci", {}, () => { accepted += 1; });
  check(sent === 2 && accepted === 2, "A finished operation prevented the next read");

  let aborted = false;
  let abortRequests = 0;
  const abortClient = createClient(webUrl, options.pairingToken, (url, init) => {
    abortRequests += 1;
    return new Promise((resolve, reject) => {
      init.signal.addEventListener("abort", () => { aborted = true; reject(new Error("aborted")); }, { once: true });
    });
  });
  const abortedRead = abortClient.runObdLocalBridgeRead("Cancel", "list_vci", {}, () => { accepted += 1; });
  abortClient.lockObdDeveloperMode();
  await abortedRead;
  check(aborted && abortRequests === 1 && accepted === 2 && abortClient.obdDevSession.bridgeEndpoint === null && abortClient.obdBridgeOperation === null, "Lock did not abort waiting, retried another endpoint, or applied a late result");

  const late = deferred();
  let lateRequests = 0;
  const lateClient = createClient(webUrl, options.pairingToken, async (url, init) => {
    lateRequests += 1;
    await late.promise;
    return successResponse(init);
  });
  const lateRead = lateClient.runObdLocalBridgeRead("Late", "list_vci", {}, () => { accepted += 1; });
  lateClient.lockObdAccess();
  lateClient.obdAccessUnlocked = true;
  const tooSoon = lateClient.runObdLocalBridgeRead("Too soon", "list_vci", {}, () => { accepted += 1; });
  try {
    check(lateRequests === 1 && lateClient.obdBridgeOperation !== null, "Cancellation released the busy slot before the old request settled");
  } finally {
    late.resolve();
    await lateRead;
    await tooSoon;
  }
  check(accepted === 2 && lateClient.obdDevSession.bridgeEndpoint === null && lateClient.obdBridgeOperation === null && lateClient.obdDevStatus.textContent === "DEFAULT_GATE", "A cancelled response was restored after unlocking");

  const noAbortReady = deferred();
  const noAbortClient = createClient(webUrl, options.pairingToken, async (url, init) => { await noAbortReady.promise; return successResponse(init); });
  noAbortClient.AbortController = undefined;
  const noAbortRead = noAbortClient.runObdLocalBridgeRead("Logical cancel", "list_vci", {}, () => { accepted += 1; });
  noAbortClient.clearObdBridgePairingToken();
  check(noAbortClient.obdBridgeOperation?.cancelled === true, "Missing AbortController released ownership before settlement");
  noAbortReady.resolve();
  await noAbortRead;
  check(accepted === 2 && noAbortClient.obdDevSession.bridgeEndpoint === null && noAbortClient.obdBridgeOperation === null, "Logical cancellation accepted a late response without AbortController");

  const bodyStarted = deferred();
  const bodyReady = deferred();
  let bodyTimer;
  let bodyTimerCleared = false;
  const bodyClient = createClient(webUrl, options.pairingToken, async () => ({ ok: true, json: async () => { bodyStarted.resolve(); return bodyReady.promise; } }));
  bodyClient.setTimeout = (callback) => { bodyTimer = callback; return 1; };
  bodyClient.clearTimeout = () => { bodyTimerCleared = true; };
  const bodyRead = bodyClient.fetchObdLocalBridgeEndpoint(`${webUrl}/local-bridge/v1/request`, {});
  const timedOut = assert.rejects(bodyRead, /local_bridge_timeout/);
  await bodyStarted.promise;
  check(!bodyTimerCleared, "Response headers ended the timeout before the body was parsed");
  bodyTimer();
  bodyReady.resolve({ ok: true });
  await timedOut;
  check(bodyTimerCleared, "Body timeout left a timer behind");

  let fallbackTimer;
  const fallbackSignals = [];
  const fallbackClient = createClient(webUrl, options.pairingToken, async (url, init) => {
    fallbackSignals.push(init.signal);
    const request = JSON.parse(init.body);
    assert.equal(Object.hasOwn(request, "operation"), false);
    if (fallbackSignals.length === 1) { fallbackTimer(); throw new Error("timed out"); }
    return successResponse(init);
  });
  fallbackClient.setTimeout = (callback) => { fallbackTimer = callback; return 1; };
  fallbackClient.clearTimeout = () => {};
  await fallbackClient.runObdLocalBridgeRead("Fallback", "list_vci", {}, () => { accepted += 1; });
  check(accepted === 3 && fallbackSignals.length === 2 && fallbackSignals[0].aborted && !fallbackSignals[1].aborted && fallbackSignals[0] !== fallbackSignals[1], "Normal timeout fallback reused an aborted controller or lost the successful result");

  const serialClient = createClient(webUrl, options.pairingToken, async () => { throw new Error("Must not call bridge while serial is active"); });
  serialClient.obdDevSession.connectionState = "selecting";
  check(serialClient.beginObdBridgeOperation() === null, "Bridge operation overlapped the Web Serial device picker");
  serialClient.obdDevSession.connectionState = "disconnected";
  const owner = serialClient.beginObdBridgeOperation();
  serialClient.finishObdBridgeOperation({}, "Wrong owner");
  check(serialClient.obdBridgeOperation === owner, "A stale completion released another operation's busy slot");
  serialClient.finishObdBridgeOperation(owner, "Done");
  serialClient.obdDevSession.connectionState = "ready";
  serialClient.obdDevSession.previewMode = "previous-preview";
  serialClient.ensureObdVehicleSelection = () => true;
  serialClient.resolveObdInterfaceId = () => "user-vci-elm327";
  serialClient.obdVehicleInput = { value: "Test vehicle" };
  serialClient.window = { ObdReadOnly: { getVehicleInterfaceCatalog: () => [] } };
  serialClient.getObdInterfaceReadoutRoute = () => ({ route: "native_connector_required" });
  serialClient.getSelectedObdInterfaceLabel = () => "Test interface";
  serialClient.prepareSelectedObdInterface();
  check(serialClient.obdDevSession.previewMode === null, "Serial connection unnecessarily blocked non-bridge preparation guidance");

  const adapterStarted = deferred();
  const adapterReady = deferred();
  let probeRequests = 0;
  const probeEndpoints = [];
  const probeClient = createClient(webUrl, options.pairingToken, async (url, init) => {
    probeRequests += 1;
    probeEndpoints.push(url);
    if (probeRequests === 2) { adapterStarted.resolve(); await adapterReady.promise; }
    return successResponse(init);
  });
  probeClient.window = { ObdReadOnly: {
    normalizeBridgeConnectionStatus: () => ({ displayStatus: "NEW_STATUS" }),
    normalizeBridgeAdapterIdentity: () => ({ adapterName: "NEW_ADAPTER" })
  } };
  probeClient.obdDevSession.bridgeStatus = "previous-status";
  probeClient.obdDevSession.adapterIdentity = "previous-adapter";
  probeClient.obdDevSession.bridgeEndpoint = "http://127.0.0.1:9999/v1/bridge";
  probeClient.renderObdDeveloperSessionSummary = () => {};
  probeClient.appendObdDeveloperLog = () => {};
  const probing = probeClient.probeObdLocalBridge();
  await adapterStarted.promise;
  await probeClient.runObdLocalBridgeRead("Concurrent", "list_vci", {}, () => { accepted += 1; });
  check(probeRequests === 2 && accepted === 3, "Read operation overlapped adapter identification");
  probeClient.lockObdDeveloperMode();
  adapterReady.resolve();
  await probing;
  check(probeEndpoints.length === 2 && probeEndpoints.every((url) => url === `${webUrl}/local-bridge/v1/request`), "Adapter identification used the old endpoint instead of the newly discovered endpoint");
  check(probeClient.obdDevSession.bridgeStatus === "previous-status" && probeClient.obdDevSession.adapterIdentity === "previous-adapter" && probeClient.obdDevSession.bridgeEndpoint === "http://127.0.0.1:9999/v1/bridge" && probeClient.obdBridgeOperation === null, "Cancelled multi-step probe mixed the new endpoint with previous connection metadata");
  check(appSource.replace(/\r\n/g, "\n").includes('function syncObdVehicleInput() {\n  cancelObdBridgeOperation();') && appSource.includes('document.querySelectorAll("[data-obd-bridge-request]")'), "Vehicle changes or public bridge controls lost operation protection");
}
await validatePortableNpmScripts();
await validateWorkstationAssetPreflight();

const previousReplay = process.env.LOCAL_BRIDGE_REPLAY_LOG;
const previousPairing = process.env.LOCAL_BRIDGE_PAIRING_TOKEN;
delete process.env.LOCAL_BRIDGE_REPLAY_LOG;
delete process.env.LOCAL_BRIDGE_PAIRING_TOKEN;
try {
  const workstation = await startLocalWorkstation(options);
  const webPort = workstation.webServer.address().port;
  try {
    check(workstation.webServer.address().address === "127.0.0.1" && workstation.bridgeServer.address().address === "127.0.0.1", "Workstation must bind both servers to loopback");
    const page = await fetch(workstation.webUrl);
    check(page.status === 200 && (await page.text()).includes("obdDiagnosticFlowPanel"), "Workstation did not serve the diagnostic screen");
    const asset = await fetch(`${workstation.webUrl}/offline-assets.json`);
    const manifest = await asset.json();
    check(asset.status === 200 && manifest.asset_count > 0, "Workstation did not serve the offline manifest");
    let servedAssets = 0;
    for (const assetPath of manifest.assets) {
      const url = new URL(assetPath, `${workstation.webUrl}/`);
      assert.equal(url.origin, workstation.webUrl, "Offline asset points outside the local workstation");
      const response = await fetch(url);
      assert.equal(response.status, 200, `Unavailable local asset: ${assetPath}`);
      await response.arrayBuffer();
      servedAssets += 1;
    }
    check(servedAssets === manifest.asset_count, "Workstation did not serve every declared offline asset");
    const health = await (await fetch(`${workstation.bridgeUrl}/health`)).json();
    check(health.j2534_discovery_requested === true && health.sample_mode === false && health.replay_mode === false && health.sample_readouts_enabled === false && health.vehicle_command_enabled === false, "Workstation enabled replay, sample readouts, or vehicle commands");
    const request = async (intent, token) => (await fetch(`${workstation.bridgeUrl}/v1/request`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ api_version: "v1", request_id: "workstation-test", intent, timestamp: new Date().toISOString(), pairing_token: token })
    })).json();
    const readout = await request("read_stored_dtc", options.pairingToken);
    check(readout.ok === false && readout.errors.includes("vci_not_detected") && readout.would_transmit === false && !Object.hasOwn(readout.data, "dtcs"), "Missing VCI was replaced with sample DTC data");
    const denied = await request("read_stored_dtc", "wrong-token");
    check(denied.blocked === true && denied.errors.includes("pairing_token_mismatch"), "Workstation accepted an unpaired readout request");
    const write = await request("clear_dtc", options.pairingToken);
    check(write.blocked === true && write.errors.includes("write_intent_blocked") && write.would_transmit === false, "Workstation accepted a state-changing intent");
    check(!JSON.stringify(health).includes(options.pairingToken) && !JSON.stringify(readout).includes(options.pairingToken), "Workstation exposed its pairing token in bridge responses");
    const localEndpoint = `${workstation.webUrl}/local-bridge/v1/request`;
    const requests = [];
    const requestBodies = [];
    const client = createClient(workstation.webUrl, options.pairingToken, (url, init) => {
      requests.push(url);
      requestBodies.push(JSON.parse(init.body));
      return fetch(url, init);
    });
    const status = await client.sendObdLocalBridgeStatusIntent("bridge_status");
    check(status.ok === true && requests.length === 1 && requests[0] === localEndpoint && client.obdDevSession.bridgeEndpoint === localEndpoint, "UI did not discover its own workstation bridge first on custom ports");
    const localReadout = await client.sendObdLocalBridgeIntent("read_stored_dtc");
    check(localReadout.ok === false && localReadout.errors.includes("vci_not_detected") && localReadout.would_transmit === false && requests[1] === localEndpoint, "UI paired readout bypassed the local bridge safety checks");
    check(requestBodies.every((body) => /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.request_id)) && requestBodies[0].request_id !== requestBodies[1].request_id, "Actual application helper did not generate distinct UUIDs for separate bridge operations");
    check(!Object.hasOwn(requestBodies[0], "pairing_token") && requestBodies[1].pairing_token === options.pairingToken, "Request ID repair changed public versus paired request credentials");
    check(requestBodies.every((body) => body.api_version === "v1" && Number.isFinite(Date.parse(body.timestamp))), "Request ID repair changed the bridge envelope");
    const fallbackIdBodies = [];
    const fallbackIdClient = createClient(workstation.webUrl, options.pairingToken, (url, init) => {
      fallbackIdBodies.push(JSON.parse(init.body));
      return fetch(url, init);
    });
    fallbackIdClient.window = {};
    delete fallbackIdClient.crypto;
    const fallbackIdStatus = await fallbackIdClient.sendObdLocalBridgeStatusIntent("bridge_status");
    const fallbackIdReadout = await fallbackIdClient.sendObdLocalBridgeIntent("read_stored_dtc");
    check(fallbackIdStatus.ok === true && fallbackIdReadout.errors.includes("vci_not_detected") && fallbackIdBodies.every((body) => /^\d+-[0-9a-f]+$/.test(body.request_id)), "Browser without randomUUID could not use the existing request ID fallback");
    check(fallbackIdBodies[0].request_id !== fallbackIdBodies[1].request_id && fallbackIdReadout.would_transmit === false, "Fallback IDs were reused or enabled vehicle transmission");
    const wrongClient = createClient(workstation.webUrl, "wrong-pairing-token");
    const wrongReadout = await wrongClient.sendObdLocalBridgeIntent("read_stored_dtc");
    check(wrongReadout.blocked === true && wrongReadout.errors.includes("pairing_token_mismatch"), "Same-origin routing bypassed pairing");
    let successCalls = 0;
    await wrongClient.runObdLocalBridgeRead("DTC", "read_stored_dtc", {}, () => { successCalls += 1; });
    check(wrongClient.obdDevStatus.textContent.includes("接続キーが一致しません") && successCalls === 0, "Pairing failure was hidden by the gate render or reached success handling");
    await client.runObdLocalBridgeRead("DTC", "read_stored_dtc", {}, () => { successCalls += 1; });
    check(client.obdDevStatus.textContent.includes("VCI未検出") && client.obdDevStatus.textContent.includes("未取得") && successCalls === 0, "Missing VCI was shown as a successful read or its reason was overwritten");
    await client.runObdLocalBridgeRead("VCI一覧", "list_vci", {}, () => { successCalls += 1; });
    check(client.obdDevStatus.textContent === "VCI一覧が完了しました。" && successCalls === 1, "Successful status operation lost its completion message");
    const displayClient = createClient(workstation.webUrl, options.pairingToken);
    for (const [code, label] of [
      ["vci_not_connected", "VCIは未接続"], ["bridge_pairing_token_not_configured", "接続キーが未設定"],
      ["local_bridge_timeout", "時間切れ"], ["sample_mode_no_vehicle_readout", "サンプルモード"],
      ["write_intent_blocked", "要求は無効"], ["詳細トークンが未設定です。", "未設定"]
    ]) {
      displayClient.sendObdLocalBridgeIntent = async () => { throw new Error(code); };
      await displayClient.runObdLocalBridgeRead("確認", "read_stored_dtc", {}, () => { successCalls += 1; });
      check(displayClient.obdDevStatus.textContent.includes(label) && successCalls === 1, `Bridge failure lost its distinct reason: ${code}`);
    }
    displayClient.sendObdLocalBridgeIntent = async () => { throw new Error(`unrecognized ${options.pairingToken} C:/private/driver.dll`); };
    await displayClient.runObdLocalBridgeRead("確認", "read_stored_dtc", {}, () => { successCalls += 1; });
    check(displayClient.obdDevStatus.textContent.includes("応答を確認できません") && !displayClient.obdDevStatus.textContent.includes(options.pairingToken) && !displayClient.obdDevStatus.textContent.includes("private"), "Unknown transport error exposed raw credentials or paths");
    displayClient.sendObdLocalBridgeStatusIntent = async () => { throw new Error("local_bridge_timeout"); };
    await displayClient.probeObdLocalBridge();
    check(displayClient.obdDevStatus.textContent.includes("時間切れ"), "Bridge discovery failure was overwritten by the gate");
    client.window = { ObdReadOnly: {
      normalizeBridgeConnectionStatus: () => ({ displayStatus: "TEST_STATUS" }),
      normalizeBridgeAdapterIdentity: () => ({ adapterName: "TEST_ADAPTER" })
    } };
    client.renderObdDeveloperSessionSummary = () => {};
    client.appendObdDeveloperLog = () => {};
    await client.probeObdLocalBridge();
    check(client.obdDevStatus.textContent.includes("TEST_STATUS / TEST_ADAPTER"), "Bridge discovery result was replaced with a generic ready message");
    displayClient.sendObdLocalBridgeIntent = async () => { displayClient.obdDevModeUnlocked = false; throw new Error("pairing_token_mismatch"); };
    await displayClient.runObdLocalBridgeRead("確認", "read_stored_dtc", {}, () => { successCalls += 1; });
    check(displayClient.obdDevStatus.textContent === "DEFAULT_GATE", "Late failure overwrote the newly locked gate");
    const renewedClient = createClient(workstation.webUrl, "saved-details-token");
    renewedClient.obdBridgePairingInput.value = options.pairingToken;
    renewedClient.applyObdBridgePairingToken();
    check(renewedClient.obdBridgePairingInput.value === "" && renewedClient.obdBridgePairingToken === options.pairingToken && renewedClient.localStorage.getItem() === "saved-details-token", "Runtime pairing changed the saved unlock token or retained the input value");
    const renewedReadout = await renewedClient.sendObdLocalBridgeIntent("read_stored_dtc");
    check(renewedReadout.errors.includes("vci_not_detected") && !renewedReadout.errors.includes("pairing_token_mismatch"), "Restarted bridge did not accept the separately supplied runtime key");
    renewedClient.obdBridgePairingInput.value = "short";
    renewedClient.applyObdBridgePairingToken();
    check(renewedClient.obdBridgePairingToken === options.pairingToken && renewedClient.obdBridgePairingStatus.textContent.includes("12"), "Invalid runtime key replaced a configured key");
    renewedClient.renderObdBridgePairingControls();
    check(!JSON.stringify(renewedClient.obdDevSession).includes(options.pairingToken) && !renewedClient.obdBridgePairingStatus.textContent.includes(options.pairingToken), "Runtime key leaked into diagnostic state or status text");
    renewedClient.clearObdBridgePairingToken();
    const clearedReadout = await renewedClient.sendObdLocalBridgeIntent("read_stored_dtc");
    check(clearedReadout.errors.includes("pairing_token_mismatch") && renewedClient.obdBridgePairingClearButton.disabled, "Clearing runtime pairing failed to restore the saved-token behavior");
    renewedClient.obdBridgePairingInput.value = options.pairingToken;
    renewedClient.applyObdBridgePairingToken();
    renewedClient.lockObdDeveloperMode();
    check(renewedClient.obdBridgePairingToken === "" && renewedClient.obdBridgePairingInput.value === "" && renewedClient.obdBridgePairingControls.hidden && renewedClient.obdBridgePairingApplyButton.disabled, "Locking left runtime pairing credentials or controls active");
    renewedClient.obdBridgePairingInput.value = options.pairingToken;
    renewedClient.applyObdBridgePairingToken();
    check(renewedClient.obdBridgePairingToken === "", "Locked details accepted a runtime key");
    renewedClient.obdDevPasswordInput.value = options.pairingToken;
    renewedClient.unlockObdDeveloperMode();
    check(renewedClient.obdDevModeUnlocked === false, "Bridge pairing key bypassed the saved details lock");
    renewedClient.obdDevPasswordInput.value = "saved-details-token";
    renewedClient.unlockObdDeveloperMode();
    check(renewedClient.obdDevModeUnlocked === true && renewedClient.obdBridgePairingToken === "", "Existing details token no longer unlocks or restored a discarded runtime key");
    check(createClient(workstation.webUrl, "saved-details-token").obdBridgePairingToken === "", "Reloaded UI retained a runtime key");
    renewedClient.obdBridgePairingInput.value = options.pairingToken;
    renewedClient.applyObdBridgePairingToken();
    renewedClient.lockObdAccess();
    check(renewedClient.obdAccessUnlocked === false && renewedClient.obdBridgePairingToken === "" && renewedClient.obdBridgePairingInput.value === "", "Top-level access lock retained the runtime pairing key");
    check(indexSource.includes('id="obdBridgePairingControls" hidden') && indexSource.includes('id="obdBridgePairingInput" type="password" autocomplete="off" minlength="12"') && indexSource.includes('id="obdBridgePairingStatus" class="data-status" role="status"'), "Pairing UI lost initial hiding, password input, or accessible status");
    check(appSource.includes('obdBridgePairingApplyButton.addEventListener("click", applyObdBridgePairingToken)') && appSource.includes('obdBridgePairingClearButton.addEventListener("click", clearObdBridgePairingToken)'), "Pairing UI buttons are not connected to the tested handlers");
    const requestCountBeforeWrite = requests.length;
    await assert.rejects(client.sendObdLocalBridgeIntent("clear_dtc"));
    check(requests.length === requestCountBeforeWrite, "UI sent a forbidden write intent");
    await assert.rejects(client.sendObdLocalBridgeStatusIntent("read_stored_dtc"));
    await assert.rejects(client.sendObdLocalBridgeStatusIntent("clear_dtc"));
    check(requests.length === requestCountBeforeWrite, "Public status helper sent a paired read or forbidden write intent");
    const localRequest = (body) => fetch(localEndpoint, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body)
    });
    const blockedResponse = await localRequest({ api_version: "v1", request_id: "local-write-test", intent: "clear_dtc", timestamp: new Date().toISOString(), pairing_token: options.pairingToken });
    const localWrite = await blockedResponse.json();
    check(localWrite.blocked === true && localWrite.errors.includes("write_intent_blocked") && localWrite.would_transmit === false && blockedResponse.headers.get("cache-control") === "no-store", "Same-origin bridge accepted a write or allowed caching");
    const invalid = await (await localRequest({})).json();
    check(invalid.blocked === true && !JSON.stringify([status, localReadout, localWrite]).includes(options.pairingToken), "Local route skipped validation or exposed pairing credentials");
    check((await fetch(localEndpoint)).status === 404 && (await fetch(`${workstation.webUrl}/local-bridge/other`, { method: "POST" })).status === 404, "Local bridge route exposed an unintended method or path");
    const publicClient = createClient("https://tool.mukiguri.com", options.pairingToken);
    const publicEndpoints = Array.from(publicClient.getObdLocalBridgeEndpoints());
    check(publicEndpoints.length === 6 && publicEndpoints.every((url) => /^http:\/\/127\.0\.0\.1:(8765|17653)\/v1/.test(url)), "Public UI discovery changed or sent pairing credentials to the public origin");
    client.obdDevSession.bridgeEndpoint = "http://127.0.0.1:17653/v1";
    check(client.getObdLocalBridgeEndpoints()[0] === client.obdDevSession.bridgeEndpoint && client.getObdLocalBridgeEndpoints({ discover: true })[0] === localEndpoint, "Cached endpoint or explicit rediscovery regressed");
    const fallbackRequests = [];
    const fallbackBodies = [];
    const legacyClient = createClient(workstation.webUrl, options.pairingToken, (url, init) => {
      fallbackRequests.push(url);
      fallbackBodies.push(JSON.parse(init.body));
      return url === localEndpoint ? Promise.resolve(new Response(null, { status: 404 })) : fetch(`${workstation.bridgeUrl}/v1/request`, init);
    });
    const fallbackStatus = await legacyClient.sendObdLocalBridgeStatusIntent("bridge_status");
    check(fallbackStatus.ok === true && fallbackRequests.length === 2 && fallbackRequests[1] === publicEndpoints[0], "Legacy static UI did not fall back to the existing separate bridge");
    check(fallbackBodies.length === 2 && fallbackBodies[0].request_id === fallbackBodies[1].request_id && fallbackBodies.every((body) => !Object.hasOwn(body, "pairing_token")), "Endpoint discovery changed the request ID or exposed pairing credentials");
    const fallbackReadout = await legacyClient.sendObdLocalBridgeIntent("read_stored_dtc", {}, { discover: true });
    check(fallbackReadout.errors.includes("vci_not_detected") && fallbackReadout.would_transmit === false && fallbackBodies.length === 4 && fallbackBodies[2].request_id === fallbackBodies[3].request_id && fallbackBodies[2].request_id !== fallbackBodies[0].request_id && fallbackBodies.slice(2).every((body) => body.pairing_token === options.pairingToken), "Paired endpoint discovery changed the request ID, lost credentials, or enabled transmission");
    await validateBridgeResponseEnvelopes(workstation.webUrl);
    await validateBridgeResponseDeadlines(workstation.webUrl);
    await validateBridgeOperationLifecycle(workstation.webUrl);
    await validateScannerImportOwnership(workstation.webUrl);
    await validateScannerAcquisitionOrder(workstation.webUrl);
    await validateScannerParserIntegration(workstation.webUrl);
    await assert.rejects(startLocalWorkstation({ ...options, webPort }), { code: "EADDRINUSE" });
    await validateWindowsLauncher(webPort);
    await validateWorkstationConsoleExit();
    check((await fetch(workstation.webUrl)).status === 200, "A competing launcher stopped the existing workstation");
  } finally {
    await workstation.close();
    await workstation.close();
  }
  check(!workstation.webServer.listening && !workstation.bridgeServer.listening, "Workstation shutdown left a listener behind");
  const occupied = http.createServer((request, response) => response.end("occupied"));
  await new Promise((resolve) => occupied.listen(0, "127.0.0.1", resolve));
  try {
    await assert.rejects(startLocalWorkstation({ ...options, webPort, bridgePort: occupied.address().port }), { code: "EADDRINUSE" });
    const retry = await startLocalWorkstation({ ...options, webPort, pairingToken: undefined });
    try {
      check(retry.webServer.listening && occupied.listening, "Failed bridge startup leaked the UI port or stopped the occupied server");
      check(/^[0-9a-f]{48}$/.test(retry.pairingToken) && retry.pairingToken !== options.pairingToken, "Workstation did not generate a runtime pairing token when none was configured");
    } finally {
      await retry.close();
    }
  } finally {
    await new Promise((resolve) => occupied.close(resolve));
  }
  await assert.rejects(startLocalWorkstation({ ...options, webPort: -1 }), /invalid_workstation_port/);
  await assert.rejects(startLocalWorkstation({ ...options, pairingToken: "short" }), /workstation_pairing_token_too_short/);
  check(true, "Invalid settings rejected");
  process.env.LOCAL_BRIDGE_REPLAY_LOG = "must-not-be-read.log";
  await assert.rejects(startLocalWorkstation(options), /workstation_replay_not_allowed/);
  check(true, "Inherited replay rejected");
} finally {
  if (previousReplay === undefined) delete process.env.LOCAL_BRIDGE_REPLAY_LOG;
  else process.env.LOCAL_BRIDGE_REPLAY_LOG = previousReplay;
  if (previousPairing === undefined) delete process.env.LOCAL_BRIDGE_PAIRING_TOKEN;
  else process.env.LOCAL_BRIDGE_PAIRING_TOKEN = previousPairing;
}
console.log(`Local workstation checks: ${checks}\nErrors: 0`);
