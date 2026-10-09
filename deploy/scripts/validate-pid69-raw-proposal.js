import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
const pid69RawDefinition = { id: "egr_system_pid69_raw" };
const source = fs.readFileSync(new URL("../obd-readonly.js", import.meta.url), "utf8");
const definitions = JSON.parse(fs.readFileSync(new URL("../data/obd-monitor-definitions.json", import.meta.url), "utf8"));
function load(code, rows) {
  const context = vm.createContext({ window: {} }); vm.runInContext(code, context);
  const obd = context.window.ObdReadOnly; obd.configureMonitorDefinitions(rows); return obd;
}
const current = load(source, definitions.filter(row => row.id !== pid69RawDefinition.id));
const proposed = load(source, definitions);
let checks = 0;
const check = (condition, message) => { assert.ok(condition, message); checks++; };
const example = "41 69 3F 80 41 0D 28 00 80";
const old = proposed.decodeLivePidResponse({ raw: example });
check(old.monitorValues.length === 1 && old.monitorValues[0].id === pid69RawDefinition.id, "PID69 invented speed or EGR numbers");
check(old.monitorValues[0].decoded === false, "PID69 RAW was promoted to numeric evidence");
for (const [mode, header, decoder, status] of [
  ["live", "41", proposed.decodeLivePidResponse, "livePidReadoutStatus"],
  ["FF", "42", proposed.decodeFreezeFrameResponse, "freezeFrameReadoutStatus"]
]) {
  for (let support = 0; support < 256; support++) {
    const payload = [support, 0x80, 0x41, 0x0D, 0x28, 0x42, 0xFF].map(byte => byte.toString(16).toUpperCase().padStart(2, "0")).join(" ");
    const result = decoder({ raw: `${header} 69 ${mode === "FF" ? "02 " : ""}${payload} ${header} 0D ${mode === "FF" ? "02 " : ""}00`, source_ecu: "7E8" });
    const rows = result.monitorValues, row = rows.find(item => item.id === pid69RawDefinition.id);
    check(rows.length === 2 && row?.value === payload && row.decoded === false, "Payload lost or numeric EGR invented");
    check(row.sourceEcu === "7E8" && (mode !== "FF" || row.freezeFrameNumber === 2), "ECU/FF identity lost");
    check(rows.find(item => item.id === "vehicle_speed")?.value === 0, "Following actual PID lost");
    check(result[status] === "reported" && result.monitorValueSummary.undecodedRawCount === 1, "RAW evidence/count wrong");
  }
  for (let size = 0; size < 7; size++) {
    const result = decoder({ raw: `${header} 69 ${mode === "FF" ? "02 " : ""}${Array(size).fill("80").join(" ")}` });
    check(result.monitorValues.length === 0 && result[status] === "unparsed", "Truncated PID69 accepted");
  }
}
const session = proposed.buildDecodedObdScanSession({ live_pid_response: { raw: example, source_ecu: "7E8" }, freeze_frame_response: { raw: "42 69 02 3F 80 41 0D 28 00 80", source_ecu: "7E9" } });
const archive = JSON.stringify(proposed.buildBridgeSessionExportPayload(session));
for (const model of [proposed, current]) {
  const restored = model.buildDiagnosticScanSessionFromJson(archive);
  for (const key of ["livePidSnapshot", "freezeFrameSnapshot"]) {
    const rows = restored[key].monitorValues;
    check(rows.length === 1 && rows[0].value === "3F 80 41 0D 28 00 80" && rows[0].decoded === false, "New RAW archive became numeric or lost bytes");
    if (model === proposed) check(rows[0].id === pid69RawDefinition.id, "New reader lost RAW identity");
    else check(rows[0].id === "commanded_egr_pid69", "Re-evaluate compatibility: old reader fallback changed");
  }
  check(restored.vehicleCommandEnabled === false && restored.wouldTransmit === false, "Archive gained transmission authority");
}
const legacy = current.buildDiagnosticScanSession({ livePidSnapshot: current.normalizeBridgeLivePidSnapshot({ values: [{ id: "commanded_egr_pid69", pid: "69", value: 50.196 }, { id: "egr_error_pid69", pid: "69", value: 12.5 }] }) });
const restoredLegacy = proposed.buildDiagnosticScanSessionFromJson(JSON.stringify(current.buildBridgeSessionExportPayload(legacy)));
check(restoredLegacy.livePidSnapshot.monitorValues.length === 2 && restoredLegacy.livePidSnapshot.monitorValues[0].value === 50.196 && restoredLegacy.livePidSnapshot.monitorValues[1].value === 12.5, "Proposal silently rewrote legacy numeric records");
check(fs.readFileSync(new URL("../obd-readonly.js", import.meta.url), "utf8") === source, "On-disk production source changed");

for(const text of ['Mode 01 PID 69: 41 69 3F 80 41 0D 28 00 80','Mode 01 PID 69: 3F 80 41 0D 28 00 80']) {
 const rows=proposed.analyzeScannerText(text).monitorValues;
 check(rows.length===1 && rows[0].id===pid69RawDefinition.id && rows[0].decoded===false, 'Text import lost full RAW');
}
const external=proposed.normalizeBridgeLivePidSnapshot({values:[{pid:'69',value:50.196}]});
check(external.monitorValues[0]?.id==='commanded_egr_pid69' && external.monitorValues[0]?.value===50.196, 'PID-only external numeric import was reinterpreted');
const standard=proposed.decodeLivePidResponse({raw:'41 2C 80 41 2D 90'}).monitorValues;
check(standard.some(r=>r.id==='commanded_egr' && r.value===50.196) && standard.some(r=>r.id==='egr_error' && r.value===12.5), 'PID 2C/2D changed');
const app=fs.readFileSync(new URL('../script.js',import.meta.url),'utf8');
const noteContext=vm.createContext({});vm.runInContext(app.match(/function formatObdPid69ReviewNote\([^)]*\) \{[\s\S]*?\r?\n\}/)[0],noteContext);
for(const id of ['commanded_egr_pid69','egr_error_pid69']) for(const value of [0,12.5,-100]) {
 const row=Object.freeze({id,value});check(noteContext.formatObdPid69ReviewNote(row).includes('旧PID69数値'), 'Legacy numeric value lacks review note');
}
for(const row of [{id:'commanded_egr',value:20},{id:'egr_error_pid69',value:'12.5'},{id:'commanded_egr_pid69',value:20,decoded:false},{id:pid69RawDefinition.id,value:'3F 80 41 0D 28 00 80',decoded:false}]) check(noteContext.formatObdPid69ReviewNote(row)==='', 'Unrelated/RAW value labeled legacy numeric');
console.log(`PID69 RAW regression: ${checks} checks passed; production decoding and legacy dictionary compatibility`);
