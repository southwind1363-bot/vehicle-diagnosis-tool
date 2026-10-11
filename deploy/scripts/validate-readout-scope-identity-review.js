import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
// Regression acceptance for the approved shared acquisition-scope identity correction.
const runtimeFiles = ['obd-readonly.js', 'script.js', 'service-worker.js', 'offline-assets.json'];
const original = runtimeFiles.map(file => fs.readFileSync(new URL('../' + file, import.meta.url), 'utf8'));
const source = original[0];
const legacy = JSON.parse(fs.readFileSync(new URL('./fixtures/readout-scope-3.13.665.json', import.meta.url), 'utf8'));
function load(text) {
  const context = { window: {} };
  vm.runInNewContext(text.replace('window.ObdReadOnly = Object.freeze({',
    'window.ObdReadOnly = Object.freeze({getReadoutNetworkScopeKey,readoutNetworkScopeMatches,buildReadoutEcuResponseSummaryInput,guardCanonicalPidSnapshot,buildFreezeFrameAssociationSummary,'), context);
  return context.window.ObdReadOnly;
}
const api = load(source);
const plain = value => JSON.parse(JSON.stringify(value));
let checks = 0, cases = 0;
function eq(actual, expected, label) { assert.deepEqual(plain(actual), expected, label); checks++; }
const pairs = [];
for (const field of ['networkBus', 'networkChannel', 'gatewayRoute']) {
  for (const kind of ['separator', 'missing']) {
    const a = { networkBus: 'CAN', networkChannel: 'CH1', gatewayRoute: 'GW1' }, b = { ...a };
    if (kind === 'separator') { a[field] = 'A|B'; b[field] = 'A B'; }
    else { delete a[field]; b[field] = '-'; }
    pairs.push([a, b]);
  }
}
function ecuInput(acquired, unresolved) {
  return { ecuInfoSnapshot: {
    ecuInfoReadoutStatus: 'unparsed', ecuInfoResponseFormat: 'obd_mode09',
    items: [{ id: 'calibration_id', infoType: '04', sourceEcu: '7E8', value: 'UNRESOLVED-ROUTE', ...unresolved }],
    ecuInfoEcuSnapshots: [
      { sourceEcu: '7E8', ecuInfoReadoutStatus: 'reported', items: [], ...acquired },
      { sourceEcu: '7E8', ecuInfoReadoutStatus: 'unparsed', items: [], ...unresolved }
    ]
  } };
}
for (const [a, b] of pairs) for (const [left, right] of [[a, b], [b, a]]) {
  const old = legacy.rows[cases++];
  eq([left, right], [old.left, old.right], 'fixed legacy input');
  eq(old.snapshot.items.map(row => row.value), ['UNRESOLVED-ROUTE'], 'legacy fixture records wrong-route adoption');
  const renormalized = api.buildDiagnosticScanSession({ecuInfoSnapshot:old.snapshot});
  eq(renormalized.ecuInfoSnapshot.items.length, 0, 'legacy normalized rows revalidated against original scopes');
  eq(renormalized.ecuInfoSnapshot.ecuInfoEcuAggregateSummary.ecuCount, 2, 'legacy collapsed scope aggregate recalculated');
  eq(api.getReadoutNetworkScopeKey(left) === api.getReadoutNetworkScopeKey(right), false, 'distinct routes have distinct identities');
  eq(api.readoutNetworkScopeMatches(left, right), false, 'cross-route matches rejected');
  {
    const session = api.buildDiagnosticScanSession(ecuInput(left, right));
    const snapshot = session.ecuInfoSnapshot;
    eq(snapshot.items.map(row => row.value), [], 'public import row selection');
    const aggregate = snapshot.ecuInfoEcuAggregateSummary;
    eq(aggregate.ecuCount, 2, 'distinct acquisition scopes');
    eq(aggregate.reportedEcuCount, 1, 'reported scope preserved');
    eq(aggregate.unparsedEcuCount, 1, 'unparsed scope preserved');
    eq(aggregate.allReported, false, 'partial acquisition remains partial');
    const summary = api.buildReadoutEcuResponseSummaryInput({ livePidSnapshot: {
      livePidReadoutStatus: 'reported', values: [left, right].map(scope => ({ id: 'engine_rpm', sourceEcu: '7E8', value: 800, ...scope }))
    } });
    eq(summary.ecu_responses.length, 2, 'response summary route count');
    const restored = api.buildDiagnosticScanSessionFromJson(JSON.stringify(api.buildBridgeSessionExportPayload(session)));
    eq(restored.ecuInfoSnapshot.items.map(row => row.value), [], 'archive retains row selection');
    eq(restored.ecuInfoSnapshot.ecuInfoEcuAggregateSummary.ecuCount, 2, 'archive retains route count');
    eq(restored.vehicleCommandEnabled, false, 'command disabled');
    eq(restored.wouldTransmit, false, 'no transmission');
  }
}
// Exercise public row-selection callers, with same-route controls to avoid empty-input false passes.
api.configureMonitorDefinitions(JSON.parse(fs.readFileSync(new URL('../data/obd-monitor-definitions.json', import.meta.url), 'utf8')));
for (const [a,b] of pairs) for (const [left,right] of [[a,b],[b,a]]) {
  for (const domain of ['freezeFrame','readiness','dtc']) {
    const status=domain+'ReadoutStatus', children=domain==='dtc'?'ecuResponses':domain+'EcuSnapshots';
    const rows=domain==='freezeFrame'?'monitorValues':domain==='readiness'?'monitors':'dtcs';
    const row=domain==='freezeFrame'?{id:'engine_speed',pid:'0C',value:800}:domain==='readiness'?{id:'misfire',supported:true,complete:true}:{code:'P0171',status:'stored'};
    for(const matched of [false,true]) {
      const input={ [status]:'unparsed', [rows]:[{...row,sourceEcu:'7E8',ecu:'7E8',...(matched?left:right)}],
        [children]:[{sourceEcu:'7E8',ecu:'7E8',...left,[status]:'reported',status:'reported',[rows]:[]},
          {sourceEcu:'7E8',ecu:'7E8',...right,[status]:'unparsed',status:'no_response',[rows]:[]}] };
      const title=domain[0].toUpperCase()+domain.slice(1);
      const normalized=api['normalize'+title+'Snapshot'](input);
      eq(normalized[rows].length, matched?1:0, domain+' normalizer adopts only matching acquired route');
      eq(normalized[children].length, 2, domain+' retains both child scopes');
      const bridge=api['normalizeBridge'+title+'Snapshot']({ok:true,blocked:false,data:input});
      eq(bridge[rows].length, matched?1:0, domain+' bridge adopts only matching acquired route');
    }
  }
}
// Cover numeric cleanup, negative response aggregation, and deterministic FF route ordering.
for(const [a,b] of pairs)for(const [left,right] of [[a,b],[b,a]]){
  for(const kind of ['live','freeze_frame'])for(const matched of [false,true]){
    const isFF=kind==='freeze_frame', status=isFF?'freezeFrameReadoutStatus':'livePidReadoutStatus', children=isFF?'freezeFrameEcuSnapshots':'livePidEcuSnapshots';
    const cleaned=api.guardCanonicalPidSnapshot({[status]:'unparsed',monitorValues:[
      {id:'engine_speed',pid:'0C',value:false,sourceEcu:'7E8',...left},
      {id:'engine_speed',pid:'0C',value:800,sourceEcu:'7E8',...(matched?left:right)}],
      [children]:[{sourceEcu:'7E8',...left,[status]:'reported',monitorValues:[]},{sourceEcu:'7E8',...right,[status]:'unparsed',monitorValues:[]}]},kind);
    eq(cleaned.monitorValues.map(row=>row.value),matched?[800]:[],kind+' cleanup retains only valid acquired-route values');
  }
  const summary=api.buildReadoutEcuResponseSummaryInput({ecuInfoSnapshot:{ecuInfoReadoutStatus:'unparsed',ecuInfoResponseFormat:'uds_read_data_by_identifier',ecuInfoEcuSnapshots:[
    {sourceEcu:'7E8',...left,ecuInfoReadoutStatus:'reported'},
    {sourceEcu:'7E8',...right,ecuInfoReadoutStatus:'unparsed',ecuInfoNegativeResponseService:'22',ecuInfoNegativeResponseCode:'31'}]}});
  eq(summary.ecu_responses.length,2,'negative response stays separate from reported route');
  eq(summary.ecu_responses.filter(row=>row.status==='reported').map(row=>row.negative_response_count??0),[0],'reported route does not inherit negative response');
  const values=[left,right].map(scope=>({id:'engine_speed',value:800,sourceEcu:'7E8',freezeFrameNumber:0,...scope}));
  const forward=api.buildFreezeFrameAssociationSummary([],values),reverse=api.buildFreezeFrameAssociationSummary([],values.toReversed());
  eq(forward.groups.length,2,'FF same-number route groups remain separate');
  eq(forward.groups,plain(reverse.groups),'FF ordering independent of input order');
}
// A historical threshold is display evidence only and must stay with its original route.
const thresholdEvidence={schemaVersion:'pid_reference_threshold_evidence_v1',referenceId:'synthetic-scope-test',pidId:'engine_speed',unit:'rpm',absoluteDeltaMax:500,
  referenceSemantics:'post_repair_absolute_delta',sourceUrl:'https://example.invalid/synthetic',sourceLocator:'Synthetic test only',sourceDate:'2026-10-11',lastVerifiedDate:'2026-10-11',exactMatch:true,
  vehicleScope:{makers:['TEST'],models:['MODEL'],engine_codes:['ENGINE'],year_from:2026,year_to:2026},
  matchedVehicle:{maker:'TEST',model:'MODEL',engine_code:'ENGINE',year:'2026',observation_condition:'post_repair'},observationConditions:['post_repair']};
