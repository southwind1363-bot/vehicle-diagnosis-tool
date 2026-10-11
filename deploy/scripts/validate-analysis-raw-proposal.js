import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
// Review only: production files remain unchanged. Patch a separate VM copy.
const source = fs.readFileSync(new URL('../obd-readonly.js', import.meta.url), 'utf8');
const oldLine = 'return item && item.valueType !== "text" && Number.isFinite(item.value) ? item.value : null;';
const newLine = 'return item && buildMonitorValueSummary([item]).numericCount === 1 ? item.value : null;';
assert.equal(source.split(oldLine).length, 2, 'Proposal anchor must occur once');
const create = code => { const c = vm.createContext({ window: {} }); vm.runInContext(code, c); return c.window.ObdReadOnly; };
const before = create(source), after = create(source.replace(oldLine, newLine));
const plain = x => JSON.parse(JSON.stringify(x));
const golden = JSON.parse(fs.readFileSync(new URL('./fixtures/analysis-raw-legacy-3.13.671.json', import.meta.url), 'utf8'));
let checks=0;
const eq=(a,b,message)=>{assert.deepEqual(plain(a),plain(b),message);checks++;};
const flags=[{decoded:false},{undecodedRaw:true},{undecoded_raw:true},{valueType:'raw_hex'},{value_type:'raw_hex'},{valueType:'text'},{value_type:'text'},{decoded:false,valueType:'number'}];
for(const test of golden.cases){
  eq(before.analyzeMonitorValues(test.rows),test.oldInsights,'frozen baseline '+test.id);
  const regular=test.rows.map(({decoded,...row})=>row);
  eq(after.analyzeMonitorValues(regular),before.analyzeMonitorValues(regular),'normal values/zero '+test.id);
  for(const flag of flags) for(let index=0;index<regular.length;index++){
    const rows=regular.map((row,i)=>i===index?{...row,...flag}:{...row});
    const original=JSON.stringify(rows);
    const expected=before.analyzeMonitorValues(rows.map((row,i)=>i===index?{...row,value:null}:row));
    eq(after.analyzeMonitorValues(rows),expected,'exclude only RAW/text operand '+test.id);
    assert.equal(JSON.stringify(rows),original);checks++;
  }
}
for(const value of [null,undefined,'9',NaN,Infinity]){
  const rows=[{id:'control_module_voltage',value}];
  eq(after.analyzeMonitorValues(rows),before.analyzeMonitorValues(rows),'non-numeric input');
}
const rows=golden.cases[0].rows;
for(const model of [before,after]) model.configureMonitorDefinitions(JSON.parse(fs.readFileSync(new URL('../data/obd-monitor-definitions.json',import.meta.url),'utf8')));
for(const flag of flags){
  const rawRows=[{id:'control_module_voltage',pid:'42',unit:'V',value:9,sourceEcu:'7E8',...flag}];
  const input={bridgeImport:{monitorValues:rawRows}};
  const old=before.mergeDiagnosticInputs(input), next=after.mergeDiagnosticInputs(input);
  eq(next.monitorValues,old.monitorValues,'merge values unchanged');
  eq(next.monitorInsights,after.analyzeMonitorValues(rawRows),'merge uses reviewed predicate');
}
const importInput={livePidSnapshot:{monitorValues:rows}};
const oldImport=before.mergeDiagnosticInputs({bridgeImport:before.buildBridgeDiagnosticImport(importInput)});
const newImport=after.mergeDiagnosticInputs({bridgeImport:after.buildBridgeDiagnosticImport(importInput)});
eq(newImport.monitorValues,oldImport.monitorValues,'bridge composition values retained');
eq(newImport.monitorInsights,after.analyzeMonitorValues(rows),'bridge composition removes RAW warning');
assert.ok(oldImport.monitorInsights.some(row=>row.title==='電源電圧を優先確認'));checks++;
const savedHint={title:'保存された注意文',level:'caution',detail:'取得元の説明',nextStep:'確認'};
const merged=after.mergeDiagnosticInputs({bridgeImport:{monitorValues:rows,monitorInsights:[savedHint]}});
assert.ok(merged.monitorInsights.some(row=>row.title===savedHint.title));checks++;
const normalized=before.normalizeBridgeLivePidSnapshot({values:rows});
eq(after.normalizeBridgeLivePidSnapshot({values:rows}),normalized,'normalization already excludes RAW');
const session=after.buildDiagnosticScanSession({livePidSnapshot:{schemaVersion:'live_pid_snapshot_v1',monitorValues:rows}});
const restored=after.buildDiagnosticScanSessionFromJson(JSON.stringify(after.buildBridgeSessionExportPayload(session)));
const legacyRestored=before.buildDiagnosticScanSessionFromJson(JSON.stringify(before.buildBridgeSessionExportPayload(session)));
eq(restored.livePidSnapshot.monitorValues,legacyRestored.livePidSnapshot.monitorValues,'archive normalization unchanged');
// Do not revive an earlier numeric row when the same ID ends in RAW.
const duplicate=[{id:'control_module_voltage',value:9},{id:'control_module_voltage',value:9,decoded:false}];
eq(after.analyzeMonitorValues(duplicate),before.analyzeMonitorValues([{id:'control_module_voltage',value:9},{id:'control_module_voltage',value:null}]),'duplicate precedence unchanged');
console.log('RAW analysis proposal: '+checks+' checks passed; isolated VM only, production unchanged, no vehicle I/O');
