import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { webcrypto } from "node:crypto";
import "./validate-case-export.js";
import "./validate-case-card-markup.js";
import "./validate-case-search.js";
import "./validate-case-privacy-warning.js";
import "./validate-case-draft-exit.js";

const source = fs.readFileSync(new URL("../script.js", import.meta.url), "utf8");
const functions = ["persistCases", "loadCases", "saveCase", "handleCaseDelete", "seedDummyCases", "createDummyCases", "importCasesJson", "findDuplicateCase", "duplicateKey", "normalizeCase", "isCaseRecord", "createCaseId", "createId", "normalizeCode", "runSelfCheck", "buildCasesCsv", "csvCell", "buildCasesBackup", "renderCaseStorageWarning", "reloadSavedCases", "readOptionalBrowserSetting", "writeOptionalBrowserSetting", "clearAllLocalStorage", "showInitialNotice", "exportCasesCsv", "exportCasesJson"];
functions.push("cancelCaseImport", "setCaseImportStatus", "hasUnsavedCaseDraft", "handleCaseDraftBeforeUnload", "syncCaseDraftExitGuard", "syncCaseImportControls");
const code = functions.map((name) => {
  const match = source.match(new RegExp(`function ${name}\\([^)]*\\) \\{[\\s\\S]*?\\r?\\n\\}`));
  assert.ok(match, `Missing application function: ${name}`);
  return match[0];
}).join("\n");
const key = "vehicle-diagnosis-cases-v1";
let checks = 0;
const check = (value, message) => { assert.ok(value, message); checks += 1; };

function client(options = {}) {
  const timestamps = { createdAt: "2026-08-27T00:00:00.000Z", updatedAt: "2026-08-27T00:00:00.000Z" };
  const original = [{ ...timestamps, id: "existing", maker: "TEST", model: "A", symptom: "existing", obdCode: "P0171", finalCause: "confirmed", confirmedFacts: "measured" }];
  const bytes = JSON.stringify(original);
  const store = new Map([[key, bytes]]);
  const calls = { reset: 0, render: 0, similar: 0, ids: 0, quality: 0, operations: [], writes: [], removals: [], alerts: [] };
  let reader;
  const timers = new Map();
  let timerId = 0;
  const context = vm.createContext({
    setTimeout: (callback, ms) => { assert.equal(ms, 30000); timers.set(++timerId, callback); return timerId; },
    clearTimeout: id => timers.delete(id),
    savedCases: original, caseStorageSnapshot: bytes, caseDeleteTargets: new WeakMap(), caseStorageReadError: "", caseImportOperation: null, CASES_KEY: key, APP_VERSION: "test", NO_DATA: "none",
    THEME_KEY: "theme", NOTICE_KEY: "notice", OBD_UI_MODE_KEY: "ui-mode", applyTheme: () => {},
    caseStorageWarning: { hidden: true }, caseStorageWarningText: {},
    noticeModal: { showModal: () => { calls.noticeShown = true; }, close: () => { calls.noticeClosed = true; } },
    sessionStorage: { getItem: () => { if (options.failRead) throw new Error("SecurityError"); return null; } },
    caseDraftBaseline: new Map(), caseDraftExitGuardAttached: false,
    window: { crypto: webcrypto, addEventListener: () => {}, removeEventListener: () => {} }, crypto: webcrypto,
    caseStatus: {}, caseImportStatus: {}, cancelCaseImportButton: { disabled: true }, caseForm: { reset: () => { calls.reset += 1; } },
    document: { getElementById: id => { assert.equal(id, "caseExportStatus"); return {}; } },
    importJsonInput: { value: "selected.json" }, confirm: () => true,
    alert: (message) => { calls.alerts.push(message); },
    collectCaseForm: () => ({ ...timestamps, id: "new", maker: "TEST", model: "B", symptom: "new", obdCode: "P0300", finalCause: "measured" }),
    evaluateCaseQuality: () => ({ blockers: [], issues: [], score: 100 }),
    renderCaseQuality: () => {}, updateCaseQualityPreview: () => { calls.quality += 1; },
    setDefaultCaseDate: () => { calls.ids += 1; }, setNextCaseId: () => { calls.ids += 1; },
    renderCases: () => { calls.render += 1; }, renderSimilarCases: () => { calls.similar += 1; },
    renderOpsResults: (results) => { calls.operations = results; },
    FileReader: class {
      constructor() { if (options.failReader === "construct") throw new Error("private-file-detail"); reader = this; }
      readAsText() { if (options.failReader === "read") throw new Error("private-file-detail"); }
    },
    localStorage: {
      setItem: (name, value) => {
        calls.writes.push(name);
        if (options.failWrite) throw new Error(options.failWrite);
        store.set(name, value);
      },
      getItem: (name) => {
        if (options.failRead) throw new Error("SecurityError");
        if (options.invalidRead && name !== key) return "invalid-json";
        return store.get(name) ?? null;
      },
      removeItem: (name) => {
        calls.removals.push(name);
        if (options.failRemove || options.failRemoveKey === name) throw new Error("SecurityError");
        store.delete(name);
      }
    }
  });
  vm.runInContext(code, context);
  context.caseDeleteTargets.set(removeEvent.target.closest(), original[0]);
  return { context, original, bytes, store, calls, options, timers, getReader: () => reader,
    import: (records) => {
      context.importCasesJson({ target: { files: [{}] } });
      reader.result = typeof records === "string" ? records : JSON.stringify(records);
      reader.onload();
    }
  };
}

