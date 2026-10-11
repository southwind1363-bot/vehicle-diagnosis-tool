import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {bridgeEcuAliasCases,readIntents} from './bridge-ecu-alias-cases.js';
const core=fs.readFileSync(new URL('../obd-readonly.js',import.meta.url),'utf8');
const ui=fs.readFileSync(new URL('../script.js',import.meta.url),'utf8');
const fixture=JSON.parse(fs.readFileSync(new URL('./fixtures/bridge-ecu-alias-legacy-3.13.676.json',import.meta.url),'utf8'));
const load=source=>{
 const c=vm.createContext({window:{}});
 vm.runInContext('Date = class extends Date { constructor(...args) { super(...(args.length ? args : [1791712800000])); } static now() { return 1791712800000; } };',c);
 vm.runInContext(source,c);c.window.ObdReadOnly.configureMonitorDefinitions(JSON.parse(fs.readFileSync(new URL('../data/obd-monitor-definitions.json',import.meta.url),'utf8')));return c.window.ObdReadOnly;
};
const after=load(core);
const blockedFixture=JSON.parse(fs.readFileSync(new URL('./fixtures/live-ecu-alias-normalization-legacy-3.13.677.json',import.meta.url),'utf8')).blocked;
const digest=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
function extract(source,name){
 const start=source.search(new RegExp('^(?:async )?function '+name+'\\(','m'));
 if(start<0)throw new Error(name);
 const rest=source.slice(start);const next=rest.slice(1).search(/^(?:async )?function /m);
 return next<0?rest:rest.slice(0,next+1);
}
function client(source,api,response,{cancel=false,missing=false}={}){
 const calls={send:0,success:0,finished:0};
 const session={marker:'previous diagnostic result',values:[14],samples:[{value:14}]};
 const operation={preserveStage:true};
 const c=vm.createContext({window:{ObdReadOnly:missing?{}:api},obdDevModeUnlocked:true,obdDevSession:{lastSession:session},obdDevStatus:{},
 beginObdBridgeOperation:()=>operation,
 sendObdLocalBridgeIntent:async()=>{calls.send++;return response;},
 throwIfObdBridgeOperationCancelled:()=>{if(cancel)throw new Error('local_bridge_cancelled');},
 finishObdBridgeOperation:(op,message)=>{calls.finished++;calls.message=message;calls.preserveStage=op.preserveStage;}});
 for(const name of ['isSafeLocalBridgeIntent','formatObdLocalBridgeFailure','runObdLocalBridgeRead'])vm.runInContext(extract(source,name),c);
 return {calls,c,session,run:async(intent)=>c.runObdLocalBridgeRead('検証読取',intent,{},value=>{calls.success++;calls.response=value;c.obdDevSession.lastSession={replacement:true};})};
}
let checks=0;const eq=(a,b,m)=>{assert.equal(a,b,m);checks++;};
for(const test of bridgeEcuAliasCases){
 const original=JSON.stringify(test.response),golden=fixture.cases.find(x=>x.id===test.id);
 eq(digest(after.normalizeBridgeLivePidSnapshot(test.response)),test.reject?digest(blockedFixture):golden.outputSha256,test.id+' approved normalizer rejection or unchanged normal output');
 eq(after.hasConflictingJsonEcuAliases(test.response),test.reject,test.id+' conflict classification');
 for(const intent of readIntents){
  const app=client(ui,after,test.response);await app.run(intent);
  eq(app.calls.send,1,test.id+' one response, no retry');eq(app.calls.finished,1,test.id+' operation released');
  eq(app.calls.success,test.reject?0:1,test.id+' callback gate');eq(app.calls.preserveStage,test.reject,test.id+' route ownership');
  if(test.reject){eq(app.c.obdDevSession.lastSession,app.session,test.id+' previous session retained');eq(app.calls.message.includes('現在の読取結果を保持しています'),true,test.id+' Japanese reason');}
  else eq(app.calls.response,test.response,test.id+' unchanged accepted envelope');
 }
 eq(JSON.stringify(test.response),original,test.id+' source untouched');
}
const source=ui,bad=bridgeEcuAliasCases[0].response;
for(const [response,options,label] of [[bad,{cancel:true},'cancel'],[bad,{missing:true},'missing checker'],[{...bad,ok:false,blocked:true,errors:['sample_mode_no_vehicle_readout']},{},'blocked response']]){
 const app=client(source,after,response,options);await app.run('read_live_pid_snapshot');eq(app.calls.success,0,label);eq(app.c.obdDevSession.lastSession,app.session,label+' keeps results');eq(app.calls.finished,1,label+' releases operation');
}
const vci=client(source,after,bad);await vci.run('list_vci');eq(vci.calls.success,1,'VCI inventory excluded');
const recovered=client(source,after,bad);await recovered.run('read_live_pid_snapshot');recovered.c.sendObdLocalBridgeIntent=async()=>bridgeEcuAliasCases.find(t=>t.id==='same-aliases').response;await recovered.run('read_live_pid_snapshot');eq(recovered.calls.success,1,'valid response after rejection');
eq(fixture.cases.find(x=>x.id==='false-trim').insights.some(x=>x.title==='バンク1の燃料補正合計が大きい'),true,'old false aggregate recorded');
console.log('Bridge ECU alias production: '+bridgeEcuAliasCases.length+' envelopes / '+readIntents.length+' read intents / '+checks+' checks passed; isolated runtime functions, no transport.');
