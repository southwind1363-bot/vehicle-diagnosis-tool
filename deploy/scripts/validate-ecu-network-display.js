import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const app = fs.readFileSync(new URL('../script.js', import.meta.url), 'utf8');
const renderSource = app.match(/function buildObdEcuResponseDisplayLines\([^)]*\) \{[\s\S]*?\r?\n\}/)?.[0];
assert.ok(renderSource);
const context = vm.createContext({ window: {} });
vm.runInContext('Date = class extends Date { constructor(...args) { super(...(args.length ? args : [1791853200000])); } static now() { return 1791853200000; } };', context);
vm.runInContext(fs.readFileSync(new URL('../obd-readonly.js', import.meta.url), 'utf8'), context);
vm.runInContext(renderSource, context);
const render = summary => Array.from(context.buildObdEcuResponseDisplayLines(summary));
const base = { id: 'ECM', address: '7E8', status: 'reported', responseCount: 2, responseTimeMs: 0 };
const baseline = render({ ecus: [base] });
let checks = 0;
const equal = (actual, expected, label) => { assert.deepEqual(actual, expected, label); checks++; };
for (const [fields, warning, route] of [
  [{}, null, null],
  [{ networkBus: 'CAN-A', networkChannel: '1', gatewayRoute: 'GW-A' }, null, 'バス: CAN-A / チャネル: 1 / 経路: GW-A'],
  [{ network_bus: 'CAN-B', network_channel: '2', gateway_route: 'GW-B' }, null, 'バス: CAN-B / チャネル: 2 / 経路: GW-B'],
  [{ networkScopeConflict: true, networkBus: 'CAN-A' }, '矛盾', 'バス: CAN-A'],
  [{ network_scope_conflict: true }, '矛盾', null],
  [{ networkScopeConflict: false, network_scope_conflict: true }, '矛盾', null],
  [{ networkScopeEvidenceEligible: false }, '根拠対象外', null],
  [{ network_scope_evidence_eligible: false, gateway_route: 'GW-B' }, '根拠対象外', '経路: GW-B'],
  [{ networkScopeConflict: true, networkScopeEvidenceEligible: false }, '矛盾', null],
  [{ networkScopeConflict: false, networkScopeEvidenceEligible: true }, null, null],
  [{ networkScopeConflict: 'true', networkScopeEvidenceEligible: 'false' }, null, null],
  [{ networkBus: 0, networkChannel: {}, gatewayRoute: '   ' }, null, null]
]) {
  const summary = { ecus: [{ ...base, ...fields }] }, original = JSON.stringify(summary);
  const lines = render(summary), warnings = lines.filter(line => line.includes('注意:'));
  equal(lines.filter(line => !line.includes('注意:') && !line.includes('記録内の通信経路')), baseline, 'existing display retained');
  equal(warnings.length, warning ? 1 : 0, 'only strict boolean flags create warnings');
  if (warning) equal(warnings[0].includes(warning), true, 'reason');
  equal(lines.some(line => line.includes('記録内の通信経路')), Boolean(route), 'only recorded route values shown');
  if (route) equal(lines.some(line => line.endsWith(route)), true, 'route value');
  if (warning === '矛盾' && route) equal(lines.some(line => line.includes('（未確定）')), true, 'conflicting route never presented as certain');
  equal(JSON.stringify(summary), original, 'rendering does not mutate record');
}

const model = context.window.ObdReadOnly;
const summary = model.normalizeEcuResponseSummary({ ecus: [
  { ...base, id: 'bus-conflict', networkBus: 'CAN-A', network_bus: 'CAN-B' },
  { ...base, id: 'channel-conflict', address: '7E9', networkChannel: '1', network_channel: '2' },
  { ...base, id: 'gateway-conflict', address: '7EA', gatewayRoute: 'GW-A', gateway_route: 'GW-B' },
  { ...base, id: 'normal-a', address: '7EB', networkBus: 'CAN-A' },
  { ...base, id: 'normal-b', address: '7EB', networkBus: 'CAN-B' }
] });
equal(summary.ecus.length, 5, 'same ECU on different routes retained');
const session = model.buildDiagnosticScanSession({ ecuResponseSummary: summary });
const archive = JSON.stringify(model.buildBridgeSessionExportPayload(session));
const restored = model.buildDiagnosticScanSessionFromJson(archive);
for (const value of [session, restored]) {
  const original = JSON.stringify(value);
  const lines = render(value.ecuResponseSummary);
  equal(lines.filter(line => line.includes('通信経路の情報に矛盾')).length, 3, 'normalized conflict and archive warning');
  equal(lines.filter(line => line.includes('応答取得 (reported)')).length, 5, 'status remains reported');
  equal(lines.filter(line => line.includes('記録内の通信経路')).length, 5, 'route details retained');
  equal(value.vehicleCommandEnabled, false, 'no commands');
  equal(value.wouldTransmit, false, 'no transmission');
  equal(JSON.stringify(value), original, 'session remains unchanged');
}
equal(JSON.stringify(model.buildBridgeSessionExportPayload(session)), archive, 'saved bytes unchanged by display');
const dual = render({ ecus: [{ ...base, ecuResponseConflict: true, networkScopeConflict: true }] });
equal(dual.filter(line => line.includes('注意:')).length, 2, 'identity and route reasons both visible');
console.log(`ECU network display: ${checks} checks passed; synthetic normalization, same-ECU routes, immutable session/archive and strict flags.`);
