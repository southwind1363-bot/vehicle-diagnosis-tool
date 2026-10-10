import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const url=new URL('../obd-readonly.js',import.meta.url);
const source=fs.readFileSync(url,'utf8');
// Production regression against frozen normalization outputs; no runtime patch.
const context={window:{}};vm.runInNewContext(source,context);
const after=context.window.ObdReadOnly;
const frozen=JSON.parse(fs.readFileSync(new URL('./fixtures/live-scope-3.13.660.json',import.meta.url),'utf8'));
const before={...after,normalizeBridgeLivePidSnapshot(input){
 const record=frozen.records.find(r=>JSON.stringify(r.input)===JSON.stringify(input));
 assert.ok(record,'missing frozen baseline');return record.output;
}};
const plain=x=>JSON.parse(JSON.stringify(x));let checks=0;
const eq=(a,b,label)=>{assert.deepEqual(plain(a),plain(b),label);checks++;};
const make=(scopes,topScope={})=>({ok:true,blocked:false,would_transmit:false,data:{
 monitor_values:[{id:'engine_speed',value:9999,unit:'rpm',source_ecu:'7E8',...topScope}],
 ecu_snapshots:scopes.map((scope,i)=>({source_ecu:'7E8',...scope,live_pid_readout_status:'reported',
 monitor_values:[{id:'engine_speed',value:(i+1)*1200,unit:'rpm'}]}))}});
const pairs=[
 [{networkBus:'CAN|A'},{networkBus:'CAN A'}],
 [{networkBus:'CAN',networkChannel:'-'},{networkBus:'CAN'}],
 [{networkBus:'-',networkChannel:'1'},{networkChannel:'1'}],
 [{networkBus:'CAN',gatewayRoute:'-'},{networkBus:'CAN'}],
 [{networkChannel:'a|b'},{networkChannel:'a b'}],
 [{gatewayRoute:'a|b'},{gatewayRoute:'a b'}]
];
for(const [left,right] of pairs)for(const [a,b] of [[left,right],[right,left]]) {
 const input=make([a,b]),saved=JSON.stringify(input);
 const old=before.normalizeBridgeLivePidSnapshot(input),fixed=after.normalizeBridgeLivePidSnapshot(input);
 eq(old.monitorValues.map(x=>x.value),[9999],'reproduce ambiguous inheritance');
 eq(fixed.monitorValues.map(x=>x.value),[1200,2400],'retain explicitly scoped observations');
 eq(fixed.livePidEcuSnapshots,old.livePidEcuSnapshots,'preserve ECU records');
 eq(fixed.monitorValues.map(x=>[x.networkBus??null,x.networkChannel??null,x.gatewayRoute??null]),[a,b].map(x=>[x.networkBus??null,x.networkChannel??null,x.gatewayRoute??null]),'correct route fields');
 eq(JSON.stringify(input),saved,'input unchanged');
 eq(fixed.vehicleCommandEnabled,false,'no vehicle commands');eq(fixed.wouldTransmit,false,'no transmission');
 const wrong=make([a],b);
 eq(before.normalizeBridgeLivePidSnapshot(wrong).monitorValues.map(x=>x.value),[9999],'reproduce wrong explicit route');
 eq(after.normalizeBridgeLivePidSnapshot(wrong).monitorValues.map(x=>x.value),[1200],'exclude wrong explicit route');
 const session=after.buildDiagnosticScanSession({live_pid_snapshot:fixed});
 const restored=after.buildDiagnosticScanSessionFromJson(JSON.stringify(after.buildBridgeSessionExportPayload(session)));
 eq(restored.livePidSnapshot.monitorValues,session.livePidSnapshot.monitorValues.map((row,i)=>({...row,sourceLine:i+1})),'JSON export restore scoped values with existing sequential sourceLine');
}
for(const scopes of [[],[{}],[{networkBus:'CAN'}],[{networkBus:'CAN'},{network_bus:'ＣＡＮ'}],
 [{networkBus:'A'},{networkBus:'B'}],[{networkBus:'A',network_bus:'B'}]]) {
 const input=make(scopes);
 eq(after.normalizeBridgeLivePidSnapshot(input),before.normalizeBridgeLivePidSnapshot(input),'unaffected cases unchanged');
}
for(const patch of [{blocked:true},{ok:false},{would_transmit:true}]) {
 const input={...make([{networkBus:'CAN'}]),...patch};
 eq(after.normalizeBridgeLivePidSnapshot(input),before.normalizeBridgeLivePidSnapshot(input),'safety and failure states unchanged');
}
const raw=make([{networkBus:'CAN'}]);raw.data.monitor_values[0].value='01 02';raw.data.monitor_values[0].decoded=false;
eq(after.normalizeBridgeLivePidSnapshot(raw),before.normalizeBridgeLivePidSnapshot(raw),'RAW preserved');
const ordinary=before.buildDiagnosticScanSession({live_pid_snapshot:before.normalizeBridgeLivePidSnapshot(make([{networkBus:'A'},{networkBus:'B'}]))});
const ordinaryRestored=before.buildDiagnosticScanSessionFromJson(JSON.stringify(before.buildBridgeSessionExportPayload(ordinary)));
eq(ordinary.livePidSnapshot.monitorValues.map(x=>x.sourceLine),[1,1],'existing child-local source line');
eq(ordinaryRestored.livePidSnapshot.monitorValues.map(x=>x.sourceLine),[1,2],'existing import sequential source line');
eq(fs.readFileSync(url,'utf8'),source,'runtime not modified');
console.log('Live scope inheritance regression: '+checks+' checks passed; production code, frozen baseline, no vehicle I/O');
