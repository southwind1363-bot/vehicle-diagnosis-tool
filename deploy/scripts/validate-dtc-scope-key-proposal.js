import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source = fs.readFileSync(new URL('../obd-readonly.js', import.meta.url), 'utf8');
// Scope is limited to the two DTC normalizers. Production assets are not modified.
const helper = `  function getDtcReadoutNetworkScopeIdentity(input = {}) {
    const scope = normalizeReadoutNetworkScope(input);
    if (scope.conflict) return null;
    if (!scope.provided) return "";
    return JSON.stringify([scope.networkBus, scope.networkChannel, scope.gatewayRoute]
      .map(value => value === null ? null : value.normalize("NFKC").toLowerCase()));
  }
`;
let proposedSource = source;
for (const name of ['normalizeDtcSnapshot', 'normalizeBridgeDtcSnapshot']) {
  const pattern = new RegExp('  function ' + name + '\\([^)]*\\) \\{[\\s\\S]*?(?=\\r?\\n  function )');
  const body = source.match(pattern)?.[0];
  assert.ok(body && body.includes('getReadoutNetworkScopeKey('), name);
  proposedSource = proposedSource.replace(body, body.replaceAll('getReadoutNetworkScopeKey(', 'getDtcReadoutNetworkScopeIdentity('));
}
proposedSource = proposedSource.replace('  function getReadoutNetworkScopeKey(', helper + '\n  function getReadoutNetworkScopeKey(');
function load(text) { const context = vm.createContext({ window: {} }); vm.runInContext(text, context); return context.window.ObdReadOnly; }
const before = load(source), after = load(proposedSource);
const plain = x => JSON.parse(JSON.stringify(x));
let checks = 0;
const eq = (a, b, message) => { assert.deepEqual(plain(a), plain(b), message); checks++; };
const collisions = [
  [{networkBus:'CAN|A'}, {networkBus:'CAN A'}],
  [{networkBus:'CAN',networkChannel:'-'}, {networkBus:'CAN'}],
  [{networkBus:'-',networkChannel:'1'}, {networkChannel:'1'}],
  [{networkBus:'CAN',gatewayRoute:'-'}, {networkBus:'CAN'}],
  [{networkChannel:'a|b'}, {networkChannel:'a b'}],
  [{gatewayRoute:'a|b'}, {gatewayRoute:'a b'}]
];
const make = (a, b, extra = {}) => ({dtcReadoutStatus:'reported', capturedAt:'2026-10-10T00:00:00Z',
 dtcs:[a,b].map(scope=>({code:'P0171',ecu:'7E8',status:'stored',...scope,...extra}))});
const legacy = JSON.parse(fs.readFileSync(new URL('./fixtures/timeline-legacy-3.13.655.json', import.meta.url), 'utf8'));
for (const [left,right] of collisions) for (const [a,b] of [[left,right],[right,left]]) {
 const input=make(a,b), original=JSON.stringify(input);
 for(const method of ['normalizeDtcSnapshot','normalizeBridgeDtcSnapshot']) {
  const old=before[method](input), result=after[method](input);
  eq(old.dtcs.length,1,'reproduce current lost scope');
  eq(result.dtcs.length,2,'retain both scopes');
  eq(result.dtcs.map(row=>[row.networkBus??null,row.networkChannel??null,row.gatewayRoute??null]),[a,b].map(scope=>[scope.networkBus??null,scope.networkChannel??null,scope.gatewayRoute??null]),'retain route values');
  const repeated=after[method](result), oldRepeated=before[method](old);
  eq(repeated.dtcs.filter(row=>after.normalizeReadoutNetworkScope(row).provided).length,2,'repeated normalization retains scoped rows');
  eq(repeated.dtcs.filter(row=>!after.normalizeReadoutNetworkScope(row).provided),oldRepeated.dtcs.filter(row=>!before.normalizeReadoutNetworkScope(row).provided),'pre-existing unscoped fallback unchanged');
 }
 const archive={...legacy.mixedArchive,session:{dtc_snapshot:input}};
 const imported=after.buildDiagnosticScanSessionFromJson(JSON.stringify(archive));
 eq(imported.dtcSnapshot.dtcs.length,2,'JSON import');
 eq(imported.wouldTransmit,false,'no transmit permission');
 eq(imported.vehicleCommandEnabled,false,'no vehicle command permission');
 const restored=after.buildDiagnosticScanSessionFromJson(JSON.stringify(after.buildBridgeSessionExportPayload(imported)));
 eq(restored.dtcSnapshot.dtcs,imported.dtcSnapshot.dtcs,'archive round trip');
 eq(JSON.stringify(input),original,'no mutation');
 // Historical one-row exports cannot recover the record already discarded by older code.
 const oldArchive={...legacy.mixedArchive,session:{dtc_snapshot:before.normalizeDtcSnapshot(input)}};
 eq(after.buildDiagnosticScanSessionFromJson(JSON.stringify(oldArchive)).dtcSnapshot.dtcs.length,1,'do not invent lost historical row');
}
for(const [a,b] of [[{},{}],[{networkBus:'CAN'},{networkBus:'CAN'}],[{networkBus:' ＣＡＮ '},{network_bus:'can'}],
 [{networkBus:'CAN-A'},{networkBus:'CAN-B'}],[{}, {networkBus:'CAN'}],[{networkBus:'A',network_bus:'B'},{}],
 [{networkScopeConflict:true},{}],[{networkBus:null},{}]]) {
 for(const method of ['normalizeDtcSnapshot','normalizeBridgeDtcSnapshot'])eq(after[method](make(a,b)),before[method](make(a,b)),'unaffected normalized output');
}
for(const status of ['stored','pending','permanent','unknown']) {
 const input=make({networkBus:'CAN|A'},{networkBus:'CAN A'},{status});
 eq(after.normalizeDtcSnapshot(input).dtcs.length,2,'all statuses retain scope');
}
const mixed=make({networkBus:'CAN|A'},{networkBus:'CAN A'});mixed.dtcs[1].status='unknown';
eq(before.normalizeDtcSnapshot(mixed).dtcs.length,1,'typed status collision baseline');
eq(after.normalizeDtcSnapshot(mixed).dtcs.length,2,'unknown status on another route retained');
eq(fs.readFileSync(new URL('../obd-readonly.js',import.meta.url),'utf8'),source,'runtime unchanged');
console.log(`DTC scope proposal: ${checks} checks passed; two isolated normalizers; no runtime or vehicle I/O changes`);
