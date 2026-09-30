import assert from "node:assert/strict";
import test from "node:test";
import { inspectJ2534RegistryPresence } from "./inspect-j2534-registry-presence.js";

const payload = (first = "not_listed", second = "listed", is64 = true) => ({
  is64BitOperatingSystem: is64,
  views: [{ view: "Registry64", status: first }, { view: "Registry32", status: second }]
});
const inspect = value => inspectJ2534RegistryPresence({ platform: "win32", run: () => JSON.stringify(value) });
const checkPermissions = report => {
  for (const key of ["driver_inventory_verified", "dll_load_attempted", "vehicle_communication_started", "execution_enabled"])
    assert.equal(report[key], false);
};

test("fixed bounded parent enumeration distinguishes listed and not-listed without execution authority", () => {
  let calls = 0;
  const report = inspectJ2534RegistryPresence({ platform: "win32", run(command, args, options) {
    calls++;
    assert.equal(command, "powershell.exe");
    assert.deepEqual(args.slice(0, -1), ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command"]);
    assert.match(args.at(-1), /GetSubKeyNames\(\)/);
    assert.match(args.at(-1), /OpenSubKey\('SOFTWARE', \$false\)/);
    assert.ok(!args.includes("-ExecutionPolicy"));
    assert.equal(options.timeout, 4000);
    assert.equal(options.maxBuffer, 16384);
    assert.equal(options.windowsHide, true);
    return JSON.stringify(payload());
  } });
  assert.equal(calls, 1);
  assert.equal(report.observation_complete, true);
  assert.deepEqual(report.views, payload().views);
  checkPermissions(report);
  const absent = inspect(payload("not_listed", "not_listed"));
  assert.equal(absent.observation_complete, true);
  assert.ok(absent.views.every(row => row.status === "not_listed"));
  checkPermissions(absent);
});

test("partial failure is incomplete; unavailable 64-bit view is explicit on a 32-bit OS", () => {
  const partial = inspect(payload("query_failed", "not_listed"));
  assert.equal(partial.observation_complete, false);
  assert.deepEqual(partial.views, payload("query_failed", "not_listed").views);
  const narrow = inspect(payload("view_unavailable", "not_listed", false));
  assert.equal(narrow.observation_complete, true);
  assert.equal(narrow.views[0].status, "view_unavailable");
  checkPermissions(partial); checkPermissions(narrow);
});

test("invalid, incomplete and contradictory reports never claim successful absence", () => {
  const extra = payload(); extra.private = "private path";
  const nestedExtra = payload(); nestedExtra.views[0].extra = true;
  for (const value of [null, [], {}, extra, nestedExtra, { ...payload(), views: [] },
    { ...payload(), views: [payload().views[0], payload().views[0]] },
    payload("absent"), payload("view_unavailable"), payload("not_listed", "listed", false)]) {
    const report = inspect(value);
    assert.equal(report.observation_complete, false);
    assert.ok(report.views.every(row => row.status === "query_failed"));
    checkPermissions(report);
  }
});

test("timeout, spawn denial, malformed and oversized output are private and never retried", () => {
  for (const result of [null, "private malformed text", "x".repeat(16385), new Error("private error")]) {
    let calls = 0;
    const report = inspectJ2534RegistryPresence({ platform: "win32", run() {
      calls++;
      if (result instanceof Error) throw result;
      return result;
    } });
    assert.equal(calls, 1);
    assert.equal(report.observation_complete, false);
    assert.ok(!JSON.stringify(report).includes("private"));
    checkPermissions(report);
  }
});

test("unsupported platform never starts PowerShell", () => {
  const report = inspectJ2534RegistryPresence({ platform: "linux", run() { assert.fail("must not run"); } });
  assert.equal(report.observation_complete, false);
  assert.ok(report.views.every(row => row.status === "unsupported_platform"));
  checkPermissions(report);
});
