import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const context = vm.createContext({ window: {} });
vm.runInContext(fs.readFileSync(new URL("../obd-readonly.js", import.meta.url), "utf8"), context);
const obd = context.window.ObdReadOnly;
obd.configureMonitorDefinitions(JSON.parse(fs.readFileSync(new URL("../data/obd-monitor-definitions.json", import.meta.url), "utf8")));
let checks = 0;
const check = (condition, message) => { assert.ok(condition, message); checks += 1; };
const routes = [
  ["live", (rows) => obd.normalizeBridgeLivePidSnapshot({ values: rows }), "livePidReadoutStatus"],
  ["bridge FF", (rows) => obd.normalizeBridgeFreezeFrameSnapshot({ values: rows }), "freezeFrameReadoutStatus"],
  ["core FF", (rows) => obd.normalizeFreezeFrameSnapshot({ values: rows, freeze_frame_readout_status: "reported" }), "freezeFrameReadoutStatus"]
];
const invalidValues = [undefined, null, "", "  ", true, false, [], [85], {}, { value: 85 }, NaN, Infinity, -Infinity,
  "0x55", "0b10", "0o10", "85 C", "85x", "1,000", "NaN", "Infinity", "1e309", "1e-999", "-1e-999",
  "0".repeat(161), new Number(85), new String("85")];
const validValues = [[0, 0], [-0, -0], [85, 85], [-40, -40], [12.75, 12.75], ["0", 0], [" -40 ", -40],
  ["+12.75", 12.75], [".5", 0.5], ["12.", 12], ["8.5e1", 85], ["1E-2", 0.01], ["00085", 85],
  ["0e-999", 0], ["-0e-999", -0], ["0".repeat(160), 0], ["5e-324", Number.MIN_VALUE]];
for (const [label, normalize, statusKey] of routes) {
  for (const value of invalidValues) {
    const input = [{ id: "coolant_temp", value }];
    const before = JSON.stringify(input);
    const snapshot = normalize(input);
    check(snapshot.monitorValues.length === 0, `${label}: invalid numeric input became a measured value: ${String(value)}`);
    check(snapshot[statusKey] === "unparsed", `${label}: invalid numeric input became a successful empty readout`);
    check(snapshot.errorCodes.includes("invalid_pid_numeric_value"), `${label}: exclusion was not disclosed`);
    check(JSON.stringify(input) === before, `${label}: normalization modified source rows`);
  }
  for (const [value, expected] of validValues) {
    const snapshot = normalize([{ id: "coolant_temp", value }]);
    check(snapshot.monitorValues.length === 1 && Object.is(snapshot.monitorValues[0].value, expected), `${label}: valid numeric input changed`);
    check(snapshot[statusKey] === "reported" && !snapshot.errorCodes.includes("invalid_pid_numeric_value"), `${label}: valid number was marked invalid`);
  }
  const mixed = normalize([{ id: "coolant_temp", value: false }, { id: "engine_speed", value: 850 }]);
  check(mixed.monitorValues.length === 1 && mixed.monitorValues[0].id === "engine_speed", `${label}: rejected value contaminated valid rows`);
  check(mixed[statusKey] === "unparsed", `${label}: partial invalid readout was marked complete`);
  const raw = normalize([{ id: "coolant_temp", value: "55", decoded: false }]);
  check(raw.monitorValues[0]?.value === "55" && raw.monitorValues[0]?.decoded === false, `${label}: RAW value was decoded or removed`);
  const empty = normalize([]);
  check(!empty.errorCodes.includes("invalid_pid_numeric_value"), `${label}: an empty response invented an invalid measurement`);
  const text = normalize([{ id: "fuel_type", value: "Gasoline" }]);
  check(text.monitorValues[0]?.value === "Gasoline", `${label}: text PID changed`);
  const boolean = normalize([{ id: "mil_status", value: true }]);
  check(boolean.monitorValues[0]?.value === true, `${label}: boolean PID changed`);
  const unknown = normalize([{ id: "unregistered_pid", value: false }]);
  check(!unknown.errorCodes.includes("invalid_pid_numeric_value"), `${label}: unknown PID was misclassified as invalid numeric input`);
}

