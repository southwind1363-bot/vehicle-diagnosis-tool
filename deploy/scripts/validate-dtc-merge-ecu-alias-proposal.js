import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { dtcMergeAliasCases } from './dtc-merge-ecu-alias-cases.js';

function load(source) {
  const context = vm.createContext({ window: {} });
  vm.runInContext('Date = class extends Date { constructor(...args) { super(...(args.length ? args : [1791712800000])); } static now() { return 1791712800000; } };', context);
  vm.runInContext(source, context);
  return context.window.ObdReadOnly;
}
const source = fs.readFileSync(new URL('../obd-readonly.js', import.meta.url), 'utf8');
const after = load(source);
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
function observe(api, input) {
  const output = api.mergeDtcSnapshots(...input);
  const session = api.buildDiagnosticScanSession({ dtcSnapshot: output });
  const archive = api.buildBridgeSessionExportPayload(session);
  const restored = api.buildDiagnosticScanSessionFromJson(JSON.stringify(archive));
  return { output, session, archive, restored };
}
const fixturePath = new URL('./fixtures/dtc-merge-ecu-alias-legacy-3.13.684.json', import.meta.url);
const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
let checks = 0;
function eq(actual, expected, label) { assert.deepEqual(JSON.parse(JSON.stringify(actual)), JSON.parse(JSON.stringify(expected)), label); checks++; }
for (const test of dtcMergeAliasCases) {
  const original = JSON.stringify(test.input), legacy = fixture.cases[test.id];
  const result = observe(after, test.input);
  if (test.reject) {
    eq(legacy.status, 'reported', test.id + ' previously accepted');
    eq(legacy.codes.includes('P0300'), true, test.id + ' previously retained code');
    eq(hash(result.output), fixture.failure, test.id + ' entire merge refused');
    for (const snapshot of [result.output, result.session.dtcSnapshot, result.restored.dtcSnapshot]) {
      eq(snapshot.dtcReadoutStatus, 'blocked', test.id + ' blocked');
      eq(snapshot.errorCodes, ['source_ecu_alias_conflict'], test.id + ' reason');
      eq(snapshot.codes, [], test.id + ' no partial codes');
    }
    for (const session of [result.session, result.restored]) {
      eq(session.wouldTransmit, false, test.id + ' no transmission');
      eq(session.vehicleCommandEnabled, false, test.id + ' no commands');
    }
  } else {
    for (const [key, value] of Object.entries(result)) eq(hash(value), legacy.hashes[key], test.id + ' unchanged ' + key);
  }
  eq(JSON.stringify(test.input), original, test.id + ' unchanged arguments');
}
const rejected = after.mergeDtcSnapshots(...dtcMergeAliasCases[0].input);
const live = after.normalizeBridgeLivePidSnapshot({ monitor_values: [{ id: 'control_module_voltage', pid: '42', value: 14, unit: 'V', sourceEcu: '7E8' }] });
const session = after.buildDiagnosticScanSession({ dtcSnapshot: rejected, livePidSnapshot: live });
const restored = after.buildDiagnosticScanSessionFromJson(JSON.stringify(after.buildBridgeSessionExportPayload(session)));
for (const value of [session, restored]) {
  eq(value.dtcSnapshot.dtcReadoutStatus, 'blocked', 'refusal retained');
  eq(value.livePidSnapshot.monitorValues.map(row => row.value), [14], 'independent live retained');
}
console.log('DTC merge ECU alias production: 18 cases / ' + checks + ' checks passed; whole merge refusal; synthetic only.');
