import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const source = fs.readFileSync(new URL('../script.js', import.meta.url), 'utf8');
const renderSource = source.match(/function buildObdEcuResponseDisplayLines\([^)]*\) \{[\s\S]*?\r?\n\}/)?.[0];
assert.ok(renderSource);
const context = vm.createContext({});
vm.runInContext(renderSource, context);
const render = summary => Array.from(context.buildObdEcuResponseDisplayLines(summary));
const normal = { id: 'ECM', address: '7E8', status: 'reported', dtcCount: 1, responseCount: 2 };
const baseline = render({ ecus: [normal] });
assert.ok(baseline.some(line => line.includes('応答取得 (reported)')));
assert.ok(!baseline.some(line => line.includes('注意:')));
let checks = 2;
for (const [flags, kind] of [
  [{ ecuResponseConflict: true }, 'conflict'],
  [{ ecu_response_conflict: true }, 'conflict'],
  [{ ecuResponseConflict: false, ecu_response_conflict: true }, 'conflict'],
  [{ applicabilityEvidenceEligible: false }, 'ineligible'],
  [{ applicability_evidence_eligible: false }, 'ineligible'],
  [{ ecuResponseConflict: true, applicabilityEvidenceEligible: false }, 'conflict'],
  [{ ecuResponseConflict: false, applicabilityEvidenceEligible: true }, 'normal'],
  [{ ecuResponseConflict: 'true', applicabilityEvidenceEligible: 'false' }, 'normal']
]) {
  const summary = { ecus: [{ ...normal, ...flags }] }, original = JSON.stringify(summary);
  const lines = render(summary), warnings = lines.filter(line => line.includes('注意:'));
  assert.deepEqual(lines.filter(line => !line.includes('注意:')), baseline);
  assert.equal(warnings.length, kind === 'normal' ? 0 : 1);
  if (kind !== 'normal') assert.ok(warnings[0].includes(kind === 'conflict' ? 'ECU識別情報に矛盾' : '適合判定の根拠対象外'));
  assert.equal(JSON.stringify(summary), original);
  checks += kind === 'normal' ? 3 : 4;
}
console.log(`ECU response conflict display: ${checks} checks passed; recorded status and data unchanged.`);
