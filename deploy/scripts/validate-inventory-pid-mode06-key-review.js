import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
// Reproduce 3.13.664 defects before changing normalization or saved identities.
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
 eq(both.supportedPidKeys.length,1,'defect: two PID routes collapse');
 const comparison=cmp(inv('supportedPidMatrix',pid([left])),inv('supportedPidMatrix',pid([right])));
 eq(comparison.supportedPidComparisonAvailable,true,'defect: collapsed routes compare');
 eq(comparison.supportedPidKeysChanged,false,'defect: route change hidden');
 const session=api.buildDiagnosticScanSession({supportedPidMatrix:pid([left,right])});
 eq(session.supportedPidMatrix.supportedPidEcuSnapshots.length,2,'public import retains two ECU observations');
 eq(session.coreReadoutInventorySummary.supportedPidKeys.length,1,'public import reproduces PID collision');
 const restored=api.buildDiagnosticScanSessionFromJson(JSON.stringify(api.buildBridgeSessionExportPayload(session)));
 eq(restored.supportedPidMatrix.supportedPidEcuSnapshots,plain(session.supportedPidMatrix.supportedPidEcuSnapshots),'PID observations retained through archive');
 eq(restored.vehicleCommandEnabled,false,'no command');eq(restored.wouldTransmit,false,'no I/O');
}
for(const [a,b] of [...pairs,[{networkBus:'CAN-PT'},{networkBus:'CAN-BODY'}]])for(const [left,right] of [[a,b],[b,a]]){
 cases++;
 const both=inv('onboardMonitorSnapshot',mode06([left,right]));
 eq(both.onboardMonitorTestKeys.length,1,'defect: Mode06 state keys omit route');
 eq(both.onboardMonitorValueKeys.length,1,'defect: Mode06 value keys omit route');
 const comparison=cmp(inv('onboardMonitorSnapshot',mode06([left])),inv('onboardMonitorSnapshot',mode06([right])));
 eq(comparison.onboardMonitorComparisonAvailable,true,'defect: Mode06 different routes compare');
 eq(comparison.onboardMonitorTestKeysChanged,false,'defect: Mode06 state route change hidden');
 eq(comparison.onboardMonitorValueKeysChanged,false,'defect: Mode06 value route change hidden');
 const session=api.buildDiagnosticScanSession({onboardMonitorSnapshot:mode06([left,right])});
 eq(session.onboardMonitorSnapshot.tests.length,2,'two numeric test rows retained');
 eq(session.onboardMonitorSnapshot.tests.every(row=>row.networkBus===undefined&&row.networkChannel===undefined&&row.gatewayRoute===undefined),true,'defect: normalizer discards per-test routes');
 eq(session.coreReadoutInventorySummary.onboardMonitorValueKeys.length,1,'public import reproduces Mode06 collision');
 const restored=api.buildDiagnosticScanSessionFromJson(JSON.stringify(api.buildBridgeSessionExportPayload(session)));
 eq(restored.onboardMonitorSnapshot.tests,plain(session.onboardMonitorSnapshot.tests),'archive retains normalized rows, not lost route metadata');
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
eq(cross.onboardMonitorValueComparisonAvailable,true,'defect: partial disjoint Mode06 routes compare');
eq(cross.onboardMonitorValueKeysChanged,true,'defect: partial disjoint values counted as change');
const wrong=partial('CAN-PT','CAN-BODY',9,true);
eq(wrong.onboardMonitorSnapshot.tests.map(row=>row.value),[9],'defect: unresolved-route direct row accepted via same ECU address');
eq(wrong.coreReadoutInventorySummary.onboardMonitorReportedEcuValueKeys,['01|02|7E8|9|0|10'],'defect: wrong-route value enters acquired evidence');
eq(wrong.onboardMonitorSnapshot.onboardMonitorEcuSnapshots.every(row=>row.networkBus===undefined),true,'defect: child snapshot route also discarded');
for(const [field,make,available,changed] of [['supportedPidMatrix',pid,'supportedPidComparisonAvailable','supportedPidKeysChanged'],['onboardMonitorSnapshot',mode06,'onboardMonitorValueComparisonAvailable','onboardMonitorValueKeysChanged']]){
 const baseline=inv(field,make([{networkBus:'CAN-PT'}]));const same=cmp(baseline,baseline);
 eq(same[available],true,'same route baseline comparable');eq(same[changed],false,'same route baseline unchanged');
}
const unknownLimits=api.buildDiagnosticScanSession({onboard_monitor_snapshot:{onboard_monitor_readout_status:'reported',tests:[{test_id:'01',component_id:'02',source_ecu:'7E8',value:1}]}});
const zeroLimits=api.buildDiagnosticScanSession({onboard_monitor_snapshot:{onboard_monitor_readout_status:'reported',tests:[{test_id:'01',component_id:'02',source_ecu:'7E8',value:1,min:0,max:0}]}});
eq(unknownLimits.onboardMonitorSnapshot.tests[0].min,null,'missing limit remains null in row');
eq(unknownLimits.coreReadoutInventorySummary.onboardMonitorValueKeys,plain(zeroLimits.coreReadoutInventorySummary.onboardMonitorValueKeys),'defect: inventory coerces missing limits to zero');
for(const [index,file] of files.entries())eq(fs.readFileSync(new URL('../'+file,import.meta.url),'utf8'),before[index],'runtime unchanged: '+file);
console.log(JSON.stringify({checks,cases,scope:'3.13.664 defect reproduction only: supported PID identities, Mode06 normalization and inventory; no vehicle I/O'},null,2));
