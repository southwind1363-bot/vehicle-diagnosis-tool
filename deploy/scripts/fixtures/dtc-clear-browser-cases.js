// Shared Node/browser test cases. All input is fixed simulated raw receipt data.
import { createDtcClearReadoutFixtureScope } from "./dtc-clear-readout-scope.js";
import { createDtcClearFixtureValidators } from "./dtc-clear-scoped-readout-core.js";

export function runDtcClearBrowserCases(api) {
  const validators = createDtcClearFixtureValidators(api);
  const build = () => {
    const profile = "iso15765_11bit_normal_h1_caf1_d0_s1_e0";
    const intents = ["read_stored_dtc", "read_pending_dtc", "read_permanent_dtc", "read_readiness"];
    const commands = ["03", "07", "0A", "0101"];
    const connectionToken = {}, targetToken = {};
    const scope = createDtcClearReadoutFixtureScope({ provenance: "simulated", profile, connectionToken, targetToken,
      byIntent: intents.map(intent => ({ intent, sourceIds: ["7E8", "7E9"] })) });
    const context = { scopeToken: scope.scopeToken, connectionToken, targetToken };
    const stamp = second => `2026-10-06T00:00:${String(second).padStart(2, "0")}.000Z`;
    const readout = (start, changed) => ({ provenance: "simulated", attemptToken: {}, connectionToken,
      startedAt: stamp(start), completedAt: stamp(start + 5),
      receipts: intents.map((intent, index) => ({ ordinal: index + 1, intent, command: commands[index], profile,
        startedAt: stamp(start + index), completedAt: stamp(start + index + 1), completion: "complete",
        transcript: ["7E8", "7E9"].map(source => index === 3
          ? `${source} 06 41 01 00 ${changed && source === "7E8" ? "17 01 01" : "07 01 00"} AA\r`
          : `${source} 02 ${["43", "47", "4A"][index]} 00 AA AA AA AA AA\r`).join("") + ">" })) });
    const clear = validators.createDtcClearFixtureReceiveWindow({ expectedSourceIds: ["7EC"], connectionToken });
    clear.append(clear.attemptToken, connectionToken, { sourceId: "7EC", payload: [0x44] });
    return { scope, context, beforeReadout: readout(1, false), clearStartedAt: stamp(7), clearCompletedAt: stamp(8),
      clearWindowSnapshot: clear.finish(clear.attemptToken, connectionToken, "complete").snapshot,
      postReadout: readout(9, true) };
  };
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
    const input = build(), ownerContext = input.context;
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
