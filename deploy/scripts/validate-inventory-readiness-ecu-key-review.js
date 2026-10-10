import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
// Regression acceptance for independent readiness / ECU inventory key v2.
const file=new URL('../obd-readonly.js',import.meta.url),source=fs.readFileSync(file,'utf8');
const context={window:{}};
vm.runInNewContext(source.replace('window.ObdReadOnly = Object.freeze({','window.ObdReadOnly = Object.freeze({buildCoreReadoutInventorySummary,buildImportedCoreReadoutInventoryComparisonSummary,'),context);
const api=context.window.ObdReadOnly, plain=x=>JSON.parse(JSON.stringify(x));let checks=0,cases=0;
const eq=(a,b,message)=>{assert.deepEqual(plain(a),b,message);checks++;};
const readiness=scopes=>({readinessReadoutStatus:'reported',monitors:scopes.map(scope=>({id:'misfire',sourceEcu:'7E8',supported:true,complete:true,...scope}))});
const items=scope=>[{id:'calibration_id',infoType:'04',sourceEcu:'7E8',value:'CAL-A',...scope},{id:'supported_info_types_00',sourceEcu:'7E8',value:'80 00 00 00',...scope}];
const ecu=scopes=>({ecuInfoReadoutStatus:'reported',items:scopes.flatMap(items)});
const inventory=(field,snapshot)=>api.buildCoreReadoutInventorySummary({[field]:snapshot});
const pairs=[];
for(const field of ['networkBus','networkChannel','gatewayRoute'])for(const kind of ['separator','missing']){
 const a={networkBus:'CAN',networkChannel:'CH1',gatewayRoute:'GW1'},b={...a};
 if(kind==='separator'){a[field]='A|B';b[field]='A B';}else{delete a[field];b[field]='-';}
 pairs.push([a,b]);
}
for(const [a,b] of pairs)for(const [left,right] of [[a,b],[b,a]]){
 cases++;
 const before=inventory('readinessSnapshot',readiness([left])),after=inventory('readinessSnapshot',readiness([right]));
 const both=inventory('readinessSnapshot',readiness([left,right]));
 eq(both.readinessMonitorKeys.length,2,'regression: two readiness routes stay distinct');
 const comparison=api.buildImportedCoreReadoutInventoryComparisonSummary(before,after);
 eq(comparison.readinessMonitorComparisonAvailable,true,'regression: readiness routes comparable');
 eq(comparison.readinessMonitorKeysChanged,true,'regression: readiness route change detected');
 const session=api.buildDiagnosticScanSession({readinessSnapshot:readiness([left,right])});
 eq(session.readinessSnapshot.monitors.length,2,'public import retains two observations');
 eq(session.coreReadoutInventorySummary.readinessMonitorKeys.length,2,'public import preserves readiness identities');
 const restored=api.buildDiagnosticScanSessionFromJson(JSON.stringify(api.buildBridgeSessionExportPayload(session)));
 eq(restored.readinessSnapshot.monitors,plain(session.readinessSnapshot.monitors),'readiness observations survive archive');
 eq(restored.vehicleCommandEnabled,false,'no command permission');eq(restored.wouldTransmit,false,'no I/O');
}
for(const [a,b] of [...pairs,[{networkBus:'CAN-PT'},{networkBus:'CAN-BODY'}]])for(const [left,right] of [[a,b],[b,a]]){
 cases++;
 const before=inventory('ecuInfoSnapshot',ecu([left])),after=inventory('ecuInfoSnapshot',ecu([right])),both=inventory('ecuInfoSnapshot',ecu([left,right]));
 eq(both.ecuInfoItemKeys.length,4,'regression: four ECU items retain four keys');
 eq(both.ecuInfoKeyValueKeys.length,2,'regression: two calibration routes remain distinct');
 eq(both.mode09SupportedTypeKeys.length,2,'regression: two Mode09 routes remain distinct');
 const comparison=api.buildImportedCoreReadoutInventoryComparisonSummary(before,after);
 for(const prefix of ['ecuInfoItem','ecuInfoKeyValue','mode09SupportedType']){
 eq(comparison[prefix+'ComparisonAvailable'],true,'regression: separate ECU routes comparable');
 eq(comparison[prefix+'KeysChanged'],true,'regression: separate ECU route change detected');
 }
 const session=api.buildDiagnosticScanSession({ecuInfoSnapshot:ecu([left,right])});
 eq(session.ecuInfoSnapshot.items.length,4,'public import retains four ECU items');
 eq(session.coreReadoutInventorySummary.ecuInfoItemKeys.length,4,'public ECU inventory identities retained');
 const restored=api.buildDiagnosticScanSessionFromJson(JSON.stringify(api.buildBridgeSessionExportPayload(session)));
 eq(restored.ecuInfoSnapshot.items,plain(session.ecuInfoSnapshot.items),'ECU items survive archive');
 eq(restored.vehicleCommandEnabled,false,'no command permission');eq(restored.wouldTransmit,false,'no I/O');
}
const partial=(reported,unresolved,value)=>api.buildDiagnosticScanSession({ecu_info_snapshot:{ecu_info_ecu_snapshots:[
 {source_ecu:'7E8',network_bus:reported,ecu_info_readout_status:'reported',items:[{id:'calibration_id',info_type:'04',value}]},
 {source_ecu:'7E8',network_bus:unresolved,ecu_info_readout_status:'unparsed',items:[]}
]}});
const p=partial('CAN-PT','CAN-BODY','CAL-A'),q=partial('CAN-BODY','CAN-PT','CAL-B');
const cross=api.buildImportedCoreReadoutInventoryComparisonSummary(p.coreReadoutInventorySummary,q.coreReadoutInventorySummary);
eq(cross.ecuInfoKeyValueComparisonAvailable,false,'regression: disjoint acquired routes cannot compare');
eq(cross.ecuInfoKeyValueComparisonScope,'unavailable','regression: disjoint routes have unavailable scope');
eq(cross.ecuInfoKeyValueKeysChanged,false,'regression: disjoint route values have no change verdict');
for(const [field,make,prefixes] of [['readinessSnapshot',readiness,['readinessMonitor']],['ecuInfoSnapshot',ecu,['ecuInfoItem','ecuInfoKeyValue','mode09SupportedType']]]){
 const ordinary=inventory(field,make([{networkBus:'CAN-PT'}]));
 const same=api.buildImportedCoreReadoutInventoryComparisonSummary(ordinary,ordinary);
 for(const prefix of prefixes){eq(same[prefix+'ComparisonAvailable'],true,'same route baseline available');eq(same[prefix+'KeysChanged'],false,'same route baseline unchanged');}
}
const legacy=JSON.parse(fs.readFileSync(new URL('./fixtures/inventory-readiness-ecu-3.13.663.json',import.meta.url),'utf8')).inventories;
const current=api.buildCoreReadoutInventorySummary({readinessSnapshot:readiness([{}]),ecuInfoSnapshot:ecu([{}])});
const compare=(a,b)=>api.buildImportedCoreReadoutInventoryComparisonSummary(a,b);
const families=['ecuInfoItem','ecuInfoKeyValue','mode09SupportedType'];
for(const old of Object.values(legacy))for(const [a,b] of [[old,current],[current,old],[old,old]]){
 const result=compare(a,b);
 eq(result.readinessMonitorComparisonAvailable,a===legacy.unscoped&&b===legacy.unscoped,'only legacy unscoped readiness pairs remain comparable');
 for(const family of families){eq(result[family+'ComparisonAvailable'],false,'legacy ECU comparison blocked');eq(result[family+'KeysChanged'],false,'blocked is not a change verdict');}
}
for(const [domain,snake,family] of [['readiness','readiness','readinessMonitor'],['ecuInfo','ecu_info','ecuInfoItem']]){
 const other=domain==='readiness'?'ecuInfoItem':'readinessMonitor';
 const badInputs=[
  {...plain(current),[domain+'KeyVersion']:1},
  {...plain(current),[domain+'KeyVersion']:3,[snake+'_key_version']:3},
  {...plain(current),[family+'Keys']:['broken']},
  {...plain(current),[family+'Keys']:'invalid'},
  {...plain(current),[domain+'KeyValidationFailed']:true},
 ];
 for(const bad of badInputs){
  const comparison=compare(bad,current);eq(comparison[family+'ComparisonAvailable'],false,'invalid domain fails closed');eq(comparison[other+'ComparisonAvailable'],true,'other version domain remains independent');
  const session=api.buildDiagnosticScanSession({readinessSnapshot:readiness([{}]),ecuInfoSnapshot:ecu([{}]),core_readout_inventory_summary:{schema_version:'core_readout_inventory_v1',...bad}});
  eq(session.importedCoreReadoutInventoryComparisonSummary[family+'ComparisonAvailable'],false,'public import retains invalid marker');
  const restored=api.buildDiagnosticScanSessionFromJson(JSON.stringify(api.buildBridgeSessionExportPayload(session)));
  eq(restored.importedCoreReadoutInventoryComparisonSummary[family+'ComparisonAvailable'],false,'archive cannot rehabilitate invalid aliases');
 }
}
const samePartial=partial('CAN-PT','CAN-BODY','CAL-B');
const matching=compare(p.coreReadoutInventorySummary,samePartial.coreReadoutInventorySummary);
eq(matching.ecuInfoKeyValueComparisonAvailable,true,'same acquired route remains comparable');
eq(matching.ecuInfoKeyValueKeysChanged,true,'same acquired route value change detected');
eq(matching.ecuInfoItemComparableEcuScopeKeys,['ecu_info_scope_v2:["7E8","can-pt",null,null]'],'partial comparison names exact route');
for(const field of ['networkBus','networkChannel','gatewayRoute']){
 const normalized=inventory('readinessSnapshot',readiness([{[field]:'ＡＢＣ'},{[field]:'abc'}]));
 eq(normalized.readinessMonitorKeys.length,1,'NFKC equivalent routes share identity');
 const oversized=inventory('readinessSnapshot',readiness([{[field]:'㍿'.repeat(field==='gatewayRoute'?41:31)}]));
 eq(oversized.readinessMonitorKeys.length,0,'expanded route outside bounds excluded');
}
const unknown=inventory('readinessSnapshot',{readinessReadoutStatus:'reported',monitors:[{id:'misfire',sourceEcu:'7E8',supported:null,complete:null}]});
eq(JSON.parse(unknown.readinessMonitorKeys[0].split(':').slice(1).join(':')).slice(2,4),['unknown','unknown'],'unknown states stay unknown');
const privateValues=inventory('ecuInfoSnapshot',{ecuInfoReadoutStatus:'reported',items:[{id:'vin',infoType:'02',sourceEcu:'7E8',value:'JTDKN3DU0A0123456'},{id:'calibration_id',infoType:'04',sourceEcu:'7E8',value:'JTDKN3DU0A0123456'}]});
eq(privateValues.ecuInfoKeyValueKeys,[],'VIN-like values cannot enter calibration comparison');
for(const family of ['readinessMonitor',...families]){
 const alias=(family+'Keys').replace(/[A-Z]/g,l=>'_'+l.toLowerCase());
 for(const badKey of ['constructor:[]',family==='readinessMonitor'?'readiness_monitor_v2:["misfire","7E8","yes","complete",null,null,null]':'ecu_info_value_v2:["vin","02","7E8","JTDKN3DU0A0123456",null,null,null]']){
  const bad={...plain(current),[family+'Keys']:[badKey],[alias]:[badKey]};
  eq(compare(bad,current)[family+'ComparisonAvailable'],false,'malformed key cannot be silently discarded');
 }
}
const uppercasePartial=plain(p.coreReadoutInventorySummary);
for(const key of Object.keys(uppercasePartial))if(Array.isArray(uppercasePartial[key]))uppercasePartial[key]=uppercasePartial[key].map(value=>typeof value==='string'?value.replaceAll('can-pt','ＣＡＮ-ＰＴ'):value);
const canonicalPartial=compare(uppercasePartial,p.coreReadoutInventorySummary);
eq(canonicalPartial.ecuInfoItemComparisonAvailable,true,'partial item routes normalize before comparison');
eq(canonicalPartial.ecuInfoItemKeysChanged,false,'equivalent partial item keys do not invent changes');
eq(canonicalPartial.ecuInfoKeyValueKeysChanged,false,'equivalent partial value keys do not invent changes');
const partialScoped=(domain,reported,unresolved,changed=false)=>api.buildDiagnosticScanSession(domain==='readiness'?{readiness_snapshot:{readiness_ecu_snapshots:[
 {sourceEcu:'7E8',...reported,readinessReadoutStatus:'reported',monitors:[{id:'misfire',supported:true,complete:!changed}]},
 {sourceEcu:'7E8',...unresolved,readinessReadoutStatus:'unparsed',monitors:[]}
]}}:{ecu_info_snapshot:{ecu_info_ecu_snapshots:[
 {sourceEcu:'7E8',...reported,ecuInfoReadoutStatus:'reported',items:[{id:'calibration_id',infoType:'04',value:changed?'CAL-B':'CAL-A'},{id:'supported_info_types_00',infoType:'00',value:changed?'A0 00 00 00':'80 00 00 00'}]},
 {sourceEcu:'7E8',...unresolved,ecuInfoReadoutStatus:'unparsed',items:[]}
]}}).coreReadoutInventorySummary;
for(const [a,b] of pairs)for(const domain of ['readiness','ecuInfo']){
 const before=partialScoped(domain,a,b),disjoint=partialScoped(domain,b,a,true),same=partialScoped(domain,a,b,true);
 const prefixes=domain==='readiness'?['readinessMonitor']:families;
 for(const prefix of prefixes){
  eq(compare(before,disjoint)[prefix+'ComparisonAvailable'],false,'partial separator/missing routes never cross');
  eq(compare(before,same)[prefix+'ComparisonAvailable'],true,'partial exact route remains comparable');
 }
}
for(const [family,domain] of [['readinessMonitor','readiness'],['ecuInfoItem','ecuInfo'],['ecuInfoKeyValue','ecuInfo'],['mode09SupportedType','ecuInfo']]){
 for(const suffix of ['ReportedEcuScopeKeys','UnresolvedEcuScopeKeys']){
  const field=family+suffix,alias=field.replace(/[A-Z]/g,l=>'_'+l.toLowerCase());
  const bad={...plain(current),[field]:['broken'],[alias]:['broken']};
  eq(compare(bad,current)[family+'ComparisonAvailable'],false,'invalid scope keys fail closed');
 }
}
const canonicalComplete=api.buildCoreReadoutInventorySummary({readinessSnapshot:readiness([{networkBus:'CAN-PT'}]),ecuInfoSnapshot:ecu([{networkBus:'CAN-PT'}])});
for(const baseline of [canonicalComplete,p.coreReadoutInventorySummary]){
 const duplicated=plain(baseline);
 for(const field of Object.keys(duplicated))if(Array.isArray(duplicated[field]))duplicated[field]=duplicated[field].flatMap(key=>typeof key==='string'&&key.includes('can-pt')?[key,key.replaceAll('can-pt','ＣＡＮ-ＰＴ')]:[key]);
 const comparison=compare(duplicated,baseline);
 for(const family of ['readinessMonitor',...families])eq(comparison[family+'KeysChanged'],false,'canonical duplicate aliases do not invent changes');
}
eq(fs.readFileSync(file,'utf8'),source,'validation does not mutate runtime');
console.log(JSON.stringify({checks,cases,scope:'Readiness, ECU item/calibration/Mode09 keys and partial ECU comparison: v2 regression acceptance; no vehicle I/O'},null,2));
