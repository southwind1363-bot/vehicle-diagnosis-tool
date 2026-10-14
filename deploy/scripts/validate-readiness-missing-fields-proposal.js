import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { restoreReadinessMissingFieldsLegacy } from './readiness-missing-fields-proposal.js';

const source = fs.readFileSync(new URL('../obd-readonly.js', import.meta.url), 'utf8');
function load(text) {
  const context = vm.createContext({ window: {} });
  vm.runInContext('Date = class extends Date { constructor(...args) { super(...(args.length ? args : [1792022400000])); } static now() { return 1792022400000; } };', context);
  vm.runInContext(text, context);
  return context.window.ObdReadOnly;
}
const old = load(restoreReadinessMissingFieldsLegacy(source)), proposal = load(source);
const plain = value => JSON.parse(JSON.stringify(value));
let checks = 0;
function equal(a, b, label) { assert.deepEqual(plain(a), plain(b), label); checks++; }
const cases = [
  [{}, null, null, 'unknown', 0, 0, 1, 0],
  [{ supported: true }, true, null, 'unknown', 0, 0, 0, 1],
  [{ supported: false }, false, null, 'not_supported', 0, 0, 0, 0],
  [{ complete: true }, null, true, 'unknown', 0, 0, 1, 0],
  [{ complete: false }, null, false, 'unknown', 0, 0, 1, 0],
  [{ is_supported: true }, true, null, 'unknown', 0, 0, 0, 1],
  [{ is_complete: true }, null, true, 'unknown', 0, 0, 1, 0],
  [{ status: '' }, null, null, 'unknown', 0, 0, 1, 0],
  [{ status: '  ' }, null, null, '  ', 0, 0, 1, 0]
];
for (const [fields, supported, complete, status, completeCount, incompleteCount, supportUnknownCount, completionUnknownCount] of cases) {
  const input = { sourceEcu: '7E8', monitors: [{ id: 'catalyst', ...fields }] };
  const savedInput = JSON.stringify(input);
  const legacy = old.normalizeReadinessSnapshot(input);
  equal(legacy.monitors[0].supported, fields.supported === false ? false : true, 'Reproduce inferred support');
  const snapshot = proposal.normalizeReadinessSnapshot(input);
  const session = proposal.buildDiagnosticScanSession({ readinessSnapshot: snapshot });
  const restored = proposal.buildDiagnosticScanSessionFromJson(JSON.stringify(proposal.buildBridgeSessionExportPayload(session)));
  for (const value of [snapshot, session.readinessSnapshot, restored.readinessSnapshot]) {
    equal([value.monitors[0].supported, value.monitors[0].complete, value.monitors[0].status], [supported, complete, status], 'Missing values remain unknown');
    equal([value.completeCount, value.incompleteCount, value.supportUnknownCount, value.completionUnknownCount],
      [completeCount, incompleteCount, supportUnknownCount, completionUnknownCount], 'Counts reflect missing support/completion');
    equal(value.readinessReadoutStatus, legacy.readinessReadoutStatus, 'Readout acquisition contract unchanged');
  }
  equal(restored.wouldTransmit, false, 'No transmission');
  equal(restored.vehicleCommandEnabled, false, 'No command authority');
  equal(JSON.stringify(input), savedInput, 'Input unchanged');
}
for (const status of ['complete', 'ready', 'ok', 'not_complete', 'incomplete', 'not_supported', 'unsupported', 'unknown', 'unparsed', '完了', '未完了', '非対応', '不明', 'vendor_custom']) {
  const input = { monitors: [{ id: 'catalyst', status }] };
  equal(proposal.normalizeReadinessSnapshot(input), old.normalizeReadinessSnapshot(input), 'Explicit existing status unchanged');
}
for (const supported of [null, false, true]) for (const complete of [null, false, true]) {
  const input = { monitors: [{ id: 'catalyst', supported, complete }] };
  equal(proposal.normalizeReadinessSnapshot(input), old.normalizeReadinessSnapshot(input), 'Explicit tri-state values unchanged');
}
for (const raw of ['41 01 00 07 00 00', '41 01 81 07 65 00', 'NO DATA', '']) {
  equal(proposal.decodeReadinessResponse(raw), old.decodeReadinessResponse(raw), 'Raw decoder unchanged');
}
console.log(`Readiness missing-field production: ${checks} checks passed.`);
