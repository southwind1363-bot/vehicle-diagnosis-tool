import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('../script.js',import.meta.url),'utf8');
const current=source.match(/function createWebSerialReadoutCapture\([^\n]*\) \{[\s\S]*?\r?\n\}/)[0];
const legacy=fs.readFileSync(new URL('./fixtures/raw-readout-capture-3.13.698.txt',import.meta.url),'utf8');
const commands=['03','07','0A','0101'];
const fields=['initializationComplete','echoOffAcknowledged','spacesOffAcknowledged','protocol11bitReported','canAutoFormatAcknowledged','dlcOffAcknowledged','canExtendedAddressOffAcknowledged'];
const valid='7E8024300AAAAAAAAAA\r>';
const cases=[[valid,[]],['7E8024300AAAAAAAAAA\n>',['framing_mismatch']],['7E8 02 43 00 AA AA AA AA AA\r>',['spacing_conflict']],['NO DATA\r>',['no_frame_evidence']],['03\r'+valid,['echo_conflict']],['PRIVATE_RAW_SENTINEL\r>',['unsupported_line','no_frame_evidence']]];
let checks=0;const equal=(a,b)=>{assert.deepEqual(a,b);checks++;};const plain=value=>JSON.parse(JSON.stringify(value));
function run(factory,transcripts,missing) {
 const state={port:{},reader:{},writer:{},settingsTicket:{},revision:1,connected:true,unlocked:true};
 const context=vm.createContext({readWebSerialCaptureContext:()=>({...state}),obdDevSession:{settingsObservation:{owner:{inspect:()=>({ok:true,summary:{}})}}}});
 vm.runInContext(factory,context);const owner=context.createWebSerialReadoutCapture(commands);
 commands.forEach((command,index)=>owner.append({command,transcript:transcripts[index],settingsBeforeRead:Object.fromEntries(fields.map(field=>[field,!missing])),startedAt:index,completedAt:index,profile:null,profileVerified:false,realTransportProofAvailable:false,executionEnabled:false}));
 owner.finish();return {owner,state};
}
for(const missing of [false,true]) for(let position=0;position<4;position++) for(const [text,reasons] of cases) {
 const transcripts=commands.map((_,index)=>index===position?text.replace(/^03\r/,commands[index]+'\r'):valid);
 const a=run(current,transcripts,missing),b=run(legacy,transcripts,missing);
 const review=a.owner.inspect().formatReview, actual=plain(review);delete actual.readoutIssues;
 equal(actual,plain(b.owner.inspect().formatReview));
 const expected=reasons.map(reason=>missing&&reason==='echo_conflict'?'unsupported_line':reason).filter(reason=>!(missing&&reason==='spacing_conflict'));
 equal(plain(review.readoutIssues),commands.map((command,index)=>({command,issues:index===position?expected:[]})));
 equal(Object.isFrozen(review.readoutIssues)&&review.readoutIssues.every(row=>Object.isFrozen(row)&&Object.isFrozen(row.issues)),true);
 a.owner.inspect();equal(a.owner.inspect().count,4);
 equal(JSON.stringify(review).includes('PRIVATE_RAW_SENTINEL'),false);
 a.state.settingsTicket={};equal(a.owner.inspect().formatReview,null);equal(a.owner.take(),null);
}
console.log(`Per-readout lexical observations: ${checks} checks / 48 cases passed; frozen 3.13.698 aggregate parity, no parser grant`);
