import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";


const sourceUrl = new URL("../obd-readonly.js", import.meta.url);
const definitionUrl = new URL("../data/obd-monitor-definitions.json", import.meta.url);
const source = fs.readFileSync(sourceUrl, "utf8");
const definitionText = fs.readFileSync(definitionUrl, "utf8");
const definitions = JSON.parse(definitionText);
function load(code, rows) {
  const context = vm.createContext({ window: {} });
  vm.runInContext(code, context);
  const obd = context.window.ObdReadOnly;
  obd.configureMonitorDefinitions(rows);
  return obd;
}
const intakeControlRawDefinitions = definitions.filter(row => ["intake_air_flow_pid6a_raw", "throttle_control_pid6c_raw"].includes(row.id));
assert.equal(intakeControlRawDefinitions.length, 2);
const current = load(source, definitions.filter(row => !intakeControlRawDefinitions.includes(row)));
const proposed = load(source, definitions);
let checks = 0;
const check = (condition, message) => { assert.ok(condition, message); checks++; };
for (const definition of intakeControlRawDefinitions) {
  const { pid, id } = definition;
  const legacyId = definitions.find(row => row.pid === pid).id;
  const example = `41 ${pid} 0F 80 41 0D 28`;
  const old = proposed.decodeLivePidResponse({ raw: example }).monitorValues;
  check(old.length === 1 && old[0].id === id && old[0].decoded === false, "Support byte became numeric evidence");
  check(!old.some(row => row.id === "vehicle_speed"), "False speed invented");
  for (const [mode, header, decoder, status] of [
    ["live", "41", proposed.decodeLivePidResponse, "livePidReadoutStatus"],
    ["FF", "42", proposed.decodeFreezeFrameResponse, "freezeFrameReadoutStatus"]
  ]) {
    for (let support = 0; support < 256; support++) {
      const bytes = mode === "live" ? [support, 0x80, 0x41, 0x0D, 0x28] : [support, 0x42, 0x0D, 2, 0x28];
      const payload = bytes.map(byte => byte.toString(16).toUpperCase().padStart(2, "0")).join(" ");
      const frame = mode === "FF" ? "02 " : "";
      const result = decoder({ raw: `${header} ${pid} ${frame}${payload} ${header} 0D ${frame}00`, source_ecu: "7E8" });
      const row = result.monitorValues.find(item => item.id === id);
      check(result.monitorValues.length === 2 && row?.value === payload && row.decoded === false && row.unit === "", "Complete RAW or evidence classification lost");
      check(row.sourceEcu === "7E8" && (mode !== "FF" || row.freezeFrameNumber === 2), "ECU/frame identity lost");
      check(result.monitorValues.find(item => item.id === "vehicle_speed")?.value === 0, "Following real speed lost or false speed invented");
      check(result[status] === "reported" && result.monitorValueSummary.undecodedRawCount === 1, "RAW status/count wrong");
    }
    for (let size = 0; size < 5; size++) {
      const result = decoder({ raw: `${header} ${pid} ${mode === "FF" ? "02 " : ""}${Array(size).fill("80").join(" ")}` });
      check(result.monitorValues.length === 0 && result[status] === "unparsed", "Truncated response accepted");
    }
  }
  const session = proposed.buildDecodedObdScanSession({ live_pid_response: { raw: example, source_ecu: "7E8" }, freeze_frame_response: { raw: `42 ${pid} 02 0F 80 41 0D 28`, source_ecu: "7E9" } });
  const archive = JSON.stringify(proposed.buildBridgeSessionExportPayload(session));
  for (const reader of [proposed, current]) {
    const restored = reader.buildDiagnosticScanSessionFromJson(archive);
    for (const key of ["livePidSnapshot", "freezeFrameSnapshot"]) {
      const rows = restored[key].monitorValues;
      check(rows.length === 1 && rows[0].value === "0F 80 41 0D 28" && rows[0].decoded === false, "Archive lost RAW or became numeric");
      check(rows[0].id === (reader === proposed ? id : legacyId), "Archive identity/fallback changed; review compatibility");
    }
    check(restored.vehicleCommandEnabled === false && restored.wouldTransmit === false, "Archive gained transmission authority");
  }
  for (const value of [0, 50.196, 100]) {
    const legacy = current.buildDiagnosticScanSession({ livePidSnapshot: current.normalizeBridgeLivePidSnapshot({ values: [{ id: legacyId, pid, value }] }) });
    const restored = proposed.buildDiagnosticScanSessionFromJson(JSON.stringify(current.buildBridgeSessionExportPayload(legacy)));
    check(restored.livePidSnapshot.monitorValues[0]?.value === value && restored.livePidSnapshot.monitorValues[0]?.id === legacyId, "Legacy numeric archive reinterpreted");
    const external = proposed.normalizeBridgeLivePidSnapshot({ values: [{ pid, value }] });
    check(external.monitorValues[0]?.id === legacyId && external.monitorValues[0]?.value === value, "PID-only numeric input reinterpreted");
  }
  for (const raw of [example, "0F 80 41 0D 28"]) {
    const rows = proposed.analyzeScannerText(`Mode 01 PID ${pid}: ${raw}`).monitorValues;
    check(rows.length === 1 && rows[0].id === id && rows[0].value === "0F 80 41 0D 28" && rows[0].decoded === false, "Text import lost RAW");
  }
}
check(fs.readFileSync(sourceUrl, "utf8") === source && fs.readFileSync(definitionUrl, "utf8") === definitionText, "Proposal changed production files");

console.log(`Intake control RAW regression: ${checks} checks passed; production RAW decoding and legacy dictionary compatibility`);

const app = fs.readFileSync(new URL("../script.js", import.meta.url), "utf8");
const noteContext = vm.createContext({});
vm.runInContext(app.match(/function formatObdLegacyControlReviewNote\([^)]*\) \{[\s\S]*?\r?\n\}/)[0], noteContext);
for (const [id, pid] of [["commanded_diesel_intake_air_flow", "6A"], ["commanded_throttle_control", "6C"]]) {
  for (const value of [0, 50.196, 100]) check(noteContext.formatObdLegacyControlReviewNote(Object.freeze({ id, value })).includes("旧PID" + pid + "数値"), "Missing legacy review note");
  check(noteContext.formatObdLegacyControlReviewNote({ id, value: 0, decoded: false }) === "", "RAW marked numeric");
}
console.log("Intake control review notes: 8 checks passed");
