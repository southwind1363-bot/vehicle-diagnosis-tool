// Development-only owner of fixed simulated receipt evidence. Never accepts saved/external records.
import { createDtcClearFixtureValidators } from "./dtc-clear-scoped-readout-core.js";
import { createDtcClearBrowserFixtureInput } from "./dtc-clear-browser-sample.js";

export function createDtcClearBrowserPreviewSession(api, sample = "monitor") {
  const validators = createDtcClearFixtureValidators(api);
  const input = createDtcClearBrowserFixtureInput(validators, sample);
  const { scope, context } = input;
  let handle;
  try {
    const result = validators.createDtcClearDtcEvidencePairFixture(input);
    handle = result.handle;
    if (!result.ok && ["workflow_unknown", "workflow_reread_failed"].includes(sample)) {
      let disposed = false;
      const inspect = () => Object.freeze({ ok: false, reason: disposed ? "scope_invalidated" : result.reason, text: null, summary: null });
      return Object.freeze({ inspect, inspectDifference: inspect, dispose() { disposed = true; scope.invalidate(context); } });
    }
    if (!result.ok) throw new Error("fixed_receipt_preview_unavailable");
  } catch (error) {
    handle?.dispose();
    scope.invalidate(context);
    throw error;
  }
  // The closure retains only the derived handle and its scope/context, not raw receipts.
  return ownSession(handle, scope, context, sample !== "monitor");
}

function ownSession(handle, scope, context, includeDifference) {
  return Object.freeze({
    inspect() { return handle.inspectMonitorStatePairText(context); },
    ...(includeDifference ? { inspectDifference() { return handle.inspectDifference(context); } } : {}),
    dispose() {
      handle.dispose();
      scope.invalidate(context);
    }
  });
}
