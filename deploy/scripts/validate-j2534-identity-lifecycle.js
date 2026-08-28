import assert from "node:assert/strict";
import fs from "node:fs";
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { runJ2534IdentityLifecycle } from "./j2534-identity-lifecycle.js";
import { reviewJ2534PassThruOpenRequest } from "./j2534-readonly-worker.js";

let checks = 0;
const check = (value, message) => { assert.ok(value, message); checks += 1; };
function buffer(text = "04.04") { const bytes = new Uint8Array(80); bytes.set(Buffer.from(text, "ascii")); return bytes; }
const readout = () => ({ status: 0, firmware: buffer("fixture-fw"), dll: buffer("fixture-dll"), api: buffer() });
function fixture(overrides = {}) {
  const calls = [];
  const backend = {
    open: () => ({ status: 0, device_id: 0 }), readVersion: readout, close: () => ({ status: 0 }), ...overrides
  };
  const transport = {};
  for (const key of ["open", "readVersion", "close"]) transport[key] = function (...args) {
    assert.equal(this, transport);
    calls.push([key, ...args]);
    return backend[key](...args);
  };
  for (const key of ["connect", "writeMsgs", "ioctl", "loadLibrary"]) Object.defineProperty(transport, key, { get() { throw new Error(`Forbidden: ${key}`); } });
  return { transport, calls };
}
const deferred = () => { let resolve; const promise = new Promise((done) => { resolve = done; }); return { promise, resolve }; };
const tick = () => new Promise((done) => setImmediate(done));
const badValues = [undefined, null, true, false, "0", NaN, Infinity, -1, 0.5, 0x100000000];
for (const id of [0, 1, 0xffffffff]) {
  const item = fixture({ open: () => ({ status: 0, device_id: id }) });
  const result = await runJ2534IdentityLifecycle(item.transport);
  check(result.status === "completed" && result.cleanup_status === "confirmed", "Successful fixture did not complete cleanup");
  check(JSON.stringify(item.calls) === JSON.stringify([["open", null], ["readVersion", id], ["close", id]]), "Lifecycle changed call order or ID");
  check(Object.values(result.steps).every((step) => step.attempted && step.status_code === 0) && result.versions.api === "04.04", "Successful step evidence missing");
}
for (const id of badValues) {
  const item = fixture({ open: () => ({ status: 0, device_id: id }) });
  const result = await runJ2534IdentityLifecycle(item.transport);
  check(result.status === "open_failed" && result.cleanup_status === "unconfirmed" && item.calls.length === 1, "Invalid device ID reached read or cleanup");
}
for (const [method, field] of [["open", "open"], ["readVersion", "read_version"], ["close", "close"]]) {
  for (const status of [undefined, null, true, "0", NaN, Infinity, 0.5, 0x80000000, -0x80000001]) {
    const item = fixture({ [method]: () => ({ status, device_id: 0 }) });
    const result = await runJ2534IdentityLifecycle(item.transport);
    check(result.status !== "completed" && result.steps[field].status_code === null, `${method}: invalid status was accepted`);
    check(method === "open" ? item.calls.length === 1 && result.cleanup_status === "unconfirmed" : item.calls.at(-1)[0] === "close", `${method}: invalid status broke cleanup`);
  }
  for (const status of [1, -1, 0x7fffffff, -0x80000000]) {
    const item = fixture({ [method]: () => ({ status, device_id: 0 }) });
    const result = await runJ2534IdentityLifecycle(item.transport);
    check(result.steps[field].status_code === status && result.status !== "completed", `${method}: native failure was lost`);
    check(result.cleanup_status === (method === "open" ? "not_required" : method === "close" ? "unconfirmed" : "confirmed"), `${method}: cleanup evidence incorrect`);
  }
  for (const reject of [false, true]) {
    const item = fixture({ [method]: () => { const error = new Error("C:/private/driver.dll secret-token"); if (reject) return Promise.reject(error); throw error; } });
    const result = await runJ2534IdentityLifecycle(item.transport);
    check(result.steps[field].attempted && result.errors.includes(`${field}_threw`), `${method}: thrown step was not recorded`);
    check(!JSON.stringify(result).includes("private") && !JSON.stringify(result).includes("secret-token"), "Native error text escaped into output");
    check(method === "open" ? item.calls.length === 1 : item.calls.at(-1)[0] === "close", "Throw skipped or invented cleanup");
  }
}
for (const invalid of [undefined, "04.04", [], new Uint8Array(79), new Uint8Array(81), new Uint8Array(80), new Uint8Array(80).fill(65), buffer("   "), buffer("a\nb"), Uint8Array.from([255, ...new Array(79).fill(0)])]) {
  for (const field of ["firmware", "dll", "api"]) {
    const item = fixture({ readVersion: () => ({ ...readout(), [field]: invalid }) });
    const result = await runJ2534IdentityLifecycle(item.transport);
    check(result.status === "read_failed" && result.versions[field] === null && result.errors.includes("version_buffer_invalid"), "Invalid version bytes became plausible identity data");
    check(result.cleanup_status === "confirmed" && item.calls.length === 3, "Invalid version skipped cleanup");
  }
}
const maxVersion = fixture({ readVersion: () => ({ ...readout(), firmware: buffer("x".repeat(79)) }) });
check((await runJ2534IdentityLifecycle(maxVersion.transport)).versions.firmware.length === 79, "Valid maximum version was truncated");
let idReads = 0;
const changingId = fixture({ open: () => ({ status: 0, get device_id() { return idReads++ === 0 ? 0 : -1; } }) });
const stableIdResult = await runJ2534IdentityLifecycle(changingId.transport);
check(idReads === 1 && stableIdResult.status === "completed" && changingId.calls.slice(1).every((call) => call[1] === 0), "Device ID changed between validation and use");
for (const [method, field] of [["open", "open"], ["readVersion", "read_version"], ["close", "close"]]) {
  for (const first of [0, 7, undefined]) {
    let statusReads = 0;
    const item = fixture({ [method]: () => ({ ...readout(), device_id: 0, get status() { return statusReads++ === 0 ? first : first === 0 ? 7 : 0; } }) });
    const result = await runJ2534IdentityLifecycle(item.transport);
    check(statusReads === 1 && result.steps[field].status_code === (first ?? null), `${method}: status changed between validation and recording`);
    check(first === 0 ? result.status === "completed" && result.cleanup_status === "confirmed" : result.status !== "completed", `${method}: changing status produced inconsistent success`);
  }
}
const combined = fixture({ readVersion: () => ({ status: 7 }), close: () => ({ status: 8 }) });
const combinedResult = await runJ2534IdentityLifecycle(combined.transport);
check(combinedResult.status === "read_failed" && combinedResult.errors.includes("read_version_status_failed") && combinedResult.errors.includes("close_status_failed") && combinedResult.cleanup_status === "unconfirmed", "Cleanup failure replaced the primary failure");
for (const transport of [undefined, null, {}, { open() {} }, { open() {}, readVersion() {} }]) {
  check((await runJ2534IdentityLifecycle(transport)).status === "blocked", "Incomplete transport was accepted");
}
const invalidSignal = fixture();
check((await runJ2534IdentityLifecycle(invalidSignal.transport, { signal: {} })).status === "blocked" && invalidSignal.calls.length === 0, "Invalid signal reached transport");
const before = fixture();
check((await runJ2534IdentityLifecycle(before.transport, { signal: AbortSignal.abort() })).status === "cancelled" && before.calls.length === 0, "Pre-aborted probe called Open");

