import assert from "node:assert/strict";
import { createDtcClearReadoutFixtureScope } from "./fixtures/dtc-clear-readout-scope.js";
import { createDtcClearFixtureReceiveWindow, createDtcClearDtcEvidencePairFixture } from "./fixtures/dtc-clear-scoped-before-readout.js";
let checks = 0;
const check = (value, message) => { assert.ok(value, message); checks += 1; };
const intents = ["read_stored_dtc", "read_pending_dtc", "read_permanent_dtc", "read_readiness"];
const services = [0x43, 0x47, 0x4A], commands = ["03", "07", "0A", "0101"];
const profile = "iso15765_11bit_normal_h1_caf1_d0_s1_e0";
const stamp = (second) => `2026-09-06T00:00:${String(second).padStart(2, "0")}.000Z`;
function frames(source, payload) {
  const line = (bytes) => `${source} ${[...bytes, ...Array(8 - bytes.length).fill(0xAA)].map((byte) => byte.toString(16).padStart(2, "0").toUpperCase()).join(" ")}\r`;
  if (payload.length <= 7) return line([payload.length, ...payload]);
  let text = line([0x10 | (payload.length >> 8), payload.length & 255, ...payload.slice(0, 6)]);
  for (let offset = 6, sequence = 1; offset < payload.length; offset += 7, sequence = (sequence + 1) & 15) {
    text += line([0x20 | sequence, ...payload.slice(offset, offset + 7)]);
  }
  return text;
}
const dtcFrames = (source, service, codes) => frames(source, [service, codes.length, ...codes.flatMap((code) => [code >> 8, code & 255])]);
function fixture(ids = ["7E8"]) {
  const connectionToken = {}, targetToken = {};
  const scope = createDtcClearReadoutFixtureScope({ provenance: "simulated", profile, connectionToken, targetToken,
    byIntent: intents.map((intent) => ({ intent, sourceIds: ids })) });
  const clear = createDtcClearFixtureReceiveWindow({ expectedSourceIds: ["7EA"], connectionToken });
  clear.append(clear.attemptToken, connectionToken, { sourceId: "7EA", payload: [0x44] });
  const readout = (start) => ({ provenance: "simulated", connectionToken, attemptToken: {}, startedAt: stamp(start), completedAt: stamp(start + 5),
    receipts: intents.map((intent, index) => ({ ordinal: index + 1, intent, command: commands[index], profile,
      startedAt: stamp(start + index), completedAt: stamp(start + index + 1), completion: "complete",
      transcript: ids.map((id) => index === 3 ? frames(id, [0x41, 1, 0x80, 7, 0xE1, 0]) : dtcFrames(id, services[index], [])).join("") + ">" })) });
  return { scope, context: { scopeToken: scope.scopeToken, connectionToken, targetToken }, beforeReadout: readout(1),
    clearStartedAt: stamp(7), clearCompletedAt: stamp(8), clearWindowSnapshot: clear.finish(clear.attemptToken, connectionToken, "complete").snapshot,
    postReadout: readout(9) };
}
const codeText = (code) => `P${code.toString(16).padStart(4, "0").toUpperCase()}`;
function verify(before, after, index) {
  const value = fixture();
  value.beforeReadout.receipts[index].transcript = dtcFrames("7E8", services[index], before) + ">";
  value.postReadout.receipts[index].transcript = dtcFrames("7E8", services[index], after) + ">";
  const created = createDtcClearDtcEvidencePairFixture(value);
  check(created.ok, "Valid set fixture rejected");
  const out = created.handle.inspectDifference(value.context).summary, row = out.differences[index].sources[0];
  assert.deepEqual(row, { sourceId: "7E8", added: after.filter((n) => !before.includes(n)).map(codeText).sort(),
    removed: before.filter((n) => !after.includes(n)).map(codeText).sort(), retained: before.filter((n) => after.includes(n)).map(codeText).sort() }); checks += 1;
  check(row.removed.length + row.retained.length === before.length && row.added.length + row.retained.length === after.length,
    "Difference violated set conservation");
  check(!out.comparisonAvailable && !out.clearSucceededInferred && !out.wouldTransmit, "Set difference became vehicle authority");
  created.handle.dispose();
}
// Exhaust all pairs of subsets of four distinct codes, with reversed input ordering.
const subset = (mask) => [1, 2, 3, 4].filter((_, index) => mask & (1 << index));
for (let before = 0; before < 16; before += 1) {
  for (let after = 0; after < 16; after += 1) verify(subset(before).reverse(), subset(after), (before + after) % 3);
}
const maximum = Array.from({ length: 255 }, (_, index) => index + 1);
for (let index = 0; index < 3; index += 1) {
  verify(maximum, [], index); verify([], maximum, index); verify(maximum, [...maximum].reverse(), index);
  verify(maximum, maximum.map((code) => code + 128).reverse(), index);
}
const ids = Array.from({ length: 32 }, (_, index) => (0x7E0 + index).toString(16).toUpperCase());
const many = fixture(ids);
for (let index = 0; index < 3; index += 1) {
  many.beforeReadout.receipts[index].transcript = ids.map((id) => dtcFrames(id, services[index], [1])).join("") + ">";
  many.postReadout.receipts[index].transcript = [...ids].reverse().map((id) => dtcFrames(id, services[index], [2])).join("") + ">";
}
const manyHandle = createDtcClearDtcEvidencePairFixture(many).handle;
for (const row of manyHandle.inspectDifference(many.context).summary.differences) {
  check(row.sources.length === 32 && row.sources.every((source, index) => source.sourceId === ids[index]
    && source.added.join() === "P0002" && source.removed.join() === "P0001" && source.retained.length === 0), "ECU order or capacity lost evidence");
}
manyHandle.dispose();
for (const side of ["beforeReadout", "postReadout"]) {
  for (let index = 0; index < 4; index += 1) {
    const value = fixture(["7E8", "7E9"]);
    value[side].receipts[index].transcript = index === 3 ? frames("7E8", [0x41, 1, 0x80, 7, 0xE1, 0]) + ">"
      : dtcFrames("7E8", services[index], [1]) + ">";
    check(createDtcClearDtcEvidencePairFixture(value).handle === null, "Missing ECU became added/removed evidence");
  }
}
// Two maximum-sized ISO-TP messages exceed the parser's existing CAN frame budget.
const overBudget = fixture(["7E8", "7E9"]);
overBudget.postReadout.receipts[0].transcript = ["7E8", "7E9"].map((id) => dtcFrames(id, 0x43, maximum)).join("") + ">";
check(createDtcClearDtcEvidencePairFixture(overBudget).handle === null, "Over-budget receipt yielded a partial difference");
// Untrusted frozen objects must be rejected within a bounded, stack-safe walk.
for (const shape of ["deep", "wide"]) {
  const value = fixture();
  let oversized = Object.freeze({});
  if (shape === "deep") {
    for (let index = 0; index < 5000; index += 1) oversized = Object.freeze({ child: oversized });
  } else oversized = Object.freeze(Object.fromEntries(Array.from({ length: 5000 }, (_, index) => [`field${index}`, index])));
  value.clearWindowSnapshot = Object.freeze({ ...value.clearWindowSnapshot, execution: oversized });
  assert.throws(() => createDtcClearDtcEvidencePairFixture(value),
    (error) => error instanceof TypeError && error.message === "pair_clear_snapshot_budget_exceeded"); checks += 1;
}
const cyclic = fixture(), cycle = {}; cycle.self = cycle; Object.freeze(cycle);
cyclic.clearWindowSnapshot = Object.freeze({ ...cyclic.clearWindowSnapshot, execution: cycle });
assert.throws(() => createDtcClearDtcEvidencePairFixture(cyclic), (error) => error.name === "TypeError"); checks += 1;
const wideClear = fixture();
const wideConnection = {}, wideWindow = createDtcClearFixtureReceiveWindow({ expectedSourceIds: ids, connectionToken: wideConnection });
for (const sourceId of ids) wideWindow.append(wideWindow.attemptToken, wideConnection, { sourceId, payload: [0x44] });
wideClear.clearWindowSnapshot = wideWindow.finish(wideWindow.attemptToken, wideConnection, "complete").snapshot;
const wideHandle = createDtcClearDtcEvidencePairFixture(wideClear).handle;
check(wideHandle.inspectDifference(wideClear.context).ok, "Valid 32-source clear snapshot exceeded inspection budget");
wideHandle.dispose();
let tokenReads = 0;
const tokenOnly = fixture();
const opaqueToken = new Proxy({}, { ownKeys() { tokenReads += 1; throw new Error("Opaque token inspected"); } });
tokenOnly.clearWindowSnapshot = Object.freeze({ ...tokenOnly.clearWindowSnapshot, attemptToken: opaqueToken });
const tokenHandle = createDtcClearDtcEvidencePairFixture(tokenOnly).handle;
check(tokenHandle.inspectDifference(tokenOnly.context).ok && tokenReads === 0, "Identity token contents traversed");
tokenHandle.dispose();
for (let valueA = 0; valueA < 256; valueA += 1) {
  const value = fixture();
  value.beforeReadout.receipts[3].transcript = frames("7E8", [0x41, 1, valueA, 7, 0xE1, 0]) + ">";
  value.postReadout.receipts[3].transcript = frames("7E8", [0x41, 1, 255 - valueA, 0, 0, 0]) + ">";
  const handle = createDtcClearDtcEvidencePairFixture(value).handle;
  const summary = handle.inspectReadinessIndicators(value.context).summary;
  assert.deepEqual(summary.beforeIndicators, [{ sourceId: "7E8", milCommandedOn: valueA >= 128, reportedDtcCount: valueA % 128 }]); checks += 1;
  assert.deepEqual(summary.postIndicators, [{ sourceId: "7E8", milCommandedOn: 255 - valueA >= 128, reportedDtcCount: (255 - valueA) % 128 }]); checks += 1;
  check(summary.fixtureReadinessIndicatorsAvailable && ["monitorEvidenceAvailable", "readinessEvidenceAvailable", "comparisonAvailable",
    "clearSucceededInferred", "readoutCoverageComplete", "sameVehicleVerified", "clearBoundaryVerified", "realTransportProofAvailable",
    "executionEnabled", "vehicleCommandEnabled", "wouldTransmit", "canExecute"].every((key) => summary[key] === false), "MIL/count became readiness or success proof");
  handle.dispose();
}
const indicatorsInput = fixture(["7E8", "7E9"]);
indicatorsInput.beforeReadout.receipts[3].transcript = frames("7E9", [0x41, 1, 0xFF, 7, 0xE1, 0])
  + frames("7E8", [0x41, 1, 0, 7, 0xE1, 0]) + frames("7E8", [0x41, 1, 0, 7, 0xE1, 0]) + ">";
