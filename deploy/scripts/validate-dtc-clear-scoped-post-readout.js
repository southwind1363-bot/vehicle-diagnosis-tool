import assert from "node:assert/strict";
import { createDtcClearReadoutFixtureScope as create } from "./fixtures/dtc-clear-readout-scope.js";
import { createDtcClearFixtureReceiveWindow as receiveWindow,
  evaluateDtcClearScopedPostReadoutFixture as evaluate } from "./fixtures/dtc-clear-scoped-before-readout.js";

let checks = 0;
const check = (value, message) => { assert.ok(value, message); checks += 1; };
const intents = ["read_stored_dtc", "read_pending_dtc", "read_permanent_dtc", "read_readiness"];
const commands = ["03", "07", "0A", "0101"];
const services = ["43", "47", "4A"];
const profile = "iso15765_11bit_normal_h1_caf1_d0_s1_e0";
function clearSnapshot(completion = "complete", affirmative = true, collecting = false) {
  const connectionToken = {};
  const window = receiveWindow({ expectedSourceIds: ["7EA"], connectionToken });
  if (affirmative) window.append(window.attemptToken, connectionToken, { sourceId: "7EA", payload: [0x44] });
  return collecting ? window.getSnapshot() : window.finish(window.attemptToken, connectionToken, completion).snapshot;
}
function fixture() {
  const connectionToken = {}, targetToken = {};
  const scope = create({ provenance: "simulated", profile, connectionToken, targetToken,
    byIntent: intents.map((intent, index) => ({ intent, sourceIds: [index === 1 ? "7E9" : "7E8"] })) });
  return { scope, context: { scopeToken: scope.scopeToken, connectionToken, targetToken },
    clearWindowSnapshot: clearSnapshot(), clearCompletedAt: "2026-09-06T00:00:00.000Z",
    postReadout: { provenance: "simulated", connectionToken, attemptToken: {},
      startedAt: "2026-09-06T00:00:01.000Z", completedAt: "2026-09-06T00:00:07.000Z",
      receipts: intents.map((intent, index) => ({ ordinal: index + 1, intent, command: commands[index], profile,
        startedAt: `2026-09-06T00:00:0${index + 2}.000Z`, completedAt: `2026-09-06T00:00:0${index + 3}.000Z`,
        completion: "complete", transcript: index === 3 ? "7E8 06 41 01 80 07 E1 00 AA\r>"
          : `${index === 1 ? "7E9" : "7E8"} 02 ${services[index]} 00 AA AA AA AA AA\r>` })) } };
}
function run(value) {
  const original = JSON.stringify(value);
  const out = evaluate(value);
  check(JSON.stringify(value) === original, "Input mutated");
  check(out.provenance === "simulated_only" && ["realTransportProofAvailable", "sameVehicleVerified", "clearBoundaryVerified",
    "readoutCoverageComplete", "comparisonAvailable", "clearSucceededInferred", "executionEnabled",
    "vehicleCommandEnabled", "wouldTransmit", "canExecute"].every((key) => out[key] === false), "Post scope became real evidence");
  return out;
}
const good = run(fixture());
check(good.fixtureScopeMatched && good.state === "fixture_scope_matched", "Complete post fixture failed");
check(good.readouts[0].fixtureExpectedSourceIds.join(",") === "7E8"
  && good.readouts[1].fixtureExpectedSourceIds.join(",") === "7E9"
  && !JSON.stringify(good).includes("7EA"), "Mode 04 expected scope contaminated readout scope");
const frozen = (value) => value === null || typeof value !== "object"
  || (Object.isFrozen(value) && Object.values(value).every(frozen));