for (const pendingStage of ["open", "readVersion", "close"]) {
  const hold = deferred();
  const controller = new AbortController();
  const item = fixture({ [pendingStage]: () => hold.promise });
  let settled = false;
  const pending = runJ2534IdentityLifecycle(item.transport, { signal: controller.signal }).then((value) => { settled = true; return value; });
  await tick();
  controller.abort();
  await tick();
  check(!settled && item.calls.at(-1)[0] === pendingStage, "Cancellation raced a pending call with cleanup");
  const callCount = item.calls.length;
  check((await runJ2534IdentityLifecycle(item.transport)).status === "busy" && item.calls.length === callCount, "Cancellation released busy ownership prematurely");
  hold.resolve(pendingStage === "open" ? { status: 0, device_id: 0 } : pendingStage === "readVersion" ? readout() : { status: 0 });
  const result = await pending;
  check(result.status === "cancelled" && result.cleanup_status === "confirmed", "Cancellation did not retain successful cleanup");
  check(item.calls.filter(([key]) => key === "close").length === 1 && (pendingStage !== "open" || !item.calls.some(([key]) => key === "readVersion")), "Cancelled acquisition performed extra calls");
  check((await runJ2534IdentityLifecycle(item.transport)).status === "completed", "Settled cleanup did not release busy ownership");
}
const failingClose = fixture({ close: () => { throw new Error(); } });
await runJ2534IdentityLifecycle(failingClose.transport);
check((await runJ2534IdentityLifecycle(failingClose.transport)).status === "cleanup_failed", "Failed cleanup leaked the in-process busy guard");
for (const stage of ["open", "readVersion"]) {
  const controller = new AbortController();
  const item = fixture({ [stage]: () => { controller.abort(); throw new Error("private failure"); }, close: () => ({ status: 9 }) });
  const result = await runJ2534IdentityLifecycle(item.transport, { signal: controller.signal });
  check(result.status === (stage === "open" ? "open_failed" : "read_failed") && result.cleanup_status === "unconfirmed", "Cancellation hid the primary failure or uncertain cleanup");
  check(stage === "open" ? !result.steps.close.attempted : result.errors.includes("read_version_threw") && result.errors.includes("close_status_failed") && result.errors.includes("identity_probe_cancelled"), "Cancellation lost failure evidence");
}

