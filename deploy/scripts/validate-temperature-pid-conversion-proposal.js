import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { proposeTemperatureConversion as convert, proposedTemperatureDefinitions as definitions } from "./fixtures/temperature-pid-conversion-proposal.js";
let checks = 0;
const check = (condition, message) => { assert.ok(condition, message); checks++; };
for (const [pid, count] of [["67", 2], ["68", 6]]) {
  const ids = definitions.filter((row) => row.pid === pid).map((row) => row.id);
  for (let mask = 0; mask < 256; mask++) {
    const payload = [mask, ...Array.from({ length: count }, (_, i) => 40 + i)];
    const before = JSON.stringify(payload);
    const result = convert(pid, payload);
    const reserved = mask >= (1 << count);
    const expected = reserved ? [] : ids.filter((_, i) => (mask & (1 << i)) !== 0);
    check(JSON.stringify(result.values.slice(1).map((row) => row.id)) === JSON.stringify(expected), "Support bits selected the wrong sensors");
    check(result.values.slice(1).every((row) => row.value === ids.indexOf(row.id)), "Sensor byte mapping changed");
    check(result.values[0].decoded === false && result.values[0].value.split(" ").length === count + 1, "RAW evidence lost");
    check(result.reason === (reserved ? "reserved_support_bits" : mask ? "conversion_proposed" : "no_supported_sensors"), "Unsupported/reserved state ambiguous");
    check(result.proposalOnly && !result.vehicleCommandEnabled && !result.wouldTransmit && JSON.stringify(payload) === before, "Proposal changed input or authority");
  }
  for (let index = 0; index < count; index++) for (let byte = 0; byte < 256; byte++) {
    const payload = [1 << index, ...Array(count).fill(0)]; payload[index + 1] = byte;
    const rows = convert(pid, payload).values;
    check(rows.length === 2 && rows[1].id === ids[index] && rows[1].value === byte - 40, "Temperature range or single-sensor mapping failed");
  }
  for (const payload of [null, {}, "03 28 28", [], Array(count).fill(0), Array(count + 2).fill(0), Array(count + 1),
    ...[undefined, null, "40", true, -1, 256, 1.5, NaN, Infinity].flatMap((bad) => Array.from({ length: count + 1 }, (_, index) => { const a = Array(count + 1).fill(0); a[index] = bad; return a; }))]) {
    const result = convert(pid, payload);
    check(result.reason === "invalid_payload" && result.values.length === 0, "Malformed input generated measurements");
  }
}
check(convert("05", [40]).reason === "unsupported_pid", "Unrelated PID accepted");

// Trial definitions live only in this isolated VM; the published dictionary is unchanged.
const context = vm.createContext({ window: {} });
vm.runInContext(fs.readFileSync(new URL("../obd-readonly.js", import.meta.url), "utf8"), context);
const obd = context.window.ObdReadOnly;
const current = JSON.parse(fs.readFileSync(new URL("../data/obd-monitor-definitions.json", import.meta.url), "utf8"));
obd.configureMonitorDefinitions([...current, ...definitions]);
const legacyContext = vm.createContext({ window: {} });
vm.runInContext(fs.readFileSync(new URL("../obd-readonly.js", import.meta.url), "utf8"), legacyContext);
const legacy = legacyContext.window.ObdReadOnly;
legacy.configureMonitorDefinitions(current);
for (const [pid, payload] of [["67", [3, 40, 125]], ["68", [63, 0, 40, 65, 66, 125, 255]]]) {
  const values = convert(pid, payload).values.map((row) => ({ ...row, source_ecu: "7E8" }));
  const session = obd.buildDiagnosticScanSession({
    livePidSnapshot: obd.normalizeBridgeLivePidSnapshot({ values }),
    freezeFrameSnapshot: obd.normalizeFreezeFrameSnapshot({ values: values.map((row) => ({ ...row, freeze_frame_number: 2 })) })
  });
  const restored = obd.buildDiagnosticScanSessionFromJson(JSON.stringify(obd.buildBridgeSessionExportPayload(session)));
  const legacyRead = legacy.buildDiagnosticScanSessionFromJson(JSON.stringify(obd.buildBridgeSessionExportPayload(session)));
  check(!legacyRead.livePidSnapshot.monitorValues.some((row) => row.id === values[1].id), "Re-evaluate proposal: old reader now recognizes the proposed IDs");
  // This documents a compatibility blocker, not acceptance of the legacy misinterpretation.
  check(legacyRead.livePidSnapshot.monitorValues.some((row) => row.id === values[0].id && row.decoded === true), "Re-evaluate proposal: old reader no longer relabels individual temperatures as the group");

  // Recommended route: persist only the original RAW row and derive a separate view.
  const rawSession = legacy.buildDiagnosticScanSession({ livePidSnapshot: legacy.normalizeBridgeLivePidSnapshot({ values: [values[0]] }) });
  const rawExport = JSON.stringify(legacy.buildBridgeSessionExportPayload(rawSession));
  const rawRestored = legacy.buildDiagnosticScanSessionFromJson(rawExport);
  const beforeView = JSON.stringify([rawSession, rawRestored]);
  const savedRow = rawRestored.livePidSnapshot.monitorValues[0];
  const view = convert(savedRow.pid, savedRow.value.split(" ").map((part) => Number.parseInt(part, 16)));
  check(view.values.length === values.length && view.values.slice(1).every((row, index) => row.value === values[index + 1].value), "RAW-only archive cannot regenerate the proposed view");
  check(rawRestored.livePidSnapshot.monitorValues.length === 1 && savedRow.decoded === false && savedRow.value === values[0].value, "Derived view rewrote the RAW-only archive");
  check(JSON.stringify([rawSession, rawRestored]) === beforeView, "Generating view changed the stored session");
  for (const result of [session, restored]) for (const key of ["livePidSnapshot", "freezeFrameSnapshot"]) {
    const rows = result[key].monitorValues;
    check(rows.length === values.length, "Session collapsed distinct sensor IDs");
    for (const expected of values) {
      const actual = rows.find((row) => row.id === expected.id);
      check(actual?.value === expected.value && actual.decoded === expected.decoded && actual.sourceEcu === "7E8", "Roundtrip changed sensor identity/value");
      check(key !== "freezeFrameSnapshot" || actual.freezeFrameNumber === 2, "Roundtrip lost FF number");
    }
    check(result.vehicleCommandEnabled === false && result.wouldTransmit === false, "Session permitted transmission");
  }
}
for (const [id, pid] of [["engine_coolant_temp_sensors", "67"], ["intake_air_temp_sensors", "68"]]) {
  for (const row of [{ id, pid, value: 85 }, { id, pid, value: "03 28 7D", decoded: false }]) {
    const session = obd.buildDiagnosticScanSession({ livePidSnapshot: obd.normalizeBridgeLivePidSnapshot({ values: [row] }) });
    const restored = obd.buildDiagnosticScanSessionFromJson(JSON.stringify(obd.buildBridgeSessionExportPayload(session)));
    check(restored.livePidSnapshot.monitorValues.length === 1 && restored.livePidSnapshot.monitorValues[0].id === id && restored.livePidSnapshot.monitorValues[0].value === row.value, "Legacy group was reinterpreted or expanded");
  }
}
console.log(`Temperature conversion proposal: ${checks} checks passed; development only, production definitions and decoding unchanged`);