for (const field of ["value", "result", "reading", "current_value", "currentValue", "display_value", "displayValue", "raw_value", "rawValue", "value_raw", "valueRaw"]) {
  check(obd.normalizeBridgeLivePidSnapshot({ values: [{ id: "coolant_temp", [field]: "85" }] }).monitorValues[0]?.value === 85, `${field}: valid alias lost`);
  check(obd.normalizeBridgeLivePidSnapshot({ values: [{ id: "coolant_temp", [field]: [] }] }).monitorValues.length === 0, `${field}: array alias became numeric`);
}
const prioritized = obd.normalizeBridgeLivePidSnapshot({ values: [{ id: "coolant_temp", value: false, result: 85 }] });
check(prioritized.monitorValues.length === 0, "Invalid primary numeric field silently fell back to a secondary value");
const nullFallback = obd.normalizeBridgeLivePidSnapshot({ values: [{ id: "coolant_temp", value: null, result: 85 }] });
check(nullFallback.monitorValues[0]?.value === 85, "Existing nullish alias precedence changed");
const missingEngine = obd.normalizeBridgeLivePidSnapshot({ values: [{ id: "engine_speed", value: null }, { id: "vehicle_speed", value: 0 }, { id: "control_module_voltage", value: false }] });
check(!missingEngine.monitorInsights.some((item) => ["キーON停止中の可能性", "電源電圧を優先確認"].includes(item.title)), "Invalid numeric input triggered diagnostic guidance");

for (const [label, normalize, snapshotKey, statusKey, ecuKey] of [
  ["live", obd.normalizeBridgeLivePidSnapshot, "livePidSnapshot", "livePidReadoutStatus", "live_pid_ecu_snapshots"],
  ["FF", obd.normalizeBridgeFreezeFrameSnapshot, "freezeFrameSnapshot", "freezeFrameReadoutStatus", "freeze_frame_ecu_snapshots"]
]) {
  const rows = [{ id: "coolant_temp", value: false }, { id: "engine_speed", value: 850 }];
  const scoped = normalize({ [ecuKey]: [
    { source_ecu: "7E8", values: rows, [statusKey]: "reported" },
    { source_ecu: "7E9", values: [{ id: "vehicle_speed", value: 0 }], [statusKey]: "reported" }
  ] });
  check(scoped[ecuKey][0][statusKey] === "unparsed", `${label}: invalid ECU was reported`);
  check(scoped[ecuKey][0].errorCodes.includes("invalid_pid_numeric_value"), `${label}: ECU error lost`);
  check(scoped.monitorValues.length === 1 && scoped.monitorValues[0].id === "vehicle_speed", `${label}: ECU evidence isolation changed`);
  check(scoped.errorCodes.includes("invalid_pid_numeric_value"), `${label}: scoped error was not aggregated`);
  const upstreamErrors = Array.from({ length: 12 }, (_, index) => `upstream_${index}`);
  for (const payload of [
    { values: rows, error_codes: upstreamErrors },
    { error_codes: upstreamErrors, [ecuKey]: [{ source_ecu: "7E8", values: rows, error_codes: upstreamErrors }] }
  ]) {
    const bounded = normalize(payload);
    check(bounded.errorCodes.length <= 12 && bounded.errorCodes.includes("invalid_pid_numeric_value"), `${label}: error limit dropped numeric failure`);
    check(JSON.stringify(bounded.errorCodes) === JSON.stringify(bounded.error_codes), `${label}: error aliases diverged`);
  }
  const nested = normalize({ values: [{ id: "engine_speed", value: 850 }], data: { values: [{ id: "coolant_temp", value: false }] } });
  check(nested.monitorValues.length === 0 && nested.errorCodes.includes("invalid_pid_numeric_value"), `${label}: invalid nested evidence fell back to outer values`);
  for (const flags of [{}, { error_codes: ["upstream_warning"] }, { blocked: true }, { would_transmit: true }, { ok: false }]) {
    const input = { values: rows, [statusKey]: "reported", ...flags };
    // The existing session builder conservatively marks FF errors as blocked.
    const expectedStatus = label === "FF" || flags.blocked || flags.would_transmit ? "blocked" : "unparsed";
    const session = obd.buildDiagnosticScanSessionFromJson(JSON.stringify({ [snapshotKey]: input }));
    check(session?.[snapshotKey]?.[statusKey] === expectedStatus, `${label}: stored reported status overrode invalid numeric evidence`);
    check(session[snapshotKey].errorCodes.includes("invalid_pid_numeric_value"), `${label}: JSON import lost numeric error with ${JSON.stringify(flags)}`);
    if (flags.error_codes) check(session[snapshotKey].errorCodes.includes("upstream_warning"), `${label}: upstream error lost`);
    const coverageId = label === "FF" ? "freeze_frame_snapshot" : "live_pid_snapshot";
    check(session.readoutCoverage.itemById[coverageId].available === false, `${label}: invalid readout became acquired coverage`);
    check(session.vehicleCommandEnabled === false && session.wouldTransmit === false, `${label}: import enabled vehicle I/O`);
    const roundTrip = obd.buildDiagnosticScanSessionFromJson(JSON.stringify(obd.buildBridgeSessionExportPayload(session)));
    check(roundTrip?.[snapshotKey]?.[statusKey] === expectedStatus, `${label}: JSON round trip changed failure status`);
    check(roundTrip[snapshotKey].errorCodes.includes("invalid_pid_numeric_value"), `${label}: JSON round trip lost numeric error`);
    check(!roundTrip[snapshotKey].monitorValues.some((row) => row.id === "coolant_temp"), `${label}: JSON round trip restored invalid value`);
  }
}

