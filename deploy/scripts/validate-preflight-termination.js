import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { EventEmitter, addAbortListener, getEventListeners } from "node:events";

// Execute the actual private runner with artificial events and a manual clock.
// No process, native binary, registry, persisted quarantine or vehicle access.
const source = fs.readFileSync(new URL("./j2534-registered-driver-native-preflight.js", import.meta.url), "utf8");
const body = source.slice(source.indexOf("function runBoundedProcess("), source.indexOf("function parseResponse("));
function fixture({ killThrows = false, markThrows = false } = {}) {
  const child = new EventEmitter();
  Object.assign(child, { stdout: new EventEmitter(), stderr: new EventEmitter(), pid: 123,
    exitCode: null, signalCode: null });
  let kills = 0, marks = 0, now = 0, sequence = 0;
  child.kill = () => { kills++; if (killThrows) throw new Error("synthetic"); return false; };
  const timers = new Map();
  const scope = { spawn: () => child, sanitizeEnvironment: () => ({}),
    setTimeout: (fn, delay) => { const id = ++sequence; timers.set(id, { fn, at: now + delay }); return id; },
    clearTimeout: id => timers.delete(id), EventTarget, Symbol, addAbortListener,
    active: true, terminationUnconfirmed: false, unconfirmedChildren: new Set(),
    quarantineStore: { mark: () => { marks++; if (markThrows) throw new Error("synthetic"); } } };
  vm.createContext(scope); vm.runInContext(body, scope);
  function advance(ms) {
    now += ms;
    for (const [id, timer] of [...timers]) if (timer.at <= now && timers.delete(id)) timer.fn();
  }
  return { child, scope, advance, timers, counts: () => ({ kills, marks }),
    run: signal => scope.runBoundedProcess("synthetic", [], { cwd: "synthetic", timeout: 1000, outputLimit: 4096, signal }) };
}
let cases = 0;
for (const scenario of ["failed_exit", "successful_exit", "kill_false", "kill_throws", "spawn_error", "mark_throws"]) {
  const f = fixture({ killThrows: scenario === "kill_throws", markThrows: scenario === "mark_throws" });
  const controller = new AbortController();
  const pending = f.run(controller.signal);
  if (scenario === "spawn_error") { f.child.pid = undefined; f.child.emit("error", new Error("synthetic")); }
  else {
    f.child.emit("spawn"); f.child.stdout.emit("data", Buffer.from("untrusted output"));
    if (scenario.endsWith("exit")) {
      f.child.exitCode = scenario === "failed_exit" ? 1 : 0;
      f.child.emit("exit", f.child.exitCode, null);
    }
  }
  f.advance(1000); f.advance(2000);
  const result = await pending;
  assert.equal(result.error, "native_preflight_termination_unconfirmed");
  assert.equal(result.exited, false); assert.equal(result.stdout, "");
  assert.equal(result.termination_unconfirmed, true); assert.ok(Object.isFrozen(result));
  assert.equal(f.scope.terminationUnconfirmed, true); assert.equal(f.scope.active, true);
  assert.equal(f.scope.unconfirmedChildren.size, 1); assert.equal(f.counts().marks, 1);
  assert.equal(f.counts().kills, scenario.endsWith("exit") || scenario === "spawn_error" ? 0 : 1);
  assert.equal(getEventListeners(controller.signal, "abort").length, 0);
  assert.equal(f.timers.size, 0);
  const snapshot = JSON.stringify(result);
  f.child.emit("close", 0, null); f.child.emit("error", new Error("late"));
  f.child.stdout.emit("data", Buffer.from("late output")); controller.abort();
  assert.equal(JSON.stringify(result), snapshot);
  assert.equal(f.scope.unconfirmedChildren.size, 0);
  assert.equal(f.scope.terminationUnconfirmed, true); assert.equal(f.scope.active, true);
  cases++;
}
for (const code of [0, 1]) {
  const f = fixture(), pending = f.run();
  f.child.emit("spawn"); f.child.stdout.emit("data", Buffer.from("result"));
  f.child.exitCode = code; f.child.emit("exit", code, null); f.child.emit("close", code, null);
  const result = await pending;
  assert.equal(result.exited, true); assert.equal(result.termination_unconfirmed, false);
  assert.equal(result.error, code ? "native_preflight_process_failed" : null);
  assert.equal(result.stdout, code ? "" : "result");
  assert.equal(f.timers.size, 0); assert.deepEqual(f.counts(), { kills: 0, marks: 0 }); cases++;
}
console.log(`Native preflight termination scenarios: ${cases} passed (artificial events only)`);
