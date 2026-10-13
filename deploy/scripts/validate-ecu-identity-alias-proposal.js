import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { applyEcuIdentityAliasProposal } from './ecu-identity-alias-proposal.js';

const other = { id: 'TCM', address: '7EA', status: 'reported', responseCount: 1 };
const pairs = [['ecuId', 'ecu_id'], ['moduleId', 'module_id'], ['controllerId', 'controller_id']];
const variants = [
  ['empty-camel', '', '7E8', true], ['empty-snake', '7E8', '', true],
  ['both-empty', '', '', true], ['whitespace', ' ', '7E8', true],
  ['different-text', 'ECM', 'TCM', true], ['prefix', '0x7E8', '7E8', true],
  ['padding', '008', '8', true], ['empty-array', [], '', true],
  ['same', '7E8', '7E8', false], ['case-space', ' 7e8 ', '7E8', false],
  ['missing-camel', undefined, '7E8', false], ['missing-snake', '7E8', undefined, false],
  ['null-camel', null, '7E8', false], ['both-null', null, null, false],
  ['same-text', 'ECM', 'ECM', false], ['existing-conflict', '7E8', '7E9', false],
  ['existing-nonstring', 42, '7E8', false]
];
const cases = [];
for (const [camel, snake] of pairs) {
  const row = (a, b) => ({ id: 'ECM', status: 'reported', responseCount: 2, responseTimeMs: 0, [camel]: a, [snake]: b });
  for (const [name, a, b, changed] of variants) cases.push([camel + '-' + name, { ecus: [row(a, b), other] }, changed]);
  cases.push(
    [camel + '-array', [row('', '7E8'), other], true],
    [camel + '-data', { data: { ecus: [row('', '7E8'), other] } }, true],
    [camel + '-duplicate-before', { ecus: [row('7E8', '7E8'), row('', '7E8'), other] }, true],
    [camel + '-duplicate-after', { ecus: [row('', '7E8'), row('7E8', '7E8'), other] }, true],
    [camel + '-unconsumed-metadata', { ecus: [{ ...row('7E8', '7E8'), metadata: { [camel]: '', [snake]: '7E9' } }, other] }, false],
    [camel + '-parent-only', { [camel]: '', [snake]: '7E8', ecus: [row('7E8', '7E8'), other] }, false]
  );
}
cases.push(['different-field-families', { ecus: [{ id: 'ECM', ecuId: 'ECM', moduleId: 'TCM', status: 'reported' }, other] }, false]);
cases.push(['existing-source-alias', { ecus: [{ id: 'ECM', sourceEcu: '', source_ecu: '7E8', status: 'reported' }, other] }, false]);
function load(source) {
  const context = vm.createContext({ window: {} });
  vm.runInContext('Date = class extends Date { constructor(...args) { super(...(args.length ? args : [1791855000000])); } static now() { return 1791855000000; } };', context);
  vm.runInContext(source, context);
  return context.window.ObdReadOnly;
}
const source = fs.readFileSync(new URL('../obd-readonly.js', import.meta.url), 'utf8');
const before = load(source), after = load(applyEcuIdentityAliasProposal(source));
const evidenceContext = vm.createContext({});
for (const name of ['normalizeDirectionalCanEcuAddress', 'resolveEcuResponseAddressEvidence']) {
  const start = source.indexOf('  function ' + name + '('), end = source.indexOf('\n  }', start);
  assert.ok(start >= 0 && end > start);
  vm.runInContext(source.slice(start, end + 4), evidenceContext);
}
const plain = value => JSON.parse(JSON.stringify(value));
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
function observe(api, input) {
  const output = api.normalizeEcuResponseSummary(input);
  const session = api.buildDiagnosticScanSession({ ecuResponseSummary: output });
  const archive = api.buildBridgeSessionExportPayload(session);
  const restored = api.buildDiagnosticScanSessionFromJson(JSON.stringify(archive));
  return { output, session, archive, restored };
}
const fixturePath = new URL('./fixtures/ecu-identity-alias-legacy-3.13.689.json', import.meta.url);
if (process.argv.includes('--freeze')) {
  assert.equal(fs.existsSync(fixturePath), false, 'Never overwrite legacy evidence');
  const frozen = {};
  for (const [id, input] of cases) {
    const result = observe(before, input);
    frozen[id] = { output: result.output, hashes: Object.fromEntries(Object.entries(result).map(([key, value]) => [key, hash(value)])) };
  }
  fs.writeFileSync(fixturePath, JSON.stringify({ version: '3.13.689', commit: 'e6d2c7e565c853021aec8ab21beaee63ec0c787c', cases: frozen }, null, 2) + '\n');
}
const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
let checks = 0;
const eq = (a, b, label) => { assert.deepEqual(plain(a), plain(b), label); checks++; };
for (const [id, input, changed] of cases) {
  const original = JSON.stringify(input), legacy = observe(before, input), next = observe(after, input);
  for (const [key, value] of Object.entries(legacy)) eq(hash(value), fixture.cases[id].hashes[key], id + ' frozen legacy ' + key);
  if (changed) {
    const expected = plain(fixture.cases[id].output);
    eq(expected.ecus[0].ecuResponseConflict ?? false, false, id + ' previously unflagged');
    Object.assign(expected.ecus[0], { ecuResponseConflict: true, ecu_response_conflict: true, applicabilityEvidenceEligible: false, applicability_evidence_eligible: false, diagnosticRequestId: null, diagnostic_request_id: null, diagnosticResponseId: null, diagnostic_response_id: null });
    eq(next.output, expected, id + ' full output differs only in existing exclusion flags and directional nulls');
    eq(evidenceContext.resolveEcuResponseAddressEvidence(next.output.ecus[0]).kind, 'conflict', id + ' actual identity resolver excludes row');
    for (const summary of [next.output, next.session.ecuResponseSummary, next.restored.ecuResponseSummary]) {
      eq(summary.ecus.map(row => [row.status, row.ecuResponseConflict ?? false, row.ecu_response_conflict ?? false, row.applicabilityEvidenceEligible ?? null, row.applicability_evidence_eligible ?? null]), [['reported', true, true, false, false], ['reported', false, false, null, null]], id + ' local exclusion survives archive');
    }
    for (const session of [next.session, next.restored]) {
      eq(session.wouldTransmit, false, id + ' no transmission');
      eq(session.vehicleCommandEnabled, false, id + ' no commands');
    }
  } else for (const [key, value] of Object.entries(next)) eq(hash(value), fixture.cases[id].hashes[key], id + ' unchanged ' + key);
  eq(JSON.stringify(input), original, id + ' input unchanged');
}
const flagged = after.normalizeEcuResponseSummary({ ecus: [{ id: 'ECM', moduleId: '', module_id: '7E8', status: 'reported' }, other] });
const live = after.normalizeBridgeLivePidSnapshot({ monitor_values: [{ id: 'control_module_voltage', pid: '42', value: 14, unit: 'V', sourceEcu: '7EA' }] });
const session = after.buildDiagnosticScanSession({ ecuResponseSummary: flagged, livePidSnapshot: live });
const restored = after.buildDiagnosticScanSessionFromJson(JSON.stringify(after.buildBridgeSessionExportPayload(session)));
for (const value of [session, restored]) {
  eq(value.livePidSnapshot.monitorValues.map(row => row.value), [14], 'independent live retained');
  eq(value.ecuResponseSummary.ecus.map(row => row.ecuResponseConflict ?? false), [true, false], 'only affected row marked');
}
console.log(`ECU identity alias isolated proposal: ${cases.length} cases / ${checks} checks passed; three field pairs; production unchanged, synthetic only.`);
