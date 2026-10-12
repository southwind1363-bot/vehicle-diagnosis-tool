import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { udsAliasCases, udsSamples } from './uds-ecu-alias-cases.js';

const source = fs.readFileSync(new URL('../obd-readonly.js', import.meta.url), 'utf8');
function load(text) {
  const context = vm.createContext({ window: {} });
  vm.runInContext('Date = class extends Date { constructor(...args) { super(...(args.length ? args : [1791712800000])); } static now() { return 1791712800000; } };', context);
  vm.runInContext(text, context);
  return context.window.ObdReadOnly;
}
const after = load(source);
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
function observe(api, test) {
  const output = api[test.api](test.input);
  const session = api.buildDiagnosticScanSession({ [test.slot]: output });
  const archive = api.buildBridgeSessionExportPayload(session);
  const restored = api.buildDiagnosticScanSessionFromJson(JSON.stringify(archive));
  return { output, session, archive, restored };
}
const fixturePath = new URL('./fixtures/uds-ecu-alias-legacy-3.13.681.json', import.meta.url);
const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
let checks = 0;
const eq = (actual, expected, label) => { assert.deepEqual(JSON.parse(JSON.stringify(actual)), JSON.parse(JSON.stringify(expected)), label); checks++; };
for (const test of udsAliasCases) {
  const original = JSON.stringify(test.input), legacy = fixture.cases[test.id];
  const observed = observe(after, test);
  if (test.reject) {
    eq(legacy.status, 'reported', test.id + ' previously accepted');
    eq(digest(observed.output), fixture.failures[test.bridge], test.id + ' complete empty refusal');
    for (const snapshot of [observed.output, observed.session[test.slot], observed.restored[test.slot]]) {
      eq(snapshot[test.status], 'blocked', test.id + ' blocked');
      eq(snapshot.errorCodes, ['source_ecu_alias_conflict'], test.id + ' reason');
      eq(snapshot.sourceEcu, null, test.id + ' no ECU');
    }
    for (const session of [observed.session, observed.restored]) {
      eq(session.wouldTransmit, false, test.id + ' no transmission');
      eq(session.vehicleCommandEnabled, false, test.id + ' no commands');
    }
  } else {
    for (const [key, value] of Object.entries(observed)) eq(digest(value), legacy.hashes[key], test.id + ' normal ' + key);
  }
  eq(JSON.stringify(test.input), original, test.id + ' unchanged input');
}
for (const sample of new Map(udsSamples.map(item => [item.api, item])).values()) {
  const rejected = after[sample.api]({ raw: sample.raw, sourceEcu: '7E8', source_ecu: '7E9' });
  const live = after.normalizeBridgeLivePidSnapshot({ monitor_values: [{ id: 'control_module_voltage', pid: '42', value: 14, unit: 'V', sourceEcu: '7E8' }] });
  const session = after.buildDiagnosticScanSession({ [sample.slot]: rejected, livePidSnapshot: live });
  const restored = after.buildDiagnosticScanSessionFromJson(JSON.stringify(after.buildBridgeSessionExportPayload(session)));
  for (const result of [session, restored]) {
    eq(result[sample.slot][sample.status], 'blocked', sample.api + ' refusal alongside normal live');
    eq(result.livePidSnapshot.monitorValues.map(row => row.value), [14], sample.api + ' independent live retained');
  }
}
console.log('UDS ECU alias production: ' + udsAliasCases.length + ' cases / ' + checks + ' checks passed; nine APIs; synthetic only.');
