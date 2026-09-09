import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync(new URL("../script.js", import.meta.url), "utf8");
const context = vm.createContext({});
vm.runInContext(source.match(/function containsPersonalInfoRisk\(record\) \{[\s\S]*?\r?\n\}/)?.[0]
  || assert.fail("Missing case privacy warning"), context);
let checks = 0;
// Artificial examples only; no customer records or real contact details.
for (const field of ["symptom", "confirmedFacts", "memo", "sources"]) {
  for (const text of ["電話 000-0000-0000", "00000000000", "なにわ 300 あ 0000"]) {
    const record = Object.freeze({ [field]: text });
    assert.equal(context.containsPersonalInfoRisk(record), true, `${field}: missed synthetic identifier`);
    assert.equal(record[field], text);
    checks += 2;
  }
}
for (const text of ["", "P0300 / P0420", "回転数 1500 rpm / 電圧 12.6 V", "連絡先未記録"]) {
  assert.equal(context.containsPersonalInfoRisk({ memo: text }), false, "Ordinary repair text falsely matched");
  checks += 1;
}
assert.equal(context.containsPersonalInfoRisk({}), false);
console.log(`Case privacy warning checks: ${checks + 1} / Errors: 0; heuristic only, not anonymization`);
