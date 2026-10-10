import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
// Exercise production inventory, import and comparison against frozen legacy evidence.
const file = new URL('../obd-readonly.js', import.meta.url);
const source = fs.readFileSync(file, 'utf8');
const context = { window: {} };
vm.runInNewContext(source.replace('window.ObdReadOnly = Object.freeze({',
  'window.ObdReadOnly = Object.freeze({buildCoreReadoutInventorySummary,buildImportedCoreReadoutInventoryComparisonSummary,'), context);
const api = context.window.ObdReadOnly;
let checks = 0;
const eq = (actual, expected, message) => { assert.deepEqual(JSON.parse(JSON.stringify(actual)), expected, message); checks++; };
const snapshot = scopes => ({
  freezeFrameReadoutStatus: 'reported',
  monitorValues: scopes.map(scope => ({ id: 'engine_speed', freezeFrameNumber: 0, sourceEcu: '7E8', value: 1200, unit: 'rpm', ...scope })),
  triggerDtcEntries: scopes.map(scope => ({ code: 'P0300', frameNumber: 0, sourceEcu: '7E8', ...scope })),
  udsDtcSnapshotRecords: scopes.map(scope => ({ code: 'P0300', snapshotRecordNumber: 1, sourceEcu: '7E8', ...scope })),
  udsDtcStoredDataRecords: scopes.map(scope => ({ storedDataRecordNumber: 2, sourceEcu: '7E8', ...scope })),
  freezeFrameEcuSnapshots: scopes.map(scope => ({ sourceEcu: '7E8', freezeFrameReadoutStatus: 'reported', ...scope }))
});
const inventory = scopes => api.buildCoreReadoutInventorySummary({ freezeFrameSnapshot: snapshot(scopes) });
const evidence = [];
const frozen = JSON.parse(fs.readFileSync(new URL("./fixtures/inventory-freeze-frame-3.13.662.json", import.meta.url), "utf8"));
for (const field of ['networkBus', 'networkChannel', 'gatewayRoute']) {
  for (const kind of ['separator', 'missing']) {
    const a = { networkBus: 'CAN', networkChannel: 'CH1', gatewayRoute: 'GW1' };
    const b = { ...a };
    if (kind === 'separator') { a[field] = 'A|B'; b[field] = 'A B'; }
    else { delete a[field]; b[field] = '-'; }
    for (const [left, right] of [[a,b],[b,a]]) {
      const input = snapshot([left,right]), saved = JSON.stringify(input);
      const both = api.buildCoreReadoutInventorySummary({ freezeFrameSnapshot: input });
      const first = inventory([left]), second = inventory([right]);
      const comparison = api.buildImportedCoreReadoutInventoryComparisonSummary(first, second);
      eq(both.countsById.freeze_frame_snapshot, 6, 'two measured rows and four UDS rows retained in count');
      eq(both.freezeFrameValueKeys.length, 2, 'separate measured keys');
      eq(both.freezeFrameTriggerKeys.length, 2, 'separate trigger keys');
      eq(both.freezeFrameUdsRecordKeys.length, 4, 'separate UDS keys');
      eq(both.freezeFrameValueReportedEcuScopeKeys.length, 2, 'separate ECU routes');
      for (const family of ['Value','Trigger','UdsRecord']) {
        eq(comparison['freezeFrame'+family+'ComparisonAvailable'], true, 'modern comparison available');
        eq(comparison['freezeFrame'+family+'KeysChanged'], true, 'different routes are changes');
      }
      eq(JSON.stringify(input), saved, 'inspection must preserve original measurements');
      const session = api.buildDiagnosticScanSession({ freeze_frame_snapshot: { freezeFrameReadoutStatus: 'reported', monitorValues: input.monitorValues } });
      eq(session.freezeFrameSnapshot.monitorValues.length, 2, 'public import retains measured rows');
      eq(session.coreReadoutInventorySummary.freezeFrameValueCount, 2, 'public import keeps separate keys');
      const restored = api.buildDiagnosticScanSessionFromJson(JSON.stringify(api.buildBridgeSessionExportPayload(session)));
      eq(restored.freezeFrameSnapshot.monitorValues, JSON.parse(JSON.stringify(session.freezeFrameSnapshot.monitorValues)), 'archive retains original rows');
      eq(restored.vehicleCommandEnabled, false, 'no command permission');
      eq(restored.wouldTransmit, false, 'no vehicle transmission');
      const old = frozen.evidence[evidence.length];
      eq(old.valueKeys.length, 1, 'frozen legacy collision retained');
      for (const [before, after] of [[old.first, first], [first, old.first], [old.first, old.second]]) {
        const blocked = api.buildImportedCoreReadoutInventoryComparisonSummary(before, after);
        for (const family of ['Value','Trigger','UdsRecord']) {
          eq(blocked['freezeFrame'+family+'ComparisonAvailable'], false, 'old or mixed comparison blocked');
          eq(blocked['freezeFrame'+family+'ComparisonScope'], 'unavailable', 'blocked scope unavailable');
          eq(blocked['freezeFrame'+family+'ComparisonBlockedByKeyVersion'], true, 'version reason retained');
          eq(blocked['freezeFrame'+family+'AddedKeys'], [], 'no invented additions');
        }
      }
      const withOld = api.buildDiagnosticScanSession({freeze_frame_snapshot: {freezeFrameReadoutStatus:'reported', monitorValues:input.monitorValues}, core_readout_inventory_summary:old.first});
      const oldRestored = api.buildDiagnosticScanSessionFromJson(JSON.stringify(api.buildBridgeSessionExportPayload(withOld)));
      eq(oldRestored.importedCoreReadoutInventoryComparisonSummary.freezeFrameValueComparisonBlockedByKeyVersion, true, 'old comparison reason survives archive');
      evidence.push({ field, kind, left, right, valueKeys: both.freezeFrameValueKeys, triggerKeys: both.freezeFrameTriggerKeys, udsKeys: both.freezeFrameUdsRecordKeys });
    }
  }
}
const ordinary = api.buildImportedCoreReadoutInventoryComparisonSummary(inventory([{networkBus:'CAN'}]), inventory([{networkBus:'CAN'}]));
eq(ordinary.freezeFrameValueComparisonAvailable, true, 'ordinary baseline available');
eq(ordinary.freezeFrameValueKeysChanged, false, 'ordinary baseline unchanged');
eq(fs.readFileSync(file,'utf8'), source, 'runtime source remains unchanged');
const modern = inventory([{networkBus:'CAN'}]);
for (const patch of [{freezeFrameKeyVersion:3}, {freezeFrameValueKeys:['bad']}, {freezeFrameValueKeys:['']}, {freezeFrameTriggerReportedEcuScopeKeys:{}}, {freezeFrameKeyVersion:1,freeze_frame_key_version:2}]) {
  const input={...modern,...patch};
  eq(api.buildImportedCoreReadoutInventoryComparisonSummary(input,modern).freezeFrameValueComparisonAvailable,false,'malformed private input blocked');
  const imported=api.buildDiagnosticScanSession({freeze_frame_snapshot:snapshot([{networkBus:'CAN'}]),core_readout_inventory_summary:input});
  eq(imported.importedCoreReadoutInventoryComparisonSummary.freezeFrameValueComparisonAvailable,false,'malformed public import blocked');
}
const legacy={freezeFrameValueEvidenceRecorded:true,freezeFrameValueKeys:['engine_speed|0|7E8|rpm|800']};
eq(api.buildImportedCoreReadoutInventoryComparisonSummary(legacy,legacy).freezeFrameValueComparisonAvailable,true,'legacy unscoped comparison preserved');
const partialInput=snapshot([{networkBus:'A|B'},{networkBus:'A B'}]);partialInput.freezeFrameReadoutStatus='unparsed';partialInput.triggerDtcEntries=[];
partialInput.freezeFrameEcuSnapshots[1].freezeFrameReadoutStatus='unparsed';
const partial=api.buildCoreReadoutInventorySummary({freezeFrameSnapshot:partialInput});
eq(partial.freezeFrameValueReportedEcuKeys.length,1,'only reported ECU route retained');
eq(partial.freezeFrameUdsRecordReportedEcuKeys.length,2,'only reported UDS route retained');
const partialComparison=api.buildImportedCoreReadoutInventoryComparisonSummary(inventory([{networkBus:'A|B'},{networkBus:'A B'}]),partial);
eq(partialComparison.freezeFrameValueComparisonScope,'reported_ecus','partial comparison scope');
eq(partialComparison.freezeFrameValueComparableEcuIds,['7E8'],'ECU ID decoded');
eq(partialComparison.freezeFrameValueKeysChanged,false,'unresolved route excluded');
const raw={id:'raw_pid',value:'41 89 00',unit:'RAW',decoded:false,undecodedRaw:true,sourceEcu:'7E8',networkBus:'CAN'};
const rawSession=api.buildDiagnosticScanSession({freeze_frame_snapshot:{freezeFrameReadoutStatus:'reported',monitorValues:[raw]}});
const rawRestored=api.buildDiagnosticScanSessionFromJson(JSON.stringify(api.buildBridgeSessionExportPayload(rawSession)));
eq(rawRestored.freezeFrameSnapshot.monitorValues,JSON.parse(JSON.stringify(rawSession.freezeFrameSnapshot.monitorValues)),'RAW untouched in archive');
const legacyNamed={...legacy,freezeFrameValueKeys:['ff_custom|0|7E8|rpm|800']};
eq(api.buildImportedCoreReadoutInventoryComparisonSummary(legacyNamed,legacyNamed).freezeFrameValueComparisonAvailable,true,'legacy ff-prefixed item retained');
const large=inventory([{networkBus:'㍿'.repeat(100)}]);
eq(large.freezeFrameValueKeys,[],'expanded route exceeds key limit without crashing');
const sameModern=api.buildImportedCoreReadoutInventoryComparisonSummary(modern,modern);
for(const family of ['Value','Trigger','UdsRecord']) {
  eq(sameModern['freezeFrame'+family+'KeysChanged'],false,'identical modern inventory unchanged');
  eq(sameModern['freezeFrame'+family+'AddedKeys'],[],'identical modern inventory no additions');
}
console.log('FF inventory v2: '+checks+' checks passed; production and frozen legacy evidence; no vehicle I/O');
