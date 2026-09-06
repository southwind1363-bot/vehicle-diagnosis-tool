// Node-only test harness: never imported by the app, bridge, or vehicle workflow.
import fs from "node:fs";
import vm from "node:vm";
import { inspectDtcClearReadoutFixtureScope } from "./dtc-clear-readout-scope.js";

const runtime = vm.createContext({ window: {}, navigator: {} });
vm.runInContext(fs.readFileSync(new URL("../../obd-readonly.js", import.meta.url), "utf8"), runtime);
const evaluateBefore = runtime.window.ObdReadOnly.evaluateGenericObdDtcClearBeforeReadoutReceipts;

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
  const readouts = before.readouts.map((row, index) => {
    const expected = current.snapshot.byIntent[index];
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
