import assert from 'node:assert/strict';
import { buildParserConnectionReport } from './report-parser-connection.js';
import { createParserConnectionPreview } from './fixtures/parser-connection-preview.js';
let checks = 0;
const equal = (a,b) => { assert.deepEqual(a,b); checks++; };
const report = buildParserConnectionReport();
for (const row of report.scenarios) {
  equal(row.preview.executionEnabled, false);
  equal(row.previewAfterInvalidation.state, 'unavailable');
  equal(row.previewAfterInvalidation.items, []);
  equal(row.previewAfterInvalidation.text.includes('保存DTC：'), false);
  if (row.id === 'generation_changed') { equal(row.preview.state, 'unavailable'); continue; }
  equal(row.preview.items.map(item => item.command), ['03','07','0A','0101']);
  const first = { unexpected_service:'format_rejected', invalid_pci:'format_rejected', bare_lf:'format_rejected', no_data:'no_response' }[row.id];
  const missing = !row.allPreReadConditionsObserved;
  equal(row.preview.items.map(item => item.status), missing ? Array(4).fill('conditions_missing') : [first || 'response_observed', ...Array(3).fill('response_observed')]);
}
const fields = ['initializationComplete','echoOffAcknowledged','spacesOffAcknowledged','protocol11bitReported','canAutoFormatAcknowledged','dlcOffAcknowledged','canExtendedAddressOffAcknowledged'];
const commands = ['03','07','0A','0101'];
for (const scenario of ['one_missing','expire_during_parse','dispose_during_parse','parser_throws','negative']) {
  let expired = false, calls = 0, preview;
  const owner = { inspect: () => ({status: expired ? 'invalidated' : 'finished',formatReview:{readoutConditions:commands.map(command=>({command,...Object.fromEntries(fields.map(field=>[field, !(scenario==='one_missing' && command==='07' && field==='dlcOffAcknowledged')]))}))}}) };
  const api = { parseElmReadOnlyRawTranscript() { calls++;
    if(scenario==='expire_during_parse') expired=true;
    if(scenario==='dispose_during_parse') preview.dispose();
    if(scenario==='parser_throws') throw Error('PRIVATE_RAW_SENTINEL');
    return {status:'responses_observed',frames:[{responseKind:scenario==='negative'?'matching_negative_service':'matching_positive_service'}]}; } };
  const records=commands.map(command=>({command,transcript:'PRIVATE_RAW_SENTINEL'}));
  preview=createParserConnectionPreview(owner,api,records);
  records[0].command='04';
  const result=preview.inspect();
  if(scenario==='one_missing') {equal(calls,3);equal(result.items.map(row=>row.status),['response_observed','conditions_missing','response_observed','response_observed']);}
  else if(scenario==='negative') {equal(calls,4);equal(result.items.every(row=>row.status==='negative_response'),true);}
  else {equal(calls,1);equal(result.state,'unavailable');equal(result.items,[]);}
  equal(result.text.includes('PRIVATE_RAW_SENTINEL'),false);
  preview.dispose();equal(preview.inspect().items,[]);
}
console.log(`Parser connection preview: ${checks} checks passed; synthetic data only`);
