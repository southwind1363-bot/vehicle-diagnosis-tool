import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { applyPid69RawProposal, pid69RawDefinition } from "./fixtures/pid69-raw-proposal.js";
const source = fs.readFileSync(new URL("../obd-readonly.js", import.meta.url), "utf8");
const definitions = JSON.parse(fs.readFileSync(new URL("../data/obd-monitor-definitions.json", import.meta.url), "utf8"));
function load(code, rows) {
  const context = vm.createContext({ window: {} }); vm.runInContext(code, context);
  const obd = context.window.ObdReadOnly; obd.configureMonitorDefinitions(rows); return obd;
}
const current = load(source, definitions);
const proposed = load(applyPid69RawProposal(source), [...definitions, pid69RawDefinition]);
let checks = 0;
const check = (condition, message) => { assert.ok(condition, message); checks++; };
const example = "41 69 3F 80 41 0D 28 00 80";
const old = current.decodeLivePidResponse({ raw: example });
check(old.monitorValues.some(row => row.id === "vehicle_speed" && row.value === 40), "Re-evaluate audit: current decoder no longer invents speed");
check(old.monitorValues.some(row => row.id === "commanded_egr_pid69" && row.value === 24.706), "Re-evaluate audit: support byte interpretation changed");
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
console.log(`PID69 RAW proposal: ${checks} checks passed; current misdecoding reproduced; isolated VM only`);