for (const [readout, snapshotKey, statusKey] of [
  ["Live Data", "livePidSnapshot", "livePidReadoutStatus"],
  ["Freeze Frame", "freezeFrameSnapshot", "freezeFrameReadoutStatus"]
]) {
  for (const value of ["0", "85", "-40", "12.75", "8.5e1", "0x55", "false", "85x", "1e-999"]) {
    const valid = ["0", "85", "-40", "12.75", "8.5e1"].includes(value);
    const session = obd.buildDiagnosticScanSessionFromCsv(`Readout,PID,Parameter,Value,Unit\n${readout},05,Coolant Temperature,${value},C`);
    const snapshot = session?.[snapshotKey];
    check(valid ? snapshot?.monitorValues[0]?.value === Number(value) : snapshot?.monitorValues.length === 0, `${readout}: CSV numeric value was coerced or lost`);
    check(valid ? snapshot?.[statusKey] === "reported" : ["unparsed", "blocked"].includes(snapshot?.[statusKey]), `${readout}: CSV status contradicts numeric evidence`);
    check(valid || snapshot?.errorCodes.includes("invalid_pid_numeric_value"), `${readout}: CSV error was not retained`);
  }
  check(obd.buildDiagnosticScanSessionFromCsv(`Readout,PID,Parameter,Value,Unit\n${readout},05,Coolant Temperature,,C`) === null, `${readout}: empty CSV cell became a measured zero`);
}
const timedCsv = obd.buildDiagnosticScanSessionFromCsv([
  "Readout,PID,Parameter,Value,Unit,Captured At,Observation Condition",
  "Live Data,05,Coolant Temperature,85,C,2026-08-29T10:00:00Z,warm",
  "Live Data,05,Coolant Temperature,0x55,C,2026-08-29T10:00:01Z,warm"
].join("\n"));
check(timedCsv.livePidSnapshot.livePidReadoutStatus === "unparsed" && timedCsv.livePidSnapshot.monitorValues.length === 0, "Invalid latest CSV sample was replaced with an older valid sample");
check(timedCsv.livePidTimeline.samples.length === 1 && timedCsv.livePidTimeline.samples[0].monitorValues[0].value === 85, "Invalid CSV sample entered the comparison timeline");
check(timedCsv.readoutCoverage.itemById.live_pid_snapshot.available === false, "Timestamped invalid PID became acquired coverage");
for (const [readout, snapshotKey, statusKey] of [
  ["Live Data", "livePidSnapshot", "livePidReadoutStatus"],
  ["Freeze Frame", "freezeFrameSnapshot", "freezeFrameReadoutStatus"]
]) {
  for (const reverse of [false, true]) {
    for (const timed of [false, true]) {
      const header = `Readout,PID,Value${timed ? ",Captured At" : ""}`;
      const tables = [
        `${header}\n${readout},05,0x55${timed ? ",2026-08-29T10:00:01Z" : ""}`,
        `${header}\n${readout},0C,850${timed ? ",2026-08-29T10:00:00Z" : ""}`
      ];
      const session = obd.buildDiagnosticScanSessionFromCsv((reverse ? tables.reverse() : tables).join("\n"));
      const snapshot = session?.[snapshotKey];
      check(["blocked", "unparsed"].includes(snapshot?.[statusKey]), `${readout}: multi-table CSV erased numeric failure`);
      check(snapshot?.errorCodes.includes("invalid_pid_numeric_value"), `${readout}: multi-table CSV lost numeric error`);
      check(!snapshot.monitorValues.some((row) => row.id === "coolant_temp"), `${readout}: multi-table CSV restored invalid value`);
      if (timed) check(snapshot.capturedAt === "2026-08-29T10:00:01Z" && snapshot.monitorValues.length === 0, `${readout}: older valid table replaced the latest rejected table`);
      const roundTrip = obd.buildDiagnosticScanSessionFromJson(JSON.stringify(obd.buildBridgeSessionExportPayload(session)));
      check(roundTrip[snapshotKey].errorCodes.includes("invalid_pid_numeric_value") && ["blocked", "unparsed"].includes(roundTrip[snapshotKey][statusKey]), `${readout}: multi-table JSON round trip restored reported status`);
    }
  }
  const allInvalid = obd.buildDiagnosticScanSessionFromCsv(`Readout,PID,Value\n${readout},05,false\nReadout,PID,Value\n${readout},0C,0x20`);
  check(allInvalid?.[snapshotKey]?.monitorValues.length === 0 && allInvalid[snapshotKey].errorCodes.includes("invalid_pid_numeric_value"), `${readout}: all-invalid CSV tables became missing evidence`);
}
const longCsvValues = ["0".repeat(160) + "85", "0".repeat(159) + "1e2", "0".repeat(160) + "bad",
  "0".repeat(161), "0." + "0".repeat(158) + "1", "0".repeat(160) + ',"invalid"'];