const removeButton = { dataset: { deleteCase: "existing" } };
const removeEvent = { target: { closest: () => removeButton } };
for (const action of ["timeout", "cancel", "replace", "success"]) {
  const c = client();
  c.context.importCasesJson({ target: { files: [{}] } });
  assert.equal(c.timers.size, 1, "Case import needs a bounded file read");
  assert.equal(c.context.caseDraftExitGuardAttached, true, 'Pending import must guard exit');
  assert.equal(c.context.cancelCaseImportButton.disabled, false);
  const lateTimeout = [...c.timers.values()][0];
  const pending = c.getReader();
  let aborts = 0;
  pending.abort = () => { aborts++; pending.onabort(); throw new Error("synthetic abort error"); };
  pending.result = JSON.stringify([{ id: "late", model: "late" }]);
  if (action === "timeout") lateTimeout();
  if (action === "cancel") c.context.cancelCaseImport();
  if (action === "replace") c.context.importCasesJson({ target: { files: [{}] } });
  if (action === "success") pending.onload();
  assert.equal(c.timers.size, action === "replace" ? 1 : 0, "Completed/replaced read retained its timer");
  assert.equal(c.context.caseDraftExitGuardAttached, action === 'replace', 'Import completion must release only its exit protection');
  assert.equal(c.context.cancelCaseImportButton.disabled, action !== 'replace');
  const before = JSON.stringify({ stored: c.store.get(key), status: c.context.caseStatus.textContent, writes: c.calls.writes });
  lateTimeout(); pending.onload(); pending.onerror();
  assert.equal(JSON.stringify({ stored: c.store.get(key), status: c.context.caseStatus.textContent, writes: c.calls.writes }), before);
  if (action !== "success") assert.equal(c.store.get(key), c.bytes);
  if (action === "timeout") {
    assert.equal(aborts, 1);
    assert.equal(c.context.importJsonInput.value, "");
    assert.match(c.context.caseImportStatus.textContent, /保存済み事例は変更していません/);
    c.import([{ id: "recovered", model: "recovered" }]);
    assert.ok(c.context.savedCases.some(item => item.id === "recovered"));
  }
}
for (const accepted of [false, true]) {
  const c = client();
  let handler;
  const prompts = [];
  c.context.caseResetButton = { addEventListener: (type, callback) => { check(type === "click", "Reset event changed"); handler = callback; } };
  c.context.confirm = message => { prompts.push(message); return accepted; };
  vm.runInContext(source.slice(source.indexOf('caseResetButton.addEventListener("click"'), source.indexOf('caseSearch.addEventListener("input"')), c.context);
  handler();
  check(prompts.length === 1 && prompts[0].includes("保存済みの事例は削除しません"), "Reset must explain input-only deletion before clearing");
  check(c.calls.reset === Number(accepted) && c.calls.quality === Number(accepted), "Cancelled reset changed form or quality preview");
  check(c.store.get(key) === c.bytes && c.context.savedCases === c.original && c.calls.writes.length === 0, "Form reset changed stored cases");
  check(c.context.caseStatus.textContent.includes(accepted ? "クリアしました" : "キャンセル"), "Reset outcome missing");
}
{
  const c = client({ failRead: true });
  check(!c.context.persistCases([]) && c.calls.writes.length === 0 && c.context.savedCases === c.original, "Denied conflict check permitted a write");
  check(c.context.caseStorageSnapshot === c.bytes, "Failed check changed the last known storage snapshot");
  c.options.failRead = false;
  check(c.context.persistCases([]) && c.context.caseStorageSnapshot === "[]", "Recovery failed to update storage snapshot");
  check(c.context.persistCases(c.original) && c.store.get(key) === c.bytes, "Consecutive successful writes caused a false conflict");
}
for (const replacement of [null, "[]", '{broken', JSON.stringify([{ id: "other-tab", model: "B" }])]) {
  const c = client();
  if (replacement === null) c.store.delete(key);
  else c.store.set(key, replacement);
  check(c.context.persistCases([]) === false, "A stale tab overwrote externally changed cases");
  check((c.store.get(key) ?? null) === replacement && c.context.savedCases === c.original && c.calls.writes.length === 0, "Conflict changed memory or persisted bytes");
  check(c.context.caseStorageReadError && !c.context.caseStorageWarning.hidden, "Conflict warning is missing");
  check(c.calls.similar === 1, "Conflict left prior similar-case suggestions rendered");
  if (replacement === '{broken') continue;
  c.context.reloadSavedCases();
  check(!c.context.caseStorageReadError, "Manual reload failed to release conflict guard");
  c.context.saveCase();
  check(c.context.savedCases.some(item => item.id === "new") && c.calls.reset === 1, "Manual recovery did not permit a new save");
  if (replacement?.includes('other-tab')) check(c.context.savedCases.some(item => item.id === "other-tab"), "Recovery discarded the other tab's case");
}
for (const action of ["clear", "reload"]) {
  for (const lateEvent of ["load", "error", "abort"]) {
    const c = client();
    c.context.importCasesJson({ target: { files: [{}] } });
    const pending = c.getReader();
    pending.result = JSON.stringify([{ id: "obsolete", model: "obsolete" }]);
    pending.abort = () => { pending.onabort(); throw new Error("abort_unavailable"); };
    if (action === "clear") c.context.clearAllLocalStorage();
    else c.context.reloadSavedCases();
    const before = JSON.stringify({ records: c.context.savedCases, stored: c.store.get(key), status: c.context.caseStatus.textContent, operations: c.calls.operations, writes: c.calls.writes.length });
    pending[`on${lateEvent}`]();
    check(JSON.stringify({ records: c.context.savedCases, stored: c.store.get(key), status: c.context.caseStatus.textContent, operations: c.calls.operations, writes: c.calls.writes.length }) === before,
      `${action}: stale ${lateEvent} restored data or replaced the completed action`);
    check(c.context.caseImportOperation === null && c.context.importJsonInput.value === "", `${action}: pending import was not released`);
    c.import([{ id: "fresh", model: "fresh" }]);
    check(c.context.savedCases.some((item) => item.id === "fresh") && !c.context.savedCases.some((item) => item.id === "obsolete"), `${action}: subsequent import did not recover`);
  }
}
for (const lateEvent of ["load", "error", "abort"]) {
  for (const [afterLatest, abortMode] of [false, true].flatMap((after) => ["absent", "synchronous", "throws"].map((mode) => [after, mode]))) {
    const c = client();
    c.context.importCasesJson({ target: { files: [{}] } });
    const oldReader = c.getReader();
    oldReader.result = JSON.stringify([{ id: "old", model: "old" }]);
    if (abortMode !== "absent") oldReader.abort = () => {
      oldReader.onabort();
      if (abortMode === "throws") throw new Error("abort_failed");
    };
    c.context.importCasesJson({ target: { files: [{}] } });
    const latestReader = c.getReader();
    latestReader.result = JSON.stringify([{ id: "latest", model: "latest" }]);
    if (afterLatest) latestReader.onload();
    const before = JSON.stringify({ data: c.context.savedCases, status: c.context.caseStatus.textContent, input: c.context.importJsonInput.value, writes: c.calls.writes.length });
    oldReader[`on${lateEvent}`]();
    check(JSON.stringify({ data: c.context.savedCases, status: c.context.caseStatus.textContent, input: c.context.importJsonInput.value, writes: c.calls.writes.length }) === before,
      `Stale ${lateEvent} changed the latest import or its status`);
    if (!afterLatest) latestReader.onload();
    check(c.context.savedCases.length === 2 && c.context.savedCases.some((item) => item.id === "latest") && !c.context.savedCases.some((item) => item.id === "old"), "Superseded file was imported after reselection");
    check(c.context.caseImportOperation === null, "Completed import retained operation ownership");
  }
}
for (const action of ["decline-first", "decline-second", "clear-failed", "reload-failed"]) {
  const c = client();
  c.context.importCasesJson({ target: { files: [{}] } });
  const pending = c.getReader();
  const owner = c.context.caseImportOperation;
  let confirmations = 0;
  c.context.confirm = () => { confirmations += 1; return action === "decline-first" ? false : action !== "decline-second" || confirmations < 2; };
  if (action === "clear-failed") c.options.failRemove = true;
  if (action === "reload-failed") { c.options.failRead = true; c.context.reloadSavedCases(); }
  else c.context.clearAllLocalStorage();
  check(c.context.caseImportOperation === owner && c.context.savedCases === c.original && c.store.get(key) === c.bytes,
    `${action}: unsuccessful replacement cancelled the pending import or changed data`);
  c.options.failRead = false;
  c.context.caseStorageReadError = "";
  pending.result = JSON.stringify([{ id: "retained", model: "retained" }]);
  pending.onload();
  check(c.context.savedCases.some((item) => item.id === "retained"), `${action}: pending import was silently discarded`);
}
{
  const c = client();
  // Parser exception text varies by engine and may echo the input.
  c.context.JSON = { parse: () => { throw new SyntaxError('Unexpected token in "PRIVATE_INPUT"'); } };
  c.import("invalid");
  check(!c.context.caseStatus.textContent.includes("PRIVATE_INPUT"), "Engine-specific parser message disclosed imported text");
  check(c.store.get(key) === c.bytes && c.calls.writes.length === 0 && c.context.importJsonInput.value === "", "Parser failure must retain storage and release the picker");
}
for (const failure of ["construct", "read", "error", "abort"]) {
  const c = client();
  c.context.importCasesJson({ target: { files: [{}] } });
  const oldReader = c.getReader();
  oldReader.result = JSON.stringify([{ id: "old", model: "old" }]);
  c.options.failReader = failure;
  c.context.importCasesJson({ target: { files: [{}] } });
  if (failure === "error" || failure === "abort") c.getReader()[`on${failure}`]();
  const status = c.context.caseStatus.textContent;
  oldReader.onload();
  check(c.context.savedCases === c.original && c.store.get(key) === c.bytes && c.calls.writes.length === 0, "Failed reselection restored an obsolete import");
  check(c.context.caseStatus.textContent === status && c.context.caseImportOperation === null, "Stale completion replaced the latest failure");
}
{
  const c = client();
  c.import("private-file-detail is not JSON");
  check(c.context.caseStatus.textContent.includes("JSONインポート失敗") && !c.context.caseStatus.textContent.includes("private-file-detail"), "Malformed JSON error disclosed input contents");
  check(c.store.get(key) === c.bytes && c.calls.writes.length === 0 && c.context.importJsonInput.value === "", "Malformed JSON changed storage or prevented retry");
}
for (const failure of ["construct", "read", "error", "abort"]) {
  const c = client({ failReader: failure });
  c.context.caseStatus.textContent = "以前のインポート完了";
  assert.doesNotThrow(() => c.context.importCasesJson({ target: { files: [{}] } }));
  if (failure === "error") c.getReader().onerror?.();
  if (failure === "abort") c.getReader().onabort?.();
  check(c.context.caseStatus.textContent.includes("JSONインポート失敗"), `${failure}: file failure left stale success status`);
  check(c.context.caseImportStatus.textContent === c.context.caseStatus.textContent, `${failure}: data-management status differs from the registration status`);
  check(c.context.importJsonInput.value === "", `${failure}: same file cannot be selected again`);
  check(c.context.savedCases === c.original && c.store.get(key) === c.bytes && c.calls.writes.length === 0, `${failure}: read failure modified stored cases`);
  check(!c.context.caseStatus.textContent.includes("private-file-detail"), `${failure}: raw error details leaked`);
  c.options.failReader = false;
  c.import([{ id: "retry", model: "B", symptom: "retry" }]);
  check(c.context.savedCases.length === 2 && c.context.caseStatus.textContent.includes("インポート完了"), `${failure}: retry did not recover`);
}
for (const failure of ["QuotaExceededError", "SecurityError"]) {
  for (const action of ["save", "delete", "seed", "import"]) {
    const c = client({ failWrite: failure });
    const run = () => {
      if (action === "save") c.context.saveCase();
      if (action === "delete") c.context.handleCaseDelete(removeEvent);
      if (action === "seed") c.context.seedDummyCases();
      if (action === "import") c.import([{ id: "new", model: "B", symptom: "new", obdCode: "P0300" }]);
    };
    run();
    check(c.context.savedCases === c.original && JSON.stringify(c.original) === c.bytes && c.store.get(key) === c.bytes, `${action}: failed write changed existing records`);
    check(c.calls.reset === 0 && c.calls.render === 0 && c.calls.similar === 0 && c.calls.ids === 0, `${action}: failed write reset input or changed displayed records`);
    check(c.context.caseStatus.textContent.includes("保存に失敗"), `${action}: missing failure status`);
    if (action === "import") check(c.context.caseImportStatus.textContent === c.context.caseStatus.textContent, "Import persistence failure was hidden from data management");
    check(c.calls.alerts.length === 1 && c.calls.alerts[0] === c.context.caseStatus.textContent, `${action}: failure was hidden in another tab`);
    c.options.failWrite = false;
    run();
    const expected = action === "delete" ? 0 : action === "seed" ? 6 : 2;
    check(c.context.savedCases.length === expected && JSON.parse(c.store.get(key)).length === expected, `${action}: retry duplicated or lost records`);
    check(JSON.stringify(c.context.loadCases()) === JSON.stringify(c.context.savedCases.map(c.context.normalizeCase)), `${action}: reload did not preserve the stored case values`);
  }
}

