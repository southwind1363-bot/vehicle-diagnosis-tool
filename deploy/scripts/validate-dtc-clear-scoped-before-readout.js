import assert from "node:assert/strict";
import { createDtcClearReadoutFixtureScope as create } from "./fixtures/dtc-clear-readout-scope.js";
import { evaluateDtcClearScopedBeforeReadoutFixture as evaluate } from "./fixtures/dtc-clear-scoped-before-readout.js";

let checks = 0;
const check = (value, message) => { assert.ok(value, message); checks += 1; };
const intents = ["read_stored_dtc", "read_pending_dtc", "read_permanent_dtc", "read_readiness"];
const commands = ["03", "07", "0A", "0101"];
const services = ["43", "47", "4A"];
const profile = "iso15765_11bit_normal_h1_caf1_d0_s1_e0";
function fixture() {
  const connectionToken = {}, targetToken = {};
  const scope = create({ provenance: "simulated", profile, connectionToken, targetToken,
    byIntent: intents.map((intent, index) => ({ intent, sourceIds: [index === 1 ? "7E9" : "7E8"] })) });
  return { scope, context: { scopeToken: scope.scopeToken, connectionToken, targetToken },
    beforeReadout: { provenance: "simulated", connectionToken, attemptToken: {},
      startedAt: "2026-09-06T00:00:01.000Z", completedAt: "2026-09-06T00:00:07.000Z",
      receipts: intents.map((intent, index) => ({ ordinal: index + 1, intent, command: commands[index], profile,
        startedAt: `2026-09-06T00:00:0${index + 2}.000Z`, completedAt: `2026-09-06T00:00:0${index + 3}.000Z`,
        completion: "complete", transcript: index === 3 ? "7E8 06 41 01 80 07 E1 00 AA\r>"
          : `${index === 1 ? "7E9" : "7E8"} 02 ${services[index]} 00 AA AA AA AA AA\r>` })) } };
}
function run(value) {
  const before = JSON.stringify(value.beforeReadout);
  const out = evaluate(value);
  check(JSON.stringify(value.beforeReadout) === before, "Receipt input mutated");
  check(out.provenance === "simulated_only" && ["realTransportProofAvailable", "sameVehicleVerified", "clearBoundaryVerified",
    "readoutCoverageComplete", "comparisonAvailable", "clearSucceededInferred", "executionEnabled",
    "vehicleCommandEnabled", "wouldTransmit", "canExecute"].every((key) => out[key] === false), "Fixture match became real evidence");
  return out;
}
const goodInput = fixture();
const good = run(goodInput);
check(good.state === "fixture_scope_matched" && good.fixtureScopeMatched
  && good.readouts.every((row) => row.fixtureScopeMatched), "Complete fixture did not match");
check(good.readouts[1].fixtureExpectedSourceIds.join(",") === "7E9", "Intent-specific scope was overwritten");
const frozen = (value) => value === null || typeof value !== "object"
  || (Object.isFrozen(value) && Object.values(value).every(frozen));
