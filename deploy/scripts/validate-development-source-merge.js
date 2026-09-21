import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const context = vm.createContext({ window: {}, navigator: {} });
vm.runInContext(fs.readFileSync(new URL("../obd-readonly.js", import.meta.url), "utf8"), context);
const obd = context.window.ObdReadOnly;
const development = "j2534_development_read";
let checks = 0;
const keys = [null, "dtcSnapshot", "dtc_snapshot", "livePidSnapshot", "live_pid_snapshot",
  "freezeFrameSnapshot", "freeze_frame_snapshot", "readinessSnapshot", "readiness_snapshot",
  "ecuInfoSnapshot", "ecu_info_snapshot", "supportedPidMatrix", "supported_pid_matrix",
  "onboardMonitorSnapshot", "onboard_monitor_snapshot"];
for (const key of keys) for (const sourceKey of ["source", "source_type"]) {
  const marker = { [sourceKey]: development };
  const input = key ? { [key]: marker } : marker;
  const before = JSON.stringify(input);
  let bridge = obd.buildBridgeDiagnosticImport(input);
  assert.equal(bridge.source, development);
  assert.equal(JSON.stringify(input), before);
  checks += 2;
  // Exercise aliases at import; the expensive full-session round trip needs
  // only the root, DTC, live and supported-PID representatives.
  if (sourceKey !== "source" || ![null, "dtcSnapshot", "livePidSnapshot", "supportedPidMatrix"].includes(key)) continue;
  for (const scannerText of ["P0300", "", "P0420"]) {
    const merged = obd.mergeDiagnosticInputs({ scannerText, bridgeImport: bridge });
    const session = obd.buildDiagnosticScanSession({ scan_session: merged });
    assert.equal(session.source, development);
    const payload = obd.buildBridgeSessionExportPayload(session);
    const restored = obd.buildDiagnosticScanSessionFromJson(JSON.stringify(payload));
    assert.equal(restored.source, development);
    // The existing screen/print warning predicate remains true after restore.
    assert.equal([restored.source, restored.source_type, restored.dtcSnapshot?.source,
      restored.dtcSnapshot?.source_type].includes(development), true);
    // Match the UI's explicit readout handoff, not a recursive re-import of
    // every derived comparison/analysis summary in the restored object.
    bridge = obd.buildBridgeDiagnosticImport({ source: restored.source,
      dtcSnapshot: restored.dtcSnapshot, livePidSnapshot: restored.livePidSnapshot,
      supportedPidMatrix: restored.supportedPidMatrix });
    assert.equal(bridge.source, development);
    checks += 4;
  }
}
for (const source of ["local_bridge", "web_serial", "scanner_text", undefined]) {
  const bridge = obd.buildBridgeDiagnosticImport({ source });
  assert.equal(bridge.source, "local_bridge");
  assert.equal(obd.mergeDiagnosticInputs({ scannerText: "P0300", bridgeImport: bridge }).source,
    "scanner_text_and_local_bridge");
  checks += 2;
}
console.log(`Development source merge checks: ${checks} / Errors: 0`);