{
  const c = client();
  const candidate = [c.original[0], { id: "circular" }];
  candidate[1].self = candidate;
  check(c.context.persistCases(candidate) === false && c.context.savedCases === c.original && c.store.get(key) === c.bytes && c.calls.writes.length === 0, "Serialization failure changed storage or memory");
}

{
  const c = client();
  c.context.confirm = () => false;
  c.context.saveCase();
  c.context.handleCaseDelete(removeEvent);
  check(c.context.savedCases === c.original && c.calls.writes.length === 0 && c.calls.reset === 0, "Cancelled changes reached storage");
  const normalize = c.context.normalizeCase;
  c.context.normalizeCase = (record) => {
    if (record.id === "broken") throw new Error("normalization_failed");
    return normalize(record);
  };
  c.import([{ id: "first", model: "B" }, { id: "broken", model: "C" }]);
  check(c.context.savedCases === c.original && c.store.get(key) === c.bytes && c.calls.writes.length === 0, "Later import failure retained an earlier partial addition");
  check(c.context.importJsonInput.value === "" && c.context.caseStatus.textContent.includes("JSONインポート失敗"), "Failed import did not allow selecting the same file again");
}

{
  const c = client();
  const first = { id: "first", maker: "TEST", model: "B", symptom: "new", obdCode: "P0300", finalCause: "measured" };
  const second = { id: "second", maker: "TEST", model: "C", symptom: "other", obdCode: "P0420" };
  c.import({ records: [c.original[0], first, { ...first, id: "same-content" }, { ...second, id: "first" }, second, null] });
  check(c.context.savedCases.map((item) => item.id).join(",") === "existing,first,second", "Import order or within-batch deduplication changed");
  check(c.context.caseStatus.textContent.includes("追加 2件 / 重複スキップ 3件 / 不正行スキップ 1件"), "Import counts changed");
  check(c.context.importJsonInput.value === "", "Import selection was not reset for retry");
  const before = c.context.savedCases;
  const stored = c.store.get(key);
  c.import("{invalid");
  check(c.context.savedCases === before && c.store.get(key) === stored, "Malformed import partially replaced stored cases");
  const backup = c.context.buildCasesBackup();
  const reloaded = client();
  reloaded.import(JSON.parse(JSON.stringify(backup)));
  check(reloaded.context.savedCases.map((item) => item.id).join(",") === "existing,first,second" && backup.schemaVersion === 2, "JSON backup round-trip changed records or schema");
}

