import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

// Approved regression: actual runtime with frozen pre-change results, no patched code.
const source = fs.readFileSync(new URL('../obd-readonly.js', import.meta.url), 'utf8');
const context = vm.createContext({ window: {} });
vm.runInContext(source, context);
const model = context.window.ObdReadOnly;
const frozen = JSON.parse(fs.readFileSync(new URL('./fixtures/timeline-scope-3.13.657.json', import.meta.url), 'utf8'));
const baseline = Object.fromEntries(['buildLivePidTimelineSummary', 'normalizeLivePidTimeline', 'buildDiagnosticScanSessionFromJson'].map(method => [method, input => {
  const entry = frozen.entries.find(entry => entry.method === method && JSON.stringify(entry.input) === JSON.stringify(input));
  assert.ok(entry, 'missing frozen baseline for ' + method);
  return entry.output;
}]));
const plain = value => JSON.parse(JSON.stringify(value));
let checks = 0;
const equal = (actual, expected, message) => { assert.deepEqual(plain(actual), plain(expected), message); checks++; };
const pair = (left = {}, right = left) => ({ samples: [left, right].map((scope, i) => ({
  capturedAt: `2026-10-10T00:00:0${i}Z`, observationCondition: 'warm',
  monitorValues: [{ id: 'engine_speed', label: 'Engine speed', sourceEcu: '7E8', unit: 'rpm', value: i * 100, ...scope }]
})) });
const legacy = JSON.parse(fs.readFileSync(new URL('./fixtures/timeline-legacy-3.13.655.json', import.meta.url), 'utf8'));
const reports = [];
const collisionPairs = [
  [{ networkBus: 'CAN|A' }, { networkBus: 'CAN A' }],
  [{ networkBus: 'CAN', networkChannel: '-' }, { networkBus: 'CAN' }],
  [{ networkBus: '-', networkChannel: '1' }, { networkChannel: '1' }],
  [{ networkBus: 'CAN', gatewayRoute: '-' }, { networkBus: 'CAN' }],
  [{ networkChannel: 'a|b' }, { networkChannel: 'a b' }],
  [{ gatewayRoute: 'a|b' }, { gatewayRoute: 'a b' }]
];
for (const [left, right] of collisionPairs) {
  for (const [a, b] of [[left, right], [right, left]]) {
    const input = pair(a, b), before = JSON.stringify(input);
    const oldSummary = baseline.buildLivePidTimelineSummary(input);
    const newSummary = model.buildLivePidTimelineSummary(input);
    equal(oldSummary.comparedValueCount, 1, 'frozen scope collision');
    equal(newSummary.comparedValueCount, 0, 'exclude different scope');
    equal(newSummary.networkScopeMismatchValueCount, 1, 'report scope mismatch');
    equal(newSummary.changes, [], 'do not publish delta across scopes');
    equal(newSummary.comparisonAvailable, oldSummary.comparisonAvailable, 'capture eligibility unchanged');
    equal(JSON.stringify(input), before, 'input unchanged');
    const normalized = baseline.normalizeLivePidTimeline(input);
    equal(model.normalizeLivePidTimeline(input), normalized, 'normalization unchanged');
    equal(model.buildLivePidTimelineSummary(normalized).comparedValueCount, 0, 'normalized comparison isolated');
    const archive = { ...legacy.mixedArchive, session: { live_pid_timeline: normalized } };
    const oldSession = baseline.buildDiagnosticScanSessionFromJson(JSON.stringify(archive));
    const newSession = model.buildDiagnosticScanSessionFromJson(JSON.stringify(archive));
    equal(newSession.livePidTimeline.samples, oldSession.livePidTimeline.samples, 'legacy samples retained');
    const restored = model.buildDiagnosticScanSessionFromJson(JSON.stringify(model.buildBridgeSessionExportPayload(newSession)));
    equal(restored.livePidTimeline.samples, oldSession.livePidTimeline.samples, 'round trip samples retained');
  }
  reports.push({ left, right, legacyCompared: 1, compared: 0, scopeMismatch: 1 });
}
for (const [left, right] of [
  [{}, {}], [{networkBus:'CAN'}, {networkBus:'CAN'}],
  [{networkBus:' ＣＡＮ '}, {network_bus:'can'}],
  [{networkChannel:' A '}, {network_channel:'a'}],
  [{gatewayRoute:' ＧＷ '}, {gateway_route:'gw'}],
  [{networkBus:'CAN|A'}, {networkBus:'CAN|A'}],
  [{networkBus:'CAN', networkChannel:'-'}, {networkBus:'CAN', networkChannel:'-'}],
  [{networkBus:'CAN A'}, {networkBus:'CAN B'}], [{}, {networkBus:'CAN'}],
  [{networkBus:'A', network_bus:'B'}, {}],
  [{networkScopeConflict:true}, {}], [{networkBus:null}, {}]
]) {
  const input = pair(left, right);
  equal(model.buildLivePidTimelineSummary(input), baseline.buildLivePidTimelineSummary(input), 'noncolliding summary unchanged');
}
for (const change of [
  t => { t.samples[1].observationCondition = 'cold'; },
  t => { t.samples[1].capturedAt = t.samples[0].capturedAt; },
  t => { t.samples[1].monitorValues[0].unit = 'rps'; },
  t => { t.samples[1].monitorValues[0].sourceEcu = '7E9'; },
  t => { t.samples[1].monitorValues[0].decoded = false; },
  t => { t.samples[1].monitorValues[0].valueType = 'text'; }
]) {
  const input = pair({networkBus:'CAN'}); change(input);
  equal(model.buildLivePidTimelineSummary(input), baseline.buildLivePidTimelineSummary(input), 'existing exclusion unchanged');
}
for (const test of legacy.cases) equal(model.buildLivePidTimelineSummary(test.timeline), baseline.buildLivePidTimelineSummary(test.timeline), 'legacy regression unchanged');
equal(fs.readFileSync(new URL('../obd-readonly.js', import.meta.url), 'utf8'), source, 'production source unchanged');
console.log(JSON.stringify({ checks, reports, scope: 'Production timeline key regression; frozen legacy samples retained; no vehicle I/O' }, null, 2));
