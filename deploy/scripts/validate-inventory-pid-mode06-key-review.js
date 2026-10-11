import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
// Regression coverage for route-preserving PID and Mode06 inventory identities.
const files=['obd-readonly.js','script.js','service-worker.js','offline-assets.json'];
const before=files.map(file=>fs.readFileSync(new URL('../'+file,import.meta.url),'utf8'));
const context={window:{}};
vm.runInNewContext(before[0].replace('window.ObdReadOnly = Object.freeze({','window.ObdReadOnly = Object.freeze({buildCoreReadoutInventorySummary,buildImportedCoreReadoutInventoryComparisonSummary,'),context);
const api=context.window.ObdReadOnly,plain=x=>JSON.parse(JSON.stringify(x));let checks=0,cases=0;
const eq=(actual,expected,message)=>{assert.deepEqual(plain(actual),expected,message);checks++;};
const cmp=api.buildImportedCoreReadoutInventoryComparisonSummary;
const pid=scopes=>({supportedPidReadoutStatus:'reported',supportedPidEcuSnapshots:scopes.map(scope=>({sourceEcu:'7E8',supportedPidReadoutStatus:'reported',supportedPids:['0C'],...scope}))});
const test=(scope,value=1)=>({testId:'01',componentId:'02',sourceEcu:'7E8',value,min:0,max:10,status:'pass',...scope});
const mode06=scopes=>({onboardMonitorReadoutStatus:'reported',tests:scopes.map(scope=>test(scope))});
const inv=(field,snapshot)=>api.buildCoreReadoutInventorySummary({[field]:snapshot});
const pairs=[];
for(const field of ['networkBus','networkChannel','gatewayRoute'])for(const kind of ['separator','missing']){
 const left={networkBus:'CAN',networkChannel:'CH1',gatewayRoute:'GW1'},right={...left};
 if(kind==='separator'){left[field]='A|B';right[field]='A B';}else{delete left[field];right[field]='-';}
 pairs.push([left,right]);
}
for(const [a,b] of pairs)for(const [left,right] of [[a,b],[b,a]]){
 cases++;
 const both=inv('supportedPidMatrix',pid([left,right]));
 eq(both.supportedPidKeys.length,2,'regression: two PID routes remain distinct');
 const comparison=cmp(inv('supportedPidMatrix',pid([left])),inv('supportedPidMatrix',pid([right])));
 eq(comparison.supportedPidComparisonAvailable,true,'regression: complete routes compare as additions/removals');
 eq(comparison.supportedPidKeysChanged,true,'regression: route change detected');
 const session=api.buildDiagnosticScanSession({supportedPidMatrix:pid([left,right])});
 eq(session.supportedPidMatrix.supportedPidEcuSnapshots.length,2,'public import retains two ECU observations');
 eq(session.coreReadoutInventorySummary.supportedPidKeys.length,2,'public import preserves PID identities');
 const restored=api.buildDiagnosticScanSessionFromJson(JSON.stringify(api.buildBridgeSessionExportPayload(session)));
 eq(restored.supportedPidMatrix.supportedPidEcuSnapshots,plain(session.supportedPidMatrix.supportedPidEcuSnapshots),'PID observations retained through archive');
 eq(restored.vehicleCommandEnabled,false,'no command');eq(restored.wouldTransmit,false,'no I/O');
}
for(const [a,b] of [...pairs,[{networkBus:'CAN-PT'},{networkBus:'CAN-BODY'}]])for(const [left,right] of [[a,b],[b,a]]){
 cases++;
 const both=inv('onboardMonitorSnapshot',mode06([left,right]));
 eq(both.onboardMonitorTestKeys.length,2,'regression: Mode06 state keys retain route');
 eq(both.onboardMonitorValueKeys.length,2,'regression: Mode06 value keys retain route');
 const comparison=cmp(inv('onboardMonitorSnapshot',mode06([left])),inv('onboardMonitorSnapshot',mode06([right])));
 eq(comparison.onboardMonitorComparisonAvailable,true,'regression: Mode06 different routes compare');
 eq(comparison.onboardMonitorTestKeysChanged,true,'regression: Mode06 state route change detected');
 eq(comparison.onboardMonitorValueKeysChanged,true,'regression: Mode06 value route change detected');
 const session=api.buildDiagnosticScanSession({onboardMonitorSnapshot:mode06([left,right])});
 eq(session.onboardMonitorSnapshot.tests.length,2,'two numeric test rows retained');
 eq(session.onboardMonitorSnapshot.tests.map(row=>[row.networkBus??null,row.networkChannel??null,row.gatewayRoute??null]),[left,right].map(row=>[row.networkBus??null,row.networkChannel??null,row.gatewayRoute??null]),'normalizer preserves per-test routes');
 eq(session.coreReadoutInventorySummary.onboardMonitorValueKeys.length,2,'public import preserves Mode06 identities');
 const restored=api.buildDiagnosticScanSessionFromJson(JSON.stringify(api.buildBridgeSessionExportPayload(session)));
 eq(restored.onboardMonitorSnapshot.tests,plain(session.onboardMonitorSnapshot.tests),'archive retains normalized rows and route metadata');
 eq(restored.vehicleCommandEnabled,false,'no command');eq(restored.wouldTransmit,false,'no I/O');
}
const partial=(reported,unresolved,value,direct=false)=>api.buildDiagnosticScanSession({onboard_monitor_snapshot:{onboard_monitor_readout_status:'unparsed',
 ...(direct?{tests:[test({networkBus:unresolved},value)]}:{}),
 onboard_monitor_ecu_snapshots:[
  {source_ecu:'7E8',network_bus:reported,onboard_monitor_readout_status:'reported',tests:[test({},direct?1:value)]},
  {source_ecu:'7E8',network_bus:unresolved,onboard_monitor_readout_status:'unparsed',tests:[]}
 ]
}});
const a=partial('CAN-PT','CAN-BODY',1),b=partial('CAN-BODY','CAN-PT',2);
const cross=cmp(a.coreReadoutInventorySummary,b.coreReadoutInventorySummary);
eq(cross.onboardMonitorValueComparisonAvailable,false,'regression: partial disjoint Mode06 routes do not compare');
eq(cross.onboardMonitorValueKeysChanged,false,'regression: partial disjoint values are not changes');
const wrong=partial('CAN-PT','CAN-BODY',9,true);
eq(wrong.onboardMonitorSnapshot.tests.map(row=>row.value),[],'regression: unresolved-route direct row excluded despite same ECU address');
eq(wrong.coreReadoutInventorySummary.onboardMonitorReportedEcuValueKeys,[],'regression: wrong-route value excluded from acquired evidence');
eq(wrong.onboardMonitorSnapshot.onboardMonitorEcuSnapshots.map(row=>row.networkBus),['CAN-PT','CAN-BODY'],'child snapshot routes retained');
for(const [field,make,available,changed] of [['supportedPidMatrix',pid,'supportedPidComparisonAvailable','supportedPidKeysChanged'],['onboardMonitorSnapshot',mode06,'onboardMonitorValueComparisonAvailable','onboardMonitorValueKeysChanged']]){
 const baseline=inv(field,make([{networkBus:'CAN-PT'}]));const same=cmp(baseline,baseline);
 eq(same[available],true,'same route baseline comparable');eq(same[changed],false,'same route baseline unchanged');
}
const unknownLimits=api.buildDiagnosticScanSession({onboard_monitor_snapshot:{onboard_monitor_readout_status:'reported',tests:[{test_id:'01',component_id:'02',source_ecu:'7E8',value:1}]}});
const zeroLimits=api.buildDiagnosticScanSession({onboard_monitor_snapshot:{onboard_monitor_readout_status:'reported',tests:[{test_id:'01',component_id:'02',source_ecu:'7E8',value:1,min:0,max:0}]}});
eq(unknownLimits.onboardMonitorSnapshot.tests[0].min,null,'missing limit remains null in row');
eq(JSON.stringify(unknownLimits.coreReadoutInventorySummary.onboardMonitorValueKeys)===JSON.stringify(zeroLimits.coreReadoutInventorySummary.onboardMonitorValueKeys),false,'missing limits differ from zero');