{
  const c = client();
  const fixtures = c.context.createDummyCases();
  c.context.createDummyCases = () => [fixtures[0], { ...fixtures[0], id: "duplicate-content" }, fixtures[1], { ...fixtures[2], id: fixtures[1].id }];
  c.context.seedDummyCases();
  check(c.context.savedCases.map((item) => item.id).join(",") === `${fixtures[1].id},${fixtures[0].id},existing`, "Seed order or within-batch duplicates changed");
}

for (const options of [{}, { failWrite: "QuotaExceededError" }, { failRead: true }, { invalidRead: true }, { failRemove: true }]) {
  const c = client(options);
  c.context.runSelfCheck();
  check(c.context.savedCases === c.original && JSON.stringify(c.original) === c.bytes && c.store.get(key) === c.bytes, "Self-check modified real records");
  check(!c.calls.writes.includes(key) && !c.calls.removals.includes(key) && c.calls.writes.every((name) => name.startsWith(`${key}:selftest:`)), "Self-check used the production case key");
  check(c.calls.removals.length === 1 && (options.failRemove || c.store.size === 1), "Temporary storage cleanup was not attempted");
  check(c.calls.operations.some((line) => line.includes(options.failRemove ? "削除: NG" : "削除: OK")), "Self-check cleanup outcome was misreported");
  check(c.calls.operations.some((line) => line.includes(options.failWrite || options.failRead || options.invalidRead ? "再読込チェック: NG" : "再読込チェック: OK")), "Self-check storage outcome was misreported");
  check(c.calls.operations.some((line) => line === "CSV出力チェック: OK") && c.calls.operations.some((line) => line === "JSONバックアップチェック: OK"), "Self-check did not test candidate exports");
}

