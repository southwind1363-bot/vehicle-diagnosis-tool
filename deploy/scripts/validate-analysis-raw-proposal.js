import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
// Approved regression: production code only, frozen legacy expectations.
const source = fs.readFileSync(new URL('../obd-readonly.js', import.meta.url), 'utf8');
const c = vm.createContext({ window: {} }); vm.runInContext(source, c);
const after = c.window.ObdReadOnly;
const plain = x => JSON.parse(JSON.stringify(x));
const golden = JSON.parse(fs.readFileSync(new URL('./fixtures/analysis-raw-legacy-3.13.671.json', import.meta.url), 'utf8'));
// Approved scope annotation; frozen legacy thresholds and text remain unchanged.
const scoped = rows => rows.map(row=>({...row,detail:'対象: ECU "7E8" / バス 未記録 / チャンネル 未記録 / ゲートウェイ経路 未記録。 '+row.detail}));
let checks=0;
const eq=(a,b,message)=>{assert.deepEqual(plain(a),plain(b),message);checks++;};
const flags=[{decoded:false},{undecodedRaw:true},{undecoded_raw:true},{valueType:'raw_hex'},{value_type:'raw_hex'},{valueType:'text'},{value_type:'text'},{decoded:false,valueType:'number'}];
for(const test of golden.cases){
  assert.ok(test.oldInsights.length > 0); checks++;
  const regular=test.rows.map(({decoded,...row})=>row);
  eq(after.analyzeMonitorValues(regular),scoped(test.regularInsights),'normal values/zero '+test.id);
  for(const flag of flags) for(let index=0;index<regular.length;index++){
    const rows=regular.map((row,i)=>i===index?{...row,...flag}:{...row});
    const original=JSON.stringify(rows);
    const expected=scoped(test.excludedOperandInsights[index]);
    eq(after.analyzeMonitorValues(rows),expected,'exclude only RAW/text operand '+test.id);
    assert.equal(JSON.stringify(rows),original);checks++;
  }
}
for(const value of [null,undefined,'9',NaN,Infinity]){
  const rows=[{id:'control_module_voltage',value}];
  eq(after.analyzeMonitorValues(rows),golden.nonNumericInsights,'non-numeric input');
}
const rows=golden.cases[0].rows;
after.configureMonitorDefinitions(JSON.parse(fs.readFileSync(new URL('../data/obd-monitor-definitions.json',import.meta.url),'utf8')));
for(const flag of flags){
  const rawRows=[{id:'control_module_voltage',pid:'42',unit:'V',value:9,sourceEcu:'7E8',...flag}];
  const input={bridgeImport:{monitorValues:rawRows}};
  const next=after.mergeDiagnosticInputs(input);
  eq(next.monitorValues,rawRows.map(row=>({...row,source:'local_bridge'})),'merge values unchanged');
  eq(next.monitorInsights,after.analyzeMonitorValues(rawRows),'merge uses reviewed predicate');
}
const importInput={livePidSnapshot:{monitorValues:rows}};
const newImport=after.mergeDiagnosticInputs({bridgeImport:after.buildBridgeDiagnosticImport(importInput)});
eq(newImport.monitorValues,rows.map(row=>({...row,source:'local_bridge'})),'bridge composition values retained');
eq(newImport.monitorInsights,after.analyzeMonitorValues(rows),'bridge composition removes RAW warning');
assert.ok(!newImport.monitorInsights.some(row=>row.title==='電源電圧を優先確認'));checks++;
const savedHint={title:'保存された注意文',level:'caution',detail:'取得元の説明',nextStep:'確認'};
const merged=after.mergeDiagnosticInputs({bridgeImport:{monitorValues:rows,monitorInsights:[savedHint]}});
assert.ok(merged.monitorInsights.some(row=>row.title===savedHint.title));checks++;
const normalized=golden.normalizedRaw;
eq(after.normalizeBridgeLivePidSnapshot({values:rows}).monitorValues,normalized,'normalization already excludes RAW');
const session=after.buildDiagnosticScanSession({livePidSnapshot:{schemaVersion:'live_pid_snapshot_v1',monitorValues:rows}});
const restored=after.buildDiagnosticScanSessionFromJson(JSON.stringify(after.buildBridgeSessionExportPayload(session)));
eq(restored.livePidSnapshot.monitorValues,golden.restoredRaw,'archive normalization unchanged');
// Do not revive an earlier numeric row when the same ID ends in RAW.
const duplicate=[{id:'control_module_voltage',value:9},{id:'control_module_voltage',value:9,decoded:false}];
eq(after.analyzeMonitorValues(duplicate),golden.duplicateInsights,'duplicate precedence unchanged');
console.log('RAW analysis regression: '+checks+' checks passed; production code, frozen legacy evidence, no vehicle I/O');
