import assert from "node:assert/strict";
import childProcess from "node:child_process";
import { EventEmitter, getEventListeners } from "node:events";
import { syncBuiltinESMExports } from "node:module";
import fs from "node:fs";
import { parseJ2534IdentityFixtureOutput, runJ2534IdentityFixture } from "./j2534-identity-supervisor.js";
import { runJ2534IdentityLifecycle } from "./j2534-identity-lifecycle.js";

let checks = 0;
const check = (value, message) => { assert.ok(value, message); checks += 1; };
const run = (scenario, extra = {}) => runJ2534IdentityFixture({ mode: "fixture", scenario, ...extra });
const tick = () => new Promise((done) => setImmediate(done));
const success = await run("success");
check(success.execution_status === "worker_completed" && success.result.status === "completed", "Supervised fixture did not complete");
check(success.worker_started && success.worker_exited && !success.termination_requested && success.fixture_cleanup_status === "confirmed", "Successful process evidence incorrect");
check(success.fixture_only === true && success.native_execution_enabled === false && success.real_adapter_cleanup_status === "not_tested", "Fixture claimed native or real adapter verification");
const envelope = (result = success.result, scenario = "success") => ({ schema_version: "j2534-identity-fixture-worker-v1", fixture_only: true, scenario, result: structuredClone(result) });
for (const [scenario, expected, cleanup] of [["open_error", "open_failed", "not_required"], ["read_error", "read_failed", "confirmed"], ["close_error", "cleanup_failed", "unconfirmed"], ["read_close_error", "read_failed", "unconfirmed"], ["invalid_version", "read_failed", "confirmed"], ["boundary", "completed", "confirmed"]]) {
  const result = await run(scenario);
  check(result.execution_status === "worker_completed" && result.result.status === expected && result.fixture_cleanup_status === cleanup, `${scenario}: lost lifecycle evidence`);
  check(result.worker_started && result.worker_exited && result.real_adapter_cleanup_status === "not_tested", `${scenario}: wrong process or native cleanup evidence`);
}
for (const scenario of ["invalid_json", "bad_result", "stdout_limit", "stderr_limit", "combined_limit", "crash", "open", "read", "close", "result_then_hang"]) {
  const result = await run(scenario, { timeout_ms: 1000 });
  check(result.worker_started && result.worker_exited && result.result === null && result.fixture_cleanup_status === "unconfirmed", `${scenario}: failed worker produced trusted cleanup or result`);
  check(!JSON.stringify(result).includes("not-json") && !JSON.stringify(result).includes("xxxx"), `${scenario}: raw output leaked`);
  const hanging = ["open", "read", "close", "result_then_hang"].includes(scenario);
  check(hanging ? result.execution_status === "worker_timed_out" && result.termination_requested && result.termination_signal_sent
    : scenario.endsWith("limit") ? result.errors.includes("worker_output_limit") : scenario === "crash" ? result.execution_status === "worker_failed" : result.execution_status === "invalid_worker_response", `${scenario}: wrong failure classification`);
}
for (const options of [undefined, null, [], {}, { mode: "native" }, { mode: "fixture", scenario: "../driver.dll" },
  { mode: "fixture", timeout_ms: "1000" }, { mode: "fixture", timeout_ms: 999 }, { mode: "fixture", timeout_ms: 10001 },
  { mode: "fixture", timeout_ms: true }, { mode: "fixture", timeout_ms: 1000.5 }, { mode: "fixture", signal: {} },
  { mode: "fixture", driver_path: "C:/private/driver.dll" }, { mode: "fixture", worker_path: "other.js" }]) {
  const result = await runJ2534IdentityFixture(options);
  check(result.execution_status === "request_blocked" && !result.worker_started && !JSON.stringify(result).includes("private"), "Invalid fixture options reached execution or leaked input");
}
const preCancelled = await run("success", { signal: AbortSignal.abort() });
check(preCancelled.execution_status === "worker_cancelled" && !preCancelled.worker_started, "Pre-cancelled request started worker");
const controller = new AbortController();
const pending = run("read", { signal: controller.signal });
check((await run("success")).execution_status === "worker_busy", "Concurrent probe bypassed guard");
await tick();
controller.abort();
const cancelled = await pending;
check(cancelled.execution_status === "worker_cancelled" && cancelled.worker_exited && cancelled.result === null && cancelled.termination_requested, "Cancellation returned before worker close or retained result");
check(getEventListeners(controller.signal, "abort").length === 0, "Supervisor retained abort listener");
check((await run("success")).execution_status === "worker_completed", "Completed cancellation did not release guard");
const obstructed = new AbortController();
obstructed.signal.addEventListener("abort", (event) => event.stopImmediatePropagation(), { once: true });
const obstructedRun = run("read", { signal: obstructed.signal, timeout_ms: 1000 });
await tick();
obstructed.abort();
const obstructedResult = await obstructedRun;
check(obstructedResult.execution_status === "worker_cancelled" && obstructedResult.worker_exited, "Earlier listener suppressed cancellation");
check(getEventListeners(obstructed.signal, "abort").length === 0, "Cancellation after stopImmediatePropagation retained a listener");

