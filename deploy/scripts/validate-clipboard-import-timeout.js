import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync(new URL("../script.js", import.meta.url), "utf8");
const code = source.match(/async function pasteObdScannerImport\(\) \{[\s\S]*?\r?\n\}/)?.[0]
  || assert.fail("Missing clipboard importer");
for (const mode of ["timeout", "success", "denied", "superseded"]) {
  let resolve, reject, callback, current;
  let calls = 0, cleaned = 0, applied = 0;
  const pending = new Promise((yes, no) => { resolve = yes; reject = no; });
  const context = vm.createContext({
    navigator: { clipboard: { readText: () => { calls += 1; return pending; } } },
    beginObdScannerImport: () => (current = {}),
    invalidateObdScannerImport: () => { current = null; },
    isCurrentObdScannerImport: operation => current === operation,
    obdScannerText: { focus() {} }, obdImportStatus: { textContent: "prior" },
    applyObdScannerImportText: () => { applied += 1; },
    setTimeout: (fn, ms) => { assert.equal(ms, 30000); callback = fn; return 7; },
    clearTimeout: id => { assert.equal(id, 7); cleaned += 1; }
  });
  vm.runInContext(code, context);
  const task = context.pasteObdScannerImport();
  if (mode === "success") resolve("synthetic text");
  else if (mode === "denied") reject(new Error("private reason"));
  else {
    if (mode === "superseded") current = { newer: true };
    callback();
  }
  await task;
  assert.equal(calls, 1);
  assert.equal(cleaned, 1);
  assert.equal(applied, mode === "success" ? 1 : 0);
  if (mode === "superseded") {
    assert.equal(current.newer, true);
    assert.equal(context.obdImportStatus.textContent, "prior");
  } else assert.equal(current, null);
  if (mode === "timeout" || mode === "denied") assert.match(context.obdImportStatus.textContent, /長押しして貼り付け/);
  if (mode === "timeout") {
    resolve("late synthetic text");
    await Promise.resolve();
    assert.equal(applied, 0);
  }
}
console.log("Clipboard import: bounded wait, late result ignored, no retry, timer cleanup and newer operation retained; no system clipboard used");
