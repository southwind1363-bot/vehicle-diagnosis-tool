import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync(new URL("../script.js", import.meta.url), "utf8");
const names = ["invalidateObdScannerImport", "beginObdScannerImport", "isCurrentObdScannerImport", "importObdScannerFile"];
const code = names.map(name => {
  const match = source.match(new RegExp(`function ${name}\\([^)]*\\) \\{[\\s\\S]*?\\r?\\n\\}`));
  assert.ok(match, name);
  return match[0];
}).join("\n");
for (const throws of [false, true]) {
  const readers = [], applied = [];
  const timers = new Map();
  let timerId = 0;
  const session = { retained: true };
  const client = vm.createContext({
    obdScannerImportOperation: null, obdScannerText: { value: "original" }, obdDevSession: { lastSession: session },
    obdImportStatus: { textContent: "original status" }, window: {}, renderObdSessionExportControls() {},
    normalizeObdScannerImportFileText: value => value, applyObdScannerImportText: value => applied.push(value),
    setTimeout(fn, ms) { assert.equal(ms, 30000); timers.set(++timerId, fn); return timerId; },
    clearTimeout(id) { timers.delete(id); },
    FileReader: class {
      constructor() { this.readyState = 0; this.aborts = 0; readers.push(this); }
      readAsText() { this.readyState = 1; }
      abort() { this.aborts++; this.readyState = 2; this.onabort(); if (throws) throw new Error("synthetic abort error"); }
    }
  });
  vm.runInContext(code, client);
  const input = () => ({ value: "file", files: [{ name: "result.txt", size: 10, type: "text/plain" }] });
  const selectedInput = input();
  client.importObdScannerFile({ currentTarget: selectedInput });
  assert.equal(timers.size, 1, "File reading must have a bounded wait");
  const oldTimeout = [...timers.values()][0];
  const first = readers[0];
  const nextInput = input();
  client.importObdScannerFile({ currentTarget: nextInput });
  oldTimeout();
  assert.equal(timers.size, 1, "Stale timeout affected the newer import");
  assert.equal(first.aborts, 1, "Replacement must stop the previous file read");
  assert.equal(selectedInput.value, "");
  assert.equal(nextInput.value, "file", "Old cancellation cleared another input");
  assert.equal(client.obdImportStatus.textContent, "original status", "Synchronous abort replaced current status");
  first.result = "obsolete";
  first.onload(); first.onerror();
  assert.deepEqual(applied, []);
  client.invalidateObdScannerImport();
  assert.equal(timers.size, 0, "Cancellation retained its timeout");
  assert.equal(nextInput.value, "", "Cancelled file selection must be cleared for same-file retry");
  assert.equal(readers[1].aborts, 1, "Explicit invalidation must stop a pending read");
  assert.equal(client.obdScannerImportOperation, null);
  assert.equal(client.obdDevSession.lastSession, session);
  client.importObdScannerFile({ currentTarget: input() });
  const completed = readers[2];
  completed.readyState = 2; completed.result = "new"; completed.onload();
  assert.equal(completed.aborts, 0, "Completed reads must not be aborted");
  assert.deepEqual(applied, ["new"]);
  assert.equal(client.obdScannerImportOperation, null);
  client.beginObdScannerImport(); // Clipboard operation has no FileReader.
  client.invalidateObdScannerImport();
  assert.equal(client.obdScannerImportOperation, null);
  const stalledInput = input();
  client.importObdScannerFile({ currentTarget: stalledInput });
  const stalledReader = readers.at(-1);
  [...timers.values()][0]();
  assert.equal(stalledReader.aborts, 1);
  assert.equal(stalledInput.value, "");
  assert.equal(timers.size, 0);
  assert.equal(client.obdScannerImportOperation, null);
  assert.equal(client.obdDevSession.lastSession, session);
  assert.match(client.obdImportStatus.textContent, /ファイルを読めませんでした/);
  stalledReader.result = "late"; stalledReader.onload();
  assert.deepEqual(applied, ["new"]);
}
console.log("Scanner file cancellation: replacement, invalidation, synchronous/throwing abort, late callbacks and recovery passed");
