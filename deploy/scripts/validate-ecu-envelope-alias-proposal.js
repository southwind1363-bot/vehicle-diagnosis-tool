import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
const rows = [{ id: 'ECM', address: '7E8', status: 'reported', responseCount: 2, responseTimeMs: 0 }, { id: 'TCM', address: '7E9', status: 'reported', dtcCount: 1 }];
const bad = { sourceEcu: '7E8', source_ecu: '7E9' };
const cases = [
  ['outer', { ...bad, ecus: rows }, true],
  ['data', { data: { ...bad, ecus: rows } }, true],
  ['outer-with-data', { ...bad, data: { ecus: rows } }, true],
  ['empty-alias', { sourceEcu: '', source_ecu: '7E8', ecus: rows }, true],
  ['invalid-alias', { sourceEcu: 2024, source_ecu: '7E8', ecus: rows }, true],
  ['normal', { ecus: rows }, false],
  ['array', rows, false],
  ['case-space', { sourceEcu: ' 7e8 ', source_ecu: '7E8', ecus: rows }, false],
  ['null', { sourceEcu: null, source_ecu: '7E8', ecus: rows }, false],
  ['one-alias', { sourceEcu: '7E8', ecus: rows }, false],
  ['parent-child-different', { sourceEcu: '7E8', data: { source_ecu: '7E9', ecus: rows } }, false],
  ['metadata-not-envelope', { metadata: bad, ecus: rows }, false],
  ['empty-rows', { ...bad, ecus: [] }, false],
  ['existing-row-conflict', { ecus: [{ ...rows[0], ...bad }, rows[1]] }, false]
];
function load(source) {
  const context = vm.createContext({ window: {} });
  vm.runInContext('Date = class extends Date { constructor(...args) { super(...(args.length ? args : [1791712800000])); } static now() { return 1791712800000; } };', context);
  vm.runInContext(source, context);
  return context.window.ObdReadOnly;
}
const source = fs.readFileSync(new URL('../obd-readonly.js', import.meta.url), 'utf8');
const after = load(source);
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
const fixturePath = new URL('./fixtures/ecu-envelope-alias-legacy-3.13.686.json', import.meta.url);
const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
let checks = 0;
const eq = (a, b, label) => { assert.deepEqual(plain(a), plain(b), label); checks++; };
for (const [id, input, changed] of cases) {
  const original = JSON.stringify(input), next = observe(after, input);
  if (changed) {
    const expected = plain(after.normalizeEcuResponseSummary({ ecus: rows }));
    eq(hash(expected), fixture.cases[id].output, id + ' fixed legacy unflagged baseline');
    for (const row of expected.ecus) Object.assign(row, { ecuResponseConflict: true, ecu_response_conflict: true, applicabilityEvidenceEligible: false, applicability_evidence_eligible: false, diagnosticRequestId: null, diagnostic_request_id: null, diagnosticResponseId: null, diagnostic_response_id: null });
    eq(next.output, expected, id + ' existing conflict shape including null directional aliases');
    for (const row of next.output.ecus) eq(evidenceContext.resolveEcuResponseAddressEvidence(row).kind, 'conflict', id + ' production evidence resolver rejects identity');
    for (const summary of [next.output, next.session.ecuResponseSummary, next.restored.ecuResponseSummary]) {
      eq(summary.ecus.length, 2, id + ' both records retained');
      eq(summary.ecus.map(row => [row.status, row.ecuResponseConflict, row.ecu_response_conflict, row.applicabilityEvidenceEligible, row.applicability_evidence_eligible]), [['reported', true, true, false, false], ['reported', true, true, false, false]], id + ' entire envelope excluded from evidence');
    }
    for (const session of [next.session, next.restored]) {
      eq(session.wouldTransmit, false, id + ' no transmission');
      eq(session.vehicleCommandEnabled, false, id + ' no commands');
    }
  } else for (const [key, value] of Object.entries(next)) eq(hash(value), fixture.cases[id][key], id + ' unchanged ' + key);
  eq(JSON.stringify(input), original, id + ' input unchanged');
}
const flagged = after.normalizeEcuResponseSummary({ ...bad, ecus: rows });
const live = after.normalizeBridgeLivePidSnapshot({ monitor_values: [{ id: 'control_module_voltage', pid: '42', value: 14, unit: 'V', sourceEcu: '7EA' }] });
const combined = after.buildDiagnosticScanSession({ ecuResponseSummary: flagged, livePidSnapshot: live });
const restored = after.buildDiagnosticScanSessionFromJson(JSON.stringify(after.buildBridgeSessionExportPayload(combined)));
for (const session of [combined, restored]) {
  eq(session.livePidSnapshot.monitorValues.map(row => row.value), [14], 'separate normal live retained');
  eq(session.ecuResponseSummary.ecus.every(row => row.applicabilityEvidenceEligible === false), true, 'envelope exclusion retained with live');
}
console.log(`ECU envelope alias production: ${cases.length} cases / ${checks} checks passed; synthetic only; production code.`);
