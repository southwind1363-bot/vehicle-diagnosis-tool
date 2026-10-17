import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {client,attachWire} from './fixtures/serial-runtime-harness.js';
import {createParserConnectionReview} from './fixtures/parser-connection-review.js';
const runtime=vm.createContext({window:{}});
vm.runInContext(fs.readFileSync(new URL('../obd-readonly.js',import.meta.url),'utf8'),runtime);
const commands=['03','07','0A','0101'];
const lines=['7E8024300AAAAAAAAAA','7E8024700AAAAAAAAAA','7E8024A00AAAAAAAAAA','7E806410100070100AA'];
let checks=0;const equal=(a,b)=>{assert.deepEqual(a,b);checks++;};
for(const scenario of ['normal','disconnect','settings_changed']) {
  const c=client(), wire=attachWire(c,2,Object.fromEntries(commands.map((command,index)=>[command,lines[index]+'\r>'])));
  let review, notify, interrupted=false, premature, completed=0, secondReadBytes=0;
  try {
    await c.context.initializeElmDeveloperAdapter();
    const state=c.context.obdDevSession;
    state.settingsObservation.owner.recordProtocol(state.settingsObservation.ticket,'A6');
    const saved=Object.freeze({marker:'saved-diagnostics'});state.lastSession=saved;c.context.obdSerialResultOwner.expectedLastSession=saved;
    const decode=state.decoder.decode.bind(state.decoder);
    state.decoder.decode=(...args)=>{
      const chunk=decode(...args);
      if(wire.writes.at(-1)==='07\r') secondReadBytes+=chunk.length;
      if(scenario!=='normal' && !interrupted && secondReadBytes>=4) {
        interrupted=true;
        if(scenario==='disconnect') state.readLoopActive=false;
        else state.settingsObservation.owner.invalidate();
        notify();
        equal(review.inspect().text,null);
        premature=review.read();
      }
      return chunk;
    };
    review=createParserConnectionReview(()=>{
      const owner=c.context.createWebSerialReadoutCapture(commands), records=[];
      const ready=(async()=>{
        for(const command of commands) {
          const result=await c.context.readElmDeveloperCommandRecord(command,100);
          if(!result.record || !owner.append(result.record)) return;
          records.push(result.record); completed++;
        }
        owner.finish();
      })();
      return {owner,records,ready,api:runtime.window.ObdReadOnly};
    },callback=>{notify=callback;return()=>{notify=()=>{};};});
    const events=[];review.subscribe(snapshot=>events.push(snapshot.status));
    const result=await review.read();
    equal(state.lastSession,saved);
    equal(wire.writes.filter(command=>commands.some(item=>command===item+'\r')),scenario==='normal'?commands.map(command=>command+'\r'):['03\r','07\r']);
    if(scenario==='normal') {equal(result,true);equal(completed,4);assert.match(review.inspect().text,/保存DTC：対応する応答/);checks++;notify();equal(review.inspect().text,null);}
    else {equal(await premature,false);equal(result,false);equal(completed,1);equal(review.inspect().status,'invalidated');equal(review.inspect().text,null);equal(events,['reading','invalidated']);}
    equal(review.inspect().executionEnabled,false);
    if(scenario==='settings_changed') {
      await c.context.initializeElmDeveloperAdapter();
      state.settingsObservation.owner.recordProtocol(state.settingsObservation.ticket,'A6');
      equal(await review.read(),true);
      equal(completed,5);
      equal(wire.writes.slice(-4),commands.map(command=>command+'\r'));
      assert.match(review.inspect().text,/レディネス：対応する応答/);checks++;
      equal(state.lastSession,saved);
    }
  } finally {review?.dispose();await wire.close();}
}
console.log(`Parser acquisition integration: ${checks} checks passed; production sender/capture with two-byte synthetic wire, no vehicle I/O`);