for(const [a,b] of pairs)for(const [left,right] of [[a,b],[b,a]])for(const matched of [false,true]){
  const row={id:'engine_speed',sourceEcu:'7E8',unit:'rpm',importedValue:800,currentValue:1200};
  const result=api.buildPostRepairReassessmentSummary({observationContext:{conditions:['post_repair'],sameVehicleConfirmed:true},
    importedSessionComparisonSummary:{comparedSectionCount:1,coreReadoutInventoryComparison:{livePidValueComparisonAvailable:true,currentLivePidObservationCondition:'post_repair',livePidValueDeltaRows:[{...row,...(matched?left:right)}]}},
    previousPostRepairReassessmentSummary:{livePidValueDeltaRows:[{...row,...left,thresholdEvidence}]}});
  eq(result.livePidValueDeltaRows[0].historicalThresholdEvidenceRetained,matched,'historical threshold requires exact route');
  eq(result.livePidValueDeltaRows[0].thresholdApplied,false,'historical threshold never authorizes a new interpretation');
}
// Existing normalization and wildcard semantics must not change in this correction.
{
  eq(api.readoutNetworkScopeMatches({ networkBus: 'ＣＡＮ' }, { network_bus: 'can' }), true, 'NFKC and case');
  eq(api.readoutNetworkScopeMatches({}, { networkBus: 'CAN' }), true, 'unspecified expected scope remains wildcard');
  eq(api.readoutNetworkScopeMatches({ networkBus: 'CAN' }, {}), false, 'specified scope requires observed scope');
  eq(api.readoutNetworkScopeMatches({ networkBus: 'CAN', network_bus: 'BODY' }, { networkBus: 'CAN' }), false, 'conflicting alias rejected');
  eq(api.getReadoutNetworkScopeKey({}), '', 'unscoped identity unchanged');
  eq(api.getReadoutNetworkScopeKey({ networkBus: 'CAN', network_bus: 'BODY' }), null, 'conflict identity unchanged');
}
for (let index = 0; index < runtimeFiles.length; index++) {
  eq(fs.readFileSync(new URL('../' + runtimeFiles[index], import.meta.url), 'utf8'), original[index], 'runtime unchanged');
}
console.log('Readout scope identity review: ' + checks + ' checks / ' + cases + ' route cases passed.');