const indicatorsHandle = createDtcClearDtcEvidencePairFixture(indicatorsInput).handle;
const indicators = indicatorsHandle.inspectReadinessIndicators(indicatorsInput.context).summary;
assert.deepEqual(indicators.beforeIndicators, [{ sourceId: "7E8", milCommandedOn: false, reportedDtcCount: 0 },
  { sourceId: "7E9", milCommandedOn: true, reportedDtcCount: 127 }]); checks += 1;
check(Object.isFrozen(indicators.beforeIndicators[0]) && !/payload|transcript|Token/.test(JSON.stringify(indicators)), "Indicator raw data or mutability leaked");
indicatorsInput.beforeReadout.receipts[3].transcript = "NO DATA\r>";
check(JSON.stringify(indicatorsHandle.inspectReadinessIndicators(indicatorsInput.context).summary) === JSON.stringify(indicators), "Indicator extraction reread caller input");
for (const key of ["scopeToken", "connectionToken", "targetToken"]) check(indicatorsHandle.inspectReadinessIndicators({ ...indicatorsInput.context, [key]: {} }).summary === null, "Foreign context acquired indicators");
indicatorsHandle.dispose();
check(indicatorsHandle.inspectReadinessIndicators(indicatorsInput.context).summary === null, "Disposed indicators retained");
const staleIndicators = fixture(), staleHandle = createDtcClearDtcEvidencePairFixture(staleIndicators).handle;
staleIndicators.scope.invalidate(staleIndicators.context);
check(staleHandle.inspectReadinessIndicators(staleIndicators.context).summary === null, "Invalidated indicators retained");
for (const side of ["beforeReadout", "postReadout"]) {
  const value = fixture(); value[side].receipts[3].transcript = frames("7E8", [0x41, 1, 0x80, 7, 0xE1, 0])
    + frames("7E8", [0x41, 1, 0, 7, 0xE1, 0]) + ">";
  check(createDtcClearDtcEvidencePairFixture(value).handle === null, "Conflicting readiness yielded indicators");
}
for (let byteB = 0; byteB < 256; byteB += 1) {
  const value = fixture();
  value.beforeReadout.receipts[3].transcript = frames("7E8", [0x41, 1, 0x80, byteB, 0xFF, 0xFF]) + ">";
  value.postReadout.receipts[3].transcript = frames("7E8", [0x41, 1, 0, 255 - byteB, 0, 0]) + ">";
  const handle = createDtcClearDtcEvidencePairFixture(value).handle;
  const summary = handle.inspectBaseMonitorReports(value.context).summary;
  for (const [reports, b] of [[summary.beforeReports, byteB], [summary.postReports, 255 - byteB]]) {
    const bits = b.toString(2).padStart(8, "0").split("").reverse();
    assert.deepEqual(reports, [{ sourceId: "7E8", ignitionTypeReported: bits[3] === "1" ? "compression" : "spark",
      reservedBitSet: bits[7] === "1", monitors: ["misfire", "fuel_system", "comprehensive_components"].map((monitorId, index) => ({
        monitorId, supportedReported: bits[index] === "1", incompleteReported: bits[index + 4] === "1",
        state: bits[7] === "1" ? "indeterminate" : ["not_supported", "complete", "indeterminate", "incomplete"][Number(bits[index]) + 2 * Number(bits[index + 4])]
      })) }]); checks += 1;
  }
  check(summary.fixtureBaseMonitorReportsAvailable && ["noncontinuousMonitorsInterpreted", "readinessEvidenceAvailable", "comparisonAvailable",
    "clearSucceededInferred", "sameVehicleVerified", "readoutCoverageComplete", "clearBoundaryVerified", "realTransportProofAvailable",
    "executionEnabled", "vehicleCommandEnabled", "wouldTransmit", "canExecute"].every((key) => summary[key] === false), "Base monitors became whole readiness or operation proof");
  handle.dispose();
}
const baseInput = fixture(["7E8", "7E9"]);
baseInput.beforeReadout.receipts[3].transcript = frames("7E9", [0x41, 1, 0, 0x77, 0, 0])
  + frames("7E8", [0x41, 1, 0, 7, 0, 0]) + frames("7E8", [0x41, 1, 0, 7, 0, 0]) + ">";
