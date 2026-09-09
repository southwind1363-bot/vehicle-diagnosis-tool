import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync(new URL("../script.js", import.meta.url), "utf8");
const csvContext = vm.createContext({});
vm.runInContext(["csvCell", "buildCasesCsv"].map(name => source.match(new RegExp(`function ${name}\\([^)]*\\) \\{[\\s\\S]*?\\r?\\n\\}`))[0]).join("\n"), csvContext);
for (const prefix of ["=", "+", "-", "@", "＝", "＋", "－", "＠"]) {
  for (const whitespace of ["", " ", "\t", "\r\n", "\uFEFF", "\u0000"]) {
    const input = `${whitespace}${prefix}1+1`;
    assert.equal(csvContext.csvCell(input), `"\t${input}"`, "Formula-like CSV cells need an Excel text prefix");
  }
}
for (const input of ["P0300", "普通のメモ", "1+1", "説明 =1+1", '引用符"と,改行\nの検査', "", null, undefined]) {
  assert.equal(csvContext.csvCell(input), `"${String(input ?? "").replace(/"/g, '""')}"`, "Ordinary CSV escaping changed");
}
const formulaRecords = [{ id: "csv-formula", memo: '=1+1",ordinary', measurements: "-12", sources: "https://example.invalid" }];
const formulaSnapshot = JSON.stringify(formulaRecords);
const formulaCsv = csvContext.buildCasesCsv(formulaRecords);
assert.ok(formulaCsv.includes('"\t=1+1"",ordinary"') && formulaCsv.includes('"\t-12"'));
assert.equal(JSON.stringify(formulaRecords), formulaSnapshot, "CSV mitigation mutated saved records");
console.log("Case CSV formula mitigation: 48 prefixes, ordinary quoting and source immutability passed; no spreadsheet execution");
const code = source.match(/function exportCasesJson\(\) \{[\s\S]*?\r?\n\}/)[0];
let checks = 0;
for (const failure of ["none", "blocked", "build", "serialize", "blob", "element", "url", "append", "click"]) {
  const records = [{ id: "synthetic", memo: "unchanged" }];
  const before = JSON.stringify(records);
  const status = { textContent: "以前の保存を開始しました。" };
  const calls = { clicks: 0, removes: 0, attached: 0, blobs: [], revoked: [], timers: [], alerts: [] };
  const fail = stage => { if (failure === stage) throw new Error("private detail"); };
  const context = {
    CASES_KEY: "cases", caseStorageSnapshot: before, localStorage: { getItem: () => before },
    caseStorageReadError: failure === "blocked" ? "storage unavailable" : "",
    alert: text => calls.alerts.push(text),
    buildCasesBackup: () => { fail("build"); const backup = { schemaVersion: 2, records }; if (failure === "serialize") backup.self = backup; return backup; },
    Blob: class extends Blob { constructor(parts, options) { fail("blob"); super(parts, options); } },
    document: {
      getElementById: id => { assert.equal(id, "caseExportStatus"); return status; },
      createElement: () => { fail("element"); return { click() { fail("click"); calls.clicks++; }, remove() { calls.removes++; } }; },
      body: { appendChild: link => { assert.equal(link.hidden, true); fail("append"); calls.attached++; } }
    },
    URL: { createObjectURL: blob => { fail("url"); calls.blobs.push(blob); return "blob:synthetic"; }, revokeObjectURL: url => calls.revoked.push(url) },
    setTimeout: fn => calls.timers.push(fn)
  };
  vm.createContext(context);
  vm.runInContext(code, context);
  const result = context.exportCasesJson();
  assert.equal(result, failure === "none" ? true : failure === "blocked" ? undefined : false);
  assert.equal(calls.clicks, failure === "none" ? 1 : 0);
  assert.equal(JSON.stringify(records), before);
  assert.equal(calls.revoked.length, 0, "URL must not be revoked during the download click");
  calls.timers.forEach(fn => fn());
  assert.equal(calls.revoked.length, calls.blobs.length);
  assert.equal(calls.removes, ["none", "url", "append", "click"].includes(failure) ? 1 : 0);
  assert.equal(JSON.stringify(status).includes("private detail"), false);
  if (failure === "none") {
    assert.deepEqual(JSON.parse(await calls.blobs[0].text()), { schemaVersion: 2, records });
    assert.match(status.textContent, /1件.*開始しました.*保存完了はブラウザー/);
  } else if (failure === "blocked") assert.match(status.textContent, /開始しませんでした.*保存事例を再読込/);
  else assert.match(status.textContent, /開始できません.*変更していません/);
  checks += 7 + (failure === "none" ? 2 : failure === "blocked" ? 0 : 1);
}
console.log(`Case JSON export checks: ${checks} / Errors: 0`);

