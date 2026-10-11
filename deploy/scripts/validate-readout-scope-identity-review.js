import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
// Review harness: candidate exists only inside a VM; production files are never patched.
const runtimeFiles = ['obd-readonly.js', 'script.js', 'service-worker.js', 'offline-assets.json'];
const original = runtimeFiles.map(file => fs.readFileSync(new URL('../' + file, import.meta.url), 'utf8'));
const source = original[0];
const start = source.indexOf('  function getReadoutNetworkScopeKey(');
const end = source.indexOf('  function readoutNetworkScopeMatches(', start);
assert(start >= 0 && end > start, 'candidate patch anchors');
const candidate = source.slice(0, start)
  + '  function getReadoutNetworkScopeKey(input = {}) { return getDtcReadoutNetworkScopeIdentity(input); }\n\n'
  + source.slice(end);
function load(text) {
  const context = { window: {} };
  vm.runInNewContext(text.replace('window.ObdReadOnly = Object.freeze({',
    'window.ObdReadOnly = Object.freeze({getReadoutNetworkScopeKey,readoutNetworkScopeMatches,buildReadoutEcuResponseSummaryInput,'), context);
  return context.window.ObdReadOnly;
}
const current = load(source), proposed = load(candidate);
const plain = value => JSON.parse(JSON.stringify(value));
let checks = 0, cases = 0;
function eq(actual, expected, label) { assert.deepEqual(plain(actual), expected, label); checks++; }
const pairs = [];
for (const field of ['networkBus', 'networkChannel', 'gatewayRoute']) {
  for (const kind of ['separator', 'missing']) {
    const a = { networkBus: 'CAN', networkChannel: 'CH1', gatewayRoute: 'GW1' }, b = { ...a };
    if (kind === 'separator') { a[field] = 'A|B'; b[field] = 'A B'; }
    else { delete a[field]; b[field] = '-'; }
    pairs.push([a, b]);
  }
}
function ecuInput(acquired, unresolved) {
  return { ecuInfoSnapshot: {
    ecuInfoReadoutStatus: 'unparsed', ecuInfoResponseFormat: 'obd_mode09',
    items: [{ id: 'calibration_id', infoType: '04', sourceEcu: '7E8', value: 'UNRESOLVED-ROUTE', ...unresolved }],
    ecuInfoEcuSnapshots: [
      { sourceEcu: '7E8', ecuInfoReadoutStatus: 'reported', items: [], ...acquired },
      { sourceEcu: '7E8', ecuInfoReadoutStatus: 'unparsed', items: [], ...unresolved }
    ]
  } };
}
for (const [a, b] of pairs) for (const [left, right] of [[a, b], [b, a]]) {
  cases++;
  eq(current.getReadoutNetworkScopeKey(left) === current.getReadoutNetworkScopeKey(right), true, 'current lossy collision');
  eq(proposed.getReadoutNetworkScopeKey(left) === proposed.getReadoutNetworkScopeKey(right), false, 'candidate separates routes');
  eq(current.readoutNetworkScopeMatches(left, right), true, 'current cross-route match');
  eq(proposed.readoutNetworkScopeMatches(left, right), false, 'candidate rejects cross-route match');
  for (const [api, isCandidate] of [[current, false], [proposed, true]]) {
    const session = api.buildDiagnosticScanSession(ecuInput(left, right));
    const snapshot = session.ecuInfoSnapshot;
    eq(snapshot.items.map(row => row.value), isCandidate ? [] : ['UNRESOLVED-ROUTE'], 'public import row selection');
    const aggregate = snapshot.ecuInfoEcuAggregateSummary;
    eq(aggregate.ecuCount, isCandidate ? 2 : 1, 'distinct acquisition scopes');
    eq(aggregate.reportedEcuCount, isCandidate ? 1 : 0, 'reported scope preserved');
    eq(aggregate.unparsedEcuCount, 1, 'unparsed scope preserved');
    eq(aggregate.allReported, false, 'partial acquisition remains partial');
    const summary = api.buildReadoutEcuResponseSummaryInput({ livePidSnapshot: {
      livePidReadoutStatus: 'reported', values: [left, right].map(scope => ({ id: 'engine_rpm', sourceEcu: '7E8', value: 800, ...scope }))
    } });
    eq(summary.ecu_responses.length, isCandidate ? 2 : 1, 'response summary route count');
    const restored = api.buildDiagnosticScanSessionFromJson(JSON.stringify(api.buildBridgeSessionExportPayload(session)));
    eq(restored.ecuInfoSnapshot.items.map(row => row.value), isCandidate ? [] : ['UNRESOLVED-ROUTE'], 'archive retains row selection');
    eq(restored.ecuInfoSnapshot.ecuInfoEcuAggregateSummary.ecuCount, isCandidate ? 2 : 1, 'archive retains route count');
    eq(restored.vehicleCommandEnabled, false, 'command disabled');
    eq(restored.wouldTransmit, false, 'no transmission');
  }
}
// Existing normalization and wildcard semantics must not change in this narrowly scoped proposal.
for (const api of [current, proposed]) {
  eq(api.readoutNetworkScopeMatches({ networkBus: 'ＣＡＮ' }, { network_bus: 'can' }), true, 'NFKC and case');
  eq(api.readoutNetworkScopeMatches({}, { networkBus: 'CAN' }), true, 'unspecified expected scope remains wildcard');
  eq(api.readoutNetworkScopeMatches({ networkBus: 'CAN' }, {}), false, 'specified scope requires observed scope');
  eq(api.readoutNetworkScopeMatches({ networkBus: 'CAN', network_bus: 'BODY' }, { networkBus: 'CAN' }), false, 'conflicting alias rejected');
  eq(api.getReadoutNetworkScopeKey({}), '', 'unscoped identity unchanged');
  eq(api.getReadoutNetworkScopeKey({ networkBus: 'CAN', network_bus: 'BODY' }), null, 'conflict identity unchanged');
}
for (let index = 0; index < runtimeFiles.length; index++) {
  eq(fs.readFileSync(new URL('../' + runtimeFiles[index], import.meta.url), 'utf8'), original[index], 'runtime unchanged');
}
console.log('Readout scope identity review: ' + checks + ' checks / ' + cases + ' route cases passed; production unchanged.');
