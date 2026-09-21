import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import os from "node:os";
import { spawn } from "node:child_process";
import { addAbortListener } from "node:events";

// Real bounded Node processes only. No native worker, registry, DLL or
// quarantine file. Missing-close and unkillable processes remain synthetic tests.
const source = fs.readFileSync(new URL("./j2534-registered-driver-native-preflight.js", import.meta.url), "utf8");
const body = source.slice(source.indexOf("function runBoundedProcess("), source.indexOf("function parseResponse("));
const env = Object.fromEntries(["SystemRoot", "WINDIR", "TEMP", "TMP"].filter(key => process.env[key]).map(key => [key, process.env[key]]));
async function verify(mode) {
  const startedAt = performance.now(), events = [];
  const record = (event, detail = null) => events.push({ event, ms: Math.round(performance.now() - startedAt), detail });
  let child, closeTimer, resultTimer, marks = 0, closed = false;
  let resolveClose;
  const closing = new Promise(resolve => { resolveClose = resolve; });
  const scope = { spawn: (...args) => {
    child = spawn(...args);
    child.once("spawn", () => record("spawn"));
    child.once("exit", (code, signal) => record("exit", { code, signal }));
    child.once("error", error => record("error", error.code));
    child.stdout.on("data", chunk => record("stdout", chunk.length));
    child.stderr.on("data", chunk => record("stderr", chunk.length));
    child.once("close", () => { closed = true; resolveClose(); });
    return child;
  }, sanitizeEnvironment: () => env, setTimeout, clearTimeout, EventTarget, Symbol,
  addAbortListener, active: true, terminationUnconfirmed: false, unconfirmedChildren: new Set(),
  quarantineStore: { mark: () => { marks++; } } };
  vm.createContext(scope); vm.runInContext(body, scope);
  const code = mode === 'timeout'
    ? "process.stdout.write('early-untrusted-output');setTimeout(()=>process.exit(0),10000);"
    : `process.stdout.write('result',()=>process.exit(${mode === 'failed' ? 1 : 0}));`;
  try {
    const result = await Promise.race([
      scope.runBoundedProcess(process.execPath, ["-e", code], { cwd: os.tmpdir(), timeout: 1500, outputLimit: 4096 }),
      new Promise((_, reject) => { resultTimer = setTimeout(() => reject(new Error("result_deadline_exceeded")), 10000); })
    ]);
    clearTimeout(resultTimer);
    assert.equal(closed, true);
    assert.equal(result.started, true); assert.equal(result.exited, true);
    assert.equal(result.error, mode === 'timeout' ? 'native_preflight_timeout'
      : mode === 'failed' ? 'native_preflight_process_failed' : null, JSON.stringify({ mode, events }));
    assert.equal(result.stdout, mode === 'normal' ? 'result' : '');
    assert.equal(result.termination_unconfirmed, false); assert.equal(marks, 0);
    const snapshot = JSON.stringify(result);
    await Promise.race([closing, new Promise((_, reject) => {
      closeTimer = setTimeout(() => reject(new Error("fixture_close_deadline_exceeded")), 10000);
    })]);
    assert.equal(JSON.stringify(result), snapshot);
    assert.equal(scope.unconfirmedChildren.size, 0);
    assert.equal(scope.terminationUnconfirmed, false);
  } finally {
    clearTimeout(resultTimer); clearTimeout(closeTimer);
    if (child && child.exitCode === null && child.signalCode === null) child.kill();
    child?.stdout?.destroy(); child?.stderr?.destroy();
  }
}
await Promise.all(['normal', 'failed', 'timeout'].map(verify));
console.log("Native preflight real process checks: normal exit retains output; failed exit and timeout discard output; confirmed close, no DLL or vehicle I/O");
