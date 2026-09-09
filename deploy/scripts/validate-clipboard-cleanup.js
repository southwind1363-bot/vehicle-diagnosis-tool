import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync(new URL("../script.js", import.meta.url), "utf8");
const code = source.match(/async function copyTextToClipboard\([^)]*\) \{[\s\S]*?\r?\n\}/)?.[0];
assert.ok(code);
for (const failure of ["none", "append", "focus", "select", "range", "copy", "false"]) {
  let removed = 0, copies = 0;
  const fail = stage => { if (failure === stage) throw new Error("synthetic failure"); };
  const textarea = { style: {}, setAttribute() {}, focus() { fail("focus"); }, select() { fail("select"); },
    setSelectionRange() { fail("range"); }, remove() { removed++; } };
  const context = vm.createContext({ navigator: {}, window: {}, document: {
    createElement: () => textarea, body: { appendChild() { fail("append"); } },
    execCommand() { fail("copy"); copies++; return failure !== "false"; }
  } });
  vm.runInContext(code, context);
  if (failure === "none") await context.copyTextToClipboard("synthetic consultation");
  else await assert.rejects(context.copyTextToClipboard("synthetic consultation"));
  assert.equal(removed, 1, failure + ": temporary consultation text was retained");
  assert.equal(copies, ["none", "false"].includes(failure) ? 1 : 0);
}
console.log("Legacy clipboard cleanup: append/focus/select/range/copy failure and success release temporary text; no system clipboard used");

for (const outcome of ["success", "denied", "timeout"]) {
  let resolve, reject, expire;
  let writes = 0, copies = 0, cleaned = 0;
  const pending = new Promise((yes, no) => { resolve = yes; reject = no; });
  const textarea = { style: {}, setAttribute() {}, focus() {}, select() {}, setSelectionRange() {}, remove() {} };
  const context = vm.createContext({
    navigator: { clipboard: { writeText: () => { writes++; return pending; } } }, window: { isSecureContext: true },
    document: { createElement: () => textarea, body: { appendChild() {} }, execCommand: () => { copies++; return true; } },
    setTimeout: (fn, ms) => { assert.equal(ms, 30000); expire = fn; return 7; },
    clearTimeout: id => { assert.equal(id, 7); cleaned++; }
  });
  vm.runInContext(code, context);
  const task = context.copyTextToClipboard("synthetic consultation");
  assert.equal(typeof expire, "function", "Clipboard write must have a bounded wait");
  if (outcome === "timeout") {
    expire();
    await assert.rejects(task, /clipboard_write_timeout/);
    resolve();
    await Promise.resolve();
  } else {
    if (outcome === "success") resolve(); else reject(new Error("synthetic denied"));
    await task;
  }
  assert.equal(writes, 1);
  assert.equal(copies, outcome === "denied" ? 1 : 0, "Timeout must not fall back to another clipboard write");
  assert.equal(cleaned, 1);
}
console.log("Clipboard write: bounded wait, timer cleanup, no fallback on timeout, normal success/rejection retained");
