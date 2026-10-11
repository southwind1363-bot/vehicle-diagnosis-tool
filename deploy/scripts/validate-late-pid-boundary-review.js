import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
// Production regression. Length evidence: J1699-3 v17.00.00 SidSaveResponseData.c.
const files=['obd-readonly.js','script.js','service-worker.js','offline-assets.json'];
const original=files.map(file=>fs.readFileSync(new URL('../'+file,import.meta.url),'utf8'));
const source=original[0],definitions=JSON.parse(fs.readFileSync(new URL('../data/obd-monitor-definitions.json',import.meta.url),'utf8'));
const legacy=JSON.parse(fs.readFileSync(new URL('./fixtures/late-pid-boundary-3.13.666.json',import.meta.url),'utf8'));
function load(code){const context={window:{}};vm.runInNewContext(code,context);context.window.ObdReadOnly.configureMonitorDefinitions(definitions);return context.window.ObdReadOnly;}
const proposed=load(source),plain=value=>JSON.parse(JSON.stringify(value));
let checks=0;const eq=(a,b,label)=>{assert.deepEqual(plain(a),b,label);checks++;};
const spec=[['A1',9,'nox_sensor_corrected'],['A2',2,'cylinder_fuel_rate'],['A4',4,'transmission_actual_gear'],['A5',4,'commanded_diesel_exhaust_fluid']];
const examples={A1:'0F 80 41 0D 28 80 42 00 80',A2:'41 0D',A4:'03 41 0D 28',A5:'03 80 01 00'};
const observed=legacy.observed;
for(const [mode,header,decoder,status,snapshot] of [
  ['live','41','decodeLivePidResponse','livePidReadoutStatus','livePidSnapshot'],
  ['FF','42','decodeFreezeFrameResponse','freezeFrameReadoutStatus','freezeFrameSnapshot']]){
  const command=(pid,payload)=>header+' '+pid+' '+(mode==='FF'?'02 ':'')+payload;
  for(const [pid,length,id] of spec){
    const old={monitorValues:legacy.observed.find(row=>row.mode===mode&&row.pid===pid).rows,[status]:'reported'};
    const payloads=[Array(length).fill(0),Array(length).fill(255)];
    for(let position=0;position<length;position++)for(const marker of [0x41,0x42]){
      const bytes=Array(length).fill(0x80);bytes[position]=marker;
      if(position+1<length)bytes[position+1]=0x0D;
      if(position+2<length)bytes[position+2]=mode==='FF'?2:40;
      if(position+3<length&&mode==='FF')bytes[position+3]=40;
      payloads.push(bytes);
    }
    for(const bytes of payloads){
      const payload=bytes.map(v=>v.toString(16).toUpperCase().padStart(2,'0')).join(' ');
      const out=proposed[decoder]({raw:command(pid,payload)+' '+command('0D','00'),source_ecu:'7E8'});
      eq(out.monitorValues.length,2,'one complete RAW and one real following PID');
      const raw=out.monitorValues.find(row=>row.id===id);
      eq(raw.value,payload,'all original bytes retained');eq(raw.decoded,false,'no unverified conversion');
      eq(raw.sourceEcu,'7E8','ECU preserved');if(mode==='FF')eq(raw.freezeFrameNumber,2,'FF number preserved');
      eq(out.monitorValues.find(row=>row.id==='vehicle_speed').value,0,'following real zero speed retained');
      eq(out.monitorValueSummary.undecodedRawCount,1,'RAW count');eq(out.monitorValueSummary.decodedCount,1,'only real speed converted');
    }
    for(let lengthMissing=0;lengthMissing<length;lengthMissing++){
      const out=proposed[decoder]({raw:command(pid,Array(lengthMissing).fill('80').join(' '))});
      eq(out.monitorValues.length,0,'truncated payload excluded');eq(out[status],'unparsed','truncated response not acquired');
    }
    const session=proposed.buildDiagnosticScanSession({[snapshot]:proposed[decoder]({raw:command(pid,examples[pid]),source_ecu:'7E8'})});
    const exported=JSON.stringify(proposed.buildBridgeSessionExportPayload(session));
    for(const reader of [proposed]){
      const restored=reader.buildDiagnosticScanSessionFromJson(exported);
      eq(restored[snapshot].monitorValues.map(row=>[row.id,row.value,row.decoded]),[[id,examples[pid],false]],'new RAW archive retained');
      eq(restored.vehicleCommandEnabled,false,'command disabled');eq(restored.wouldTransmit,false,'no transmission');
    }
    const oldSession=proposed.buildDiagnosticScanSession({[snapshot]:old});
    const restored=proposed.buildDiagnosticScanSessionFromJson(JSON.stringify(proposed.buildBridgeSessionExportPayload(oldSession)));
    eq(restored[snapshot].monitorValues.map(row=>[row.id,row.value,row.decoded]),plain(oldSession[snapshot].monitorValues.map(row=>[row.id,row.value,row.decoded])),'old stored rows not silently reinterpreted');
  }
}
eq(observed.find(row=>row.mode==='live'&&row.pid==='A1').rows.map(row=>row.id),['nox_sensor_corrected','vehicle_speed'],'current A1 false extra speed reproduced');
eq(observed.find(row=>row.mode==='live'&&row.pid==='A4').rows.map(row=>row.id),['transmission_actual_gear','vehicle_speed'],'current A4 false extra speed reproduced');
eq(observed.find(row=>row.mode==='live'&&row.pid==='A5').rows[0].value,1.176,'current A5 support byte converted to percentage');
const ui={};const review=original[1].match(/function formatObdLegacyControlReviewNote\([^)]*\) \{[\s\S]*?\r?\n\}/)?.[0];assert.ok(review);vm.runInNewContext(review,ui);
for(const row of legacy.observed.filter(row=>['A4','A5'].includes(row.pid)).flatMap(row=>row.rows.filter(item=>item.pid===row.pid))){
  const before=JSON.stringify(row);eq(Boolean(ui.formatObdLegacyControlReviewNote(row)),true,'legacy record review note');eq(JSON.stringify(row),before,'note preserves stored record');
  for(const change of [{decoded:false},{undecodedRaw:true},{service:'22'},{scope:'manufacturer-specific'},{pid:'0D'},{id:'other'}, {value:null}])eq(ui.formatObdLegacyControlReviewNote({...row,...change}),'','unrelated/RAW record has no legacy warning');
}
eq(ui.formatObdLegacyControlReviewNote({id:'commanded_diesel_exhaust_fluid',pid:'A5',value:0,decoded:true}).includes('再確認'),true,'legacy numeric zero remains reviewable');
eq(ui.formatObdLegacyControlReviewNote({id:'transmission_actual_gear',pid:'A4',value:'Neutral',decoded:true,valueType:'text'}),'','semantic gear text not reclassified');
for(let i=0;i<files.length;i++)eq(fs.readFileSync(new URL('../'+files[i],import.meta.url),'utf8'),original[i],'runtime unchanged');
console.log('Late PID boundary review: '+checks+' checks passed; production; no vehicle I/O.');