const mutations = [
  (m) => { m.fixture_only = "true"; }, (m) => { m.scenario = "other"; }, (m) => { m.schema_version = "old"; },
  (m) => { m.private_path = "C:/private"; }, (m) => { m.result.versions.api = "<\nscript"; },
  (m) => { m.result.versions.api = "x".repeat(80); }, (m) => { m.result.versions.api = " 04.04 "; },
  (m) => { m.result.versions.firmware = null; }, (m) => { m.result.versions.serial = "private"; },
  (m) => { m.result.steps.open.status_code = true; }, (m) => { m.result.steps.close.status_code = "0"; },
  (m) => { m.result.steps.open.attempted = false; }, (m) => { m.result.steps.read_version.attempted = false; },
  (m) => { m.result.steps.close.attempted = false; }, (m) => { m.result.steps.close.status_code = 9; },
  (m) => { m.result.steps.close.status_code = 0x80000000; }, (m) => { m.result.cleanup_status = "not_required"; },
  (m) => { m.result.status = "cancelled"; }, (m) => { m.result.errors = ["C:/private/driver.dll"]; },
  (m) => { m.result.errors = ["close_threw", "close_threw"]; }, (m) => { m.result.steps.connect = { attempted: true, status_code: 0 }; }
];
for (const mutate of mutations) {
  const input = envelope(); mutate(input);
  check(parseJ2534IdentityFixtureOutput(JSON.stringify(input), "success") === null, "Invalid fixture envelope was trusted");
}
const encoded = JSON.stringify(envelope());
check(parseJ2534IdentityFixtureOutput(encoded.padEnd(4096, " "), "success")?.status === "completed", "4096-byte response was rejected");
for (const output of [encoded.padEnd(4097, " "), encoded + "{}", "log\n" + encoded, "null", "[]", "{bad}", "é".repeat(2049)]) {
  check(parseJ2534IdentityFixtureOutput(output, "success") === null, "Malformed, trailing, or oversized output was accepted");
}
const buffer = () => { const value = new Uint8Array(80); value.set([48, 52, 46, 48, 52]); return value; };
for (const method of ["open", "readVersion", "close"]) {
  for (const outcome of [ ["throw", null], ["malformed", null], ["failure", -1] ]) {
    const transport = { open: () => ({ status: 0, device_id: 0 }), readVersion: () => ({ status: 0, firmware: buffer(), dll: buffer(), api: buffer() }), close: () => ({ status: 0 }) };
    transport[method] = () => { if (outcome[0] === "throw") throw new Error("private"); return { status: outcome[1] }; };
    const lifecycle = await runJ2534IdentityLifecycle(transport);
    const parsed = parseJ2534IdentityFixtureOutput(JSON.stringify(envelope(lifecycle)), "success");
    check(parsed && JSON.stringify(parsed) === JSON.stringify(lifecycle), `${method}/${outcome[0]}: valid failure evidence was rejected or changed`);
  }
}