const baseHandle = createDtcClearDtcEvidencePairFixture(baseInput).handle;
const baseSummary = baseHandle.inspectBaseMonitorReports(baseInput.context).summary;
check(baseSummary.beforeReports.length === 2 && baseSummary.beforeReports[0].sourceId === "7E8"
  && baseSummary.beforeReports[0].monitors.every((row) => row.state === "complete")
  && baseSummary.beforeReports[1].monitors.every((row) => row.state === "incomplete"), "ECU monitor reports merged or duplicate retained");
check(Object.isFrozen(baseSummary.beforeReports[0].monitors[0]) && !/payload|transcript|Token/.test(JSON.stringify(baseSummary)), "Base monitors leaked mutable/raw data");
baseInput.beforeReadout.receipts[3].transcript = "NO DATA\r>";
check(JSON.stringify(baseHandle.inspectBaseMonitorReports(baseInput.context).summary) === JSON.stringify(baseSummary), "Base monitor extraction reread input");
for (const key of ["scopeToken", "connectionToken", "targetToken"]) check(baseHandle.inspectBaseMonitorReports({ ...baseInput.context, [key]: {} }).summary === null, "Foreign context acquired base monitors");
baseHandle.dispose(); check(baseHandle.inspectBaseMonitorReports(baseInput.context).summary === null, "Disposed base monitors retained");
const invalidBase = fixture(), invalidBaseHandle = createDtcClearDtcEvidencePairFixture(invalidBase).handle;
invalidBase.scope.invalidate(invalidBase.context);
check(invalidBaseHandle.inspectBaseMonitorReports(invalidBase.context).summary === null, "Invalidated base monitors retained");
for (const compression of [false, true]) {
  const names = compression
    ? ["nmhc_catalyst", "nox_scr", null, "boost_pressure", null, "exhaust_gas_sensor", "pm_filter", "egr_vvt"]
    : ["catalyst", "heated_catalyst", "evaporative_system", "secondary_air", null, "oxygen_sensor", "oxygen_sensor_heater", "egr_vvt"];
  for (let supported = 0; supported < 256; supported += 1) {
    for (const incomplete of [0, supported, 255 - supported]) {
      const value = fixture();
      for (const side of ["beforeReadout", "postReadout"]) value[side].receipts[3].transcript = frames("7E8", [0x41, 1, 0, compression ? 15 : 7, supported, incomplete]) + ">";
      const handle = createDtcClearDtcEvidencePairFixture(value).handle;
      const summary = handle.inspectNoncontinuousMonitorReports(value.context).summary;
      const supportBits = supported.toString(2).padStart(8, "0").split("").reverse();
      const incompleteBits = incomplete.toString(2).padStart(8, "0").split("").reverse();
      const unmapped = names.some((name, i) => name === null && (supportBits[i] === "1" || incompleteBits[i] === "1"));
      const expected = [{ sourceId: "7E8", ignitionTypeReported: compression ? "compression" : "spark", reservedBitSet: false,
        unmappedBitsReported: unmapped, monitors: names.flatMap((monitorId, i) => monitorId === null ? [] : [{ monitorId,
          supportedReported: supportBits[i] === "1", incompleteReported: incompleteBits[i] === "1",
          state: unmapped ? "indeterminate" : ["not_supported", "complete", "indeterminate", "incomplete"][Number(supportBits[i]) + 2 * Number(incompleteBits[i])]
        }]) }];
      assert.deepEqual(summary.beforeReports, expected); checks += 1;
      assert.deepEqual(summary.postReports, expected); checks += 1;
      check(summary.fixtureNoncontinuousMonitorReportsAvailable && ["readinessEvidenceAvailable", "comparisonAvailable", "clearSucceededInferred",
        "readoutCoverageComplete", "sameVehicleVerified", "clearBoundaryVerified", "realTransportProofAvailable", "executionEnabled",
        "vehicleCommandEnabled", "wouldTransmit", "canExecute"].every((key) => summary[key] === false), "Noncontinuous reports became real readiness proof");
      handle.dispose();
    }
  }
}
const noncontinuous = fixture(["7E8", "7E9"]);
noncontinuous.beforeReadout.receipts[3].transcript = frames("7E9", [0x41, 1, 0, 15, 1, 1]) + frames("7E8", [0x41, 1, 0, 7, 1, 0]) + ">";
noncontinuous.postReadout.receipts[3].transcript = frames("7E8", [0x41, 1, 0, 15, 1, 0]) + frames("7E9", [0x41, 1, 0, 0x8F, 1, 0]) + ">";
const noncontinuousHandle = createDtcClearDtcEvidencePairFixture(noncontinuous).handle;
const noncontinuousSummary = noncontinuousHandle.inspectNoncontinuousMonitorReports(noncontinuous.context).summary;
check(noncontinuousSummary.beforeReports[0].monitors[0].monitorId === "catalyst"
  && noncontinuousSummary.beforeReports[1].monitors[0].monitorId === "nmhc_catalyst"
  && noncontinuousSummary.postReports[0].monitors[0].monitorId === "nmhc_catalyst", "Ignition mapping crossed ECU or phase");
