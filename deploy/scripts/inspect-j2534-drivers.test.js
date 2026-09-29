import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
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