for (const stored of ["", "{broken", "null", "{}", '[{"id":"valid"},null]', '[{"id":"valid"},42]']) {
  const c = client();
  c.store.set(key, stored);
  c.context.reloadSavedCases();
  check(c.context.savedCases === c.original && c.context.caseStorageReadError && !c.context.caseStorageWarning.hidden, "Malformed storage replaced memory or hid its warning");
  check(c.calls.similar === 1, "Failed reload left prior similar-case suggestions rendered");
  for (const run of [() => c.context.saveCase(), () => c.context.handleCaseDelete(removeEvent), () => c.context.seedDummyCases(), () => c.import([{ id: "new", model: "new" }]), () => c.context.exportCasesCsv(), () => c.context.exportCasesJson()]) run();
  check(c.store.get(key) === stored && c.calls.writes.length === 0 && c.context.savedCases === c.original && c.calls.reset === 0, "Unresolved storage failure allowed a mutation or reset the form");
  check(c.calls.alerts.length === 6, "Blocked mutation or export was not reported");
  c.context.reloadSavedCases();
  check(c.store.get(key) === stored && c.context.savedCases === c.original, "Repeated failed retry damaged existing data");
  c.store.set(key, c.bytes);
  c.context.reloadSavedCases();
  check(!c.context.caseStorageReadError && c.context.caseStorageWarning.hidden && c.context.savedCases[0].id === "existing", "Restored storage could not be reloaded");
  c.context.saveCase();
  check(JSON.parse(c.store.get(key)).map((item) => item.id).join(",") === "new,existing", "Recovered storage remained locked or lost existing records");
}