check(noncontinuousSummary.postReports[1].reservedBitSet && noncontinuousSummary.postReports[1].monitors.every((m) => m.state === "indeterminate"), "Reserved B bit ignored");
check(Object.isFrozen(noncontinuousSummary.beforeReports[0].monitors[0]) && !/payload|transcript|Token/.test(JSON.stringify(noncontinuousSummary)), "Noncontinuous raw data leaked");
noncontinuous.beforeReadout.receipts[3].transcript = "NO DATA\r>";
check(JSON.stringify(noncontinuousHandle.inspectNoncontinuousMonitorReports(noncontinuous.context).summary) === JSON.stringify(noncontinuousSummary), "Noncontinuous input reread");
for (const key of ["scopeToken", "connectionToken", "targetToken"]) check(noncontinuousHandle.inspectNoncontinuousMonitorReports({ ...noncontinuous.context, [key]: {} }).summary === null, "Foreign context acquired noncontinuous reports");
noncontinuousHandle.dispose(); check(noncontinuousHandle.inspectNoncontinuousMonitorReports(noncontinuous.context).summary === null, "Disposed noncontinuous reports retained");
const staleNoncontinuous = fixture(), staleNoncontinuousHandle = createDtcClearDtcEvidencePairFixture(staleNoncontinuous).handle;
staleNoncontinuous.scope.invalidate(staleNoncontinuous.context);
check(staleNoncontinuousHandle.inspectNoncontinuousMonitorReports(staleNoncontinuous.context).summary === null, "Invalidated noncontinuous reports retained");
// All readiness views share generation-time parsing, but expose only immutable derived data.
const sharedInput = fixture(), sharedHandle = createDtcClearDtcEvidencePairFixture(sharedInput).handle;
const views = ["inspectReadinessIndicators", "inspectBaseMonitorReports", "inspectNoncontinuousMonitorReports"];
const savedViews = views.map((name) => JSON.stringify(sharedHandle[name](sharedInput.context)));
for (const name of [...views].reverse()) {
  const output = sharedHandle[name](sharedInput.context);
  check(!/frames|payload|transcript|Token/.test(JSON.stringify(output)), "Shared readiness parse leaked retained frames");
  assert.throws(() => { output.summary.extra = true; }, TypeError); checks += 1;
}
sharedInput.beforeReadout.receipts[3].transcript = "NO DATA\r>";
for (const [index, name] of views.entries()) check(JSON.stringify(sharedHandle[name](sharedInput.context)) === savedViews[index], "Readiness views changed each other or reread inputs");
sharedHandle.dispose();
for (const name of views) check(sharedHandle[name](sharedInput.context).reason === "evidence_disposed", "Shared readiness view outlived disposal");
console.log(`DTC clear difference boundary checks: ${checks} / Errors: 0`);
