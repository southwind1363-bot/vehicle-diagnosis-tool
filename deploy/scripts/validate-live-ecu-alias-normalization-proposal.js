import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {liveEcuAliasCases} from './live-ecu-alias-normalization-cases.js';
const source=fs.readFileSync(new URL('../obd-readonly.js',import.meta.url),'utf8');
const fixture=JSON.parse(fs.readFileSync(new URL('./fixtures/live-ecu-alias-normalization-legacy-3.13.677.json',import.meta.url),'utf8'));
const load=text=>{const c=vm.createContext({window:{}});vm.runInContext('Date = class extends Date { constructor(...args) { super(...(args.length ? args : [1791712800000])); } static now() { return 1791712800000; } };',c);vm.runInContext(text,c);const api=c.window.ObdReadOnly;api.configureMonitorDefinitions(JSON.parse(fs.readFileSync(new URL('../data/obd-monitor-definitions.json',import.meta.url),'utf8')));return {api,c};};
const after=load(source);
const jsonFixture=JSON.parse(fs.readFileSync(new URL('./fixtures/live-ecu-alias-json-legacy-3.13.677.json',import.meta.url),'utf8'));
const digest=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
let checks=0;const eq=(a,b,m)=>{assert.deepEqual(JSON.parse(JSON.stringify(a)),JSON.parse(JSON.stringify(b)),m);checks++;};
const checkBlocked=(s,label)=>{
 eq(s.livePidReadoutStatus,'blocked',label+' status');eq(s.monitorValues,[],label+' no adopted values');eq(s.monitorInsights,[],label+' no adopted insights');
 eq(s.errorCodes,['source_ecu_alias_conflict'],label+' reason');eq([s.ok,s.blocked,s.wouldTransmit,s.vehicleCommandEnabled,s.retainedRawText],[false,true,false,false,false],label+' safety');
};
for(const test of liveEcuAliasCases){
 const original=JSON.stringify(test.response),golden=fixture.cases.find(x=>x.id===test.id);
 const snapshot=after.api.normalizeBridgeLivePidSnapshot(test.response);
 const session=after.api.buildDiagnosticScanSession({livePidSnapshot:snapshot});
 const restored=after.api.buildDiagnosticScanSessionFromJson(JSON.stringify(after.api.buildBridgeSessionExportPayload(session)));
 const direct=after.api.buildBridgeDiagnosticImport({livePidResponse:test.response});
 if(test.reject){
  eq(snapshot,fixture.blocked,test.id+' complete failure shape, no input metadata adopted');
  checkBlocked(session.livePidSnapshot,test.id+' session');checkBlocked(restored.livePidSnapshot,test.id+' archive');
  checkBlocked(direct.bridgeSession.livePidSnapshot,test.id+' direct import');
 }else{
  for(const [value,key] of [[snapshot,'snapshotSha256'],[session,'sessionSha256'],[restored,'restoredSha256'],[direct,'directSha256']])eq(digest(value),golden[key],test.id+' normal '+key);
 }
 eq(after.api.hasConflictingJsonEcuAliases(test.response),jsonFixture.jsonCases.find(x=>x.id===test.id).conflict,test.id+' shared JSON check unchanged');
 eq(digest(after.api.buildDiagnosticScanSessionFromJson(original)),jsonFixture.jsonCases.find(x=>x.id===test.id).outputSha256,test.id+' JSON entry behavior unchanged');
 eq(JSON.stringify(test.response),original,test.id+' input not mutated');
}
// Direct callers may share references or have cycles in ignored metadata.
// The check must terminate; this does not promise all downstream parsers accept arbitrary cycles.
for(const conflict of [false,true]){
 const input={monitor_values:[{id:'control_module_voltage',value:14,sourceEcu:'7E8'}],metadata:{}};
 input.metadata.self=input.metadata;input.metadata.root=input;
 if(conflict)Object.assign(input.metadata,{sourceEcu:'7E8',source_ecu:'7E9'});
 after.c.testInput=input;
 vm.runInContext('cycleResult=window.ObdReadOnly.normalizeBridgeLivePidSnapshot(testInput)',after.c,{timeout:2000});
 if(conflict)checkBlocked(after.c.cycleResult,'cyclic metadata conflict');else eq(digest(after.c.cycleResult),jsonFixture.normalCyclicSnapshotSha256,'cyclic ignored metadata normal behavior');
 eq(input.metadata.root===input,true,'cycle input untouched');
}
const shared={sourceEcu:'7E8',source_ecu:'7E8'};after.c.testInput={a:shared,b:shared,c:{sourceEcu:'7E8',source_ecu:'7E9'}};
vm.runInContext('sharedResult=window.ObdReadOnly.hasConflictingJsonEcuAliases(testInput)',after.c,{timeout:2000});eq(after.c.sharedResult,true,'shared references do not hide another conflict');
eq(fixture.cases.find(x=>x.id==='false-trim').oldInsights.some(x=>x.title==='バンク1の燃料補正合計が大きい'),true,'old false aggregate evidence');
console.log('Live ECU normalization production: '+liveEcuAliasCases.length+' cases / '+checks+' checks passed; snapshot, session, archive, direct-import boundary and cyclic metadata; no transport.');