{
  const c = client({ failRead: true });
  c.context.reloadSavedCases();
  check(c.context.savedCases === c.original && c.context.caseStorageReadError && c.store.get(key) === c.bytes, "Denied reads cleared memory or storage");
  c.context.runSelfCheck();
  check(c.context.caseStorageReadError && !c.context.persistCases([]) && c.store.get(key) === c.bytes, "Temporary self-check cleared the unresolved read guard");
  c.options.failRead = false;
  c.context.reloadSavedCases();
  check(!c.context.caseStorageReadError, "Read permission recovery did not clear the guard");
  const normalize = c.context.normalizeCase;
  const previous = c.context.savedCases;
  c.context.normalizeCase = () => { throw new Error("normalization_failed"); };
  c.context.reloadSavedCases();
  check(c.context.savedCases === previous && c.context.caseStorageReadError && c.store.get(key) === c.bytes, "Normalization failure partially replaced records");
  c.context.normalizeCase = normalize;
}

for (const stored of [null, "[]"]) {
  const c = client();
  if (stored === null) c.store.delete(key); else c.store.set(key, stored);
  c.context.reloadSavedCases();
  check(c.context.savedCases.length === 0 && !c.context.caseStorageReadError && c.calls.writes.length === 0, "Absent or genuinely empty storage was rejected or rewritten");
}