const legacy=JSON.parse(fs.readFileSync(new URL('./fixtures/inventory-pid-mode06-3.13.664.json',import.meta.url),'utf8'));
const current=api.buildCoreReadoutInventorySummary({supportedPidMatrix:pid([{networkBus:'CAN-PT'}]),onboardMonitorSnapshot:mode06([{networkBus:'CAN-PT'}])});
eq(cmp(legacy.pidUnscoped,legacy.pidUnscoped).supportedPidComparisonAvailable,true,'legacy unscoped PID pairs remain comparable');
for(const old of [legacy.pidUnscoped,legacy.pidScoped])eq(cmp(old,current).supportedPidComparisonAvailable,false,'mixed PID versions unavailable');
eq(cmp(legacy.pidScoped,legacy.pidScoped).supportedPidComparisonAvailable,false,'legacy scoped PID pairs unavailable');
for(const old of [legacy.mode06Unscoped,legacy.mode06Scoped]){
 eq(cmp(old,old).onboardMonitorComparisonAvailable,false,'all legacy Mode06 identities unavailable');
 eq(cmp(old,current).onboardMonitorValueComparisonAvailable,false,'mixed Mode06 versions unavailable');
 eq(cmp(old,current).onboardMonitorFailedDelta,null,'legacy failure delta unavailable');
}
for(const [domain,field] of [['supportedPid','supportedPidKeys'],['onboardMonitor','onboardMonitorValueKeys']]){
 const alias=field.replace(/[A-Z]/g,l=>'_'+l.toLowerCase()),version=domain+'KeyVersion',versionAlias=version.replace(/[A-Z]/g,l=>'_'+l.toLowerCase());
 for(const mutate of [x=>x[version]=3,x=>x[versionAlias]=1,x=>x[field]=['broken'],x=>{x[field]=['broken'];x[alias]=['broken'];},x=>{x[field]=null;delete x[alias];}]){
  const bad=plain(current);mutate(bad);
  const comparison=cmp(bad,current);
  eq(comparison[domain+'ComparisonAvailable'],false,'bad version/alias/key fails closed');
  eq(comparison[(domain==='supportedPid'?'onboardMonitor':'supportedPid')+'ComparisonAvailable'],true,'domain validation independent');
  const session=api.buildDiagnosticScanSession({supportedPidMatrix:pid([{networkBus:'CAN-PT'}]),onboardMonitorSnapshot:mode06([{networkBus:'CAN-PT'}]),core_readout_inventory_summary:bad});
  const restored=api.buildDiagnosticScanSessionFromJson(JSON.stringify(api.buildBridgeSessionExportPayload(session)));
  eq(restored.importedCoreReadoutInventoryComparisonSummary[domain+'ComparisonAvailable'],false,'invalid state sticky through archive');
 }
}
for(const baseline of [current,a.coreReadoutInventorySummary]){
 const duplicated=plain(baseline);
 for(const field of Object.keys(duplicated))if(Array.isArray(duplicated[field]))duplicated[field]=duplicated[field].flatMap(key=>typeof key==='string'&&key.includes('can-pt')?[key,key.replaceAll('can-pt','ＣＡＮ-ＰＴ')]:[key]);
 const result=cmp(duplicated,baseline);
 eq(result.supportedPidKeysChanged,false,'canonical PID duplicate does not invent change');
 eq(result.onboardMonitorValueKeysChanged,false,'canonical Mode06 duplicate does not invent change');
}
const matching=cmp(a.coreReadoutInventorySummary,partial('CAN-PT','CAN-BODY',2).coreReadoutInventorySummary);
eq(matching.onboardMonitorValueComparisonAvailable,true,'same partial route comparable');
eq(matching.onboardMonitorValueKeysChanged,true,'same partial route value change detected');
eq(matching.onboardMonitorComparableEcuScopeKeys,['mode06_scope_v2:["7E8","can-pt",null,null]'],'partial scope names exact route');
const conflict=api.buildDiagnosticScanSession({onboard_monitor_snapshot:{network_bus:'CAN-PT',onboard_monitor_readout_status:'reported',onboard_monitor_ecu_snapshots:[{network_bus:'CAN-BODY',source_ecu:'7E8',onboard_monitor_readout_status:'reported',tests:[test({})]}]}});
eq(conflict.onboardMonitorSnapshot.tests,[],'parent child conflict excludes acquired rows');
eq(conflict.onboardMonitorSnapshot.onboardMonitorEcuSnapshots[0].networkScopeConflict,true,'child conflict retained');
eq(conflict.onboardMonitorSnapshot.onboardMonitorEcuSnapshots[0].errorCodes.includes('network_scope_conflict'),true,'child conflict remains visible');
for(const input of [{onboard_monitor_snapshot:{data:mode06([{networkBus:'CAN-PT'}])}},{onboard_monitor_response:{ok:true,blocked:false,would_transmit:false,data:mode06([{networkBus:'CAN-PT'}])}}]){
 const session=api.buildDiagnosticScanSession(input);
 eq(session.onboardMonitorSnapshot.tests[0].networkBus,'CAN-PT','direct data or bridge route retained');
 eq(session.wouldTransmit,false,'bridge fixture cannot transmit');
}

