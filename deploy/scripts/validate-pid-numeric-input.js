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
for (const [snapshotKey, schemaVersion, statusKey, coverageId] of [
  ["livePidSnapshot", "live_pid_snapshot_v1", "livePidReadoutStatus", "live_pid_snapshot"],
  ["freezeFrameSnapshot", "freeze_frame_snapshot_v1", "freezeFrameReadoutStatus", "freeze_frame_snapshot"]
]) {
  for (const value of [false, true, null, undefined, "", [], {}, "0x55", "0".repeat(161), NaN, Infinity]) {
    const snapshot = { schemaVersion, [statusKey]: "reported", monitorValues: [{ id: "coolant_temp", value, valueType: "number" }] };
    const before = JSON.stringify(snapshot);
    const session = obd.buildDiagnosticScanSession({ [snapshotKey]: snapshot });
    check(session[snapshotKey].monitorValues.length === 0, `${snapshotKey}: direct canonical input retained an invalid numeric value`);
    check(["unparsed", "blocked"].includes(session[snapshotKey][statusKey]), `${snapshotKey}: canonical input bypassed numeric rejection`);
    check(session[snapshotKey].errorCodes.includes("invalid_pid_numeric_value"), `${snapshotKey}: direct input lost numeric rejection evidence`);
    check(session.readoutCoverage.itemById[coverageId].available === false, `${snapshotKey}: direct invalid input completed coverage`);
    check(JSON.stringify(snapshot) === before, `${snapshotKey}: direct validation mutated the caller's snapshot`);
  }
  const validRow = { id: "coolant_temp", value: 0, valueType: "number", decoded: true, unit: "C", note: "retained", sourceEcu: "7E8", customEvidence: { quality: "measured" } };
  const customRow = { id: "manufacturer_custom_pid", value: 12, valueType: "number", manufacturerDefinition: "fixture-v1" };
  const validInput = { schemaVersion, [statusKey]: "reported", monitorValues: [validRow, customRow], customSnapshotMetadata: "retained" };
  const validSession = obd.buildDiagnosticScanSession({ [snapshotKey]: validInput });
  check(JSON.stringify(validSession[snapshotKey].monitorValues) === JSON.stringify(validInput.monitorValues), `${snapshotKey}: valid canonical rows or metadata changed`);
  check(validSession[snapshotKey].customSnapshotMetadata === "retained", `${snapshotKey}: canonical snapshot metadata changed`);
  const mixedInput = { ...validInput, monitorValues: [...validInput.monitorValues, { id: "engine_speed", value: false, valueType: "number" }] };
  const mixedSession = obd.buildDiagnosticScanSession({ [snapshotKey]: mixedInput });
  check(JSON.stringify(mixedSession[snapshotKey].monitorValues) === JSON.stringify(validInput.monitorValues), `${snapshotKey}: rejection removed or rewrote unrelated valid canonical data`);
  check(mixedSession[snapshotKey].customSnapshotMetadata === "retained", `${snapshotKey}: rejecting a value lost snapshot metadata`);
  for (const rawFlags of [{ valueType: "raw_hex" }, { value_type: "raw_hex" }, { decoded: false }, { undecodedRaw: true }, { undecoded_raw: true }, { is_decoded: false }, { isDecoded: "no" }, { isUndecodedRaw: "true" }, { is_undecoded_raw: 1 }]) {
    const rawRow = { id: "control_module_voltage", value: 0.1, ...rawFlags };
    const rawInput = { schemaVersion, [statusKey]: "reported", monitorValues: [{ id: "coolant_temp", value: false }, rawRow] };
    const rawSession = obd.buildDiagnosticScanSession({ [snapshotKey]: rawInput });
    const rawResult = rawSession[snapshotKey];
    check(rawResult.monitorValues.length === 1 && rawResult.monitorValues[0].value === 0.1, `${snapshotKey}: RAW row was removed or rewritten`);
    check(rawResult.monitorInsights.length === 0, `${snapshotKey}: RAW numeric payload became diagnostic guidance`);
    check(rawResult.monitorValueSummary.numericCount === 0 && rawResult.monitorValueSummary.decodedCount === 0 && rawResult.monitorValueSummary.undecodedRawCount === 1, `${snapshotKey}: regenerated counts classified RAW aliases as measurements`);
    check(rawSession.monitorValueSummary.numericCount === 0 && rawSession.monitorValueSummary.decodedCount === 0 && rawSession.monitorValueSummary.undecodedRawCount === 1, `${snapshotKey}: whole-session summary restored RAW numeric counts`);
    if (rawFlags.is_decoded === false) {
      const imported = obd.buildDiagnosticScanSessionFromJson(JSON.stringify(obd.buildBridgeSessionExportPayload(rawSession)));
      check(imported.monitorValueSummary.numericCount === 0 && imported.monitorValueSummary.undecodedRawCount === 1, `${snapshotKey}: export restored RAW numeric counts`);
      const otherKey = snapshotKey === "livePidSnapshot" ? "freezeFrameSnapshot" : "livePidSnapshot";
      const otherSchema = snapshotKey === "livePidSnapshot" ? "freeze_frame_snapshot_v1" : "live_pid_snapshot_v1";
      const paired = obd.buildDiagnosticScanSession({ [snapshotKey]: rawInput, [otherKey]: { schemaVersion: otherSchema, monitorValues: [{ id: "engine_speed", value: 850 }], monitorValueSummary: { totalCount: 7, numericCount: 7, decodedCount: 7 } } });
      check(paired.monitorValueSummary.numericCount === 7 && paired.monitorValueSummary.totalCount === 8 && paired.monitorValueSummary.undecodedRawCount === 1, `${snapshotKey}: repaired summary rewrote a clean snapshot's explicit counts`);
    }
  }
  const childKeys = snapshotKey === "livePidSnapshot" ? ["livePidEcuSnapshots", "live_pid_ecu_snapshots"] : ["freezeFrameEcuSnapshots", "freeze_frame_ecu_snapshots"];
  for (const childKey of childKeys) {
    const failedRow = { id: "engine_speed", value: 850, valueType: "number", sourceEcu: "7E8" };
    const goodRow = { id: "vehicle_speed", value: 0, valueType: "number", sourceEcu: "7E9", customEvidence: "retained" };
    const childInput = { schemaVersion, [statusKey]: "reported", monitorValues: [failedRow, goodRow],
      [childKey]: [
        { sourceEcu: "7E8", [statusKey]: "reported", monitorValues: [failedRow, { id: "coolant_temp", value: false }], childMetadata: "retained" },
        { sourceEcu: "7E9", [statusKey]: "reported", monitorValues: [goodRow] }
      ] };
    const session = obd.buildDiagnosticScanSession({ [snapshotKey]: childInput });
    const result = session[snapshotKey];
    check(result.monitorValues.length === 1 && result.monitorValues[0].id === "vehicle_speed", `${snapshotKey}: invalid child leaked ECU values into the aggregate`);
    check(result[childKeys[0]][0].monitorValues.length === 1 && result[childKeys[0]][0].childMetadata === "retained", `${snapshotKey}: child validation lost valid evidence or metadata`);
    check(result[childKeys[0]][0][statusKey] === "unparsed", `${snapshotKey}: invalid child remained reported`);
    check(result.monitorValueSummary.totalCount === 1 && session.readoutCoverage.itemById[coverageId].available === false, `${snapshotKey}: child validation left stale counts or coverage`);
    const inherited = { ...childInput, sourceEcu: "7E9", monitorValues: [{ id: "engine_speed", value: 950, customEvidence: "parent" }], values: [failedRow, goodRow] };
    const inheritedResult = obd.buildDiagnosticScanSession({ [snapshotKey]: inherited })[snapshotKey];
    check(inheritedResult.monitorValues[0]?.value === 950 && inheritedResult.monitorValues[0]?.customEvidence === "parent", `${snapshotKey}: parent ECU inheritance substituted a child measurement`);
    check(inheritedResult.values.length === 1 && inheritedResult.values[0].sourceEcu === "7E9", `${snapshotKey}: failed ECU evidence survived in a retained alias`);
    const aliasChild = { ...childInput, monitorValues: [], [childKey]: [childInput[childKey][0], { ecu_id: "7E9", [statusKey]: "reported", monitorValues: [{ id: "engine_speed", value: 900 }] }] };
    const aliasChildResult = obd.buildDiagnosticScanSession({ [snapshotKey]: aliasChild })[snapshotKey];
    check(aliasChildResult.monitorValues.length === 1 && aliasChildResult.monitorValues[0].value === 900, `${snapshotKey}: healthy ecu_id child was excluded`);
    const snakeStatus = statusKey === "livePidReadoutStatus" ? "live_pid_readout_status" : "freeze_frame_readout_status";
    for (const failure of [{ [statusKey]: "blocked" }, { [snakeStatus]: "blocked" }, { readoutStatus: "blocked" }, { readout_status: "blocked" }, { ok: false }, { error_codes: ["fixture_failure"] }, { would_transmit: true }]) {
      const blocked = Object.values(failure).includes("blocked") || failure.would_transmit === true;
      const sharedAddress = { schemaVersion, ok: false, monitorValues: [{ id: "coolant_temp", value: false }], [childKey]: [
        { sourceEcu: "7E9", ...failure, monitorValues: [{ id: "engine_speed", value: 999 }] },
        { sourceEcu: "7E9", [statusKey]: "reported", monitorValues: [{ id: "vehicle_speed", value: 0 }] }
      ] };
      const shared = obd.buildDiagnosticScanSession({ [snapshotKey]: sharedAddress })[snapshotKey];
      const aggregate = shared[snapshotKey === "livePidSnapshot" ? "livePidEcuAggregateSummary" : "freezeFrameEcuAggregateSummary"];
      check(shared.monitorValues.length === 1 && shared.monitorValues[0].id === "vehicle_speed", `${snapshotKey}: same-address healthy child authorized failed evidence`);
      check(shared[statusKey] === (blocked ? "blocked" : "unparsed"), `${snapshotKey}: parent failure downgraded the effective child status`);
      check(aggregate.ecuCount === 2 && aggregate.reportedEcuCount === 1 && aggregate[blocked ? "blockedEcuCount" : "unparsedEcuCount"] === 1, `${snapshotKey}: aggregate counts disagree with per-child failure evidence`);
    }
    const customOnlyRow = { ...customRow, sourceEcu: "7E9" };
    const customOnly = obd.buildDiagnosticScanSession({ [snapshotKey]: { schemaVersion, [statusKey]: "reported", monitorValues: [{ id: "coolant_temp", value: false }, customOnlyRow], [childKey]: [{ sourceEcu: "7E9", [statusKey]: "reported", monitorValues: [customOnlyRow] }] } })[snapshotKey];
    const customAggregate = customOnly[snapshotKey === "livePidSnapshot" ? "livePidEcuAggregateSummary" : "freezeFrameEcuAggregateSummary"];
    check(customOnly.monitorValues.length === 1 && customOnly.monitorValues[0].manufacturerDefinition === "fixture-v1", `${snapshotKey}: reported custom-only child evidence was discarded`);
    check(customAggregate.reportedEcuCount === 1 && customAggregate.blockedEcuCount === 0 && customAggregate.allReported === true && customOnly[statusKey] === "unparsed", `${snapshotKey}: parent rejection was invented as a custom child failure`);
    if (snapshotKey === "freezeFrameSnapshot") {
      const entry = { code: "P0300", frameNumber: 0, sourceEcu: "7E9", customEvidence: "trigger" };
      inherited[childKey][1] = { ...inherited[childKey][1], triggerDtcEntries: [entry] };
      const ff = obd.buildDiagnosticScanSession({ [snapshotKey]: inherited })[snapshotKey];
      check(ff.triggerDtcEntries[0]?.customEvidence === "trigger", "FF aggregation dropped eligible original trigger metadata");
      const scopedInput = { schemaVersion, [statusKey]: "reported", monitorValues: [], expectedItems: [{ monitorId: "engine_speed", pid: "0C" }],
        [childKey]: [childInput[childKey][0], ...["7E9", "7EA"].map((sourceEcu, index) => ({ sourceEcu, [statusKey]: "reported",
          monitorValues: [{ id: "engine_speed", value: 900 + index, freezeFrameNumber: 0, customEvidence: sourceEcu }],
          triggerDtcEntries: [{ code: index ? "P0400" : "P0300", frameNumber: 0, customEvidence: sourceEcu }] }))] };
      const scoped = obd.buildDiagnosticScanSession({ [snapshotKey]: scopedInput })[snapshotKey];
      check(scoped.freezeFrameAssociationSummary.groups.length === 2 && scoped.freezeFrameAssociationSummary.matchedGroupCount === 2, "FF inherited child scope collapsed independent frame associations");
      check(JSON.stringify(scoped.expectedItems[0].capturedEcuIds) === JSON.stringify(["7E9", "7EA"]), "FF expected-item ECU list lost inherited child scope");
      check(scoped.monitorValues[0].customEvidence === "7E9" && scoped.triggerDtcEntries[1].customEvidence === "7EA", "FF scoped summary discarded original metadata");
      const localTrigger = { code: "P0500", frameNumber: 1, sourceEcu: "7E9", customEvidence: "local" };
      const union = obd.buildDiagnosticScanSession({ [snapshotKey]: { ...scopedInput, triggerDtcEntries: [localTrigger, localTrigger] } })[snapshotKey];
      check(union.triggerDtcEntries.length === 3 && union.triggerDtcEntries.some((item) => item.code === "P0500") && union.triggerDtcEntries.some((item) => item.code === "P0300") && union.triggerDtcEntries.some((item) => item.code === "P0400"), "FF local triggers replaced child triggers or retained duplicates");
    }
  }
  const aliasInput = { schemaVersion, [statusKey]: "reported", monitorValues: [], values: [{ id: "coolant_temp", value: false }], monitorValueSummary: { totalCount: 99 } };
  const aliasSession = obd.buildDiagnosticScanSession({ [snapshotKey]: aliasInput });
  check(aliasSession[snapshotKey].values?.length === 0 && aliasSession[snapshotKey].monitorValueSummary.totalCount === 0, `${snapshotKey}: rejected alternate rows or stale counts survived`);
  const roundTrip = obd.buildDiagnosticScanSessionFromJson(JSON.stringify(obd.buildBridgeSessionExportPayload(aliasSession)));
  check(roundTrip[snapshotKey].monitorValues.length === 0 && roundTrip[snapshotKey].errorCodes.includes("invalid_pid_numeric_value"), `${snapshotKey}: empty canonical rejection was revived by export`);
  if (snapshotKey === "freezeFrameSnapshot") {
    const ff = obd.buildDiagnosticScanSession({ freezeFrameSnapshot: { schemaVersion, monitorValues: [{ id: "coolant_temp", value: false }, { id: "engine_speed", value: 850 }], values: [{ id: "coolant_temp", value: 90 }], expectedItems: [{ monitorId: "coolant_temp", pid: "05" }, { monitorId: "engine_speed", pid: "0C" }] } }).freezeFrameSnapshot;
    check(ff.expectedItems.find((item) => item.monitorId === "coolant_temp")?.captured === false && ff.expectedItems.find((item) => item.monitorId === "engine_speed")?.captured === true, "FF expected-item flags describe an alternate rather than the retained collection");
  }
}
for (const build of [obd.buildBridgeSessionSummary, (input) => {
  const exported = obd.buildBridgeSessionExportPayload({ bridgeSession: { schemaVersion: "bridge_session_summary_v1", ...input } }).session;
  return { monitorValues: exported.monitor_values, monitorValueSummary: exported.monitor_value_summary, monitorInsights: exported.monitor_insights, livePidSnapshot: exported.live_pid_snapshot };
}]) {
  const input = { monitorValues: [{ id: "engine_speed", value: false }], monitorValueSummary: { totalCount: 99 }, monitorInsights: [{ title: "stale-invalid-guidance" }] };
  const summary = build(input);
  check(summary.monitorValues.length === 0 && summary.monitorValueSummary.totalCount === 0, "Direct monitor override revived invalid PID rows or counts");
  check(!summary.monitorInsights.some((item) => item.title === "stale-invalid-guidance"), "Stale outer insights overrode repaired PID evidence");
  check(summary.livePidSnapshot.errorCodes.includes("invalid_pid_numeric_value"), "Direct override did not mark the effective snapshot unsuccessful");
  const rawSummary = build({ monitorValues: [...input.monitorValues, { id: "control_module_voltage", value: 0.1, valueType: "raw_hex", decoded: false }] });
  check(rawSummary.monitorValues.length === 1 && rawSummary.monitorValueSummary.undecodedRawCount === 1 && rawSummary.monitorValueSummary.numericCount === 0, "Direct override lost RAW evidence or classified it as a measurement");
  check(rawSummary.monitorInsights.length === 0, "Direct override generated guidance from RAW numeric evidence");
  const rawAliasSummary = build({ monitorValues: [...input.monitorValues, { id: "control_module_voltage", value: 0.1, is_decoded: false }] });
  check(rawAliasSummary.monitorValueSummary.numericCount === 0 && rawAliasSummary.monitorValueSummary.decodedCount === 0 && rawAliasSummary.monitorValueSummary.undecodedRawCount === 1 && rawAliasSummary.monitorInsights.length === 0, "Direct summary counts and insights disagree on RAW aliases");
  const cleanSnapshot = { monitorValues: [{ id: "engine_speed", value: 850 }], livePidReadoutStatus: "reported", monitorValueSummary: { totalCount: 1 } };
  const clean = build({ livePidSnapshot: cleanSnapshot, monitorValues: [...cleanSnapshot.monitorValues, { id: "vehicle_speed", value: 0 }] });
  check(clean.livePidSnapshot.monitorValues.length === 1 && clean.monitorValues.length === 2, "Clean direct rows rewrote the canonical snapshot rather than only the summary");
}
console.log(`PID numeric input checks: ${checks} / Errors: 0`);