for (const failRemoveKey of [key, "theme", "notice", "ui-mode", null]) {
  const c = client({ failRemoveKey });
  c.context.caseStorageReadError = "unresolved";
  c.context.clearAllLocalStorage();
  if (failRemoveKey === key) {
    check(c.context.savedCases === c.original && c.context.caseStorageReadError === "unresolved" && c.store.get(key) === c.bytes, "Failed clear discarded memory or protection");
    check(c.calls.removals.length === 1 && c.calls.operations[0].includes("削除できません"), "Failed case removal continued deleting settings or reported success");
  } else {
    check(c.context.savedCases.length === 0 && !c.context.caseStorageReadError && !c.store.has(key), "Successful case deletion retained old records or the guard");
    check(c.calls.operations[0].includes(failRemoveKey ? "一部失敗" : "全削除: OK"), "Partial settings deletion was misreported");
    c.context.saveCase();
    check(JSON.parse(c.store.get(key)).map((item) => item.id).join(",") === "new", "Later save resurrected cleared cases");
  }
}

for (const deniedProperty of [false, true]) {
  const c = client({ failRead: true, failWrite: "SecurityError" });
  if (deniedProperty) {
    for (const area of ["localStorage", "sessionStorage"]) Object.defineProperty(c.context, area, { get: () => { throw new Error("Storage property denied"); }, configurable: true });
  }
  Object.assign(c.context, { fallbackData: {}, OBD_ACCESS_MODE_KEY: "access", OBD_DEV_MODE_KEY: "dev" });
  vm.runInContext(source.slice(source.indexOf("let dataStore = fallbackData;"), source.indexOf("const ELM327_CONNECTION_STATES")), c.context);
  check(vm.runInContext("savedCases.length === 0 && Boolean(caseStorageReadError) && !obdAccessUnlocked && !obdDevModeUnlocked", c.context), "Startup read failure threw, lost its warning, or unlocked a gate");
  let loaded = false;
  let offlineRegistered = false;
  let theme;
  Object.assign(c.context, {
    APP_LAST_UPDATED: "test", appVersion: {}, lastUpdated: {},
    applyTheme: (value) => { theme = value; }, loadData: () => { loaded = true; },
    renderObdUiMode: () => {}, initializeLaunchView: () => {},
    registerOfflineCache: () => { offlineRegistered = true; }, updateAiButtonLabel: () => {},
    renderCases: () => c.context.renderCaseStorageWarning()
  });
  vm.runInContext(source.slice(source.indexOf("appVersion.textContent = APP_VERSION;"), source.indexOf('form.addEventListener("submit"')), c.context);
  check(loaded && offlineRegistered && theme === "light" && c.calls.noticeShown && !c.context.caseStorageWarning.hidden, "Storage failure prevented data initialization, notice, or warning");
  let acknowledge;
  let retry;
  c.context.noticeCloseButton = { addEventListener: (event, callback) => { acknowledge = callback; } };
  c.context.retryCaseStorageButton = { addEventListener: (event, callback) => { retry = callback; } };
  vm.runInContext(source.slice(source.indexOf('noticeCloseButton.addEventListener("click"'), source.indexOf('mobileGptOpenButton.addEventListener("click"')), c.context);
  acknowledge();
  check(c.calls.noticeClosed && typeof retry === "function", "Unavailable storage trapped the user in the notice or left retry unwired");
}

