// Node-only test harness: never imported by the app, bridge, or vehicle workflow.
import fs from "node:fs";
import vm from "node:vm";
import { inspectDtcClearReadoutFixtureScope } from "./dtc-clear-readout-scope.js";

const runtime = vm.createContext({ window: {}, navigator: {} });
vm.runInContext(fs.readFileSync(new URL("../../obd-readonly.js", import.meta.url), "utf8"), runtime);
const evaluateBefore = runtime.window.ObdReadOnly.evaluateGenericObdDtcClearBeforeReadoutReceipts;
const evaluatePost = runtime.window.ObdReadOnly.evaluateGenericObdDtcClearPostReadoutReceipts;

// Construct clear fixtures in this VM so the immutable follow-up-plan identity is preserved.
export function createDtcClearFixtureReceiveWindow(input) {
  return runtime.window.ObdReadOnly.createGenericObdDtcClearReceiveWindow(input);
}

function record(value, keys) {
  if (value === null || typeof value !== "object" || Array.isArray(value)
    || ![null, Object.prototype].includes(Object.getPrototypeOf(value))) throw new TypeError("invalid_scoped_fixture_record");
  const actual = Reflect.ownKeys(value);
  if (actual.length !== keys.length || actual.some((key) => !keys.includes(key))) throw new TypeError("invalid_scoped_fixture_keys");
  return Object.fromEntries(keys.map((key) => {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !Object.hasOwn(descriptor, "value")) throw new TypeError("invalid_scoped_fixture_accessor");
    return [key, descriptor.value];
  }));
}

function freeze(value) {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}

function result(state, reason, readouts = []) {
  return freeze({ state, reason, provenance: "simulated_only", fixtureScopeMatched: state === "fixture_scope_matched",
    readouts, realTransportProofAvailable: false, sameVehicleVerified: false, clearBoundaryVerified: false,
    readoutCoverageComplete: false, comparisonAvailable: false, clearSucceededInferred: false,
    executionEnabled: false, vehicleCommandEnabled: false, wouldTransmit: false, canExecute: false });
}

export function evaluateDtcClearScopedBeforeReadoutFixture(input) {
  const value = record(input, ["scope", "context", "beforeReadout"]);
  const context = record(value.context, ["scopeToken", "connectionToken", "targetToken"]);
  const initial = inspectDtcClearReadoutFixtureScope(value.scope, context);
  if (!initial.ok) return result("rejected", initial.reason);
  const beforeReadout = record(value.beforeReadout,
    ["provenance", "attemptToken", "connectionToken", "startedAt", "completedAt", "receipts"]);
  if (beforeReadout.connectionToken !== context.connectionToken) return result("rejected", "receipt_connection_reference_mismatch");
  // Always evaluate strict raw receipts; never accept a caller's ready-made summary.
  const before = evaluateBefore({ beforeReadout });
  const current = inspectDtcClearReadoutFixtureScope(value.scope, context);
  if (!current.ok) return result("rejected", current.reason);
  if (before.state === "rejected") return result("rejected", "before_readout_order_invalid");
  return matchFixtureReadouts(before.readouts, current.snapshot);
}

function matchFixtureReadouts(rows, snapshot) {
  const readouts = rows.map((row, index) => {
    const expected = snapshot.byIntent[index];
    if (expected.intent !== row.intent) throw new TypeError("fixture_intent_mismatch");
    const positive = row.intent === "read_readiness"
      ? (row.observation === "source_positive_reported" ? row.observedSourceIds : [])
      : [...row.positiveEmptySourceIds, ...row.positiveNonemptySourceIds];
    const missingFixtureSourceIds = expected.sourceIds.filter((id) => !positive.includes(id));
    const positiveSourceIdsOutsideFixture = row.observedSourceIds.filter((id) => !expected.sourceIds.includes(id));
    const uncertain = ["indeterminate", "missing_or_unproven"].includes(row.observation);
    return {
      intent: row.intent, observation: row.observation,
      fixtureExpectedSourceIds: [...expected.sourceIds], missingFixtureSourceIds, positiveSourceIdsOutsideFixture,
      fixtureScopeMatched: !uncertain && missingFixtureSourceIds.length === 0 && positiveSourceIdsOutsideFixture.length === 0
    };
  });
  return result(readouts.every((row) => row.fixtureScopeMatched) ? "fixture_scope_matched" : "fixture_scope_incomplete",
    null, readouts);
}

