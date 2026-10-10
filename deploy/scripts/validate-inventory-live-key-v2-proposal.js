import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('../obd-readonly.js',import.meta.url),'utf8');
// Expose production private helpers for focused tests, without replacing their implementations.
const c={window:{}};vm.runInNewContext(source.replace('window.ObdReadOnly = Object.freeze({','window.ObdReadOnly = Object.freeze({buildCoreReadoutInventorySummary,buildImportedCoreReadoutInventoryComparisonSummary,parseLivePidInventoryValueKey,parseLivePidInventoryScopeKey,'),c);
const core=c.window.ObdReadOnly,plain=x=>JSON.parse(JSON.stringify(x));let checks=0;
const eq=(a,b,label)=>{assert.deepEqual(plain(a),plain(b),label);checks++;};
const frozen=JSON.parse(fs.readFileSync(new URL('./fixtures/inventory-live-3.13.661.json',import.meta.url),'utf8'));
const row=(scope,value=1200)=>({id:'engine_speed',sourceEcu:'7E8',unit:'rpm',value,...scope});
const snapshot=rows=>({livePidReadoutStatus:'reported',observationCondition:'warm',protocol:'ISO15765',monitorValues:rows});
const inventory=rows=>core.buildCoreReadoutInventorySummary({livePidSnapshot:snapshot(rows)});
const compare=(a,b)=>core.buildImportedCoreReadoutInventoryComparisonSummary(a,b);
for(const record of frozen.records){
 const {a,b}=record,first=inventory([row(a)]),second=inventory([row(b,2400)]),both=inventory([row(a),row(b)]);
 eq(record.count,1,'legacy collapsed count');eq(record.comparisonAvailable,true,'legacy wrong comparison');eq(record.deltas.length,1,'legacy wrong delta');
 eq(both.livePidValueCount,2,'two route keys');eq(both.countsById.live_pid_snapshot,2,'two measurements');
 eq(first.livePidKeyVersion,2,'version marker');eq(first.live_pid_key_version,2,'version alias');
 eq(first.livePidValueKeys[0].split('|').length,1,'old parser cannot consume new key');
 eq(compare(first,second).livePidValueDeltaRows,[],'no cross-route numeric delta');
 const same=compare(first,inventory([row(a,2400)]));eq(same.livePidValueDeltaRows[0].delta,1200,'same route delta');eq(same.livePidValueDeltaRows[0].id,'engine_speed','delta identity');eq(same.livePidValueDeltaRows[0].sourceEcu,'7E8','delta ECU');
 eq(core.normalizeReadoutNetworkScope(same.livePidValueDeltaRows[0]).conflict,false,'missing fields not conflicts');
 for(const [old,current] of [[record.first,second],[first,record.second],[record.first,record.second]]){
 const result=compare(old,current);eq(result.livePidValueComparisonAvailable,false,'legacy comparisons blocked');eq(result.livePidValueDeltaRows,[],'no legacy deltas');eq(result.livePidValueComparisonBlockedByScopeVersion,true,'reason retained');}
 const session=core.buildDiagnosticScanSession({live_pid_snapshot:snapshot([row(a),row(b)]),core_readout_inventory_summary:record.first});
 eq(session.importedCoreReadoutInventoryComparisonSummary.livePidValueComparisonAvailable,false,'public legacy import');
 const restored=core.buildDiagnosticScanSessionFromJson(JSON.stringify(core.buildBridgeSessionExportPayload(session)));
 eq(restored.coreReadoutInventorySummary.livePidValueKeys,session.coreReadoutInventorySummary.livePidValueKeys,'save new keys');
 eq(restored.importedCoreReadoutInventoryComparisonSummary.livePidValueComparisonAvailable,false,'legacy mismatch survives save');
 eq(restored.vehicleCommandEnabled,false,'no commands');eq(restored.wouldTransmit,false,'no transmission');
}
const full=inventory([row({networkBus:'CAN|A'}),row({networkBus:'CAN A'},2400)]);
const partial=core.buildCoreReadoutInventorySummary({livePidSnapshot:{...snapshot([row({networkBus:'CAN|A'},1300),row({networkBus:'CAN A'},9999)]),livePidReadoutStatus:'unparsed',livePidEcuSnapshots:[{sourceEcu:'7E8',networkBus:'CAN|A',livePidReadoutStatus:'reported'},{sourceEcu:'7E8',networkBus:'CAN A',livePidReadoutStatus:'unparsed'}]}});
const partialCmp=compare(full,partial);
eq(partial.livePidValueReportedEcuKeys.length,1,'partial route keys');eq(partialCmp.livePidValueComparisonScope,'reported_ecus','partial scope');eq(partialCmp.livePidValueDeltaRows.map(x=>x.delta),[100],'only reported route delta');eq(partialCmp.livePidValueComparableEcuIds,['7E8'],'scope ECU decode');
const modern=inventory([row({networkChannel:'1'})]);
for(const patch of [{livePidKeyVersion:1},{livePidKeyVersion:3,live_pid_key_version:3},{livePidValueKeys:['broken'],live_pid_value_keys:['broken']},{livePidValueKeys:[''],live_pid_value_keys:['']},{livePidValueReportedEcuScopeKeys:{}},{livePidValueKeys:[]}]){
 eq(compare({...modern,...patch},modern).livePidValueComparisonAvailable,false,'bad version/key/alias rejected');
}
for(const input of ['',null,'live_pid_value_v2:[]','live_pid_value_v2:["x","7E8","rpm","1",null,null,null]'])eq(core.parseLivePidInventoryValueKey(input),null,'invalid key');
eq(inventory([row({networkBus:'ＣＡＮ'})]).livePidValueKeys,inventory([row({network_bus:'can'})]).livePidValueKeys,'scope aliases');
const key=modern.livePidValueKeys[0];eq(core.parseLivePidInventoryValueKey(key).networkBus,null,'missing bus retained');
const sameSession=core.buildDiagnosticScanSession({live_pid_snapshot:snapshot([row({networkChannel:'1'},1500)]),core_readout_inventory_summary:modern});
eq(sameSession.importedCoreReadoutInventoryComparisonSummary.livePidValueDeltaRows[0].delta,300,'public v2 comparison');
const restored=core.buildDiagnosticScanSessionFromJson(JSON.stringify(core.buildBridgeSessionExportPayload(sameSession)));
eq(restored.importedCoreReadoutInventoryComparisonSummary.livePidValueDeltaRows[0].delta,300,'v2 comparison round trip');
eq(inventory([row({networkBus:'㍿'.repeat(100)})]).livePidValueKeys,[],'expanded scope rejected without crash');
const legacyBracket={livePidValueEvidenceRecorded:true,livePidObservationCondition:'warm',livePidDiagnosticProtocol:'ISO15765',livePidValueKeys:['[id|7E8|rpm|1']};
eq(compare(legacyBracket,{...legacyBracket,livePidValueKeys:['[id|7E8|rpm|2']}).livePidValueDeltaRows[0].delta,1,'legacy bracket is not JSON');
console.log('Inventory live key v2 regression: '+checks+' checks passed; production code, frozen legacy evidence, partial routes and JSON round trips; no vehicle I/O');