// Inject only the Node test binding; production options never accept a spawner/path.
const originalSpawn = childProcess.spawn;
function replaceSpawn(fn) { childProcess.spawn = fn; syncBuiltinESMExports(); }
try {
  replaceSpawn(() => { throw new Error("C:/private/spawn.exe"); });
  const failed = await run("success");
  check(failed.execution_status === "worker_failed" && !failed.worker_started && !failed.worker_exited && !JSON.stringify(failed).includes("private"), "Synchronous spawn failure leaked or claimed process exit");
  for (const killOutcome of [true, false, "throw"]) {
    const fake = new EventEmitter();
    fake.stdout = new EventEmitter(); fake.stderr = new EventEmitter();
    fake.pid = 123; fake.exitCode = null; fake.signalCode = null;
    let kills = 0;
    fake.kill = (signal) => { check(signal === "SIGKILL", "Unexpected termination signal"); kills += 1; if (killOutcome === "throw") throw new Error("private kill failure"); return killOutcome; };
    replaceSpawn((command, args, options) => {
      check(command === process.execPath && args.length === 3 && args[0].endsWith("j2534-identity-worker.js") && args[2] === "--supervised", "Supervisor accepted an alternate executable or inherited Node flags");
      check(options.shell === false && options.windowsHide === true && Object.keys(options.env).every((key) => !/^NODE_(OPTIONS|PATH)$/i.test(key)), "Unsafe shell, window, or Node environment");
      queueMicrotask(() => fake.emit("spawn"));
      return fake;
    });
    const aborter = new AbortController();
    let settled = false;
    const running = run("success", { signal: aborter.signal }).then((value) => { settled = true; return value; });
    await tick();
    fake.stdout.emit("data", Buffer.from(encoded));
    aborter.abort();
    fake.exitCode = 0;
    fake.emit("exit", 0, null);
    await tick();
    check(!settled && (await run("success")).execution_status === "worker_busy", "kill/exit released ownership before close");
    fake.stderr.emit("data", Buffer.alloc(5000));
    fake.emit("close", 0, null);
    const finished = await running;
    check(kills === 1 && finished.execution_status === "worker_cancelled" && finished.result === null && finished.fixture_cleanup_status === "unconfirmed", "Late output changed first termination reason or trusted premature result");
    check(finished.termination_signal_sent === (killOutcome === true) && finished.worker_exited, "Kill request was confused with actual process completion");
  }
  for (const outcome of ["success", "spawn_error", "process_error", "overflow", "deadline", "exit_failure"]) {
    const fake = new EventEmitter();
    fake.stdout = new EventEmitter(); fake.stderr = new EventEmitter();
    fake.pid = outcome === "spawn_error" ? undefined : 123;
    fake.exitCode = null; fake.signalCode = null;
    fake.kill = () => true;
    replaceSpawn(() => fake);
    const aborter = new AbortController();
    const running = run("success", { signal: aborter.signal, timeout_ms: 1000 });
    if (outcome === "spawn_error") fake.emit("error", new Error("private spawn error"));
    else {
      fake.emit("spawn");
      if (outcome === "process_error") fake.emit("error", new Error("private process error"));
      if (outcome === "overflow") { fake.stdout.emit("data", Buffer.alloc(4097)); aborter.abort(); }
      if (outcome === "deadline") { await new Promise((done) => setTimeout(done, 1100)); aborter.abort(); }
      fake.stdout.emit("data", Buffer.from(encoded));
      if (outcome === "success") fake.stderr.emit("data", Buffer.alloc(4096 - Buffer.byteLength(encoded)));
    }
    fake.exitCode = outcome === "exit_failure" ? 7 : 0;
    fake.emit("exit", fake.exitCode, null);
    check((await run("success")).execution_status === "worker_busy", `${outcome}: exit released busy before close`);
    fake.emit("close", fake.exitCode, null);
    const result = await running;
    const expected = { success: null, spawn_error: "worker_spawn_failed", process_error: "worker_process_error", overflow: "worker_output_limit", deadline: "worker_timeout", exit_failure: "worker_process_failed" }[outcome];
    check(expected === null ? result.execution_status === "worker_completed" : result.errors[0] === expected && result.result === null && result.fixture_cleanup_status === "unconfirmed", `${outcome}: incorrect first failure or result adoption`);
    check(getEventListeners(aborter.signal, "abort").length === 0 && !JSON.stringify(result).includes("private"), `${outcome}: leaked listener or error text`);
  }
  for (const mode of ["throw_before_add", "throw_after_add", "throw_remove"]) {
    const fake = new EventEmitter();
    fake.stdout = new EventEmitter(); fake.stderr = new EventEmitter();
    fake.pid = 123; fake.exitCode = null; fake.signalCode = null;
    let kills = 0;
    fake.kill = () => { kills += 1; return true; };
    replaceSpawn(() => { queueMicrotask(() => fake.emit("spawn")); return fake; });
    const aborter = new AbortController();
    if (mode === "throw_remove") aborter.signal.removeEventListener = () => { throw new Error("private remove failure"); };
    else aborter.signal.addEventListener = function (...args) {
      if (mode === "throw_after_add") EventTarget.prototype.addEventListener.apply(this, args);
      throw new Error("private setup failure");
    };
    let settled = false;
    const running = run("success", { signal: aborter.signal }).then((value) => { settled = true; return value; });
    await tick();
    check(!settled && (await run("success")).execution_status === "worker_busy", `${mode}: signal failure released a live child`);
    fake.stdout.emit("data", Buffer.from(encoded));
    fake.exitCode = 0; fake.emit("exit", 0, null); fake.emit("close", 0, null);
    const result = await running;
    check(mode === "throw_remove" ? result.execution_status === "worker_completed" && kills === 0 : result.errors.includes("worker_signal_setup_failed") && kills === 1 && result.result === null, `${mode}: signal setup/disposal outcome incorrect`);
    check(getEventListeners(aborter.signal, "abort").length === 0 && result.worker_exited, `${mode}: signal failure lost cleanup or exit evidence`);
  }
} finally { replaceSpawn(originalSpawn); }
check((await run("success")).execution_status === "worker_completed", "Supervisor was not reusable after failed kill fixture closed");
for (const relative of ["../local-bridge-readonly.js", "./j2534-readonly-worker.js", "./package-workstation.js"]) {
  check(!fs.readFileSync(new URL(relative, import.meta.url), "utf8").includes("j2534-identity-supervisor"), "Development supervisor reached a production entry point");
}
console.log(`J2534 identity supervisor checks: ${checks} / Errors: 0`);
