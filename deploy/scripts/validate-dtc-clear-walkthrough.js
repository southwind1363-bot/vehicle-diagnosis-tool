import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { createDtcClearWalkthrough } from "./fixtures/dtc-clear-walkthrough.js";
import { createDtcClearBrowserPreviewSession } from "./fixtures/dtc-clear-browser-preview-session.js";
const host = vm.createContext({ window: {}, navigator: {} });
vm.runInContext(fs.readFileSync(new URL("../obd-readonly.js", import.meta.url), "utf8"), host);
const api = host.window.ObdReadOnly;
assert.throws(() => createDtcClearBrowserPreviewSession(api, "external-record"));
const sample = createDtcClearBrowserPreviewSession(api, "workflow");
const difference = sample.inspectDifference();
assert.equal(difference.ok, true);
assert.equal(difference.summary.clearSucceededInferred, false);
assert.equal(difference.summary.executionEnabled, false);
sample.dispose();
assert.equal(sample.inspectDifference().ok, false);
assert.equal(sample.inspect().ok, false);
const actions = ["prepare", "confirm", "reviewBlockedDispatch", "compareFixedRecords"];
const stages = ["empty", "prepared", "confirmed", "dispatch_blocked", "compared"];
for (let stop = 0; stop <= 4; stop++) {
  const flow = createDtcClearWalkthrough(api);
  for (let index = 0; index <= stop; index++) {
    const before = flow.inspect();
    assert.equal(before.stage, stages[index]);
    assert.equal(before.executionEnabled, false); assert.equal(before.wouldTransmit, false);
    assert.equal(before.vehicleCommandEnabled, false); assert.equal(before.canExecute, false);
    assert.equal(before.repairConfirmed, false);
    for (const action of actions.filter((_, i) => i !== index)) {
      assert.equal(flow[action](), false); assert.deepEqual(flow.inspect(), before);
    }
    if (index === stop) break;
    assert.equal(flow[actions[index]](), true);
  }
  if (stop === 4) {
    assert.equal(flow.inspect().workflow.state, "dispatch_blocked");
    assert.equal(flow.inspect().workflow.dispatch.attempted, false);
    assert.equal(typeof flow.inspect().comparison, "string");
    assert.ok(flow.inspect().comparison.length > 0);
    assert.match(flow.inspect().comparison, /前のみ P0133/);
    assert.match(flow.inspect().comparison, /後のみ P0300/);
    assert.match(flow.inspect().comparison, /前後共通 P0420/);
  }
  flow.cancel(); flow.cancel();
  assert.equal(flow.inspect().stage, "cancelled"); assert.equal(flow.inspect().comparison, null);
  for (const action of actions) assert.equal(flow[action](), false);
}
const failed = createDtcClearWalkthrough({ getServiceOperationReadinessRequirements() { throw new Error('private'); } });
assert.equal(failed.prepare(), false); assert.equal(failed.inspect().stage, "unavailable");
assert.equal(failed.inspect().workflow, null); assert.equal(failed.confirm(), false);
assert.throws(() => createDtcClearWalkthrough(api, "unknown"));
for (const scenario of ["result_unknown", "reread_failed"]) {
  const flow = createDtcClearWalkthrough(api, scenario);
  assert.equal(flow.prepare(), true); assert.equal(flow.confirm(), true); assert.equal(flow.reviewBlockedDispatch(), true);
  assert.equal(flow.compareFixedRecords(), false);
  const snapshot = flow.inspect();
  assert.equal(snapshot.stage, scenario); assert.equal(snapshot.comparison, null);
  assert.equal(snapshot.blockedReason, scenario === "result_unknown" ? "clear_evaluation_incomplete" : "post_fixture_scope_incomplete");
  assert.equal(snapshot.workflow.dispatch.attempted, false);
  assert.equal(snapshot.executionEnabled, false); assert.equal(snapshot.repairConfirmed, false);
  for (const action of actions) assert.equal(flow[action](), false);
  assert.deepEqual(flow.inspect(), snapshot);
  flow.cancel(); assert.equal(flow.inspect().blockedReason, null);
  console.log(`Walkthrough ${scenario}: existing receipt validator rejected ${snapshot.blockedReason}; no comparison or retry`);
}
console.log("DTC clear walkthrough: ordered preparation/confirmation/blocked dispatch/comparison, cancellation at every stage and failure passed; fixed simulation only");
