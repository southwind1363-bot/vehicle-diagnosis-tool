import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync(new URL("../script.js", import.meta.url), "utf8");
const code = source.match(/function renderCases\(\) \{[\s\S]*?\r?\n\}/)[0];
const records = [
  { id: "CASE-101", model: "プリウス", symptom: "アイドル不調", obdCode: "P0171", work: "吸気ダクト交換", replacedParts: "ダクト", memo: "温間で確認", measurements: "燃料補正 +18%", engine: "2ZR-FXE", year: "2018", mileage: "85000", technician: "試験整備士" },
  { id: 202, model: "フィット", symptom: "アイドル不調", obdCode: "P0300" }
];
const before = JSON.stringify(records);
let result, empty;
const context = vm.createContext({
  savedCases: records, caseStorageReadError: "", caseSearch: { value: "" }, caseStatus: {}, caseList: {},
  renderCaseStorageWarning() {}, renderCaseCards(_container, items, text) { result = Array.from(items); empty = text; }
});
vm.runInContext(code, context);
let checks = 0;
for (const [query, expected] of [
  ["プリウス P0171 アイドル", [records[0]]], [" p0171　プリウス ", [records[0]]],
  ["CASE-101", [records[0]]], ["202", [records[1]]], ["ダクト 温間", [records[0]]],
  ["燃料補正 +18%", [records[0]]], ["2zr-fxe 2018", [records[0]]],
  ["85000 試験整備士", [records[0]]], ["フィット +18%", []],
  ["アイドル", records], ["P0171 フィット", []], ["", records], ["　 ", records]
]) {
  context.caseSearch.value = query;
  context.renderCases();
  assert.deepEqual(result, expected, query);
  assert.equal(JSON.stringify(records), before);
  checks += 2;
}
context.caseSearch.value = "一致しない";
context.renderCases();
assert.match(empty, /検索条件に一致/);
assert.match(context.caseStatus.textContent, /検索結果: 0件 \/ 保存件数: 2件/);
context.savedCases = [];
context.renderCases();
assert.match(empty, /保存済み事例はまだありません/);
context.caseStorageReadError = "read failed";
context.renderCases();
assert.match(empty, /読み込めていません/);
assert.equal(context.caseStatus.textContent, "read failed");
console.log(`Case search checks: ${checks + 5} / Errors: 0`);
