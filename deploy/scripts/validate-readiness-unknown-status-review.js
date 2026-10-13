// Production regression with the prior one-line inference reconstructed as a control.
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const source = fs.readFileSync(new URL('../obd-readonly.js', import.meta.url), 'utf8');
const before = 'status: statusKey !== rawStatusKey ? statusKey : (statusAlias || (supported ? (complete ? "complete" : "not_complete") : "not_supported")),';
const after = 'status: statusKey !== rawStatusKey ? statusKey : (statusAlias || (supported === false ? "not_supported" : supported === true && complete === true ? "complete" : supported === true && complete === false ? "not_complete" : "unknown")),';
assert.equal(source.split(after).length, 2, 'Production fix must be unique');
function load(text) {
  const context = vm.createContext({ window: {} });
  vm.runInContext('Date = class extends Date { constructor(...args) { super(...(args.length ? args : [1791936000000])); } static now() { return 1791936000000; } };', context);
  vm.runInContext(text, context);
  return context.window.ObdReadOnly;
}
const current = load(source.replace(after, before)), proposed = load(source);
let checks = 0;
const plain = value => JSON.parse(JSON.stringify(value));
function equal(actual, expected, message) { assert.deepEqual(plain(actual), plain(expected), message); checks++; }
for (const supported of [null, false, true]) for (const complete of [null, false, true]) {
  const input = { sourceEcu: '7E8', monitors: [{ id: 'catalyst', supported, complete }] };
  const savedInput = JSON.stringify(input);
  const old = current.normalizeReadinessSnapshot(input);
  const next = proposed.normalizeReadinessSnapshot(input);
  const expected = supported === false ? 'not_supported' : supported === true && complete === true ? 'complete'
    : supported === true && complete === false ? 'not_complete' : 'unknown';
  equal(next.monitors[0].status, expected, 'Explicit tri-state status');
  equal(old.monitors[0].status, supported ? (complete ? 'complete' : 'not_complete') : 'not_supported', 'Reproduce current inference');
  const normalizedOld = plain(old);
  normalizedOld.monitors[0].status = expected;
  equal(next, normalizedOld, 'Only monitor status changes; acquisition, values and counts stay unchanged');
  const session = proposed.buildDiagnosticScanSession({ readinessSnapshot: next });
  const archive = proposed.buildBridgeSessionExportPayload(session);
  const restored = proposed.buildDiagnosticScanSessionFromJson(JSON.stringify(archive));
  for (const result of [session, restored]) {
    equal(result.readinessSnapshot.monitors[0].status, expected, 'Session/archive preserve status');
    equal(result.readinessSnapshot.monitors[0].supported, supported, 'Support stays tri-state');
    equal(result.readinessSnapshot.monitors[0].complete, complete, 'Completion stays tri-state');
    equal(result.wouldTransmit, false, 'No transmission authority');
    equal(result.vehicleCommandEnabled, false, 'No command authority');
  }
  equal(JSON.stringify(input), savedInput, 'Input unchanged');
}
// Explicit labels (including legacy stored labels) are not reinterpreted by this proposal.
for (const row of [
  { id: 'catalyst', is_supported: null, is_complete: null },
  { id: 'catalyst', supported: 'unknown', complete: 'unknown' },
  { id: 'catalyst', supported: true, complete: 'unrecognized' }
]) {
  const result = proposed.normalizeBridgeReadinessSnapshot({ ok: true, data: { monitors: [row] } });
  equal(result.monitors[0].status, 'unknown', 'Bridge keeps unknown aliases/values unknown');
}
equal(proposed.normalizeReadinessSnapshot({ monitors: [{ id: 'catalyst' }] }),
  current.normalizeReadinessSnapshot({ monitors: [{ id: 'catalyst' }] }), 'Absent-field defaults are outside this proposal');
for (const status of ['complete', 'not_complete', 'not_supported', 'unknown', 'unparsed', '完了', '未完了', '非対応', '不明']) {
  const input = { monitors: [{ id: 'catalyst', supported: null, complete: null, status }] };
  equal(proposed.normalizeReadinessSnapshot(input), current.normalizeReadinessSnapshot(input), 'Explicit/legacy label unchanged');
}
for (const response of ['41 01 00 07 00 00', '41 01 81 07 65 00', 'NO DATA', '']) {
  equal(proposed.decodeReadinessResponse(response), current.decodeReadinessResponse(response), 'Raw response unchanged');
}
console.log(`Readiness unknown-status production: ${checks} checks passed.`);
