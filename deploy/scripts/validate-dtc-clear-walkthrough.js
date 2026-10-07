import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { createDtcClearWalkthrough } from "./fixtures/dtc-clear-walkthrough.js";
import { createDtcClearBrowserPreviewSession } from "./fixtures/dtc-clear-browser-preview-session.js";
import { createDtcClearBrowserFixtureInput } from "./fixtures/dtc-clear-browser-sample.js";
import { createDtcClearFixtureValidators } from "./fixtures/dtc-clear-scoped-readout-core.js";
const host = vm.createContext({ window: {}, navigator: {} });
vm.runInContext(fs.readFileSync(new URL("../obd-readonly.js", import.meta.url), "utf8"), host);
const api = host.window.ObdReadOnly;
const validators = createDtcClearFixtureValidators(api);
for (const [sampleName, missing] of [["workflow_no_data", ["7E8", "7E9"]], ["workflow_ecu_missing", ["7E9"]]]) {
  const input = createDtcClearBrowserFixtureInput(validators, sampleName);
  try {
    assert.ok(input.postReadout.receipts.every(receipt => receipt.completion === "complete" && receipt.transcript.endsWith(">")));
    const { scope, context, clearWindowSnapshot, clearCompletedAt, postReadout } = input;
    const result = validators.evaluateDtcClearScopedPostReadoutFixture({ scope, context, clearWindowSnapshot, clearCompletedAt, postReadout });
    assert.equal(result.fixtureScopeMatched, false);
    assert.deepEqual(result.readouts[0].missingFixtureSourceIds, missing);
    assert.ok(result.readouts.slice(1).every(row => row.fixtureScopeMatched));
    assert.equal(result.readouts[0].positiveSourceIdsOutsideFixture.length, 0);
  } finally { input.scope.invalidate(input.context); }
}
const expectedPlan = api.evaluateGenericObdDtcClearResponses({ expectedSourceIds: ["7EC"], frames: [], completion: "timeout" }).postOperationReadOnlyFollowupPlan;
const checkPlan = plan => {
  assert.equal(plan, expectedPlan, "Plan must come from the existing response evaluator");
  assert.equal(Object.isFrozen(plan), true); assert.equal(Object.isFrozen(plan.intents), true);
  assert.equal(plan.readOnly, true); assert.equal(plan.automaticRetryAllowed, false);
  assert.equal(plan.execution.wouldTransmit, false); assert.equal(plan.execution.canExecute, false);
};
assert.throws(() => createDtcClearBrowserPreviewSession(api, "external-record"));
const sample = createDtcClearBrowserPreviewSession(api, "workflow");
const difference = sample.inspectDifference();
assert.equal(difference.ok, true);
assert.equal(difference.summary.clearSucceededInferred, false);
assert.equal(difference.summary.executionEnabled, false);
sample.dispose();
assert.equal(sample.inspectDifference().ok, false);
assert.equal(sample.inspect().ok, false);
assert.equal(sample.inspectFollowupPlan(), null);
const actions = ["prepare", "confirm", "reviewBlockedDispatch", "compareFixedRecords"];
const stages = ["empty", "prepared", "confirmed", "dispatch_blocked", "compared"];
for (let stop = 0; stop <= 4; stop++) {
  const flow = createDtcClearWalkthrough(api);
  for (let index = 0; index <= stop; index++) {
    const before = flow.inspect();
    assert.equal(before.stage, stages[index]);
    if (index < 4) assert.equal(before.followupPlan, null);
    assert.equal(before.history.length, index);
    assert.equal(Object.isFrozen(before.history), true);
    for (const [position, entry] of before.history.entries()) {
      assert.equal(entry.ordinal, position + 1); assert.equal(Object.isFrozen(entry), true);
      assert.equal(entry.provenance, "simulated_only"); assert.equal(entry.wouldTransmit, false);
    }
    assert.equal(before.executionEnabled, false); assert.equal(before.wouldTransmit, false);
    assert.equal(before.vehicleCommandEnabled, false); assert.equal(before.canExecute, false);
    assert.equal(before.repairConfirmed, false);
    for (const action of actions.filter((_, i) => i !== index)) {
      assert.equal(flow[action](), false); assert.deepEqual(flow.inspect(), before);
    }
    if (index === stop) break;
    assert.equal(flow[actions[index]](), true);
    assert.equal(before.history.length, index, "Old snapshots must not gain later events");
  }
  if (stop === 4) {
    checkPlan(flow.inspect().followupPlan);
    assert.equal(flow.inspect().workflow.state, "dispatch_blocked");
    assert.equal(flow.inspect().workflow.dispatch.attempted, false);
    assert.equal(typeof flow.inspect().comparison, "string");
    assert.ok(flow.inspect().comparison.length > 0);
    assert.match(flow.inspect().comparison, /前のみ P0133/);
    assert.match(flow.inspect().comparison, /後のみ P0300/);
    assert.match(flow.inspect().comparison, /前後共通 P0420/);
  }
  flow.cancel(); flow.cancel();
  assert.equal(flow.inspect().history.length, stop + 1);
  assert.equal(flow.inspect().history.at(-1).stage, "cancelled");
  assert.equal(flow.inspect().stage, "cancelled"); assert.equal(flow.inspect().comparison, null);
  assert.equal(flow.inspect().followupPlan, null);
  for (const action of actions) assert.equal(flow[action](), false);
}
const failed = createDtcClearWalkthrough({ getServiceOperationReadinessRequirements() { throw new Error('private'); } });
for (const [scenario, missing] of [["pre_record_missing", "pre_clear_snapshot_saved"], ["recovery_missing", "recovery_plan"], ["applicability_missing", "vehicle_applicability_confirmed"]]) {
  const flow = createDtcClearWalkthrough(api, scenario);
  assert.equal(flow.prepare(), false);
  const snapshot = flow.inspect();
  assert.equal(snapshot.stage, "preconditions_missing");
  assert.equal(snapshot.followupPlan, null);
  assert.equal(snapshot.workflow.state, "pre_save_required");
  assert.ok(snapshot.workflow.readiness.missingRequirementIds.includes(missing));
  assert.equal(snapshot.workflow.confirmation.recorded, false);
  assert.equal(snapshot.workflow.dispatch.attempted, false);
  assert.equal(snapshot.comparison, null);
  assert.equal(snapshot.history.length, 1);
  for (const action of actions) assert.equal(flow[action](), false);
  assert.deepEqual(flow.inspect(), snapshot);
  flow.cancel(); assert.equal(flow.inspect().stage, "cancelled");
}
assert.equal(failed.prepare(), false); assert.equal(failed.inspect().stage, "unavailable");
assert.equal(failed.inspect().workflow, null); assert.equal(failed.confirm(), false);
assert.throws(() => createDtcClearWalkthrough(api, "unknown"));
for (const scenario of ["result_unknown", "reread_failed", "no_data", "ecu_missing"]) {
  const flow = createDtcClearWalkthrough(api, scenario);
  assert.equal(flow.prepare(), true); assert.equal(flow.confirm(), true); assert.equal(flow.reviewBlockedDispatch(), true);
  assert.equal(flow.compareFixedRecords(), false);
  const snapshot = flow.inspect();
  assert.equal(snapshot.stage, scenario); assert.equal(snapshot.comparison, null);
  checkPlan(snapshot.followupPlan);
  assert.equal(snapshot.blockedReason, scenario === "result_unknown" ? "clear_evaluation_incomplete" : "post_fixture_scope_incomplete");
  assert.equal(snapshot.workflow.dispatch.attempted, false);
  assert.deepEqual(snapshot.history.map(entry => entry.stage), ["prepared", "confirmed", "dispatch_blocked", scenario]);
  assert.equal(snapshot.history.at(-1).reason, snapshot.blockedReason);
  assert.equal(snapshot.executionEnabled, false); assert.equal(snapshot.repairConfirmed, false);
  for (const action of actions) assert.equal(flow[action](), false);
  assert.deepEqual(flow.inspect(), snapshot);
  flow.cancel(); assert.equal(flow.inspect().blockedReason, null);
  assert.equal(flow.inspect().followupPlan, null);
  assert.equal(flow.inspect().history[3].reason, snapshot.blockedReason, "Ending must retain the earlier hold reason in this simulation's history");
  console.log(`Walkthrough ${scenario}: existing receipt validator rejected ${snapshot.blockedReason}; no comparison or retry`);
}
// Move the actual private controller ahead of the view to reproduce a stale view snapshot.
for (const [completedSteps, actionToReject] of [[1, "confirm"], [2, "reviewBlockedDispatch"], [3, "compareFixedRecords"],
  [1, "cancel"], [2, "cancel"], [3, "cancel"], [4, "cancel"]]) {
  let owner;
  const flow = createDtcClearWalkthrough({ ...api,
    buildGenericObdDtcClearWorkflow() { throw new Error("direct_builder_must_not_be_used"); },
    transitionGenericObdDtcClearWorkflow() { throw new Error("direct_transition_must_not_be_used"); },
    createGenericObdDtcClearController(input) { owner = api.createGenericObdDtcClearController(input); return owner; }
  });
  for (const action of actions.slice(0, completedSteps)) assert.equal(flow[action](), true);
  const oldView = flow.inspect();
  const current = owner.getSnapshot();
  owner.transition(current, { type: "cancel", revision: current.revision });
  if (actionToReject === "cancel") flow.cancel();
  else assert.equal(flow[actionToReject](), false);
  const rejected = flow.inspect();
  assert.equal(rejected.stage, "unavailable");
  assert.equal(rejected.blockedReason, "workflow_transition_rejected");
  assert.equal(rejected.workflow, null); assert.equal(rejected.comparison, null); assert.equal(rejected.followupPlan, null);
  assert.equal(rejected.history.length, oldView.history.length + 1);
  assert.equal(rejected.history.at(-1).stage, "unavailable");
  assert.equal(owner.getSnapshot().state, "cancelled");
  for (const action of actions) assert.equal(flow[action](), false);
  assert.deepEqual(flow.inspect(), rejected);
  assert.equal(flow.cancel().stage, "cancelled");
}
for (const mode of ["throw", "unchanged", "copied"]) {
  const flow = createDtcClearWalkthrough({ ...api, createGenericObdDtcClearController(input) {
    const owner = api.createGenericObdDtcClearController(input);
    return { getSnapshot: owner.getSnapshot, transition(snapshot, event) {
      if (mode === "throw") throw new Error("private_failure_details");
      if (mode === "unchanged") return snapshot;
      return { ...owner.transition(snapshot, event) };
    } };
  } });
  assert.equal(flow.prepare(), true); assert.equal(flow.confirm(), false);
  assert.equal(flow.inspect().stage, "unavailable");
  assert.equal(JSON.stringify(flow.inspect()).includes("private_failure_details"), false);
}
console.log("DTC clear walkthrough: ordered flow and actual controller ownership, stale views, transition rejection and cancellation passed; fixed simulation only");