const index = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
{
  const c = client();
  c.context.cancelCaseImportButton = null;
  const binding = source.split(/\r?\n/).find(line => line.startsWith('cancelCaseImportButton'));
  assert.ok(binding, 'Missing optional cancel control binding');
  assert.doesNotThrow(() => vm.runInContext(binding, c.context), 'Older HTML without the optional cancel control must still initialize');
  assert.doesNotThrow(() => c.import([{ id: 'legacy-shell', model: 'legacy-shell' }]), 'Older HTML must still import cases');
  assert.ok(c.context.savedCases.some(item => item.id === 'legacy-shell'));
}
{
  const c = client();
  c.context.savedCases = [];
  c.context.caseStorageReadError = "unread";
  c.context.caseSearch = { value: "" };
  c.context.caseList = {};
  let emptyText;
  c.context.renderCaseCards = (container, cases, text) => { emptyText = text; };
  vm.runInContext(source.match(/function renderCases\(\) \{[\s\S]*?\r?\n\}/)[0], c.context);
  c.context.renderCases();
  check(c.context.caseStatus.textContent === "unread" && emptyText.includes("読み込めていません"), "Unread cases were presented as a confirmed empty list");
  c.context.caseSearch.value = "search";
  c.context.renderCases();
  check(c.context.caseStatus.textContent === "unread", "Searching replaced the unresolved read error with counts");
  c.context.caseStorageReadError = "";
  c.context.renderCases();
  check(c.context.caseStatus.textContent.includes("検索結果: 0件"), "Successful recovery did not restore result counts");
}
{
  const c = client();
  c.store.set("theme", "dark");
  c.store.set("notice", "accepted");
  c.context.sessionStorage.getItem = () => "enabled";
  check(c.context.readOptionalBrowserSetting("theme") === "dark" && c.context.readOptionalBrowserSetting("access", true) === "enabled", "Readable preferences or session flags were discarded");
  c.context.showInitialNotice();
  check(!c.calls.noticeShown, "Readable notice acknowledgement was ignored");
  c.context.writeOptionalBrowserSetting("theme", "light");
  check(c.store.get("theme") === "light", "Optional settings no longer persist when available");
}
check(index.indexOf('id="caseStorageWarning"') < index.indexOf('id="diagnosis-panel"') && index.includes('id="caseStorageWarningText" class="data-status error" role="alert"') && index.includes('id="retryCaseStorageButton" class="secondary-button"'), "Storage warning is hidden in a tab or lacks accessible recovery controls");
{
  const c = client();
  const records = Array.from({ length: 300 }, (_, i) => ({ id: `bulk-${i}`, model: `model-${i}`, symptom: `symptom-${i}` }));
  let keyCalls = 0;
  const originalKey = c.context.duplicateKey;
  c.context.duplicateKey = item => { keyCalls++; return originalKey(item); };
  c.import(records);
  check(c.context.savedCases.length === 301 && c.calls.writes.length === 1, "Bulk import must save all unique cases once");
  check(keyCalls <= 301, `Bulk duplicate matching rescanned the entire list (${keyCalls} key calls)`);
}
for (let seed = 0; seed < 12; seed++) {
  const c = client();
  const timestamp = "2026-09-08T00:00:00.000Z";
  const records = Array.from({ length: 80 }, (_, i) => ({
    id: i % 13 === 0 ? "existing" : i % 9 === 0 ? (i % 18 ? 1 : "1") : `batch-${(i + seed) % 41}`,
    maker: i % 3 ? "TEST" : " test ", model: `m-${(i + seed) % 19}`,
    symptom: `s-${i % 7}`, obdCode: "p0300", createdAt: timestamp, updatedAt: timestamp
  }));
  records.push(null, [], "bad", {}, records[0]);
  const expected = [...c.original];
  let added = 0, skipped = 0, invalid = 0;
  // Independent legacy algorithm: preserve its first accepted record and order.
  for (const item of records) {
    if (!c.context.isCaseRecord(item)) { invalid++; continue; }
    const record = c.context.normalizeCase(item);
    if (c.context.findDuplicateCase(record, expected) || expected.some(item => item.id === record.id)) { skipped++; continue; }
    expected.push(record); added++;
  }
  c.import(records);
  check(JSON.stringify(c.context.savedCases) === JSON.stringify(expected), `Batch ${seed}: indexed matching changed legacy records or order`);
  check(c.context.caseStatus.textContent === `JSONインポート完了: 追加 ${added}件 / 重複スキップ ${skipped}件 / 不正行スキップ ${invalid}件`, `Batch ${seed}: counts changed`);
}
console.log(`Case storage checks: ${checks} / Errors: 0`);
