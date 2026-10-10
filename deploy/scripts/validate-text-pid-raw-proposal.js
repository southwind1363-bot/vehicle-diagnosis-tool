import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

// Approved migration regression. Synthetic data only; production decoder, no transport.
const c = vm.createContext({ window: {} });
vm.runInContext(fs.readFileSync(new URL('../obd-readonly.js', import.meta.url), 'utf8'), c);
const obd = c.window.ObdReadOnly;
obd.configureMonitorDefinitions(JSON.parse(fs.readFileSync(new URL('../data/obd-monitor-definitions.json', import.meta.url), 'utf8')));
// Captured from the 3.13.651 decoder before migration; explicit text remains text.
const legacy = JSON.parse(fs.readFileSync(new URL('./fixtures/text-pid-legacy-3.13.651.json', import.meta.url), 'utf8'));
const old = obd.buildDiagnosticScanSessionFromJson(JSON.stringify(legacy));
const oldAgain = obd.buildDiagnosticScanSessionFromJson(JSON.stringify(obd.buildBridgeSessionExportPayload(old)));
let checks = 0;
const check = (value, message) => { assert.ok(value, message); checks++; };
for (const [pid, length] of [['65',2], ['66',5], ['7B',7], ['7D',1], ['7E',1], ['85',10], ['88',13], ['8B',7], ['91',5]]) {
  const bytes = Array(length).fill('28').join(' ');
  const input = { live_pid_response: { raw: `41 ${pid} ${bytes}`, source_ecu: '7E8' }, freeze_frame_response: { raw: `42 ${pid} 02 ${bytes}`, source_ecu: '7E8' } };
  const after = obd.buildDecodedObdScanSession(input);
  const restored = obd.buildDiagnosticScanSessionFromJson(JSON.stringify(obd.buildBridgeSessionExportPayload(after)));
  for (const [key, fixtureKey] of [['livePidSnapshot','live_pid_snapshot'], ['freezeFrameSnapshot','freeze_frame_snapshot']]) {
    const before = legacy[fixtureKey].monitor_values.find(row => row.pid === pid);
    for (const result of [after, restored]) {
      const row = result[key].monitorValues[0];
      check(result[key].monitorValues.length === 1 && row.value === bytes && row.id === before.id, `${pid}: identity/value`);
      check(row.decoded === false && row.valueType === 'raw_hex', `${pid}: RAW classification`);
      check(result[key].monitorValueSummary.undecodedRawCount === 1 && result[key].monitorValueSummary.decodedCount === 0, `${pid}: counts`);
      check(row.sourceEcu === before.sourceEcu && row.freezeFrameNumber === before.freezeFrameNumber, `${pid}: provenance`);
    }
    for (const result of [old, oldAgain]) {
      const kept = result[key].monitorValues.find(row => row.pid === pid);
      check(kept.value === before.value && kept.id === before.id && kept.valueType === 'text' && kept.decoded === true, `${pid}: old text archive changed`);
      check(result[key].monitorValueSummary.decodedCount === 9 && result[key].monitorValueSummary.undecodedRawCount === 0, `${pid}: old counts`);
    }
  }
  check(after.vehicleCommandEnabled === false && after.wouldTransmit === false, `${pid}: transmission`);
}
console.log(`Text PID RAW regression: ${checks} checks passed; production RAW classification and legacy text preservation`);