for(const [left,right] of pairs)for(const domain of ['supportedPid','onboardMonitor']){
 const partialInventory=(reported,unresolved)=>api.buildDiagnosticScanSession(domain==='supportedPid'?{supportedPidMatrix:{supportedPidReadoutStatus:'unparsed',supportedPidEcuSnapshots:[{sourceEcu:'7E8',...reported,supportedPidReadoutStatus:'reported',supportedPids:['0C']},{sourceEcu:'7E8',...unresolved,supportedPidReadoutStatus:'unparsed',supportedPids:[]}]}}:{onboardMonitorSnapshot:{onboardMonitorReadoutStatus:'unparsed',onboardMonitorEcuSnapshots:[{sourceEcu:'7E8',...reported,onboardMonitorReadoutStatus:'reported',tests:[test({})]},{sourceEcu:'7E8',...unresolved,onboardMonitorReadoutStatus:'unparsed',tests:[]}]}}).coreReadoutInventorySummary;
 const first=partialInventory(left,right),other=partialInventory(right,left);
 eq(cmp(first,other)[domain+'ComparisonAvailable'],false,'partial separator and missing routes remain disjoint');
 eq(cmp(first,first)[domain+'ComparisonAvailable'],true,'partial exact routes remain available');
}
const oldQuality=api.buildDiagnosticScanSession({onboardMonitorSnapshot:mode06([{networkBus:'CAN-PT'}]),core_readout_inventory_summary:legacy.mode06Scoped,readout_quality_summary:{schema_version:'readout_quality_summary_v1',onboard_monitor_failed_count:3}});
eq(oldQuality.importedReadoutQualityComparisonSummary.onboardMonitorFailedDelta,null,'old inventory cannot supply quality failure delta');
for(const invalid of ['mode06_value_v2:["01","02","7E8",null,0,10,null,null,null]','mode06_value_v2:["01","02","7E8",1,"0",10,null,null,null]','mode06_value_v2:["01","02","7E8",1,0,10,"",null,null]']){
 const bad={...plain(current),onboardMonitorValueKeys:[invalid],onboard_monitor_value_keys:[invalid]};
 eq(cmp(bad,current).onboardMonitorValueComparisonAvailable,false,'invalid numeric or route type unavailable');
}

