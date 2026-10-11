import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {ecuAliasCases} from './ecu-alias-import-cases.js';
const source=fs.readFileSync(new URL('../obd-readonly.js',import.meta.url),'utf8');
const fixture=JSON.parse(fs.readFileSync(new URL('./fixtures/ecu-alias-import-legacy-3.13.675.json',import.meta.url),'utf8'));
const roundtrip=JSON.parse(fs.readFileSync(new URL('./fixtures/ecu-alias-import-roundtrip-3.13.675.json',import.meta.url),'utf8'));
const load=source=>{
 const c=vm.createContext({window:{}});
 vm.runInContext('Date = class extends Date { constructor(...args) { super(...(args.length ? args : [1791712800000])); } static now() { return 1791712800000; } };',c);
 vm.runInContext(source,c);const api=c.window.ObdReadOnly;
 api.configureMonitorDefinitions(JSON.parse(fs.readFileSync(new URL('../data/obd-monitor-definitions.json',import.meta.url),'utf8')));return api;
};
const after=load(source);
const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const plain=value=>JSON.parse(JSON.stringify(value));
let checks=0;const equal=(a,b,message)=>{assert.deepEqual(plain(a),plain(b),message);checks++;};
for(const test of ecuAliasCases){
 const json=JSON.stringify(test.input),golden=fixture.cases.find(x=>x.id===test.id);
 const result=after.buildDiagnosticScanSessionFromJson(json);
 if(test.reject){
  equal(result,{accepted:false,ok:false,blocked:true,errors:['source_ecu_alias_conflict'],vehicleCommandEnabled:false,vehicle_command_enabled:false,wouldTransmit:false,would_transmit:false,retainedRawText:false},test.id+': reject before canonicalization');
  equal(after.buildDiagnosticScanSessionFromJson(json),result,test.id+': stable repeated rejection');
 } else {
  equal(digest(result),golden.outputSha256,test.id+': accepted behavior unchanged');
  const archived=after.buildBridgeSessionExportPayload(result);
  equal(digest(after.buildDiagnosticScanSessionFromJson(JSON.stringify(archived))),roundtrip.archives.find(x=>x.id===test.id).outputSha256,test.id+': archive compatibility');
 }
 equal(JSON.stringify(test.input),json,test.id+': original input retained');
}
equal(fixture.cases.find(x=>x.id==='row-conflict').oldLiveValues.map(x=>[x.sourceEcu,x.source_ecu]),[['7E9','7E9']],'old conflict erased');
equal(fixture.cases.find(x=>x.id==='false-trim').oldLiveInsights.some(x=>x.title==='バンク1の燃料補正合計が大きい'),true,'old false correlated insight');
for(const test of roundtrip.nonJson)equal(after.buildDiagnosticScanSessionFromJson(test.input),test.output,'non-JSON behavior unchanged');
console.log('ECU alias import production: '+ecuAliasCases.length+' cases / '+checks+' checks passed; isolated VM; JSON import only, no vehicle I/O');
