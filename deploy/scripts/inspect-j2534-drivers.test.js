import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import vm from "node:vm";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createLocalBridgeApp } from "../local-bridge-readonly.js";
import { discoverJ2534WorkstationDrivers } from "./inspect-workstation-j2534.js";
import { inspectJ2534Drivers } from "./inspect-j2534-drivers.js";

function checkBlocked(result) {
  for (const key of ["vehicle_command_enabled", "vehicle_communication_started", "dll_load_attempted", "pass_thru_open_attempted"])
    assert.equal(result[key], false);
  assert.equal(result.identity_probe_readiness.identity_probe_execution_enabled, false);
}

test("successful empty queries are distinct from failed discovery", () => {
  const calls = [];
  const result = inspectJ2534Drivers({ platform: "win32", queryRegistry(command, args, options) {
    calls.push(args);
    assert.equal(command, "reg.exe");
    assert.deepEqual(args, ["query", args[1], "/s"]);
    assert.equal(options.timeout, 4000);
    assert.equal(options.maxBuffer, 1024 * 1024);
    assert.equal(options.windowsHide, true);
    return "";
  } });
  assert.equal(calls.length, 2);
  assert.equal(new Set(calls.map(args => args[1])).size, 2);
  assert.equal(result.registry_query_status, "completed");
  assert.equal(result.registration_status, "no_registered_driver");
  assert.equal(result.registry_roots_checked.length, 2);
  checkBlocked(result);
});

test("failed or invalid queries never claim absent drivers or expose raw errors", () => {
  for (const mode of ["denied", "timeout", "missing", "invalid"]) {
    const result = inspectJ2534Drivers({ platform: "win32", queryRegistry() {
      if (mode === "invalid") return null;
      throw Object.assign(new Error("private registry detail"), { status: 1, code: mode, stderr: "private" });
    } });
    assert.equal(result.registry_query_status, "incomplete");
    assert.equal(result.registration_status, "registry_discovery_incomplete");
    assert.equal(result.driver_readiness_status, "registry_discovery_incomplete");
    assert.equal(result.next_check, "verify_registry_query_access_and_key_presence");
    assert.deepEqual(result.registry_roots_checked, []);
    assert.ok(result.registry_queries.every(item => item.status === "query_failed"));
    assert.ok(!result.identity_probe_readiness.blockers.includes("no_registered_driver"));
    assert.ok(result.identity_probe_readiness.blockers.includes("registry_discovery_incomplete"));
    assert.ok(!JSON.stringify(result).includes("private"));
    checkBlocked(result);
  }
});

test("partial query failure preserves detected candidates without claiming complete discovery", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "registry-cli-"));
  try {
    let calls = 0;
    const result = inspectJ2534Drivers({ platform: "win32", queryRegistry() {
      if (++calls === 2) throw new Error("private");
      return `HKEY_LOCAL_MACHINE\\SOFTWARE\\PassThruSupport.04.04\\Synthetic VCI\n    Name    REG_SZ    Synthetic VCI\n    Vendor    REG_SZ    Synthetic\n    FunctionLibrary    REG_SZ    ${path.join(root, "missing.dll")}`;
    } });
    assert.equal(result.detected_count, 1);
    assert.equal(result.devices.length, 1);
    assert.equal(result.registry_query_status, "incomplete");
    assert.equal(result.registration_status, "registry_discovery_incomplete");
    assert.equal(result.registry_roots_checked.length, 1);
    assert.equal(result.open_review_status, "blocked");
    checkBlocked(result);
  } finally { fs.rmdirSync(root); }
});

test("unsupported platforms never launch a registry query", () => {
  const result = inspectJ2534Drivers({ platform: "linux", queryRegistry() { assert.fail("Must not query"); } });
  assert.equal(result.registry_query_status, "incomplete");
  assert.equal(result.next_check, "inspect_on_windows");
  assert.ok(result.registry_queries.every(item => item.status === "unsupported_platform"));
  assert.deepEqual(result.registry_roots_checked, []);
  checkBlocked(result);
});

test("bridge rejects incomplete discovery using existing failure envelope and preserves authentication priority", async () => {
  for (const partial of [false, true]) {
    let calls = 0;
    const server = createLocalBridgeApp({ pairingToken: "synthetic-registry-test", discoverJ2534: true,
      j2534RegistryPlatform: "win32", j2534RegistryQuery() {
        if (partial && ++calls === 1) return "";
        throw new Error("private registry failure");
      } });
    await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
    try {
      const origin = `http://127.0.0.1:${server.address().port}`;
      const health = await fetch(origin + "/health").then(r => r.json());
      assert.equal(health.ok, false);
      assert.equal(health.driver_readiness_status, "not_checked");
      assert.equal(health.next_check, null);
      assert.equal(health.sample_mode, false);
      assert.deepEqual(health.errors, ["registry_query_failed"]);
      const send = (intent, token = "synthetic-registry-test") => fetch(origin + "/v1/bridge", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ api_version: "v1", request_id: "synthetic", timestamp: new Date().toISOString(),
          intent, pairing_token: token, data: {} })
      }).then(r => r.json());
      for (const intent of ["bridge_status", "list_vci", "adapter_identity", "read_stored_dtc", "read_live_pid_snapshot"]) {
        assert.deepEqual(await send(intent), { request_id: "synthetic", ok: false, blocked: true,
          would_transmit: false, errors: ["registry_query_failed"], data: null });
      }
      assert.deepEqual((await send("clear_dtc")).errors, ["write_intent_blocked"]);
      assert.deepEqual((await send("read_stored_dtc", "wrong")).errors, ["pairing_token_mismatch"]);
    } finally { await new Promise(resolve => server.close(resolve)); }
  }
});

