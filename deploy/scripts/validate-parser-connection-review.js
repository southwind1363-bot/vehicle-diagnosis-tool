import assert from 'node:assert/strict';
import { createParserConnectionReview } from './fixtures/parser-connection-review.js';
let checks=0;
const equal=(a,b)=>{assert.deepEqual(a,b);checks++;};
const commands=['03','07','0A','0101'];
const fields=['initializationComplete','echoOffAcknowledged','spacesOffAcknowledged','protocol11bitReported','canAutoFormatAcknowledged','dlcOffAcknowledged','canExtendedAddressOffAcknowledged'];
for(const failure of [false,true]) {
  let listener, removed=0, created=0, released=0, calls=0;
  const pending=[];
  const review=createParserConnectionReview(()=>{
    created++;let valid=true;
    return {owner:{inspect:()=>({status:valid?'finished':'invalidated',formatReview:{readoutConditions:commands.map(command=>({command,...Object.fromEntries(fields.map(field=>[field,true]))}))}}),invalidate(){valid=false;released++;}},
      api:{parseElmReadOnlyRawTranscript(){calls++;return {status:'responses_observed',frames:[]};}},records:commands.map(command=>({command,transcript:'PRIVATE_RAW'}))};
  },callback=>{listener=callback;return()=>{removed++;if(failure)throw Error('unsubscribe_failure');};},()=>new Promise(resolve=>pending.push(resolve)));
  const events=[];const unsubscribe=review.subscribe(state=>events.push(state.status));
  const old=review.read();equal(review.inspect().status,'reading');
  listener();equal(review.inspect().status,'invalidated');equal(released,1);
  const fresh=review.read();equal(created,2);
  pending[0]();equal(await old,false);equal(review.inspect().status,'reading');equal(calls,0);
  pending[1]();equal(await fresh,true);equal(review.inspect().status,'ready');equal(calls,4);
  listener();equal(review.inspect().text,null);equal(released,2);
  const last=review.read();equal(created,3);
  if(failure){assert.throws(()=>review.dispose(),/unsubscribe_failure/);checks++;}else review.dispose();
  equal(review.inspect().status,'invalidated');equal(review.inspect().text,null);
  pending[2]();equal(await last,false);equal(calls,4);equal(released,3);
  listener();review.dispose();equal(removed,1);equal(await review.read(),false);
  equal(events,['reading','invalidated','reading','ready','invalidated','reading','invalidated']);
  equal(review.inspect().executionEnabled,false);equal(review.inspect().wouldTransmit,false);
  unsubscribe();
}
{
  let invalidated=0;
  const review=createParserConnectionReview(()=>({owner:{invalidate(){invalidated++;}},get ready(){throw Error('PRIVATE_READY_ERROR');}}),()=>()=>{});
  equal(await review.read(),false);
  equal(review.inspect().status,'unavailable');
  equal(review.inspect().text,null);
  equal(invalidated,1);
  review.dispose();equal(invalidated,1);
}
console.log(`Parser preview lifecycle: ${checks} checks passed; synthetic invalidation, late completion, reread and disposal only`);
