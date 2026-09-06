import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import "./validate-dtc-clear-fixture-scope.js";
import "./validate-dtc-clear-scoped-before-readout.js";
import "./validate-dtc-clear-scoped-post-readout.js";
import "./validate-dtc-clear-readout-sequence.js";

let ioCalls = 0;
const forbidden = () => { ioCalls += 1; throw new Error("Unexpected I/O"); };
const context = vm.createContext({ window: {}, navigator: { serial: { requestPort: forbidden } },
  fetch: forbidden, localStorage: { setItem: forbidden, removeItem: forbidden } });
vm.runInContext(fs.readFileSync(new URL("../obd-readonly.js", import.meta.url), "utf8"), context);
const api = context.window.ObdReadOnly;
const evaluate = api.evaluateGenericObdDtcClearBeforeReadoutReceipts;
let checks = 0;
const check = (condition, message) => { assert.ok(condition, message); checks += 1; };
const rejects = (fn, message) => { assert.throws(fn, (error) => error?.name === "TypeError", message); checks += 1; };
const profile = "iso15765_11bit_normal_h1_caf1_d0_s1_e0";
const intents = [["read_stored_dtc", "03", "43"], ["read_pending_dtc", "07", "47"],
  ["read_permanent_dtc", "0A", "4A"], ["read_readiness", "0101", "41"]];
function fixture() {
  return { beforeReadout: { provenance: "simulated", attemptToken: {}, connectionToken: {},
    startedAt: "2026-09-06T00:00:01.000Z", completedAt: "2026-09-06T00:00:07.000Z",
    receipts: intents.map(([intent, command, service], index) => ({ ordinal: index + 1, intent, command, profile,
      startedAt: `2026-09-06T00:00:0${index + 2}.000Z`, completedAt: `2026-09-06T00:00:0${index + 3}.000Z`,
      completion: "complete", transcript: index === 3 ? "7E8 06 41 01 80 07 E1 00 AA\r>" : `7E8 02 ${service} 00 AA AA AA AA AA\r>` })) } };
}
function safe(result) {
  check(result.provenance.status === "simulated_only" && result.provenance.operationBound === false
    && result.provenance.sameConnectionReferenceObserved === false && result.provenance.sameVehicleVerified === false
    && result.provenance.realTransportProofAvailable === false && result.provenance.clearBoundaryVerified === false
    && result.provenance.expectedSourceScopeStatus === "unavailable", "Before result overstated provenance");
  check(["readoutCoverageComplete", "comparisonAvailable", "operationOutcomeInferred", "clearSucceededInferred",
    "repairCompleteInferenceAllowed", "executionEnabled", "vehicleCommandEnabled", "wouldTransmit", "canExecute"]
    .every((key) => result[key] === false), "Before result enabled comparison or operation");
  check(result.readouts.every((row) => row.evidenceComplete === false) && result.technicianReviewRequired === true
    && result.provenance.blockerIds.includes("before_clear_boundary_unverified"), "Before evidence boundary lost");
}
const input = fixture();
const inputBefore = JSON.stringify(input);
const good = evaluate(input);
safe(good);
check(good.schemaVersion === "generic_obd_dtc_clear_before_readout_receipts_v1" && good.state === "indeterminate"
  && good.ordering.status === "ordered_within_attempt" && good.receiptStructureComplete === true, "Valid before structure failed");
check(good.readouts.slice(0, 3).every((row) => row.observation === "source_positive_empty_observed")
  && good.readouts[3].observation === "source_positive_reported", "Before observations failed");
check(JSON.stringify(input) === inputBefore && !Object.isFrozen(input.beforeReadout.attemptToken), "Input mutated or token frozen");
function frozen(value) {
  return value === null || typeof value !== "object" || (Object.isFrozen(value) && Object.values(value).every(frozen));
}
check(frozen(good), "Before result not deeply frozen");
check(!/transcript|payload|attemptToken|connectionToken|dtcs|clearResponseExpectedSourceIds/.test(JSON.stringify(good)),
  "Raw data, tokens, or fabricated clear scope leaked into result");

