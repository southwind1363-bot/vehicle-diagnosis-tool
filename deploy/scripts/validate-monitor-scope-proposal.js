import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createHash} from 'node:crypto';
import {scopeCases} from './monitor-scope-cases.js';

const source = fs.readFileSync(new URL('../obd-readonly.js',import.meta.url),'utf8');
const load = source => {
  const context = vm.createContext({window:{}});
  vm.runInContext('Date = class extends Date { constructor(...args) { super(...(args.length ? args : [1791712800000])); } static now() { return 1791712800000; } };',context);
  vm.runInContext(source,context);
  const model=context.window.ObdReadOnly;
  model.configureMonitorDefinitions(JSON.parse(fs.readFileSync(new URL('../data/obd-monitor-definitions.json',import.meta.url),'utf8')));
  return model;
};
const after=load(source);
const plain=x=>JSON.parse(JSON.stringify(x));
const fixture=JSON.parse(fs.readFileSync(new URL('./fixtures/monitor-scope-legacy-3.13.674.json',import.meta.url),'utf8'));
const baseline=JSON.parse(fs.readFileSync(new URL('./fixtures/monitor-scope-contract-3.13.674.json',import.meta.url),'utf8'));
let checks=0;
const eq=(a,b,message)=>{assert.deepEqual(plain(a),plain(b),message);checks++;};
const strip=value=>Array.isArray(value)?value.map(strip):!value||typeof value!=='object'?value:Object.fromEntries(Object.entries(value).filter(([key])=>!['monitorInsights','monitor_insights'].includes(key)).map(([key,item])=>[key,strip(item)]));
const count=(items,title)=>items.filter(item=>item.title===title).length;
for(const test of scopeCases){
  const saved=JSON.stringify(test.rows);

  const output=after.analyzeMonitorValues(test.rows);
  eq(count(output,'電源電圧を優先確認'),test.low,test.id+': low voltage');
  eq(count(output,'バンク1の燃料補正合計が大きい'),test.fuel,test.id+': fuel trim');
  eq(JSON.stringify(test.rows),saved,test.id+': input untouched');
  if(test.id==='legacy-no-scope')eq(output,fixture.cases.find(row=>row.id===test.id).oldInsights,'legacy no-scope compatibility');
  if(test.id==='different-ecu-low-first')assert.match(output.find(row=>row.title==='電源電圧を優先確認').detail,/ECU "7E8"/);
  // Conflicting aliases already discarded by upstream normalization cannot be
  // reconstructed in this analysis change; do not claim an import fix.
  if(['ecu-conflict','route-conflict','all-conflicting'].includes(test.id))continue;
  const input={monitorValues:test.rows,monitorInsights:[{level:'info',title:'保存時の原文',detail:'原文を保持',nextStep:'確認'}]};
  let snapshot=after.normalizeBridgeLivePidSnapshot(input);
  if(['missing-ecu-mixed','unknown-low-mixed'].includes(test.id)){
    eq(snapshot.sourceEcu,null,'mixed unknown must not synthesize snapshot ECU');
  }
  eq(createHash('sha256').update(JSON.stringify(strip(snapshot))).digest('hex'),baseline.cases.find(row=>row.id===test.id).approvedNonInsightDigest,test.id+': frozen non-insight contract');
  eq(count(snapshot.monitorInsights,'電源電圧を優先確認'),test.low,test.id+': normalized low voltage');
  eq(count(snapshot.monitorInsights,'バンク1の燃料補正合計が大きい'),test.fuel,test.id+': normalized fuel trim');
  eq(snapshot.monitorInsights[0],input.monitorInsights[0],test.id+': recorded original');
  const expected=plain(snapshot.monitorInsights);
  for(let i=0;i<2;i++){
    snapshot=after.normalizeBridgeLivePidSnapshot(snapshot);
    eq(snapshot.monitorInsights,expected,test.id+': repeat normalization');
  }
  const merged=after.mergeDiagnosticInputs({bridgeImport:input});
  // Existing preference within one scope is retained (numeric outranks RAW).
  const mergedLow=test.id==='raw-same-ecu'?1:test.low;
  eq(count(merged.monitorInsights,'電源電圧を優先確認'),mergedLow,test.id+': merged low voltage');
  eq(count(merged.monitorInsights,'バンク1の燃料補正合計が大きい'),test.fuel,test.id+': merged fuel trim');
  if(test.id==='different-ecu-low-first')eq(merged.monitorValues.map(row=>row.sourceEcu),['7E8','7E9'],'merge retains both ECU values');
  const reversed=after.analyzeMonitorValues([...test.rows].reverse());
  if(['different-ecu-low-first','different-networkBus','different-networkChannel','different-gatewayRoute','later-scope-after-six'].includes(test.id)){
    eq(count(reversed,'電源電圧を優先確認'),test.low,'scope order does not lose cautions');
    eq(merged.monitorValues,test.rows.map(row=>({...row,source:'local_bridge'})),'distinct scope values untouched');
  }
  if(['different-ecu-low-first','cross-ecu-trim','later-scope-after-six','missing-ecu-mixed'].includes(test.id)){
    const composed=after.mergeDiagnosticInputs({bridgeImport:after.buildBridgeDiagnosticImport({livePidSnapshot:snapshot})});
    eq(count(composed.monitorInsights,'電源電圧を優先確認'),test.low,test.id+': bridge import composition');
    eq(count(composed.monitorInsights,'バンク1の燃料補正合計が大きい'),test.fuel,test.id+': composed trim');
    let session=after.buildDiagnosticScanSession({session_id:'scope-'+test.id,livePidSnapshot:snapshot});
    const insights=plain(session.livePidSnapshot.monitorInsights);
    for(let i=0;i<2;i++){
      session=after.buildDiagnosticScanSessionFromJson(JSON.stringify(after.buildBridgeSessionExportPayload(session)));
      eq(session.livePidSnapshot.monitorInsights,insights,test.id+': archive repeat');
    }
  }
}
// Every former numeric/RAW rule remains identical in unscoped records.
const raw=JSON.parse(fs.readFileSync(new URL('./fixtures/analysis-raw-legacy-3.13.671.json',import.meta.url),'utf8'));
for(const test of raw.cases){
  const unscoped=test.rows.map(({sourceEcu,source_ecu,...row})=>row);
  const regular=unscoped.map(({decoded,...row})=>row);
  eq(after.analyzeMonitorValues(regular),baseline.raw.find(row=>row.id===test.id).regular,'legacy numeric rule '+test.id);
  eq(after.analyzeMonitorValues(unscoped),baseline.raw.find(row=>row.id===test.id).raw,'legacy RAW rule '+test.id);
}
console.log('Monitor scope production: '+scopeCases.length+' cases, '+checks+' checks passed; production code, no vehicle I/O; alias normalization outside this change');
