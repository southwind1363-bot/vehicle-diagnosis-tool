import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
// Current production defect reproduction for migration review; not repair acceptance.
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
 eq(both.readinessMonitorKeys.length,1,'defect: two readiness routes collapse');
 const comparison=api.buildImportedCoreReadoutInventoryComparisonSummary(before,after);
 eq(comparison.readinessMonitorComparisonAvailable,true,'defect: readiness routes comparable');
 eq(comparison.readinessMonitorKeysChanged,false,'defect: readiness route change hidden');
 const session=api.buildDiagnosticScanSession({readinessSnapshot:readiness([left,right])});
 eq(session.readinessSnapshot.monitors.length,2,'public import retains two observations');
 eq(session.coreReadoutInventorySummary.readinessMonitorKeys.length,1,'public import reproduces readiness collision');
 const restored=api.buildDiagnosticScanSessionFromJson(JSON.stringify(api.buildBridgeSessionExportPayload(session)));
 eq(restored.readinessSnapshot.monitors,plain(session.readinessSnapshot.monitors),'readiness observations survive archive');
 eq(restored.vehicleCommandEnabled,false,'no command permission');eq(restored.wouldTransmit,false,'no I/O');
}
for(const [a,b] of [...pairs,[{networkBus:'CAN-PT'},{networkBus:'CAN-BODY'}]])for(const [left,right] of [[a,b],[b,a]]){
 cases++;
 const before=inventory('ecuInfoSnapshot',ecu([left])),after=inventory('ecuInfoSnapshot',ecu([right])),both=inventory('ecuInfoSnapshot',ecu([left,right]));
 eq(both.ecuInfoItemKeys.length,2,'defect: four ECU items collapse to two keys');
 eq(both.ecuInfoKeyValueKeys.length,1,'defect: two calibration routes collapse');
 eq(both.mode09SupportedTypeKeys.length,1,'defect: two Mode09 routes collapse');
 const comparison=api.buildImportedCoreReadoutInventoryComparisonSummary(before,after);
 for(const prefix of ['ecuInfoItem','ecuInfoKeyValue','mode09SupportedType']){
 eq(comparison[prefix+'ComparisonAvailable'],true,'defect: separate ECU routes comparable');
 eq(comparison[prefix+'KeysChanged'],false,'defect: separate ECU route change hidden');
 }
 const session=api.buildDiagnosticScanSession({ecuInfoSnapshot:ecu([left,right])});
 eq(session.ecuInfoSnapshot.items.length,4,'public import retains four ECU items');
 eq(session.coreReadoutInventorySummary.ecuInfoItemKeys.length,2,'public ECU inventory collision');
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
eq(cross.ecuInfoKeyValueComparisonAvailable,true,'defect: disjoint acquired routes considered comparable');
eq(cross.ecuInfoKeyValueComparisonScope,'reported_ecus','defect: same ECU address hides disjoint routes');
eq(cross.ecuInfoKeyValueKeysChanged,true,'defect: disjoint route values reported changed');
for(const [field,make,prefixes] of [['readinessSnapshot',readiness,['readinessMonitor']],['ecuInfoSnapshot',ecu,['ecuInfoItem','ecuInfoKeyValue','mode09SupportedType']]]){
 const ordinary=inventory(field,make([{networkBus:'CAN-PT'}]));
 const same=api.buildImportedCoreReadoutInventoryComparisonSummary(ordinary,ordinary);
 for(const prefix of prefixes){eq(same[prefix+'ComparisonAvailable'],true,'same route baseline available');eq(same[prefix+'KeysChanged'],false,'same route baseline unchanged');}
}
eq(fs.readFileSync(file,'utf8'),source,'runtime unchanged');
console.log(JSON.stringify({checks,cases,scope:'Readiness, ECU item/calibration/Mode09 keys and partial ECU comparison: current defect reproduction only; no vehicle I/O'},null,2));
