import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const context = vm.createContext({ window: {} });
vm.runInContext(fs.readFileSync(new URL('../obd-readonly.js', import.meta.url), 'utf8'), context);
const chartCode = fs.readFileSync(new URL('../script.js', import.meta.url), 'utf8').match(/function buildLivePidTimelineChartRows\([^)]*\) \{[\s\S]*?\r?\n\}/)[0];
vm.runInContext(chartCode, context);
const model = context.window.ObdReadOnly;
const chart = context.buildLivePidTimelineChartRows;
const plain = value => JSON.parse(JSON.stringify(value));
let checks = 0;
const check = (condition, message) => { assert.ok(condition, message); checks++; };
const pair = (left = {}, right = left) => ({ samples: [left, right].map((scope, i) => ({
  capturedAt: `2026-10-10T00:00:0${i}Z`, observationCondition: 'warm',
  monitorValues: [{ id: 'engine_speed', label: 'Engine speed', sourceEcu: '7E8', unit: 'rpm', value: i * 100, ...scope }]
})) });
for (const field of ['networkBus', 'networkChannel', 'gatewayRoute']) {
  const same = pair({ [field]: 'CAN-A' });
  check(chart(same).length === 1 && chart(same)[0].delta === 100, 'same scope retains zero and delta');
  check(chart(pair({ [field]: 'CAN-A' }, { [field]: 'CAN-B' })).length === 0, 'different scope merged: ' + field);
  check(chart(pair({}, { [field]: 'CAN-A' })).length === 0, 'unspecified scope merged: ' + field);
}
for (const [camel, snake] of [['networkBus', 'network_bus'], ['networkChannel', 'network_channel'], ['gatewayRoute', 'gateway_route']]) {
  check(chart(pair({ [camel]: ' ＣＡＮ-A ' }, { [snake]: 'can-a' })).length === 1, 'canonical scope aliases');
  check(chart(pair({ [camel]: 'A', [snake]: 'B' })).length === 0, 'conflicting aliases graphed');
}
for (const scope of [{ networkBus: null }, { networkBus: '' }, { networkBus: 1 }, { networkBus: 'x'.repeat(121) },
  { networkScopeConflict: true }, { network_scope_conflict: true }, { networkScopeEvidenceEligible: false },
  { networkBusProvided: true }, { networkBus: 'A', networkBusProvided: false }]) {
  check(chart(pair(scope)).length === 0, 'invalid scope graphed: ' + JSON.stringify(scope));
}
check(chart(pair({ networkBus: 'a|b', networkChannel: 'c' }, { networkBus: 'a', networkChannel: 'b|c' })).length === 0, 'scope separator collision');
check(chart(pair({ networkBus: '-' }, {})).length === 0, 'missing scope placeholder collision');
check(chart(pair()).length === 1, 'legacy unscoped graph lost');
const multi = pair();
multi.samples.forEach((sample, i) => { sample.monitorValues = ['CAN-A', 'CAN-B'].map((networkBus, n) => ({
  ...sample.monitorValues[0], networkBus, networkChannel: 'channel-1', gatewayRoute: 'gateway/engine', value: n * 1000 + i * 100
})); });
const before = JSON.stringify(multi);
const rows = chart(multi);
check(rows.length === 2 && rows.every(row => row.points.length === 2 && row.delta === 100), 'two scopes must have independent series');
check(rows[0].minimum === 0 && rows[1].minimum === 1000, 'scoped min/max merged');
check(rows.every(row => row.networkScopeLabel.includes('channel-1') && row.networkScopeLabel.includes('gateway/engine')), 'scope labels incomplete');
check(JSON.stringify(multi) === before, 'chart mutated input');
const legacy = JSON.parse(fs.readFileSync(new URL('./fixtures/timeline-legacy-3.13.655.json', import.meta.url), 'utf8'));
const archive = { ...legacy.mixedArchive, session: { live_pid_timeline: model.normalizeLivePidTimeline(multi) } };
const restored = model.buildDiagnosticScanSessionFromJson(JSON.stringify(archive));
const summaryBefore = JSON.stringify(model.buildLivePidTimelineSummary(restored.livePidTimeline));
check(chart(restored.livePidTimeline).length === 2, 'scope lost through JSON import');
const again = model.buildDiagnosticScanSessionFromJson(JSON.stringify(model.buildBridgeSessionExportPayload(restored)));
assert.deepEqual(plain(again.livePidTimeline.samples), plain(restored.livePidTimeline.samples)); checks++;
check(JSON.stringify(model.buildLivePidTimelineSummary(restored.livePidTimeline)) === summaryBefore, 'chart changed summary');
console.log(`Timeline network chart: ${checks} checks passed`);