check(frozen(good) && !/transcript|payload|Token/.test(JSON.stringify(good)), "Result retained raw data or mutable output");
for (let index = 0; index < 4; index += 1) {
  for (const kind of ["missing", "outside", "timeout", "no_prompt", "negative", "conflict", "wrong_service"]) {
    const value = fixture();
    const receipt = value.beforeReadout.receipts[index];
    const expectedSource = index === 1 ? "7E9" : "7E8";
    if (kind === "missing") receipt.transcript = "NO DATA\r>";
    if (kind === "outside") receipt.transcript = receipt.transcript.replace(expectedSource, "7EA");
    if (kind === "timeout") receipt.completion = "timeout";
    if (kind === "no_prompt") receipt.transcript = receipt.transcript.replace(">", "");
    if (kind === "negative") receipt.transcript = `${expectedSource} 03 7F ${commands[index].slice(0, 2)} 78 AA AA AA AA\r>`;
    if (kind === "conflict") receipt.transcript = receipt.transcript.replace(">", index === 3
      ? `${expectedSource} 06 41 01 00 07 E1 00 AA\r>` : `${expectedSource} 04 ${services[index]} 01 C1 23 AA AA AA\r>`);
    if (kind === "wrong_service") receipt.transcript = `${expectedSource} 02 44 00 AA AA AA AA AA\r>`;
    const out = run(value);
    check(out.state === "fixture_scope_incomplete" && !out.readouts[index].fixtureScopeMatched, `${kind}: scope falsely matched`);
    if (kind === "outside") check(out.readouts[index].positiveSourceIdsOutsideFixture.join(",") === "7EA"
      && out.readouts[index].missingFixtureSourceIds.join(",") === expectedSource, "Outside source silently filtered");
  }
}
const extra = fixture();
extra.beforeReadout.receipts[0].transcript = "7E8 02 43 00 AA AA AA AA AA\r7EA 02 43 00 AA AA AA AA AA\r>";
check(run(extra).readouts[0].positiveSourceIdsOutsideFixture.join(",") === "7EA", "Extra source ignored");
for (const mutate of [
  (v) => { v.context.scopeToken = {}; }, (v) => { v.context.connectionToken = {}; },
  (v) => { v.context.targetToken = {}; }, (v) => { v.beforeReadout.connectionToken = {}; },
  (v) => { v.beforeReadout.completedAt = "2026-09-06T00:00:00.000Z"; },
  (v) => { v.scope.invalidate(v.context); }
]) { const value = fixture(); mutate(value); const out = run(value);
  check(out.state === "rejected" && out.readouts.length === 0 && !out.fixtureScopeMatched, "Invalid context or order accepted"); }
const stale = fixture();
const oldSnapshot = stale.scope.inspect(stale.context).snapshot;
stale.scope.invalidate(stale.context);
check(oldSnapshot.state === "active" && run(stale).reason === "scope_invalidated", "Old snapshot bypassed live invalidation");
let spoofCalls = 0;
const spoof = fixture(); spoof.scope = { inspect() { spoofCalls += 1; return { ok: true, snapshot: oldSnapshot }; } };
assert.throws(() => evaluate(spoof), TypeError); checks += 1;
check(spoofCalls === 0, "Caller supplied inspection code was executed");
for (const mutate of [
  (v) => { v.beforeReadout = { readouts: good.readouts }; }, (v) => { v.extra = true; },
  (v) => { v.context.scopeVerified = true; }, (v) => { v.beforeReadout.provenance = "vehicle"; }
]) { const value = fixture(); mutate(value); assert.throws(() => evaluate(value), (error) => error.name === "TypeError"); checks += 1; }
let getterCalls = 0;
const getter = fixture();
Object.defineProperty(getter.beforeReadout, "connectionToken", { get() { getterCalls += 1; return getter.context.connectionToken; } });
assert.throws(() => evaluate(getter), TypeError); checks += 1;
check(getterCalls === 0, "Connection getter invoked");
const duringEvaluation = fixture();
let invalidationTriggered = false;
duringEvaluation.beforeReadout.receipts = new Proxy(duringEvaluation.beforeReadout.receipts, {
  getOwnPropertyDescriptor(target, key) {
    if (!invalidationTriggered) {
      invalidationTriggered = true;
      duringEvaluation.scope.invalidate(duringEvaluation.context);
    }
    return Reflect.getOwnPropertyDescriptor(target, key);
  }
});
const invalidatedDuringEvaluation = evaluate(duringEvaluation);
check(invalidationTriggered && invalidatedDuringEvaluation.state === "rejected"
  && invalidatedDuringEvaluation.reason === "scope_invalidated" && invalidatedDuringEvaluation.readouts.length === 0,
  "Scope invalidation during receipt evaluation was not rechecked");
console.log(`DTC clear scoped before-readout checks: ${checks} / Errors: 0`);
