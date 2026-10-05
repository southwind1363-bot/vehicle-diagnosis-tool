// Shared Node/browser test cases. All input is fixed simulated raw receipt data.
import { createDtcClearBrowserFixtureInput } from "./dtc-clear-browser-sample.js";
import { createDtcClearFixtureValidators } from "./dtc-clear-scoped-readout-core.js";

export function runDtcClearBrowserCases(api) {
  const validators = createDtcClearFixtureValidators(api);
  const mutations = {
    normal() {},
    no_data(input) { input.beforeReadout.receipts[0].transcript = "NO DATA\r>"; },
    unexpected_source(input) { input.beforeReadout.receipts[0].transcript = input.beforeReadout.receipts[0].transcript.replaceAll("7E8", "7ED"); },
    readiness_conflict(input) { input.beforeReadout.receipts[3].transcript = input.beforeReadout.receipts[3].transcript.replace(">", "7E8 06 41 01 00 17 01 01 AA\r>"); },
    missing_receipt(input) { input.beforeReadout.receipts.pop(); },
    foreign_context(input) { input.context = { ...input.context, targetToken: {} }; },
    copied_scope(input) { input.scope = { ...input.scope }; },
    copied_followup_plan(input) {
      const immutable = value => {
        if (value && typeof value === "object" && !Object.isFrozen(value)) {
          Object.values(value).forEach(immutable); Object.freeze(value);
        }
        return value;
      };
      const snapshot = input.clearWindowSnapshot;
      input.clearWindowSnapshot = immutable({ ...snapshot, evaluation: { ...snapshot.evaluation,
        postOperationReadOnlyFollowupPlan: structuredClone(snapshot.evaluation.postOperationReadOnlyFollowupPlan) } });
    },
    invalidated(input) { input.scope.invalidate(input.context); },
    repeated_attempt(input) { input.postReadout.attemptToken = input.beforeReadout.attemptToken; },
    reversed_boundary(input) { input.clearStartedAt = "2026-10-06T00:00:00.000Z"; },
    mutable_snapshot(input) { input.clearWindowSnapshot = { ...input.clearWindowSnapshot }; },
    transcript_overflow(input) { input.beforeReadout.receipts[0].transcript = " ".repeat(32769); },
    receipt_accessor(input) { Object.defineProperty(input.beforeReadout.receipts[0], "transcript", { get() { throw new Error("accessor_must_not_execute"); } }); }
  };
  return Object.entries(mutations).map(([name, mutate]) => {
    const input = createDtcClearBrowserFixtureInput(validators), ownerContext = input.context;
    let handle;
    try {
      mutate(input);
      const result = validators.createDtcClearDtcEvidencePairFixture(input);
      handle = result.handle;
      if (!result.ok) return { name, ok: false, reason: result.reason };
      const pairs = handle.inspectMonitorStatePairs(ownerContext);
      const text = handle.inspectMonitorStatePairText(ownerContext);
      handle.dispose();
      const disposed = handle.inspectMonitorStatePairText(ownerContext);
      input.scope.invalidate(ownerContext);
      const invalidated = handle.inspectMonitorStatePairText(ownerContext);
      return { name, ok: true, pairs, text, disposed, invalidated };
    } catch (error) {
      return { name, ok: false, errorName: error.name, reason: error.message };
    } finally {
      handle?.dispose();
      input.scope.invalidate(ownerContext);
    }
  });
}
