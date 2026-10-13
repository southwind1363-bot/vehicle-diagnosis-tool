import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

const other = { id: 'TCM', address: '7EA', status: 'reported', responseCount: 1 };
const row = pair => ({ id: 'ECM', sourceEcu: pair[0], source_ecu: pair[1], status: 'reported', responseCount: 2, responseTimeMs: 0 });
const cases = [
  ['empty-camel', ['', '7E8'], true], ['empty-snake', ['7E8', ''], true],
  ['both-empty', ['', ''], true], ['whitespace', [' ', '7E8'], true],
  ['text-conflict', ['ECM', 'TCM'], true], ['hex-prefix', ['0x7E8', '7E8'], true],
  ['hex-padding', ['008', '8'], true],
  ['same', ['7E8', '7E8'], false], ['case-space', [' 7e8 ', '7E8'], false],
  ['missing-camel', [undefined, '7E8'], false], ['null-camel', [null, '7E8'], false],
  ['both-null', [null, null], false], ['same-text', ['ECM', 'ECM'], false],
  ['existing-conflict', ['7E8', '7E9'], false], ['existing-invalid', [42, '7E8'], false]
].map(([id, pair, changed]) => [id, { ecus: [row(pair), other] }, changed]);
cases.push(
  ['array', [row(['', '7E8']), other], true],
  ['data', { data: { ecus: [row(['', '7E8']), other] } }, true],
  ['metadata', { ecus: [{ ...row(['7E8', '7E8']), metadata: { sourceEcu: '', source_ecu: '7E9' } }, other] }, false],
  ['duplicate-before', { ecus: [row(['7E8', '7E8']), row(['', '7E8']), other] }, true],
  ['duplicate-after', { ecus: [row(['', '7E8']), row(['7E8', '7E8']), other] }, true]
);
function load(source) {
  const c = vm.createContext({ window: {} });
  vm.runInContext('Date = class extends Date { constructor(...args) { super(...(args.length ? args : [1791712800000])); } static now() { return 1791712800000; } };', c);
  vm.runInContext(source, c);
  return c.window.ObdReadOnly;
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
const fixturePath = new URL('./fixtures/ecu-row-alias-legacy-3.13.687.json', import.meta.url);
const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
let checks = 0;
const eq = (a, b, label) => { assert.deepEqual(plain(a), plain(b), label); checks++; };
for (const [id, input, changed] of cases) {
  const original = JSON.stringify(input), next = observe(after, input);
  if (changed) {
    const expected = plain(fixture.cases[id].output);
    eq(expected.ecus[0].ecuResponseConflict ?? false, false, id + ' previously unflagged');
    Object.assign(expected.ecus[0], { ecuResponseConflict: true, ecu_response_conflict: true, applicabilityEvidenceEligible: false, applicability_evidence_eligible: false, diagnosticRequestId: null, diagnostic_request_id: null, diagnosticResponseId: null, diagnostic_response_id: null });
    eq(next.output, expected, id + ' exact changed row and unchanged other rows');
    eq(evidenceContext.resolveEcuResponseAddressEvidence(next.output.ecus[0]).kind, 'conflict', id + ' actual identity evidence resolver excludes row');
    for (const summary of [next.output, next.session.ecuResponseSummary, next.restored.ecuResponseSummary]) {
      eq(summary.ecus.map(r => [r.status, r.ecuResponseConflict ?? false, r.ecu_response_conflict ?? false, r.applicabilityEvidenceEligible ?? null, r.applicability_evidence_eligible ?? null]), [['reported', true, true, false, false], ['reported', false, false, null, null]], id + ' local exclusion survives archive');
    }
    for (const session of [next.session, next.restored]) {
      eq(session.wouldTransmit, false, id + ' no transmission');
      eq(session.vehicleCommandEnabled, false, id + ' no commands');
    }
  } else for (const [key, value] of Object.entries(next)) eq(hash(value), fixture.cases[id].hashes[key], id + ' unchanged ' + key);
  eq(JSON.stringify(input), original, id + ' immutable input');
}
const flagged = after.normalizeEcuResponseSummary({ecus: [row(['', '7E8']), other]});
const live = after.normalizeBridgeLivePidSnapshot({monitor_values: [{id:'control_module_voltage',pid:'42',value:14,unit:'V',sourceEcu:'7EA'}]});
const session = after.buildDiagnosticScanSession({ecuResponseSummary:flagged,livePidSnapshot:live});
const restored = after.buildDiagnosticScanSessionFromJson(JSON.stringify(after.buildBridgeSessionExportPayload(session)));
for (const value of [session, restored]) {
  eq(value.livePidSnapshot.monitorValues.map(r=>r.value), [14], 'independent live retained');
  eq(value.ecuResponseSummary.ecus.map(r=>r.ecuResponseConflict??false), [true,false], 'only affected row marked');
}
console.log(`ECU row alias production: ${cases.length} cases / ${checks} checks passed; synthetic only; production code.`);
