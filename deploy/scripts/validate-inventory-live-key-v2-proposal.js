import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const url=new URL('../obd-readonly.js',import.meta.url),source=fs.readFileSync(url,'utf8');
// Expose existing private functions only in this test VM. No runtime edits.
const c={window:{}};vm.runInNewContext(source.replace('window.ObdReadOnly = Object.freeze({','window.ObdReadOnly = Object.freeze({buildCoreReadoutInventorySummary,buildImportedCoreReadoutInventoryComparisonSummary,'),c);
const core=c.window.ObdReadOnly;
const plain=x=>JSON.parse(JSON.stringify(x));let checks=0;
const eq=(a,b,label)=>{assert.deepEqual(plain(a),plain(b),label);checks++;};
// Development-only key format prototype, accepting normalized numeric observations.
const prefix='live_pid_value_v2:';
function encode(row){
 const scope=core.normalizeReadoutNetworkScope(row);
 if(scope.conflict || typeof row.value!=='number' || !Number.isFinite(row.value))return null;
 return prefix+JSON.stringify([row.id,row.sourceEcu,row.unit,row.value,...[scope.networkBus,scope.networkChannel,scope.gatewayRoute].map(v=>v===null?null:v.normalize('NFKC').toLowerCase())]).replaceAll('|','\\u007c');
}
function decode(key){
 if(typeof key!=='string'||!key.startsWith(prefix))return null;
 let a;try{a=JSON.parse(key.slice(prefix.length));}catch{return null;}
 if(!Array.isArray(a)||a.length!==7||a.slice(0,3).some(v=>typeof v!=='string'||!v)||typeof a[3]!=='number'||!Number.isFinite(a[3]))return null;
 if(a.slice(4).some((v,i)=>v!==null&&(typeof v!=='string'||!v||v.length>[120,120,160][i])))return null;
 return a;
}
function compareKeys(before,after){
 const a=decode(before),b=decode(after);
 if(!a||!b)return {comparable:false,reason:'key_version_or_format'};
 if(JSON.stringify([...a.slice(0,3),...a.slice(4)])!==JSON.stringify([...b.slice(0,3),...b.slice(4)]))return {comparable:false,reason:'measurement_scope_mismatch'};
 return {comparable:true,delta:b[3]-a[3]};
}
const row=(scope,value=1200)=>({id:'engine_speed',sourceEcu:'7E8',unit:'rpm',value,...scope});
const inventory=rows=>core.buildCoreReadoutInventorySummary({livePidSnapshot:{livePidReadoutStatus:'reported',observationCondition:'warm',protocol:'ISO15765',monitorValues:rows}});
const pairs=[
 [{networkBus:'CAN|A'},{networkBus:'CAN A'}],
 [{networkBus:'CAN',networkChannel:'-'},{networkBus:'CAN'}],
 [{networkBus:'-',networkChannel:'1'},{networkChannel:'1'}],
 [{networkBus:'CAN',gatewayRoute:'-'},{networkBus:'CAN'}],
 [{networkChannel:'a|b'},{networkChannel:'a b'}],
 [{gatewayRoute:'a|b'},{gatewayRoute:'a b'}]
];
for(const [left,right] of pairs)for(const [a,b] of [[left,right],[right,left]]){
 const both=inventory([row(a),row(b)]);
 eq(both.countsById.live_pid_snapshot,2,'raw observations still counted');
 eq(both.livePidValueCount,1,'reproduce collapsed evidence count');
 eq(both.livePidValueKeys.length,1,'reproduce lossy inventory key');
 const old=inventory([row(a)]),current=inventory([row(b,2400)]);
 const comparison=core.buildImportedCoreReadoutInventoryComparisonSummary(old,current);
 eq(comparison.livePidValueComparisonAvailable,true,'reproduce cross-route comparison');
 eq(comparison.livePidValueDeltaRows.length,1,'wrong delta exists');
 const keyA=encode(row(a)),keyB=encode(row(b,2400));
 eq(keyA.split('|').length,1,'legacy delimiter parser rejects v2');
 eq(compareKeys(keyA,keyB),{comparable:false,reason:'measurement_scope_mismatch'},'v2 distinct routes');
 eq(compareKeys(keyA,encode(row(a,2400))),{comparable:true,delta:1200},'same-route comparison');
 eq(compareKeys(old.livePidValueKeys[0],keyB),{comparable:false,reason:'key_version_or_format'},'legacy scoped key not inferred');
 eq(decode(JSON.parse(JSON.stringify(keyA))),decode(keyA),'JSON key round trip');
}
eq(encode(row({networkBus:'ＣＡＮ'})),encode(row({network_bus:'can'})),'normalization aliases');
eq(compareKeys(encode(row({})),encode(row({networkBus:'CAN'}))).comparable,false,'unspecified route distinct');
eq(encode(row({networkBus:'A',network_bus:'B'})),null,'conflicting scope');
for(const key of ['',null,'live_pid_value_v2:{','live_pid_value_v2:[]','live_pid_value_v2:["x","7E8","rpm","1200",null,null,null]'])eq(decode(key),null,'malformed key');
for(const value of [NaN,Infinity,'1200',null])eq(encode(row({},value)),null,'prototype requires normalized number');
eq(fs.readFileSync(url,'utf8'),source,'runtime unchanged');
console.log('Inventory live key v2 proposal: '+checks+' checks passed; production collision reproduced; development-only codec, no runtime edits or vehicle I/O');