const csvCode = source.match(/function exportCasesCsv\(\) \{[\s\S]*?\r?\n\}/)[0];
let csvChecks = 0;
for (const failure of ["none", "blocked", "empty", "build", "blob", "element", "url", "append", "click"]) {
  const records = failure === "empty" ? [] : [{ id: "synthetic", memo: "unchanged" }];
  const before = JSON.stringify(records);
  const status = { textContent: "以前の保存を開始しました。" };
  const calls = { clicks: 0, removed: 0, blobs: [], timers: [], revoked: [], alerts: [] };
  let stage = failure;
  const fail = name => { if (stage === name) throw new Error("private CSV detail"); };
  const context = vm.createContext({
    CASES_KEY: "cases", caseStorageSnapshot: before, localStorage: { getItem: () => before },
    savedCases: records, caseStorageReadError: failure === "blocked" ? "unavailable" : "",
    alert: text => calls.alerts.push(text), buildCasesCsv: () => { fail("build"); return 'ID,メモ\r\nsynthetic,"unchanged"'; },
    Blob: class extends Blob { constructor(parts, options) { fail("blob"); super(parts, options); } },
    document: {
      getElementById: () => status,
      createElement: () => { fail("element"); return { click() { fail("click"); calls.clicks++; }, remove() { calls.removed++; } }; },
      body: { appendChild(link) { assert.equal(link.hidden, true); fail("append"); } }
    },
    URL: { createObjectURL(blob) { fail("url"); calls.blobs.push(blob); return "blob:csv"; }, revokeObjectURL: url => calls.revoked.push(url) },
    setTimeout: fn => calls.timers.push(fn)
  });
  vm.runInContext(csvCode, context);
  assert.doesNotThrow(() => context.exportCasesCsv(), failure);
  assert.equal(JSON.stringify(records), before);
  assert.equal(calls.clicks, failure === "none" ? 1 : 0);
  assert.equal(calls.revoked.length, 0);
  calls.timers.splice(0).forEach(fn => fn());
  assert.equal(calls.revoked.length, calls.blobs.length);
  assert.equal(calls.removed, ["none", "url", "append", "click"].includes(failure) ? 1 : 0);
  assert.equal(JSON.stringify(status).includes("private CSV detail"), false);
  csvChecks += 7;
  if (failure === "none") {
    assert.deepEqual(Array.from(new Uint8Array(await calls.blobs[0].arrayBuffer()).slice(0, 3)), [239, 187, 191]);
    assert.match(status.textContent, /1件.*CSV.*開始しました.*保存完了はブラウザー/);
    csvChecks += 2;
  } else if (failure === "blocked") assert.match(status.textContent, /開始しませんでした.*保存事例を再読込/);
  else if (failure === "empty") assert.match(status.textContent, /開始しませんでした.*事例がありません/);
  else {
    assert.match(status.textContent, /開始できません.*変更していません/);
    stage = "none";
    assert.equal(context.exportCasesCsv(), true, "Retry should recover");
    assert.equal(calls.clicks, 1);
    csvChecks += 3;
  }
}
console.log(`Case CSV export checks: ${csvChecks} / Errors: 0`);

for (const format of ["Json", "Csv"]) {
  for (const external of ['[{"id":"new"}]', null, "unreadable"]) {
    const records = [{ id: "original" }], snapshot = JSON.stringify(records);
    const status = {};
    let stored = external, clicks = 0;
    const context = vm.createContext({
      CASES_KEY: "cases", caseStorageSnapshot: snapshot, savedCases: records, caseStorageReadError: "",
      localStorage: { getItem(key) { assert.equal(key, "cases"); if (stored === "unreadable") throw new Error("PRIVATE_READ_FAILURE"); return stored; } },
      buildCasesBackup: () => ({ records }), buildCasesCsv: () => 'id\noriginal', Blob,
      document: { getElementById: () => status, createElement: () => ({ click() { clicks++; }, remove() {} }), body: { appendChild() {} } },
      URL: { createObjectURL: () => "blob:test", revokeObjectURL() {} }, setTimeout: fn => fn(), alert() {}
    });
    vm.runInContext(format === "Json" ? code : csvCode, context);
    assert.equal(context['exportCases' + format](), false);
    assert.equal(clicks, 0);
    assert.equal(JSON.stringify(records), snapshot);
    assert.equal(stored, external);
    assert.equal(status.textContent.includes("PRIVATE_READ_FAILURE"), false);
    if (external !== "unreadable") assert.match(status.textContent, /保存事例を再読込/);
    stored = snapshot; // A matching freshly read snapshot permits manual export again.
    assert.equal(context['exportCases' + format](), true);
    assert.equal(clicks, 1);
  }
}
console.log("Case export snapshot: external update/removal/read failure block stale downloads; matching snapshot recovers");
