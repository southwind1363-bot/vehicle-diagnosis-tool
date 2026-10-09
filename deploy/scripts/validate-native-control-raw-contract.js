// Proposed native envelope -> real Web importer only. Does not execute Swift or BLE.
import fs from "node:fs";
import vm from "node:vm";
import assert from "node:assert/strict";
const root = new URL("../", import.meta.url);
const source = fs.readFileSync(new URL("obd-readonly.js", root), "utf8");
const definitions = JSON.parse(fs.readFileSync(new URL("data/obd-monitor-definitions.json", root), "utf8"));
const base = JSON.parse(fs.readFileSync(new URL("fixtures/native-elm327-live-pid-envelope.json", import.meta.url), "utf8"));
const context = vm.createContext({ window: {} });
vm.runInContext(source, context);
const obd = context.window.ObdReadOnly;
obd.configureMonitorDefinitions(definitions);
let checks = 0;
const check = (ok, message) => { assert.ok(ok, message); checks++; };
for (const [pid, id, length, legacyId] of [
  ["69", "egr_system_pid69_raw", 7, "commanded_egr_pid69"],
  ["6A", "intake_air_flow_pid6a_raw", 5, "commanded_diesel_intake_air_flow"],
  ["6C", "throttle_control_pid6c_raw", 5, "commanded_throttle_control"]
]) {
  for (const ecu of ["7E8", "7E9"]) {
    for (const support of [0, 15, 63, 255]) {
      const raw = [support, 0x41, 0x0D, 0, 0x42, 0, 0x80].slice(0, length).map(x => x.toString(16).toUpperCase().padStart(2, "0")).join(" ");
      const envelope = structuredClone(base);
      envelope.readout_scope_id = ecu;
      envelope.data.monitor_values = [{ id, pid, value: raw, unit: "", decoded: false, source_ecu: ecu }];
      const before = JSON.stringify(envelope);
      const result = obd.buildNativeConnectorDiagnosticImport(envelope);
      check(result.accepted && result.session.livePidSnapshot.monitorValues.length === 1, "Native RAW proposal rejected");
      const row = result.session.livePidSnapshot.monitorValues[0];
      check(row.id === id && row.value === raw && row.unit === "" && row.decoded === false && row.sourceEcu === ecu, "Native RAW identity/evidence lost");
      check(result.session.livePidSnapshot.monitorValueSummary.undecodedRawCount === 1, "Native RAW treated as decoded");
      const restored = obd.buildDiagnosticScanSessionFromJson(JSON.stringify(obd.buildBridgeSessionExportPayload(result.session)));
      check(restored.livePidSnapshot.monitorValues[0].decoded === false && restored.livePidSnapshot.monitorValues[0].value === raw, "RAW lost on export/reimport");
      check(result.vehicleCommandEnabled === false && result.wouldTransmit === false, "Proposal gained vehicle authority");
      check(JSON.stringify(envelope) === before, "Input envelope mutated");
    }
  }
  const legacy = structuredClone(base);
  legacy.data.monitor_values = [{ id: legacyId, pid, value: 0, unit: "%", source_ecu: "7E8" }];
  const imported = obd.buildNativeConnectorDiagnosticImport(legacy);
  check(imported.session.livePidSnapshot.monitorValues[0].id === legacyId && imported.session.livePidSnapshot.monitorValues[0].value === 0, "Legacy zero reinterpreted");
}
check(fs.readFileSync(new URL("obd-readonly.js", root), "utf8") === source, "Production source changed");
console.log(`Native RAW contract proposal: ${checks} checks passed; synthetic envelopes and Web importer only; Swift/CI/BLE not executed`);

if (process.argv[2]) {
  const generated = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
  assert.equal(generated.length, 6, "Swift must emit every PID/ECU pair");
  const pairs = new Set();
  for (const envelope of generated) {
    const result = obd.buildNativeConnectorDiagnosticImport(envelope);
    assert.equal(result.accepted, true);
    const row = result.session.livePidSnapshot.monitorValues[0];
    assert.equal(row.decoded, false);
    assert.equal(row.unit, "");
    const length = row.pid === "69" ? 7 : 5;
    assert.equal(row.value, Array(length).fill("80").join(" "));
    pairs.add(row.pid + ":" + row.sourceEcu);
    assert.equal(result.vehicleCommandEnabled, false);
    const restored = obd.buildDiagnosticScanSessionFromJson(JSON.stringify(obd.buildBridgeSessionExportPayload(result.session)));
    assert.equal(restored.livePidSnapshot.monitorValues[0].decoded, false);
  }
  assert.deepEqual([...pairs].sort(), ["69:7E8", "69:7E9", "6A:7E8", "6A:7E9", "6C:7E8", "6C:7E9"]);
  console.log("Swift-generated RAW envelopes: all six PID/ECU pairs imported and re-exported");
}