const workerPath = fileURLToPath(new URL("./fixtures/j2534-identity-worker.js", import.meta.url));
for (const mode of ["open", "read", "close", "crash"]) {
  const execution = await new Promise((resolve) => {
    let output;
    const env = { ...process.env };
    delete env.NODE_OPTIONS;
    const child = execFile(process.execPath, [workerPath, mode], { timeout: 1500, windowsHide: true, maxBuffer: 4096, env },
      (error, stdout) => { output = { error, stdout }; });
    child.once("close", () => resolve({ ...output, closed: true }));
    child.stdin.end();
  });
  check(execution.closed && execution.error && execution.stdout.includes(`fixture:${mode === "crash" ? "read" : mode}`), "Isolated fixture did not reach and leave the requested stage");
  check(mode === "crash" ? execution.error.code === 23 : execution.error.killed === true, "Hung fixture was not terminated by its independent parent");
  check(!execution.stdout.includes("result:"), "A killed worker reported completed cleanup");
}
for (const operation of ["probe_adapter_identity", "run_identity_lifecycle", "PassThruConnect", "PassThruWriteMsgs"]) {
  const denied = reviewJ2534PassThruOpenRequest({ operation });
  check(denied.review_status === "blocked" && denied.blockers.includes("operation_not_allowed") && denied.dll_load_attempted === false, "Existing worker exposed the new lifecycle");
}
for (const relative of ["../local-bridge-readonly.js", "./j2534-readonly-worker.js", "./package-workstation.js"]) {
  check(!fs.readFileSync(new URL(relative, import.meta.url), "utf8").includes("j2534-identity-lifecycle"), "Unverified lifecycle was wired into a production entry point");
}
console.log(`J2534 identity lifecycle checks: ${checks} / Errors: 0`);
