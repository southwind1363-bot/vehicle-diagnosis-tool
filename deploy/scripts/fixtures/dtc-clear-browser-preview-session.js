// Development-only owner of fixed simulated receipt evidence. Never accepts saved/external records.
import { createDtcClearFixtureValidators } from "./dtc-clear-scoped-readout-core.js";
import { createDtcClearBrowserFixtureInput } from "./dtc-clear-browser-sample.js";

export function createDtcClearBrowserPreviewSession(api) {
  const validators = createDtcClearFixtureValidators(api);
  const input = createDtcClearBrowserFixtureInput(validators);
  const { scope, context } = input;
  let handle;
  try {
    const result = validators.createDtcClearDtcEvidencePairFixture(input);
    handle = result.handle;
    if (!result.ok) throw new Error("fixed_receipt_preview_unavailable");
  } catch (error) {
    handle?.dispose();
    scope.invalidate(context);
    throw error;
  }
  // The closure retains only the derived handle and its scope/context, not raw receipts.
  return ownSession(handle, scope, context);
}

function ownSession(handle, scope, context) {
  return Object.freeze({
    inspect() { return handle.inspectMonitorStatePairText(context); },
    dispose() {
      handle.dispose();
      scope.invalidate(context);
    }
  });
}