export function evaluateDtcClearScopedPostReadoutFixture(input) {
  const value = record(input, ["scope", "context", "clearWindowSnapshot", "clearCompletedAt", "postReadout"]);
  const context = record(value.context, ["scopeToken", "connectionToken", "targetToken"]);
  const initial = inspectDtcClearReadoutFixtureScope(value.scope, context);
  if (!initial.ok) return result("rejected", initial.reason);
  const postReadout = record(value.postReadout,
    ["provenance", "attemptToken", "connectionToken", "startedAt", "completedAt", "receipts"]);
  if (postReadout.connectionToken !== context.connectionToken) return result("rejected", "receipt_connection_reference_mismatch");
  const post = evaluatePost({ clearWindowSnapshot: value.clearWindowSnapshot, clearCompletedAt: value.clearCompletedAt, postReadout });
  const current = inspectDtcClearReadoutFixtureScope(value.scope, context);
  if (!current.ok) return result("rejected", current.reason);
  if (post.state === "rejected") return result("rejected",
    post.provenance.blockerIds.includes("post_attempt_not_distinct") ? "post_attempt_not_distinct" : "post_readout_order_invalid");
  const clearBlocker = ["clear_snapshot_evaluation_mismatch", "clear_window_not_terminal", "clear_evaluation_incomplete"]
    .find((id) => post.provenance.blockerIds.includes(id));
  if (clearBlocker) return result("fixture_scope_incomplete", clearBlocker);
  // A complete simulated Mode 04 evaluation does not establish real clear success or connection ownership.
  return matchFixtureReadouts(post.readouts, current.snapshot);
}

// Checks a caller-described simulated sequence, not an actual clear operation.
export function evaluateDtcClearReadoutSequenceFixture(input) {
  const value = record(input, ["scope", "context", "beforeReadout", "clearWindowSnapshot", "clearStartedAt", "clearCompletedAt", "postReadout"]);
  const context = record(value.context, ["scopeToken", "connectionToken", "targetToken"]);
  const readoutKeys = ["provenance", "attemptToken", "connectionToken", "startedAt", "completedAt", "receipts"];
  const beforeReadout = record(value.beforeReadout, readoutKeys);
  const postReadout = record(value.postReadout, readoutKeys);
  const sequenceResult = (state, reason) => {
    const { fixtureScopeMatched, readouts, ...boundary } = result(state, reason);
    return freeze({ ...boundary, fixtureSequenceMatched: state === "fixture_sequence_matched" });
  };
  const initial = inspectDtcClearReadoutFixtureScope(value.scope, context);
  if (!initial.ok) return sequenceResult("rejected", initial.reason);
  for (const time of [value.clearStartedAt, value.clearCompletedAt]) {
    if (typeof time !== "string" || !Number.isFinite(Date.parse(time)) || new Date(time).toISOString() !== time) {
      throw new TypeError("invalid_fixture_clear_timestamp");
    }
  }
  // Capture the reference without invoking an accessor; post evaluation validates the full snapshot.
  const clearAttempt = value.clearWindowSnapshot !== null && typeof value.clearWindowSnapshot === "object"
    ? Object.getOwnPropertyDescriptor(value.clearWindowSnapshot, "attemptToken") : null;
  if (!clearAttempt || !Object.hasOwn(clearAttempt, "value")) throw new TypeError("invalid_fixture_clear_attempt");
  const before = evaluateDtcClearScopedBeforeReadoutFixture({ scope: value.scope, context, beforeReadout });
  if (before.state === "rejected") return sequenceResult("rejected", before.reason);
  const post = evaluateDtcClearScopedPostReadoutFixture({ scope: value.scope, context,
    clearWindowSnapshot: value.clearWindowSnapshot, clearCompletedAt: value.clearCompletedAt, postReadout });
  if (post.state === "rejected") return sequenceResult("rejected", post.reason);
  const current = inspectDtcClearReadoutFixtureScope(value.scope, context);
  if (!current.ok) return sequenceResult("rejected", current.reason);
  if (new Set([beforeReadout.attemptToken, clearAttempt.value, postReadout.attemptToken]).size !== 3) {
    return sequenceResult("rejected", "sequence_attempt_not_distinct");
  }
  const boundaries = [beforeReadout.completedAt, value.clearStartedAt, value.clearCompletedAt, postReadout.startedAt].map(Date.parse);
  if (!boundaries.every((time, index) => index === 0 || time >= boundaries[index - 1])) {
    return sequenceResult("rejected", "fixture_sequence_order_invalid");
  }
  if (!before.fixtureScopeMatched) return sequenceResult("fixture_sequence_incomplete", "before_fixture_scope_incomplete");
  if (!post.fixtureScopeMatched) return sequenceResult("fixture_sequence_incomplete", post.reason || "post_fixture_scope_incomplete");
  return sequenceResult("fixture_sequence_matched", null);
}