for (const [readout, snapshotKey, statusKey, coverageId] of [
  ["Live Data", "livePidSnapshot", "livePidReadoutStatus", "live_pid_snapshot"],
  ["Freeze Frame", "freezeFrameSnapshot", "freezeFrameReadoutStatus", "freeze_frame_snapshot"]
]) {
  for (const delimiter of [",", ";", "\t"]) {
    const encode = (cells) => cells.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(delimiter);
    const header = ["Readout", "PID", "Value", "Captured At"].join(delimiter);
    for (const value of longCsvValues) {
      const invalidTable = `${header}\n${encode([readout, "05", value, "2026-08-29T11:00:01Z"])}`;
      const session = obd.buildDiagnosticScanSessionFromCsv(invalidTable);
      const snapshot = session?.[snapshotKey];
      check(snapshot?.monitorValues.length === 0, `${readout}: long CSV cell became a truncated numeric measurement`);
      check(["unparsed", "blocked"].includes(snapshot[statusKey]) && snapshot.errorCodes.includes("invalid_pid_numeric_value"), `${readout}: long CSV cell did not retain rejection evidence`);
      check(session.readoutCoverage.itemById[coverageId].available === false, `${readout}: long CSV cell completed coverage`);
      const validTable = `${header}\n${encode([readout, "05", "85", "2026-08-29T11:00:00Z"])}`;
      const combined = obd.buildDiagnosticScanSessionFromCsv(`${validTable}\n${invalidTable}`);
      check(combined[snapshotKey].monitorValues.length === 0 && combined[snapshotKey].capturedAt === "2026-08-29T11:00:01Z", `${readout}: truncated or older CSV value became current`);
      const roundTrip = obd.buildDiagnosticScanSessionFromJson(JSON.stringify(obd.buildBridgeSessionExportPayload(combined)));
      check(roundTrip[snapshotKey].monitorValues.length === 0 && roundTrip[snapshotKey].errorCodes.includes("invalid_pid_numeric_value"), `${readout}: long CSV rejection was lost on JSON round trip`);
    }
    for (const value of ["0".repeat(160), "0".repeat(158) + "85", " -40 ", "1e2"]) {
      const session = obd.buildDiagnosticScanSessionFromCsv(`${header}\n${encode([readout, "05", value, "2026-08-29T11:00:00Z"])}`);
      check(session?.[snapshotKey]?.monitorValues[0]?.value === Number(value), `${readout}: valid full-length CSV number changed`);
    }
  }
  const textValue = "Gasoline ".repeat(30);
  const textSession = obd.buildDiagnosticScanSessionFromCsv(`Readout,Parameter,Value\n${readout},Fuel Type,${textValue}`);
  check(textSession?.[snapshotKey]?.monitorValues[0]?.value === textValue.trim().slice(0, 160), `${readout}: text PID display bound changed`);
  const privateSession = obd.buildDiagnosticScanSessionFromCsv(`Readout,Parameter,Value\n${readout},Fuel Type,VIN: JTDKB20U793123456`);
  check(privateSession !== null && !JSON.stringify(privateSession).includes("JTDKB20U793123456"), `${readout}: untruncated input leaked an identifier`);
}
console.log(`PID numeric input checks: ${checks} / Errors: 0`);