test("completed empty registry queries preserve the existing no-driver bridge response", async () => {
  const server = createLocalBridgeApp({ pairingToken: "synthetic-registry-test", discoverJ2534: true,
    j2534RegistryPlatform: "win32", j2534RegistryQuery: () => "" });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  try {
    const health = await fetch(`http://127.0.0.1:${server.address().port}/health`).then(r => r.json());
    assert.equal(health.ok, true);
    assert.equal(health.driver_readiness_status, "no_registered_driver");
    assert.equal(health.vehicle_command_enabled, false);
  } finally { await new Promise(resolve => server.close(resolve)); }
});

test("registry failure has an actionable Japanese message without an absent-driver claim", () => {
  const source = fs.readFileSync(new URL("../script.js", import.meta.url), "utf8");
  const match = source.match(/function formatObdLocalBridgeFailure\(error\) \{[^]*?\n\}/);
  assert.ok(match);
  const context = vm.createContext({});
  vm.runInContext(match[0], context);
  const message = context.formatObdLocalBridgeFailure({ message: "registry_query_failed" });
  assert.match(message, /登録状態を確認できません/);
  assert.match(message, /読取権限/);
  assert.match(message, /未登録と確定したものではありません/);
});

test("workstation discovery refuses full and partial failure before static inspection", () => {
  for (const partial of [false, true]) {
    let calls = 0;
    assert.throws(() => discoverJ2534WorkstationDrivers({ platform: "win32", queryRegistry() {
      if (partial && ++calls === 1) return 'HKEY_LOCAL_MACHINE\\SOFTWARE\\PassThruSupport.04.04\\Synthetic\n    FunctionLibrary    REG_SZ    private.dll';
      throw new Error("private");
    } }), { code: "j2534_registry_query_incomplete" });
  }
  assert.deepEqual(discoverJ2534WorkstationDrivers({ platform: "win32", queryRegistry: () => "" }), []);
  assert.deepEqual(discoverJ2534WorkstationDrivers({ platform: "linux", queryRegistry() { assert.fail("Unexpected query"); } }), []);
});

test("workstation CLI emits no evidence or preflight on query failure; completed empty queries still export", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "workstation-query-cli-"));
  const preload = path.join(root, "query.mjs");
  try {
    const entry = fileURLToPath(new URL("./inspect-workstation-j2534.js", import.meta.url));
    const writePreload = query => fs.writeFileSync(preload, `import cp from 'node:child_process';\nimport {syncBuiltinESMExports} from 'node:module';\nObject.defineProperty(process,'platform',{value:'win32'});\ncp.execFileSync=${query};\nsyncBuiltinESMExports();\n`);
    const run = (args, input = "") => spawnSync(process.execPath, ["--import", pathToFileURL(preload).href, entry, ...args],
      { encoding: "utf8", windowsHide: true, timeout: 10000, shell: false, input });
    writePreload(`()=>{throw new Error('private failure');}`);
    for (const args of [[], ["--evidence-json"], ["--preflight-index", "1"],
      ["--preflight-index", "1", "--evidence-json"], ["--prepare-uds-request", "1", "7E0", "7E8", "F189"]]) {
      const result = run(args);
      assert.equal(result.status, 2);
      assert.equal(result.stdout, "");
      assert.match(result.stderr, /登録状態を確認できませんでした/);
      assert.match(result.stderr, /証拠JSONは生成していません/);
      assert.doesNotMatch(result.stderr, /private failure|非実行事前検査/);
    }
    writePreload(`()=>''`);
    const result = run(["--evidence-json"]);
    assert.equal(result.status, 0);
    const evidence = JSON.parse(result.stdout);
    assert.equal(evidence.registration_status, "no_registered_driver");
    assert.equal(evidence.dll_load_attempted, false);
    assert.equal(evidence.vehicle_communication_started, false);
    writePreload(`()=>{throw new Error('private failure');}`);
    const validation = run(["--validate-evidence-stdin"], JSON.stringify(evidence));
    assert.equal(validation.status, 0);
    assert.equal(JSON.parse(validation.stdout).valid, true);
    assert.equal(JSON.parse(validation.stdout).evidence_authorizes_execution, false);
  } finally { fs.unlinkSync(preload); fs.rmdirSync(root); }
});
