// Fixed simulated walkthrough only. No transport, saved records, or caller-supplied evidence.
import { createDtcClearBrowserPreviewSession } from "./dtc-clear-browser-preview-session.js";

export function createDtcClearWalkthrough(api, scenario = "normal") {
  const samples = { normal: "workflow", result_unknown: "workflow_unknown", reread_failed: "workflow_reread_failed",
    no_data: "workflow_no_data", ecu_missing: "workflow_ecu_missing",
    pre_record_missing: "workflow", recovery_missing: "workflow", applicability_missing: "workflow" };
  if (!Object.hasOwn(samples, scenario)) throw new TypeError("unknown_walkthrough_scenario");
  let blockedReason = null;
  let followupPlan = null;
  let controller = null;
  let stage = "empty", workflow = null, comparison = null, session = null;
  let history = Object.freeze([]);
  const record = () => {
    history = Object.freeze([...history, Object.freeze({ ordinal: history.length + 1, stage,
      reason: blockedReason, provenance: "simulated_only", wouldTransmit: false })]);
  };
  const release = () => { session?.dispose(); session = null; comparison = null; followupPlan = null; };
  const failTransition = () => {
    release(); controller = null; workflow = null;
    blockedReason = "workflow_transition_rejected"; stage = "unavailable"; record();
    return false;
  };
  const transition = (event, expectedState) => {
    try {
      const next = controller.transition(workflow, event);
      if (next !== controller.getSnapshot() || next.state !== expectedState) return failTransition();
      workflow = next;
      return true;
    } catch { return failTransition(); }
  };
  const inspect = () => Object.freeze({ stage, workflow, comparison, scenario, blockedReason, history, followupPlan,
    provenance: "simulated_only", executionEnabled: false, vehicleCommandEnabled: false,
    wouldTransmit: false, canExecute: false, repairConfirmed: false });
  return Object.freeze({
    inspect,
    prepare() {
      if (stage !== "empty") return false;
      try {
        const evidence = Object.fromEntries(api.getServiceOperationReadinessRequirements("clear_dtc")
          .filter(item => item.evidenceKey !== "impactAcknowledged").map(item => [item.evidenceKey, true]));
        const missingKeys = { pre_record_missing: "preClearSnapshotSaved", recovery_missing: "recoveryPlan",
          applicability_missing: "vehicleApplicabilityConfirmed" };
        if (Object.hasOwn(missingKeys, scenario)) evidence[missingKeys[scenario]] = false;
        controller = api.createGenericObdDtcClearController({
          target: { vehicleId: "simulated-vehicle", ecuId: "simulated-ecu", transportId: "simulated-transport" },
          preOperationSessionId: scenario === "pre_record_missing" ? null : "fixed-simulated-before-record", evidence
        });
        workflow = controller.getSnapshot();
        if (workflow.state !== "confirmation_required") {
          blockedReason = "preconditions_incomplete";
          stage = "preconditions_missing";
          record();
          return false;
        }
        session = createDtcClearBrowserPreviewSession(api, samples[scenario]);
        stage = "prepared";
        record();
        return true;
      } catch { release(); controller = null; workflow = null; stage = "unavailable"; record(); return false; }
    },
    confirm() {
      if (stage !== "prepared") return false;
      if (!transition({ type: "record_confirmation",
        revision: workflow.revision, target: workflow.target,
        preOperationSessionId: workflow.preOperationSessionId, impactAcknowledged: true }, "confirmation_recorded")) return false;
      stage = "confirmed";
      record();
      return true;
    },
    reviewBlockedDispatch() {
      if (stage !== "confirmed") return false;
      if (!transition({ type: "request_dispatch", revision: workflow.revision }, "dispatch_blocked")) return false;
      stage = "dispatch_blocked";
      record();
      return true;
    },
    compareFixedRecords() {
      if (stage !== "dispatch_blocked") return false;
      try {
        if (controller.getSnapshot() !== workflow) return failTransition();
      } catch { return failTransition(); }
      const result = session.inspect();
      const difference = session.inspectDifference();
      const plan = session.inspectFollowupPlan();
      if (!result.ok || !difference.ok) {
        blockedReason = result.reason || difference.reason;
        release();
        stage = scenario === "result_unknown" && blockedReason === "clear_evaluation_incomplete" ? "result_unknown"
          : ["reread_failed", "no_data", "ecu_missing"].includes(scenario) && blockedReason === "post_fixture_scope_incomplete" ? scenario : "unavailable";
        if (["result_unknown", "reread_failed", "no_data", "ecu_missing"].includes(stage)) followupPlan = plan;
        record();
        return false;
      }
      const names = { read_stored_dtc: "保存DTC", read_pending_dtc: "保留DTC", read_permanent_dtc: "永久DTC" };
      const lines = difference.summary.differences.flatMap(item => item.sources.map(source =>
        `[${source.sourceId}] ${names[item.intent]}：前のみ ${source.removed.join(", ") || "なし"} / 後のみ ${source.added.join(", ") || "なし"} / 前後共通 ${source.retained.join(", ") || "なし"}`));
      comparison = "固定の模擬DTC差分（消去成功・修理完了の判定ではありません）\n" + lines.join("\n") + "\n\n" + result.text;
      stage = "compared";
      followupPlan = plan;
      record();
      return true;
    },
    cancel() {
      if (stage === "cancelled") return inspect();
      release();
      blockedReason = null;
      if (workflow && workflow.state !== "cancelled") {
        if (!transition({ type: "cancel", revision: workflow.revision }, "cancelled")) return inspect();
      }
      controller = null;
      stage = "cancelled";
      record();
      return inspect();
    }
  });
}
