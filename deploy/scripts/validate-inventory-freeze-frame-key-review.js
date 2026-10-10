import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
// Reproduce the existing defect for migration review. Not a production acceptance test.
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
      eq(both.freezeFrameValueKeys.length, 1, 'defect: two measured rows collapse to one inventory key');
      eq(both.freezeFrameTriggerKeys.length, 1, 'defect: two triggers collapse to one inventory key');
      eq(both.freezeFrameUdsRecordKeys.length, 2, 'defect: four UDS records collapse to two inventory keys');
      eq(both.freezeFrameValueReportedEcuScopeKeys.length, 1, 'defect: two ECU routes collapse');
      for (const family of ['Value','Trigger','UdsRecord']) {
        eq(comparison['freezeFrame'+family+'ComparisonAvailable'], true, 'defect: route collision accepted for comparison');
        eq(comparison['freezeFrame'+family+'KeysChanged'], false, 'defect: different route reported unchanged');
      }
      eq(JSON.stringify(input), saved, 'inspection must preserve original measurements');
      const session = api.buildDiagnosticScanSession({ freeze_frame_snapshot: { freezeFrameReadoutStatus: 'reported', monitorValues: input.monitorValues } });
      eq(session.freezeFrameSnapshot.monitorValues.length, 2, 'public import retains measured rows');
      eq(session.coreReadoutInventorySummary.freezeFrameValueCount, 1, 'public import reproduces collapsed inventory');
      const restored = api.buildDiagnosticScanSessionFromJson(JSON.stringify(api.buildBridgeSessionExportPayload(session)));
      eq(restored.freezeFrameSnapshot.monitorValues, JSON.parse(JSON.stringify(session.freezeFrameSnapshot.monitorValues)), 'archive retains original rows');
      eq(restored.vehicleCommandEnabled, false, 'no command permission');
      eq(restored.wouldTransmit, false, 'no vehicle transmission');
      evidence.push({ field, kind, left, right, valueKeys: both.freezeFrameValueKeys, triggerKeys: both.freezeFrameTriggerKeys, udsKeys: both.freezeFrameUdsRecordKeys });
    }
  }
}
const ordinary = api.buildImportedCoreReadoutInventoryComparisonSummary(inventory([{networkBus:'CAN'}]), inventory([{networkBus:'CAN'}]));
eq(ordinary.freezeFrameValueComparisonAvailable, true, 'ordinary baseline available');
eq(ordinary.freezeFrameValueKeysChanged, false, 'ordinary baseline unchanged');
eq(fs.readFileSync(file,'utf8'), source, 'runtime source remains unchanged');
console.log(JSON.stringify({ checks, cases: evidence.length, scope: 'Current production FF inventory collision reproduction only; no migration or vehicle I/O', example: evidence[0] }, null, 2));
