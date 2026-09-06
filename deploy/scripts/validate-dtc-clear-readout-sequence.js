import assert from "node:assert/strict";
import { createDtcClearReadoutFixtureScope as create } from "./fixtures/dtc-clear-readout-scope.js";
import { createDtcClearFixtureReceiveWindow as receiveWindow,
  evaluateDtcClearReadoutSequenceFixture as evaluate } from "./fixtures/dtc-clear-scoped-before-readout.js";

let checks = 0;
const check = (value, message) => { assert.ok(value, message); checks += 1; };
const intents = ["read_stored_dtc", "read_pending_dtc", "read_permanent_dtc", "read_readiness"];
const commands = ["03", "07", "0A", "0101"];
const profile = "iso15765_11bit_normal_h1_caf1_d0_s1_e0";
const stamp = (second) => `2026-09-06T00:00:${String(second).padStart(2, "0")}.000Z`;
function fixture() {
  const connectionToken = {}, targetToken = {};
  const scope = create({ provenance: "simulated", profile, connectionToken, targetToken,
    byIntent: intents.map((intent) => ({ intent, sourceIds: ["7E8"] })) });
  // Deliberately distinct: sequence matching must not claim clear connection ownership.
  const clearConnection = {};
  const clear = receiveWindow({ expectedSourceIds: ["7E9"], connectionToken: clearConnection });
  clear.append(clear.attemptToken, clearConnection, { sourceId: "7E9", payload: [0x44] });
  const readout = (start) => ({ provenance: "simulated", connectionToken, attemptToken: {}, startedAt: stamp(start),
    completedAt: stamp(start + 5), receipts: intents.map((intent, index) => ({ ordinal: index + 1, intent,
      command: commands[index], profile, startedAt: stamp(start + index), completedAt: stamp(start + index + 1),
      completion: "complete", transcript: index === 3 ? "7E8 06 41 01 80 07 E1 00 AA\r>"
        : `7E8 02 ${["43", "47", "4A"][index]} 00 AA AA AA AA AA\r>` })) });
  return { scope, context: { scopeToken: scope.scopeToken, connectionToken, targetToken },
    beforeReadout: readout(1), clearStartedAt: stamp(7), clearCompletedAt: stamp(8),
    clearWindowSnapshot: clear.finish(clear.attemptToken, clearConnection, "complete").snapshot, postReadout: readout(9) };
}
function run(input) {
  const original = JSON.stringify(input);
  const out = evaluate(input);
  check(JSON.stringify(input) === original, "Sequence input mutated");
  check(out.provenance === "simulated_only" && ["realTransportProofAvailable", "sameVehicleVerified", "clearBoundaryVerified",
    "readoutCoverageComplete", "comparisonAvailable", "clearSucceededInferred", "executionEnabled",
    "vehicleCommandEnabled", "wouldTransmit", "canExecute"].every((key) => out[key] === false), "Sequence overstated real evidence");
  return out;
}
const good = run(fixture());
check(good.state === "fixture_sequence_matched" && good.fixtureSequenceMatched, "Ordered distinct fixture failed");
check(Object.isFrozen(good) && !/payload|transcript|Token|readouts/.test(JSON.stringify(good)), "Sequence retained evidence internals");
const adjacent = fixture(); adjacent.clearStartedAt = adjacent.beforeReadout.completedAt;
adjacent.clearCompletedAt = adjacent.postReadout.startedAt;
check(run(adjacent).fixtureSequenceMatched, "Adjacent non-overlapping boundaries rejected");
for (const [mutate, reason] of [
  [(v) => { v.clearStartedAt = stamp(5); }, "fixture_sequence_order_invalid"],
  [(v) => { v.clearStartedAt = stamp(9); }, "fixture_sequence_order_invalid"],
  [(v) => { v.clearCompletedAt = stamp(10); }, "post_readout_order_invalid"],
  [(v) => { v.beforeReadout.receipts[1].startedAt = stamp(0); }, "before_readout_order_invalid"],
  [(v) => { v.beforeReadout.attemptToken = v.clearWindowSnapshot.attemptToken; }, "sequence_attempt_not_distinct"],
  [(v) => { v.postReadout.attemptToken = v.beforeReadout.attemptToken; }, "sequence_attempt_not_distinct"],
  [(v) => { v.postReadout.attemptToken = v.clearWindowSnapshot.attemptToken; }, "post_attempt_not_distinct"],
  [(v) => { v.beforeReadout.connectionToken = {}; }, "receipt_connection_reference_mismatch"],
  [(v) => { v.postReadout.connectionToken = {}; }, "receipt_connection_reference_mismatch"],
  [(v) => { v.context.targetToken = {}; }, "target_reference_mismatch"],
  [(v) => { v.context.scopeToken = {}; }, "scope_reference_mismatch"],
  [(v) => { v.scope.invalidate(v.context); }, "scope_invalidated"]
]) { const value = fixture(); mutate(value); const out = run(value);
  check(out.state === "rejected" && out.reason === reason && !out.fixtureSequenceMatched, "Invalid sequence boundary passed"); }
for (const side of ["beforeReadout", "postReadout"]) {
  for (let index = 0; index < 4; index += 1) {
    for (const kind of ["missing", "outside", "timeout"]) {
      const value = fixture();
      const receipt = value[side].receipts[index];
      if (kind === "missing") receipt.transcript = "NO DATA\r>";
      if (kind === "outside") receipt.transcript = receipt.transcript.replace("7E8", "7EA");
      if (kind === "timeout") receipt.completion = "timeout";
      const out = run(value);
      check(out.state === "fixture_sequence_incomplete" && !out.fixtureSequenceMatched, "Incomplete side became matched sequence");
    }
  }
}
const clearIncomplete = fixture();
const clearConnection = {};
const clear = receiveWindow({ expectedSourceIds: ["7E9"], connectionToken: clearConnection });
clearIncomplete.clearWindowSnapshot = clear.finish(clear.attemptToken, clearConnection, "complete").snapshot;
check(run(clearIncomplete).reason === "clear_evaluation_incomplete", "Incomplete clear evaluation ignored");
for (const mutate of [
  (v) => { delete v.clearStartedAt; }, (v) => { v.clearStartedAt = "2026-09-06"; },
  (v) => { v.clearStartedAt = 0; }, (v) => { v.beforeScope = v.scope; },
  (v) => { v.clearConnectionVerified = true; }, (v) => { v.beforeReadout = { reported: true }; }
]) { const value = fixture(); mutate(value); assert.throws(() => evaluate(value), (error) => error.name === "TypeError"); checks += 1; }
let getters = 0;
const accessor = fixture(); Object.defineProperty(accessor, "clearStartedAt", { get() { getters += 1; return stamp(7); } });
assert.throws(() => evaluate(accessor), TypeError); checks += 1;
check(getters === 0, "Sequence accessor invoked");
for (const side of ["beforeReadout", "postReadout"]) {
  const value = fixture(); let invalidated = false;
  value[side].receipts = new Proxy(value[side].receipts, { getOwnPropertyDescriptor(target, key) {
    if (!invalidated) { invalidated = true; value.scope.invalidate(value.context); }
    return Reflect.getOwnPropertyDescriptor(target, key);
  } });
  check(evaluate(value).reason === "scope_invalidated", "Invalidation during sequence was ignored");
}
console.log(`DTC clear readout sequence checks: ${checks} / Errors: 0`);
