import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

// Review only: patch one function in an isolated VM. Do not write runtime assets.
const source = fs.readFileSync(new URL('../obd-readonly.js', import.meta.url), 'utf8');
const functionPattern = /  function buildLivePidTimelineSummary\([^)]*\) \{[\s\S]*?(?=\r?\n  function )/;
const functionSource = source.match(functionPattern)?.[0];
assert.ok(functionSource, 'production timeline summary function must be located');
const oldKey = /    const monitorComparisonKey = \(item\) => \{[\s\S]*?\r?\n    \};/;
const proposedKey = [
  '    const monitorComparisonKey = (item) => {',
  '      const scope = normalizeReadoutNetworkScope(item);',
  '      if (scope.conflict) return null;',
  '      return JSON.stringify([monitorComparisonBaseKey(item),',
  '        ...[scope.networkBus, scope.networkChannel, scope.gatewayRoute]',
  '          .map(value => value === null ? null : value.normalize("NFKC").toLowerCase())]);',
  '    };'
].join('\n');
assert.equal((functionSource.match(new RegExp(oldKey.source, 'g')) || []).length, 1);
const patchedFunction = functionSource.replace(oldKey, proposedKey);
const patchedSource = source.replace(functionSource, patchedFunction);
function load(text) {
  const context = vm.createContext({ window: {} });
  vm.runInContext(text, context);
  return context.window.ObdReadOnly;
}
const current = load(source), proposal = load(patchedSource);
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
    const oldSummary = current.buildLivePidTimelineSummary(input);
    const newSummary = proposal.buildLivePidTimelineSummary(input);
    equal(oldSummary.comparedValueCount, 1, 'reproduce current scope collision');
    equal(newSummary.comparedValueCount, 0, 'exclude different scope');
    equal(newSummary.networkScopeMismatchValueCount, 1, 'report scope mismatch');
    equal(newSummary.changes, [], 'do not publish delta across scopes');
    equal(newSummary.comparisonAvailable, oldSummary.comparisonAvailable, 'capture eligibility unchanged');
    equal(JSON.stringify(input), before, 'input unchanged');
    const normalized = current.normalizeLivePidTimeline(input);
    equal(proposal.normalizeLivePidTimeline(input), normalized, 'normalization unchanged');
    equal(proposal.buildLivePidTimelineSummary(normalized).comparedValueCount, 0, 'normalized comparison isolated');
    const archive = { ...legacy.mixedArchive, session: { live_pid_timeline: normalized } };
    const oldSession = current.buildDiagnosticScanSessionFromJson(JSON.stringify(archive));
    const newSession = proposal.buildDiagnosticScanSessionFromJson(JSON.stringify(archive));
    equal(newSession.livePidTimeline.samples, oldSession.livePidTimeline.samples, 'legacy samples retained');
    const restored = proposal.buildDiagnosticScanSessionFromJson(JSON.stringify(proposal.buildBridgeSessionExportPayload(newSession)));
    equal(restored.livePidTimeline.samples, oldSession.livePidTimeline.samples, 'round trip samples retained');
  }
  reports.push({ left, right, currentCompared: 1, proposedCompared: 0, proposedScopeMismatch: 1 });
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
  equal(proposal.buildLivePidTimelineSummary(input), current.buildLivePidTimelineSummary(input), 'noncolliding summary unchanged');
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
  equal(proposal.buildLivePidTimelineSummary(input), current.buildLivePidTimelineSummary(input), 'existing exclusion unchanged');
}
for (const test of legacy.cases) equal(proposal.buildLivePidTimelineSummary(test.timeline), current.buildLivePidTimelineSummary(test.timeline), 'legacy regression unchanged');
equal(fs.readFileSync(new URL('../obd-readonly.js', import.meta.url), 'utf8'), source, 'production source unchanged');
console.log(JSON.stringify({ checks, reports, scope: 'VM-only timeline key proposal; no runtime changes or vehicle I/O' }, null, 2));
