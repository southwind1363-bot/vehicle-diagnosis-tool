import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
// Isolated proposal only. Production source and shared scope rules are not edited.
const url = new URL('../obd-readonly.js', import.meta.url);
const source = fs.readFileSync(url, 'utf8');
const start = source.indexOf('  function linkReadableFreezeFrameToDtcSnapshot(');
const end = source.indexOf('  function buildDiagnosticScanSession(', start);
assert.ok(start >= 0 && end > start);
const original = source.slice(start, end);
assert.equal((original.match(/readoutNetworkScopeMatches\(/g) || []).length, 4);
assert.equal((original.match(/getReadoutNetworkScopeKey\(value\)/g) || []).length, 1);
const replacement = original.replace('const linkScopeKey = (value) => getReadoutNetworkScopeKey(value);',
  'const linkScopeKey = (value) => getDtcReadoutNetworkScopeIdentity(value);\n'
  + '    const linkScopeMatches = (expected, observed) => {\n'
  + '      const a = normalizeReadoutNetworkScope(expected), b = normalizeReadoutNetworkScope(observed);\n'
  + '      if (a.conflict || b.conflict) return false;\n'
  + '      if (!a.provided) return true;\n'
  + '      return b.provided && linkScopeKey(expected) === linkScopeKey(observed);\n'
  + '    };').replaceAll('readoutNetworkScopeMatches(', 'linkScopeMatches(');
const load = text => { const c = {window:{}}; vm.runInNewContext(text,c); return c.window.ObdReadOnly; };
let proposed = source.slice(0,start)+replacement+source.slice(end);
for (const [from,to] of [
 ['  function normalizeFreezeFrameSnapshot(', '  function buildFreezeFrameNumberSummary('],
 ['  function buildFreezeFrameAssociationSummary(', '  function normalizeReadinessSnapshot(']
]) {
 const a=proposed.indexOf(from), b=proposed.indexOf(to,a);
 assert.ok(a>=0 && b>a);
 const body=proposed.slice(a,b);
 // Keep the existing presentation sort order. Change identity only.
 const oldCall=from.includes('normalizeFreeze')?'getReadoutNetworkScopeKey(item)':'getReadoutNetworkScopeKey(scopeSource)';
 assert.equal(body.split(oldCall).length-1,1);
 proposed=proposed.slice(0,a)+body.replace(oldCall,oldCall.replace('getReadoutNetworkScopeKey','getDtcReadoutNetworkScopeIdentity'))+proposed.slice(b);
}
const before = load(source), after = load(proposed);
const plain = x => JSON.parse(JSON.stringify(x));
let checks=0;
const eq=(a,b,label)=>{assert.deepEqual(plain(a),plain(b),label);checks++;};
const envelope=JSON.parse(fs.readFileSync(new URL('./fixtures/timeline-legacy-3.13.655.json',import.meta.url),'utf8')).mixedArchive;
const make=(dtc,trigger,value=trigger)=>({
 dtc_snapshot:{dtc_readout_status:'reported',dtcs:[{code:'P0171',status:'stored',ecu:'7E8',...dtc}]},
 freeze_frame_snapshot:{freeze_frame_readout_status:'reported',
 trigger_dtc_entries:[{code:'P0171',source_ecu:'7E8',frame_number:0,...trigger}],
 monitor_values:[{id:'engine_speed',value:1200,unit:'rpm',source_ecu:'7E8',freeze_frame_number:0,...value}]}
});
const matches=s=>s.dtcSnapshot.dtcs[0].freezeFrameMatches||[];
const refs=s=>matches(s).flatMap(x=>x.freezeFrameValueRefs||[]);
const pairs=[
 [{networkBus:'CAN|A'},{networkBus:'CAN A'}],
 [{networkBus:'CAN',networkChannel:'-'},{networkBus:'CAN'}],
 [{networkBus:'-',networkChannel:'1'},{networkChannel:'1'}],
 [{networkBus:'CAN',gatewayRoute:'-'},{networkBus:'CAN'}],
 [{networkChannel:'a|b'},{networkChannel:'a b'}],
 [{gatewayRoute:'a|b'},{gatewayRoute:'a b'}]
];
for(const [left,right] of pairs)for(const [a,b] of [[left,right],[right,left]]){
 const input=make(a,b), saved=JSON.stringify(input);
 const old=before.buildDiagnosticScanSession(input), result=after.buildDiagnosticScanSession(input);
 eq(matches(old).length,1,'reproduce wrong cross-route link');
 eq(matches(result).length,0,'exclude cross-route trigger');
 eq(result.dtcSnapshot.freezeFrameLinkSummary.matchedDtcCount,0,'derived DTC count');
 eq(result.freezeFrameSnapshot,old.freezeFrameSnapshot,'FF records and association summary unchanged');
 eq(JSON.stringify(input),saved,'input unchanged');
 const imported=after.buildDiagnosticScanSessionFromJson(JSON.stringify({...envelope,session:input}));
 eq(matches(imported).length,0,'real JSON entry point');
 const restored=after.buildDiagnosticScanSessionFromJson(JSON.stringify(after.buildBridgeSessionExportPayload(imported)));
 eq(matches(restored).length,0,'export and restore do not revive wrong link');
 eq(restored.vehicleCommandEnabled,false,'vehicle commands remain blocked');
 eq(restored.wouldTransmit,false,'no transmission');
 // Trigger is correct but its value comes from the colliding route.
 const mixed=make(a,a,b), prior=before.buildDiagnosticScanSession(mixed), fixed=after.buildDiagnosticScanSession(mixed);
 eq(refs(prior).length,1,'reproduce wrong-route value');
 eq(refs(fixed).length,0,'wrong-route measured value excluded');
 eq(matches(fixed).length,1,'correct trigger still linked');
 eq(fixed.freezeFrameSnapshot.monitorValues,prior.freezeFrameSnapshot.monitorValues,'measurements retained');
 eq(fixed.freezeFrameSnapshot.freezeFrameAssociationSummary.matchedGroupCount,0,'no falsely matched value group');
 eq(fixed.freezeFrameSnapshot.freezeFrameAssociationSummary.groupCount,2,'trigger and values grouped separately');
 eq(matches(fixed)[0].freezeFrameValueAssociationVerified === true,false,'not verified without same-route values');
 const both=make(a,a), second=make(b,b);both.dtc_snapshot.dtcs.push(second.dtc_snapshot.dtcs[0]);
 both.freeze_frame_snapshot.trigger_dtc_entries.push(second.freeze_frame_snapshot.trigger_dtc_entries[0]);
 both.freeze_frame_snapshot.monitor_values.push({...second.freeze_frame_snapshot.monitor_values[0],value:2400});
 const separate=after.buildDiagnosticScanSession(both);
 eq(separate.freezeFrameSnapshot.triggerDtcEntries.length,2,'both route triggers retained');
 eq(separate.dtcSnapshot.dtcs.map(r=>r.freezeFrameMatches?.length||0),[1,1],'one trigger per DTC route');
 eq(separate.dtcSnapshot.dtcs.map(r=>r.freezeFrameMatches[0].freezeFrameValueRefs.map(v=>v.value)),[[1200],[2400]],'correct measured values per route');
 const restoredBoth=after.buildDiagnosticScanSessionFromJson(JSON.stringify(after.buildBridgeSessionExportPayload(separate)));
 eq(restoredBoth.dtcSnapshot.dtcs,separate.dtcSnapshot.dtcs,'two-route archive round trip');
}
for(const [a,b] of [[{},{}],[{networkBus:'CAN'},{networkBus:'CAN'}],
 [{networkBus:' ＣＡＮ '},{network_bus:'can'}],[{networkBus:'A'},{networkBus:'B'}],
 [{}, {networkBus:'CAN'}],[{networkBus:'CAN'},{}],[{networkBus:'A',network_bus:'B'},{}],
 [{networkScopeConflict:true},{}]]){
 const input=make(a,b);
 eq(after.buildDiagnosticScanSession(input),before.buildDiagnosticScanSession(input),'ordinary and unspecified-scope policy unchanged');
}
const raw=make({networkBus:'CAN'},{networkBus:'CAN'});
raw.freeze_frame_snapshot.monitor_values[0].value='01 02';
raw.freeze_frame_snapshot.monitor_values[0].decoded=false;
eq(after.buildDiagnosticScanSession(raw),before.buildDiagnosticScanSession(raw),'RAW values unchanged');
for(const field of ['ecu','code']){
 const input=make({networkBus:'CAN'},{networkBus:'CAN'});
 input.dtc_snapshot.dtcs[0][field]=field==='ecu'?'7E9':'P0300';
 eq(matches(after.buildDiagnosticScanSession(input)).length,0,'other ECU/code excluded');
}
for(const state of ['stored','pending','permanent','unknown']) {
 const input=make({networkBus:'CAN|A'},{networkBus:'CAN A'});
 input.dtc_snapshot.dtcs[0].status=state;
 eq(matches(after.buildDiagnosticScanSession(input)).length,0,'all DTC states exclude wrong route');
}
for(const field of ['dtc_snapshot','freeze_frame_snapshot']) {
 const input=make({networkBus:'CAN'},{networkBus:'CAN'});
 input[field][field==='dtc_snapshot'?'dtc_readout_status':'freeze_frame_readout_status']='unavailable';
 eq(after.buildDiagnosticScanSession(input),before.buildDiagnosticScanSession(input),'unavailable readout unchanged');
}
eq(fs.readFileSync(url,'utf8'),source,'production file unchanged');
console.log('FF link scope proposal: '+checks+' checks passed; isolated VM; production unchanged; no vehicle I/O');
