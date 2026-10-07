// Development-only owner of fixed simulated receipt evidence. Never accepts saved/external records.
import { createDtcClearFixtureValidators } from "./dtc-clear-scoped-readout-core.js";
import { createDtcClearBrowserFixtureInput } from "./dtc-clear-browser-sample.js";

export function createDtcClearBrowserPreviewSession(api, sample = "monitor") {
  const validators = createDtcClearFixtureValidators(api);
  const input = createDtcClearBrowserFixtureInput(validators, sample);
  const { scope, context } = input;
  const followupPlan = input.clearWindowSnapshot.evaluation.postOperationReadOnlyFollowupPlan;
  let handle;
  try {
    const result = validators.createDtcClearDtcEvidencePairFixture(input);
    handle = result.handle;
    if (!result.ok && ["workflow_unknown", "workflow_reread_failed", "workflow_no_data", "workflow_ecu_missing"].includes(sample)) {
      let disposed = false;
      const inspect = () => Object.freeze({ ok: false, reason: disposed ? "scope_invalidated" : result.reason, text: null, summary: null });
      return Object.freeze({ inspect, inspectDifference: inspect,
        inspectFollowupPlan() { return disposed ? null : followupPlan; },
        dispose() { disposed = true; scope.invalidate(context); } });
    }
    if (!result.ok) throw new Error("fixed_receipt_preview_unavailable");
  } catch (error) {
    handle?.dispose();
    scope.invalidate(context);
    throw error;
  }
  // Retain derived views, the immutable follow-up plan and scope/context, not raw receipts.
  return ownSession(handle, scope, context, sample !== "monitor", followupPlan);
}

function ownSession(handle, scope, context, includeDifference, followupPlan) {
  let disposed = false;
  return Object.freeze({
    inspect() { return handle.inspectMonitorStatePairText(context); },
    ...(includeDifference ? { inspectDifference() { return handle.inspectDifference(context); },
      inspectFollowupPlan() { return disposed ? null : followupPlan; } } : {}),
    dispose() {
      disposed = true;
      handle.dispose();
      scope.invalidate(context);
    }
  });
}
