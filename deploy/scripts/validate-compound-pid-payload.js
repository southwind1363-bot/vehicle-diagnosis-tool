import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

// Synthetic protocol bytes only: no transport, vehicle, or numeric conversion.
const context = vm.createContext({ window: {} });
vm.runInContext(fs.readFileSync(new URL("../obd-readonly.js", import.meta.url), "utf8"), context);
const obd = context.window.ObdReadOnly;
obd.configureMonitorDefinitions(JSON.parse(fs.readFileSync(new URL("../data/obd-monitor-definitions.json", import.meta.url), "utf8")));
let checks = 0;
const check = (condition, message) => { assert.ok(condition, message); checks += 1; };
const hex = (bytes) => bytes.map((byte) => byte.toString(16).toUpperCase().padStart(2, "0")).join(" ");

for (const [pid, id, length] of [["6B", "egr_temp", 5], ["6D", "fuel_pressure_control", 11], ["6E", "injection_pressure_control", 9], ["6F", "turbo_inlet_pressure", 3]]) {
  for (const [mode, header, decode, status] of [
    ["live", "41", obd.decodeLivePidResponse, "livePidReadoutStatus"],
    ["FF", "42", obd.decodeFreezeFrameResponse, "freezeFrameReadoutStatus"]
  ]) {
    const prefix = `${header} ${pid}${mode === "FF" ? " 02" : ""} `;
    for (let position = 0; position < length; position++) {
      for (const byte of [0x00, 0x41, 0x42, 0xFF]) {
        const payload = Array(length).fill(0x28);
        payload[0] = 0x0F;
        payload[position] = byte;
        const next = `${header} 0D${mode === "FF" ? " 02" : ""} 00`;
        const input = { raw: prefix + hex(payload) + " " + next, source_ecu: "7E8" };
        const before = JSON.stringify(input);
        const result = decode(input);
        const row = result.monitorValues.find((item) => item.id === id);
        check(result.monitorValues.length === 2, `${mode}/${pid}: payload invented or swallowed another PID`);
        check(row?.value === hex(payload) && row.decoded === false && row.valueType === "raw_hex", `${mode}/${pid}: RAW bytes changed or became a number`);
        check(row.sourceEcu === "7E8", `${mode}/${pid}: ECU lost`);
        check(mode !== "FF" || row.freezeFrameNumber === 2, `${mode}/${pid}: frame number lost`);
        check(result.monitorValues.find((item) => item.id === "vehicle_speed")?.value === 0, `${mode}/${pid}: following zero speed lost`);
        check(result[status] === "reported" && result.monitorValueSummary.undecodedRawCount === 1, `${mode}/${pid}: RAW status/count changed`);
        check(JSON.stringify(input) === before, `${mode}/${pid}: source mutated`);
      }
    }
    for (let size = 0; size < length; size++) {
      const result = decode({ raw: prefix + hex(Array(size).fill(0x28)) });
      check(result.monitorValues.length === 0 && result[status] === "unparsed", `${mode}/${pid}: truncated payload accepted`);
    }
  }
}

for (const [pid, payload] of [["6B", "0F 41 0D 28 42"], ["6D", "3F 41 0D 28 42 0D 02 28 41 42 00"], ["6E", "0F 41 0D 28 42 0D 02 28 00"], ["6F", "03 41 42"]]) {
  const session = obd.buildDecodedObdScanSession({
    live_pid_response: { raw: `41 ${pid} ${payload}`, source_ecu: "7E8" },
    freeze_frame_response: { raw: `42 ${pid} 02 ${payload}`, source_ecu: "7E8" }
  });
  const restored = obd.buildDiagnosticScanSessionFromJson(JSON.stringify(obd.buildBridgeSessionExportPayload(session)));
  for (const result of [session, restored]) {
    check(result?.livePidSnapshot?.monitorValues.length === 1 && result.livePidSnapshot.monitorValues[0].value === payload && result.livePidSnapshot.monitorValues[0].decoded === false, `Session/${pid}: live RAW changed`);
    const rows = result.freezeFrameSnapshot.monitorValues;
    check(rows.length === 1 && rows[0].value === payload && rows[0].decoded === false && rows[0].sourceEcu === "7E8" && rows[0].freezeFrameNumber === 2, `Session/${pid}: FF RAW/identity changed`);
    check(result.vehicleCommandEnabled === false && result.wouldTransmit === false, `Session/${pid}: transmission permitted`);
  }
  for (const includeHeader of [false, true]) {
    const live = obd.analyzeScannerText(`Mode 01 PID ${pid}: ${includeHeader ? `41 ${pid} ` : ""}${payload}`);
    check(live.monitorValues.length === 1 && live.monitorValues[0].value === payload && live.monitorValues[0].decoded === false, `Text/${pid}: live RAW import failed`);
    const freeze = obd.analyzeScannerText(`Mode 02 PID ${pid}: ${includeHeader ? `42 ${pid} ` : ""}02 ${payload}`);
    const rows = freeze.freezeFrameSnapshot?.monitorValues || [];
    check(rows.length === 1 && rows[0].value === payload && rows[0].decoded === false && rows[0].freezeFrameNumber === 2, `Text/${pid}: FF RAW import failed`);
    check(freeze.monitorValues.length === 0, `Text/${pid}: FF leaked into live values`);
  }
  for (const raw of [payload.split(" ").slice(0, -1).join(" "), payload + " 00"]) {
    check(obd.extractMonitorValues(`Mode 01 PID ${pid}: 41 ${pid} ${raw}`).length === 0, `Text/${pid}: invalid live length accepted`);
    check(!obd.analyzeScannerText(`Mode 02 PID ${pid}: 42 ${pid} 02 ${raw}`).freezeFrameSnapshot?.monitorValues?.length, `Text/${pid}: invalid FF length accepted`);
  }
}
console.log(`Compound PID payload validation: ${checks} checks passed`);
