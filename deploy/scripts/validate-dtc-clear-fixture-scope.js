import assert from "node:assert/strict";
import { createDtcClearReadoutFixtureScope as create } from "./fixtures/dtc-clear-readout-scope.js";

let checks = 0;
const check = (value, message) => { assert.ok(value, message); checks += 1; };
const rejects = (fn) => { assert.throws(fn, TypeError); checks += 1; };
const intents = ["read_stored_dtc", "read_pending_dtc", "read_permanent_dtc", "read_readiness"];
const fixture = () => ({ provenance: "simulated", profile: "iso15765_11bit_normal_h1_caf1_d0_s1_e0",
  connectionToken: {}, targetToken: {}, byIntent: intents.map((intent, index) => ({ intent,
    sourceIds: index === 0 ? ["7E9", "7E8"] : ["7EA"] })) });
const input = fixture();
const before = JSON.stringify(input);
const scope = create(input);
const context = { scopeToken: scope.scopeToken, connectionToken: input.connectionToken, targetToken: input.targetToken };
const first = scope.inspect(context);
check(first.ok && first.snapshot.state === "active", "Valid scope unavailable");
check(first.snapshot.byIntent[0].sourceIds.join(",") === "7E8,7E9"
  && first.snapshot.byIntent[1].sourceIds.join(",") === "7EA", "Intent scopes inferred or merged");
check(JSON.stringify(input) === before && !Object.isFrozen(input.connectionToken) && !Object.isFrozen(input.targetToken),
  "Caller input mutated or frozen");
input.byIntent[0].sourceIds.length = 0;
input.byIntent[1].intent = "changed";
check(scope.inspect(context).snapshot.byIntent[0].sourceIds.length === 2
  && scope.inspect(context).snapshot.byIntent[1].intent === intents[1], "Input mutation changed captured scope");
const frozen = (value) => value === null || typeof value !== "object"
  || (Object.isFrozen(value) && Object.values(value).every(frozen));
check(frozen(first), "Result not deeply frozen");
check(first.snapshot.provenance === "simulated_only" && ["realTransportProofAvailable", "sameVehicleVerified",
  "readoutCoverageComplete", "comparisonAvailable", "clearSucceededInferred", "executionEnabled",
  "vehicleCommandEnabled", "wouldTransmit", "canExecute"].every((key) => first.snapshot[key] === false), "Scope overstated evidence");
check(!/Token|transcript|payload/.test(JSON.stringify(first)), "Context references or raw data leaked");
for (const [key, reason] of [["scopeToken", "scope_reference_mismatch"],
  ["connectionToken", "connection_reference_mismatch"], ["targetToken", "target_reference_mismatch"]]) {
  const mismatch = { ...context, [key]: {} };
  check(scope.inspect(mismatch).reason === reason && scope.inspect(mismatch).snapshot === null, "Mismatched context accepted");
  check(scope.invalidate(mismatch).reason === reason && scope.inspect(context).ok, "Mismatched invalidation mutated scope");
}
const invalidated = scope.invalidate(context);
check(invalidated.ok && invalidated.snapshot.state === "invalidated" && invalidated.snapshot.byIntent.length === 0,
  "Invalidation retained usable scope");
check(scope.inspect(context).reason === "scope_invalidated" && scope.inspect(context).snapshot === null,
  "Invalidated scope was reused");
check(scope.invalidate(context).reason === "scope_invalidated", "Repeated invalidation revived scope");
const newInput = fixture();
newInput.connectionToken = context.connectionToken;
newInput.targetToken = context.targetToken;
const newScope = create(newInput);
check(newScope.scopeToken !== scope.scopeToken && newScope.inspect(context).reason === "scope_reference_mismatch",
  "New scope accepted old handle");

rejects(() => create());
for (const mutate of [
  (v) => { v.provenance = "vehicle"; }, (v) => { v.profile = "auto"; },
  (v) => { v.connectionToken = null; }, (v) => { v.targetToken = "vehicle"; },
  (v) => { v.expectedSourceScopeVerified = true; }, (v) => { v.receipts = []; },
  (v) => { v.byIntent.pop(); }, (v) => { v.byIntent.reverse(); },
  (v) => { delete v.byIntent[1]; }, (v) => { v.byIntent[1] = v.byIntent[0]; },
  (v) => { v.byIntent[0].sourceIds = []; }, (v) => { v.byIntent[0].sourceIds = ["7E8", "7E8"]; },
  (v) => { v.byIntent[0].sourceIds = ["7e8"]; }, (v) => { v.byIntent[0].sourceIds = ["800"]; },
  (v) => { v.byIntent[0].sourceIds = ["18DAF110"]; }, (v) => { v.byIntent[0].sourceIds = [2024]; },
  (v) => { v.byIntent[0].sourceIds = [" 7E8"]; }, (v) => { delete v.byIntent[0].sourceIds[0]; },
  (v) => { v.byIntent[0].sourceIds.extra = true; }, (v) => { v.byIntent[0].sourceIds[Symbol()] = true; },
  (v) => { v.byIntent[0].extra = true; }, (v) => { Object.setPrototypeOf(v, { inherited: true }); }
]) { const value = fixture(); mutate(value); rejects(() => create(value)); }
const maximum = fixture();
maximum.byIntent[0].sourceIds = Array.from({ length: 32 }, (_, index) => index.toString(16).toUpperCase().padStart(3, "0"));
check(create(maximum).scopeToken !== null, "32-source bound rejected");
maximum.byIntent[0].sourceIds.push("020");
assert.throws(() => create(maximum), RangeError); checks += 1;
const oversized = fixture(); oversized.byIntent.push(oversized.byIntent[0]);
assert.throws(() => create(oversized), RangeError); checks += 1;
let getterCalls = 0;
for (const level of ["root", "row", "array"]) {
  const value = fixture();
  const target = level === "root" ? value : level === "row" ? value.byIntent[0] : value.byIntent[0].sourceIds;
  const key = level === "root" ? "byIntent" : level === "row" ? "sourceIds" : "0";
  Object.defineProperty(target, key, { enumerable: true, get() { getterCalls += 1; return []; } });
  rejects(() => create(value));
}
const accessorContext = { ...context };
Object.defineProperty(accessorContext, "scopeToken", { get() { getterCalls += 1; return scope.scopeToken; } });
rejects(() => scope.inspect(accessorContext));
check(getterCalls === 0, "Accessor invoked");
console.log(`DTC clear fixture scope checks: ${checks} / Errors: 0`);
