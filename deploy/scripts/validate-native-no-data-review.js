// Source-boundary review and synthetic envelopes -> production Web importer.
// Does not compile Swift, simulate CoreBluetooth, or execute the proposed Swift change.
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const connector = fs.readFileSync(new URL('../../native/ios/ELM327BLEConnector/Sources/ELM327BLEConnector/ELM327BLEConnector.swift', import.meta.url), 'utf8');
const commands = fs.readFileSync(new URL('../../native/ios/ELM327BLEConnector/Sources/ELM327BLEConnector/ELMReadCommand.swift', import.meta.url), 'utf8');
const factory = fs.readFileSync(new URL('../../native/ios/ELM327BLEConnector/Sources/ELM327BLEConnector/NativeConnectorEnvelope.swift', import.meta.url), 'utf8');
const host = fs.readFileSync(new URL('../../native/ios/VehicleDiagnosisELMHost/Sources/ReadoutCoordinatorViewModel.swift', import.meta.url), 'utf8');
const context = vm.createContext({ window: {} });
vm.runInContext(fs.readFileSync(new URL('../obd-readonly.js', import.meta.url), 'utf8'), context);
const obd = context.window.ObdReadOnly;
const base = JSON.parse(fs.readFileSync(new URL('./fixtures/native-elm327-readiness-envelope.json', import.meta.url), 'utf8'));
delete base.readout_scope_id;
base.adapter_transport = 'ble_gatt';
base.readout_attempt = 0;
let checks = 0;
function check(value, message) { assert.ok(value, message); checks++; }
check(connector.includes('case .storedDTC, .pendingDTC, .permanentDTC, .freezeFrameCapabilities, .onboardMonitor, .mode09SupportedInfoTypes:'), 'Review baseline changed');
check(connector.includes('if emitExpectedEmptyReadout(for: command, context: context) {') && connector.includes('emitFailure(for: command, error: "readout_not_available")'), 'Expected existing no-data failure path');
check(factory.includes('data["readout_id"] = .string(readoutID)') && factory.includes('ok: false, errors: [error]'), 'Failure envelope contract changed');
check(host.includes('guard envelope.ok, envelope.errors.isEmpty, !envelope.blocked, !envelope.wouldTransmit'), 'Host completion must exclude failed readouts');

const cases = [
  ...['stored', 'pending', 'permanent'].map(status => ({ name: status, intent: `read_${status}_dtc`, id: `${status}_dtc_snapshot`, slot: 'dtcSnapshot', statusKey: 'dtcReadoutStatus', data: { dtcs: [], source_ecu: null, dtc_readout_status: 'reported' } })),
  { name: 'freeze-frame', intent: 'read_freeze_frame', id: 'freeze_frame_snapshot', slot: 'freezeFrameSnapshot', statusKey: 'freezeFrameReadoutStatus', data: { trigger_dtc: null, trigger_dtc_entries: [], trigger_frame_number: 0, values: [], freeze_frame_readout_status: 'reported' } },
  { name: 'Mode06', intent: 'read_onboard_monitor', id: 'onboard_monitor_snapshot', slot: 'onboardMonitorSnapshot', statusKey: 'onboardMonitorReadoutStatus', data: { tests: [], onboard_monitor_readout_status: 'reported' } },
  { name: 'ECU-info', intent: 'read_ecu_info', id: 'ecu_info_snapshot', slot: 'ecuInfoSnapshot', statusKey: 'ecuInfoReadoutStatus', data: { items: [], ecu_info_readout_status: 'reported' } }
];
const wireCommands = [['storedDTC', '03'], ['pendingDTC', '07'], ['permanentDTC', '0A'], ['freezeFrameCapabilities', '0200'], ['onboardMonitor', '06'], ['mode09SupportedInfoTypes', '0900']];
for (const [command, wire] of wireCommands) check(commands.includes('case .' + command + ': return "' + wire + '"'), 'Native wire mapping changed: ' + command);
for (const test of cases) {
  for (const failed of [false, true]) {
    // Mirrors the existing factory's two shapes. These are NOT Swift-generated fixtures.
    const envelope = { ...base, intent: test.intent, readout_id: test.id, ok: !failed, errors: failed ? ['readout_not_available'] : [], data: { ...(failed ? { adapter_family: 'ELM327', readout_id: test.id } : test.data), vehicle_command_enabled: false } };
    const before = JSON.stringify(envelope);
    const imported = obd.buildNativeConnectorDiagnosticImport(envelope);
    check(imported.accepted && imported.session, `${test.name}: envelope import rejected`);
    const restored = obd.buildDiagnosticScanSessionFromJson(JSON.stringify(obd.buildBridgeSessionExportPayload(imported.session)));
    for (const session of [imported.session, restored]) {
      const snapshot = session[test.slot];
      check(snapshot && (failed ? snapshot[test.statusKey] !== 'reported' : snapshot[test.statusKey] === 'reported'), `${test.name}: wrong acquisition status`);
      if (test.slot === 'dtcSnapshot') check(failed ? !snapshot.dtcStatusSummary.reportedStatuses.includes(test.name) : snapshot.dtcStatusSummary.emptyStatuses.includes(test.name), `${test.name}: wrong DTC coverage`);
      if (failed) check(snapshot.errorCodes.includes('readout_not_available'), `${test.name}: missing failure reason`);
      check(session.vehicleCommandEnabled === false && session.wouldTransmit === false, `${test.name}: gained authority`);
    }
    check(JSON.stringify(envelope) === before, `${test.name}: input mutated`);
    console.log(`${test.name}: ${failed ? 'proposed failure shape' : 'current empty shape'} -> ${imported.session[test.slot][test.statusKey]}; archive retained`);
  }
}
console.log(`Native NO DATA review: ${checks} checks passed; source inspection and synthetic envelope import only; Swift/BLE not executed.`);
