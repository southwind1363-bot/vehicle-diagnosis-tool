import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { pidMatrixCases, pidMatrixKinds } from './pid-matrix-ecu-alias-cases.js';
import { coreReadoutEcuCases } from './core-readout-ecu-alias-cases.js';

function load(source) {
  const context = vm.createContext({ window: {} });
  vm.runInContext('Date = class extends Date { constructor(...args) { super(...(args.length ? args : [1791712800000])); } static now() { return 1791712800000; } };', context);
  vm.runInContext(source, context);
  const api = context.window.ObdReadOnly;
  api.configureMonitorDefinitions(JSON.parse(fs.readFileSync(new URL('../data/obd-monitor-definitions.json', import.meta.url), 'utf8')));
  api.configureEcuInfoItems(JSON.parse(fs.readFileSync(new URL('../data/obd-ecu-info-items-2026.json', import.meta.url), 'utf8')));
  return api;
}
const source = fs.readFileSync(new URL('../obd-readonly.js', import.meta.url), 'utf8');
const after = load(source);
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
function observe(api, test) {
  const output = api[test.api](test.input);
  const session = api.buildDiagnosticScanSession({ [test.slot]: output });
  const archive = api.buildBridgeSessionExportPayload(session);
  const restored = api.buildDiagnosticScanSessionFromJson(JSON.stringify(archive));
  return { output, session, archive, restored };
}
const fixturePath = new URL('./fixtures/pid-matrix-ecu-alias-legacy-3.13.683.json', import.meta.url);
const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
let checks = 0;
function eq(actual, expected, label) { assert.deepEqual(JSON.parse(JSON.stringify(actual)), JSON.parse(JSON.stringify(expected)), label); checks++; }
for (const test of pidMatrixCases) {
  const input = JSON.stringify(test.input), legacy = fixture.cases[test.id];
  const result = observe(after, test);
  if (test.reject) {
    eq(legacy.status, 'reported', test.id + ' previously accepted');
    eq(hash(result.output), fixture.failures[test.bridge], test.id + ' entire input refused');
    for (const snapshot of [result.output, result.session[test.slot], result.restored[test.slot]]) {
      eq(snapshot[test.status], 'blocked', test.id + ' blocked');
      eq(snapshot.errorCodes, ['source_ecu_alias_conflict'], test.id + ' reason');
      eq(snapshot.sourceEcu, null, test.id + ' no ECU');
    }
    for (const session of [result.session, result.restored]) {
      eq(session.wouldTransmit, false, test.id + ' no transmission');
      eq(session.vehicleCommandEnabled, false, test.id + ' no commands');
    }
  } else {
    for (const [key, value] of Object.entries(result)) eq(hash(value), legacy.hashes[key], test.id + ' unchanged ' + key);
  }
  eq(JSON.stringify(test.input), input, test.id + ' unchanged argument');
}
for (const test of coreReadoutEcuCases.filter(test => test.kind === 'SupportedPid')) {
  eq(hash(after[test.api](test.input)), fixture.callers[test.api + ':' + test.id], test.id + ' unchanged calling decoder/bridge');
}
for (const kind of pidMatrixKinds) {
  const output = after[kind.api]({ ...kind.data, sourceEcu: '7E8', source_ecu: '7E9' });
  const live = after.normalizeBridgeLivePidSnapshot({ monitor_values: [{ id: 'control_module_voltage', pid: '42', value: 14, unit: 'V', sourceEcu: '7E8' }] });
  const session = after.buildDiagnosticScanSession({ [kind.slot]: output, livePidSnapshot: live });
  const restored = after.buildDiagnosticScanSessionFromJson(JSON.stringify(after.buildBridgeSessionExportPayload(session)));
  for (const value of [session, restored]) {
    eq(value[kind.slot][kind.status], 'blocked', kind.kind + ' refusal retained');
    eq(value.livePidSnapshot.monitorValues.map(row => row.value), [14], kind.kind + ' independent live retained');
  }
}
console.log('PID matrix ECU alias production: 21 cases and 24 caller outputs / ' + checks + ' checks passed; one API; synthetic only.');