check(frozen(good) && !/payload|transcript|Token/.test(JSON.stringify(good)), "Mutable output or raw data leaked");
for (let index = 0; index < 4; index += 1) {
  for (const kind of ["missing", "outside", "timeout", "disconnected", "error", "negative", "conflict", "wrong_service", "no_prompt"]) {
    const value = fixture(), receipt = value.postReadout.receipts[index];
    const source = index === 1 ? "7E9" : "7E8";
    if (kind === "missing") receipt.transcript = "NO DATA\r>";
    if (kind === "outside") receipt.transcript = receipt.transcript.replace(source, "7EB");
    if (["timeout", "disconnected", "error"].includes(kind)) receipt.completion = kind;
    if (kind === "negative") receipt.transcript = `${source} 03 7F ${commands[index].slice(0, 2)} 78 AA AA AA AA\r>`;
    if (kind === "conflict") receipt.transcript = receipt.transcript.replace(">", index === 3
      ? `${source} 06 41 01 00 07 E1 00 AA\r>` : `${source} 04 ${services[index]} 01 C1 23 AA AA AA\r>`);
    if (kind === "wrong_service") receipt.transcript = `${source} 02 44 00 AA AA AA AA AA\r>`;
    if (kind === "no_prompt") receipt.transcript = receipt.transcript.replace(">", "");
    const out = run(value);
    check(out.state === "fixture_scope_incomplete" && !out.readouts[index].fixtureScopeMatched, `${kind}: post scope falsely matched`);
  }
}
for (const [snapshot, reason] of [
  [clearSnapshot("complete", false, true), "clear_window_not_terminal"],
  [clearSnapshot("complete", false), "clear_evaluation_incomplete"],
  [clearSnapshot("timeout"), "clear_evaluation_incomplete"],
  [clearSnapshot("disconnected"), "clear_evaluation_incomplete"],
  [clearSnapshot("error"), "clear_evaluation_incomplete"],
  [{ ...clearSnapshot(), completion: "timeout" }, "clear_snapshot_evaluation_mismatch"]
]) {
  const value = fixture(); value.clearWindowSnapshot = snapshot;
  const out = run(value);
  check(!out.fixtureScopeMatched && out.reason === reason && out.readouts.length === 0, "Incomplete clear allowed post scope match");
}
for (const [mutate, reason] of [
  [(v) => { v.postReadout.attemptToken = v.clearWindowSnapshot.attemptToken; }, "post_attempt_not_distinct"],
  [(v) => { v.clearCompletedAt = "2026-09-06T00:00:08.000Z"; }, "post_readout_order_invalid"],
  [(v) => { v.postReadout.receipts[1].startedAt = "2026-09-06T00:00:01.000Z"; }, "post_readout_order_invalid"],
  [(v) => { v.postReadout.connectionToken = {}; }, "receipt_connection_reference_mismatch"],
  [(v) => { v.context.connectionToken = {}; }, "connection_reference_mismatch"],
  [(v) => { v.context.targetToken = {}; }, "target_reference_mismatch"],
  [(v) => { v.context.scopeToken = {}; }, "scope_reference_mismatch"],
  [(v) => { v.scope.invalidate(v.context); }, "scope_invalidated"]
]) {
  const value = fixture(); mutate(value); const out = run(value);
  check(out.state === "rejected" && out.reason === reason && out.readouts.length === 0, "Invalid post boundary accepted");
}
for (const mutate of [
  (v) => { v.extra = true; }, (v) => { v.context.verified = true; },
  (v) => { v.postReadout = { readouts: good.readouts }; }, (v) => { v.postReadout.provenance = "vehicle"; },
  (v) => { v.clearWindowSnapshot = { ...v.clearWindowSnapshot, connectionToken: v.context.connectionToken }; },
  (v) => { v.scope = { inspect() { throw new Error("Spoof called"); } }; }
]) { const value = fixture(); mutate(value); assert.throws(() => evaluate(value), (error) => error.name === "TypeError"); checks += 1; }
const reentrant = fixture();
let invalidated = false;
reentrant.postReadout.receipts = new Proxy(reentrant.postReadout.receipts, {
  getOwnPropertyDescriptor(target, key) {
    if (!invalidated) { invalidated = true; reentrant.scope.invalidate(reentrant.context); }
    return Reflect.getOwnPropertyDescriptor(target, key);
  }
});
check(evaluate(reentrant).reason === "scope_invalidated", "In-evaluation invalidation ignored");
let getterCalls = 0;
const accessor = fixture();
Object.defineProperty(accessor, "clearWindowSnapshot", { get() { getterCalls += 1; return {}; } });
assert.throws(() => evaluate(accessor), TypeError); checks += 1;
check(getterCalls === 0, "Clear snapshot getter invoked");
console.log(`DTC clear scoped post-readout checks: ${checks} / Errors: 0`);