const ambiguous=partial('CAN-PT','CAN-PT',1);
eq(ambiguous.onboardMonitorSnapshot.tests,[],'contradictory child disposition cannot supply rows');
eq(cmp(ambiguous.coreReadoutInventorySummary,ambiguous.coreReadoutInventorySummary).onboardMonitorValueComparisonAvailable,false,'contradictory child route cannot supply partial scope');
const pipeEcu=api.buildDiagnosticScanSession({supportedPidMatrix:{supportedPidReadoutStatus:'unparsed',supportedPidEcuSnapshots:[{sourceEcu:'ECM|PRIMARY',networkBus:'CAN',supportedPidReadoutStatus:'reported',supportedPids:['0C']},{sourceEcu:'TCM',supportedPidReadoutStatus:'unparsed',supportedPids:[]}]}});
eq(pipeEcu.coreReadoutInventorySummary.supportedPidReportedEcuKeys.length,1,'partial PID ECU delimiter kept consistent with scope');

const missingPartialScope=plain(pipeEcu.coreReadoutInventorySummary);
delete missingPartialScope.supportedPidReportedEcuScopeKeys;delete missingPartialScope.supported_pid_reported_ecu_scope_keys;
eq(cmp(missingPartialScope,missingPartialScope).supportedPidComparisonAvailable,false,'v2 partial evidence cannot fall back to bare ECU IDs');
for(const [index,file] of files.entries())eq(fs.readFileSync(new URL('../'+file,import.meta.url),'utf8'),before[index],'runtime unchanged: '+file);
console.log(JSON.stringify({checks,cases,scope:'v2 regression: supported PID identities, Mode06 normalization and inventory; no vehicle I/O'},null,2));