// Same four receipts must yield identical source observations on either side.
const connection = {};
const clear = api.createGenericObdDtcClearReceiveWindow({ expectedSourceIds: ["7E9"], connectionToken: connection });
clear.append(clear.attemptToken, connection, { sourceId: "7E9", payload: [0x44] });
const clearWindowSnapshot = clear.finish(clear.attemptToken, connection, "complete").snapshot;
for (let index = 0; index < 4; index += 1) {
  const service = intents[index][2];
  const validTranscript = fixture().beforeReadout.receipts[index].transcript;
  for (const [transcript, completion] of [
    [validTranscript, "complete"], [validTranscript, "timeout"], [validTranscript, "disconnected"], [validTranscript, "error"],
    ["NO DATA\r>", "complete"], [validTranscript.replace(">", ""), "complete"],
    [validTranscript.replace(">", "NO DATA\r>"), "complete"],
    [`7E8 03 7F ${intents[index][1].slice(0, 2)} 78 AA AA AA AA\r>`, "complete"],
    [`7E8 03 ${service} 00 00 AA AA AA AA\r>`, "complete"],
    [validTranscript.replace(">", validTranscript.replace("7E8", "7E9")), "complete"]
  ]) {
    const value = fixture();
    Object.assign(value.beforeReadout.receipts[index], { transcript, completion });
    const before = evaluate(value);
    const post = api.evaluateGenericObdDtcClearPostReadoutReceipts({ clearWindowSnapshot,
      clearCompletedAt: "2026-09-06T00:00:00.000Z", postReadout: value.beforeReadout });
    safe(before);
    check(JSON.stringify(before.readouts) === JSON.stringify(post.readouts)
      && before.receiptStructureComplete === post.receiptStructureComplete, "Before/post observation drift");
  }
}
for (const mutate of [
  (v) => { v.beforeReadout.completedAt = "2026-09-06T00:00:00.000Z"; },
  (v) => { v.beforeReadout.startedAt = "2026-09-06T00:00:03.000Z"; },
  (v) => { v.beforeReadout.receipts[1].startedAt = "2026-09-06T00:00:02.000Z"; },
  (v) => { v.beforeReadout.receipts[0].completedAt = "2026-09-06T00:00:01.000Z"; }
]) {
  const value = fixture(); mutate(value); const result = evaluate(value); safe(result);
  check(result.state === "rejected" && result.ordering.status === "invalid"
    && result.provenance.blockerIds.includes("before_readout_order_invalid"), "Invalid before ordering passed");
}
rejects(() => evaluate(), "Missing input accepted");
for (const mutate of [
  (v) => { v.clearWindowSnapshot = clearWindowSnapshot; },
  (v) => { v.beforeReadout.provenance = "vehicle"; },
  (v) => { v.beforeReadout.expectedSourceIds = ["7E8"]; },
  (v) => { v.beforeReadout.clearStartedAt = "2026-09-06T00:00:08.000Z"; },
  (v) => { v.beforeReadout.attemptToken = null; },
  (v) => { v.beforeReadout.connectionToken = "connection"; },
  (v) => { v.beforeReadout.startedAt = "2026-09-06"; },
  (v) => { v.beforeReadout.receipts.pop(); },
  (v) => { delete v.beforeReadout.receipts[1]; },
  (v) => { v.beforeReadout.receipts.reverse(); },
  (v) => { v.beforeReadout.receipts[0].command = "04"; },
  (v) => { v.beforeReadout.receipts[0].profile = "inferred"; },
  (v) => { v.beforeReadout.receipts[0].completion = "success"; },
  (v) => { v.beforeReadout.receipts[0].scopeVerified = true; },
  (v) => { v.beforeReadout.receipts[0].transcript = new String("NO DATA\r>"); },
  (v) => { v.beforeReadout.receipts[0][Symbol("extra")] = true; }
]) { const value = fixture(); mutate(value); rejects(() => evaluate(value), "Invalid before receipt accepted"); }
let getterCalls = 0;
for (const level of ["root", "attempt", "receipt"]) {
  const value = fixture();
  const target = level === "root" ? value : level === "attempt" ? value.beforeReadout : value.beforeReadout.receipts[0];
  const key = level === "root" ? "beforeReadout" : level === "attempt" ? "receipts" : "transcript";
  Object.defineProperty(target, key, { enumerable: true, get() { getterCalls += 1; throw new Error("getter invoked"); } });
  rejects(() => evaluate(value), "Accessor input accepted");
}
check(getterCalls === 0 && ioCalls === 0, "Evaluation invoked an accessor or I/O");
console.log(`DTC clear before-readout receipt checks: ${checks} / Errors: 0`);
