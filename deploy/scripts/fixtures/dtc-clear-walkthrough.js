// Fixed simulated walkthrough only. No transport, saved records, or caller-supplied evidence.
import { createDtcClearBrowserPreviewSession } from "./dtc-clear-browser-preview-session.js";

export function createDtcClearWalkthrough(api) {
  let stage = "empty", workflow = null, comparison = null, session = null;
  const release = () => { session?.dispose(); session = null; comparison = null; };
  const inspect = () => Object.freeze({ stage, workflow, comparison,
    provenance: "simulated_only", executionEnabled: false, vehicleCommandEnabled: false,
    wouldTransmit: false, canExecute: false, repairConfirmed: false });
  return Object.freeze({
    inspect,
    prepare() {
      if (stage !== "empty") return false;
      try {
        const evidence = Object.fromEntries(api.getServiceOperationReadinessRequirements("clear_dtc")
          .filter(item => item.evidenceKey !== "impactAcknowledged").map(item => [item.evidenceKey, true]));
        workflow = api.buildGenericObdDtcClearWorkflow({
          target: { vehicleId: "simulated-vehicle", ecuId: "simulated-ecu", transportId: "simulated-transport" },
          preOperationSessionId: "fixed-simulated-before-record", evidence
        });
        session = createDtcClearBrowserPreviewSession(api, "workflow");
        stage = "prepared";
        return true;
      } catch { release(); workflow = null; stage = "unavailable"; return false; }
    },
    confirm() {
      if (stage !== "prepared") return false;
      workflow = api.transitionGenericObdDtcClearWorkflow(workflow, { type: "record_confirmation",
        revision: workflow.revision, target: workflow.target,
        preOperationSessionId: workflow.preOperationSessionId, impactAcknowledged: true });
      stage = "confirmed";
      return true;
    },
    reviewBlockedDispatch() {
      if (stage !== "confirmed") return false;
      workflow = api.transitionGenericObdDtcClearWorkflow(workflow, { type: "request_dispatch", revision: workflow.revision });
      stage = "dispatch_blocked";
      return true;
    },
    compareFixedRecords() {
      if (stage !== "dispatch_blocked") return false;
      const result = session.inspect();
      const difference = session.inspectDifference();
      if (!result.ok || !difference.ok) { release(); stage = "unavailable"; return false; }
      const names = { read_stored_dtc: "保存DTC", read_pending_dtc: "保留DTC", read_permanent_dtc: "永久DTC" };
      const lines = difference.summary.differences.flatMap(item => item.sources.map(source =>
        `[${source.sourceId}] ${names[item.intent]}：前のみ ${source.removed.join(", ") || "なし"} / 後のみ ${source.added.join(", ") || "なし"} / 前後共通 ${source.retained.join(", ") || "なし"}`));
      comparison = "固定の模擬DTC差分（消去成功・修理完了の判定ではありません）\n" + lines.join("\n") + "\n\n" + result.text;
      stage = "compared";
      return true;
    },
    cancel() {
      release();
      if (workflow && workflow.state !== "cancelled") {
        workflow = api.transitionGenericObdDtcClearWorkflow(workflow, { type: "cancel", revision: workflow.revision });
      }
      stage = "cancelled";
      return inspect();
    }
  });
}
