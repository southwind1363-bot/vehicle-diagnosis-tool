import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { webcrypto } from "node:crypto";

const source = fs.readFileSync(new URL("../script.js", import.meta.url), "utf8");
const functions = ["persistCases", "loadCases", "saveCase", "handleCaseDelete", "seedDummyCases", "createDummyCases", "importCasesJson", "findDuplicateCase", "duplicateKey", "normalizeCase", "isCaseRecord", "createCaseId", "createId", "normalizeCode", "runSelfCheck", "buildCasesCsv", "csvCell", "buildCasesBackup"];
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
  const context = vm.createContext({
    savedCases: original, CASES_KEY: key, APP_VERSION: "test", NO_DATA: "none",
    window: { crypto: webcrypto }, crypto: webcrypto,
    caseStatus: {}, caseForm: { reset: () => { calls.reset += 1; } },
    importJsonInput: { value: "selected.json" }, confirm: () => true,
    alert: (message) => { calls.alerts.push(message); },
    collectCaseForm: () => ({ ...timestamps, id: "new", maker: "TEST", model: "B", symptom: "new", obdCode: "P0300", finalCause: "measured" }),
    evaluateCaseQuality: () => ({ blockers: [], issues: [], score: 100 }),
    renderCaseQuality: () => {}, updateCaseQualityPreview: () => { calls.quality += 1; },
    setDefaultCaseDate: () => { calls.ids += 1; }, setNextCaseId: () => { calls.ids += 1; },
    renderCases: () => { calls.render += 1; }, renderSimilarCases: () => { calls.similar += 1; },
    renderOpsResults: (results) => { calls.operations = results; },
    FileReader: class { constructor() { reader = this; } readAsText() {} },
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
        if (options.failRemove) throw new Error("SecurityError");
        store.delete(name);
      }
    }
  });
  vm.runInContext(code, context);
  return { context, original, bytes, store, calls, options,
    import: (records) => {
      context.importCasesJson({ target: { files: [{}] } });
      reader.result = typeof records === "string" ? records : JSON.stringify(records);
      reader.onload();
    }
  };
}

const removeEvent = { target: { closest: () => ({ dataset: { deleteCase: "existing" } }) } };
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

console.log(`Case storage checks: ${checks} / Errors: 0`);
