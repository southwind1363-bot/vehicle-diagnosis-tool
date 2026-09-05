import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync(new URL("../obd-readonly.js", import.meta.url), "utf8");
const context = vm.createContext({ window: {}, navigator: {} });
vm.runInContext(source, context);
const api = context.window.ObdReadOnly;
let checks = 0;
const check = (value, message) => { assert.ok(value, message); checks += 1; };
const error = (fn, code) => { assert.throws(fn, (value) => value?.code === code); checks += 1; };
const throws = (fn) => { assert.throws(fn); checks += 1; };
const target = { vehicleId: "vehicle-1", ecuId: "engine-1", transportId: "vci-1" };
const session = "pre-clear-scan-1";
const requirements = api.getServiceOperationReadinessRequirements("clear_dtc");
const keys = requirements.map((item) => item.evidenceKey).filter((key) => key !== "impactAcknowledged");
const evidence = Object.fromEntries(keys.map((key) => [key, true]));
const safe = (workflow, message) => check(
  workflow.executionEnabled === false && workflow.vehicleCommandEnabled === false && workflow.wouldTransmit === false && workflow.canExecute === false
    && workflow.dispatch.attempted === false && workflow.dispatch.outcome === "not_attempted" && workflow.dispatch.retryAllowed === false && workflow.dispatch.wouldTransmit === false,
  message
);

const empty = api.buildGenericObdDtcClearWorkflow();
check(empty.state === "pre_save_required", "Empty workflow must require pre-save evidence");
safe(empty, "Empty workflow enabled dispatch");
for (const key of keys) {
  const workflow = api.buildGenericObdDtcClearWorkflow({ target, preOperationSessionId: session, evidence: { ...evidence, [key]: false } });
  const requirement = requirements.find((item) => item.evidenceKey === key);
  check(workflow.state === "pre_save_required" && workflow.readiness.missingRequirementIds.includes(requirement.id), `${key} shortage was hidden`);
}
check(api.buildGenericObdDtcClearWorkflow({ target, evidence }).state === "pre_save_required", "Missing session reached confirmation");
check(api.buildGenericObdDtcClearWorkflow({ preOperationSessionId: session, evidence }).state === "pre_save_required", "Missing target reached confirmation");
const buildInput = { target: { ...target }, preOperationSessionId: session, evidence: { ...evidence } };
const ready = api.buildGenericObdDtcClearWorkflow(buildInput);
check(buildInput.target.vehicleId === target.vehicleId && buildInput.target.ecuId === target.ecuId && buildInput.target.transportId === target.transportId
  && buildInput.preOperationSessionId === session && keys.every((key) => buildInput.evidence[key] === true), "Workflow build changed its input");
buildInput.target.vehicleId = "caller-mutated";
check(ready.target.vehicleId === target.vehicleId, "Workflow target retained a caller-owned reference");
check(ready.state === "confirmation_required" && ready.readiness.missingRequirementIds.join(",") === "impact_acknowledged", "Eleven preconditions did not stop for confirmation");
error(() => api.buildGenericObdDtcClearWorkflow({ target, preOperationSessionId: session, evidence: { ...evidence, impactAcknowledged: true } }), "invalid_dtc_clear_workflow_evidence");
error(() => api.buildGenericObdDtcClearWorkflow({ target: { vehicleId: "v", ecuId: "e" }, preOperationSessionId: session, evidence }), "invalid_dtc_clear_workflow_target");
error(() => api.buildGenericObdDtcClearWorkflow({ target, preOperationSessionId: true, evidence }), "invalid_dtc_clear_workflow_session");
error(() => api.buildGenericObdDtcClearWorkflow({ target, preOperationSessionId: "x".repeat(129), evidence }), "invalid_dtc_clear_workflow_session");
error(() => api.buildGenericObdDtcClearWorkflow({ target, preOperationSessionId: session, evidence: { ...evidence, operatorAuthenticated: "true" } }), "invalid_dtc_clear_workflow_evidence");
const confirmationEvent = { type: "record_confirmation", revision: 0, target: { ...target }, preOperationSessionId: session, impactAcknowledged: true };
const confirmed = api.transitionGenericObdDtcClearWorkflow(ready, confirmationEvent);
check(ready.state === "confirmation_required" && ready.revision === 0 && confirmationEvent.target.vehicleId === target.vehicleId
  && confirmationEvent.target.ecuId === target.ecuId && confirmationEvent.target.transportId === target.transportId
  && confirmationEvent.preOperationSessionId === session && confirmationEvent.impactAcknowledged === true, "Workflow transition changed its input or event");
confirmationEvent.target.vehicleId = "caller-mutated";
check(confirmed.target.vehicleId === target.vehicleId && confirmed.confirmation.target.vehicleId === target.vehicleId && confirmed.target !== confirmed.confirmation.target, "Confirmation retained a mutable or shared target reference");
check(confirmed.state === "confirmation_recorded" && confirmed.readiness.missingRequirementIds.length === 0 && confirmed.confirmation.revision === 0, "Confirmation did not bind the exact complete revision");
safe(confirmed, "Confirmation enabled dispatch");
throws(() => { confirmed.readiness.checks[0].complete = false; });
check(confirmed.readiness.checks[0].complete === true && Object.isFrozen(confirmed.readiness.checks[0]), "Readiness facts are mutable after workflow construction");
error(() => api.transitionGenericObdDtcClearWorkflow(ready, { type: "record_confirmation", revision: 1, target, preOperationSessionId: session, impactAcknowledged: true }), "stale_dtc_clear_workflow_revision");
error(() => api.transitionGenericObdDtcClearWorkflow(ready, { type: "record_confirmation", revision: 0, target: { ...target, ecuId: "other" }, preOperationSessionId: session, impactAcknowledged: true }), "invalid_dtc_clear_workflow_confirmation");
error(() => api.transitionGenericObdDtcClearWorkflow(ready, { type: "record_confirmation", revision: 0, target, preOperationSessionId: "other-session", impactAcknowledged: true }), "invalid_dtc_clear_workflow_confirmation");
error(() => api.transitionGenericObdDtcClearWorkflow(ready, { type: "record_confirmation", revision: 0, target, preOperationSessionId: session, impactAcknowledged: "true" }), "invalid_dtc_clear_workflow_confirmation");
const revised = api.transitionGenericObdDtcClearWorkflow(confirmed, { type: "update_input", revision: 0, target: { ...target, ecuId: "other" } });
check(revised.revision === 1 && revised.state === "confirmation_required" && revised.confirmation.recorded === false && revised.readiness.missingRequirementIds.join(",") === "impact_acknowledged", "Target update did not invalidate confirmation");
error(() => api.transitionGenericObdDtcClearWorkflow(revised, { type: "record_confirmation", revision: 0, target: { ...target, ecuId: "other" }, preOperationSessionId: session, impactAcknowledged: true }), "stale_dtc_clear_workflow_revision");
const sessionRevised = api.transitionGenericObdDtcClearWorkflow(confirmed, { type: "update_input", revision: 0, preOperationSessionId: "pre-clear-scan-2" });
check(sessionRevised.revision === 1 && sessionRevised.confirmation.recorded === false, "Session update did not invalidate confirmation");
const evidenceRevised = api.transitionGenericObdDtcClearWorkflow(confirmed, { type: "update_input", revision: 0, evidence: { ...evidence, recoveryPlan: false } });
check(evidenceRevised.revision === 1 && evidenceRevised.state === "pre_save_required" && evidenceRevised.confirmation.recorded === false, "Evidence update did not invalidate confirmation");
error(() => api.transitionGenericObdDtcClearWorkflow({ ...confirmed, state: "dispatching" }, { type: "request_dispatch", revision: 0 }), "invalid_dtc_clear_workflow_state");
error(() => api.transitionGenericObdDtcClearWorkflow({ ...confirmed, dispatch: { attempted: true, outcome: "sent", retryAllowed: true, wouldTransmit: true } }, { type: "request_dispatch", revision: 0 }), "invalid_dtc_clear_workflow_state");
error(() => api.transitionGenericObdDtcClearWorkflow({ ...confirmed, readiness: { ...confirmed.readiness, wouldTransmit: true } }, { type: "request_dispatch", revision: 0 }), "invalid_dtc_clear_workflow_state");
error(() => api.transitionGenericObdDtcClearWorkflow({ ...confirmed, readiness: { ...confirmed.readiness, public_execution_enabled: true } }, { type: "request_dispatch", revision: 0 }), "invalid_dtc_clear_workflow_state");
error(() => api.transitionGenericObdDtcClearWorkflow({ ...confirmed, readiness: { ...confirmed.readiness, completedCount: 99 } }, { type: "request_dispatch", revision: 0 }), "invalid_dtc_clear_workflow_state");
error(() => api.transitionGenericObdDtcClearWorkflow({ ...confirmed, readiness: { ...confirmed.readiness, checks: [...confirmed.readiness.checks, { ...confirmed.readiness.checks[0] }] } }, { type: "request_dispatch", revision: 0 }), "invalid_dtc_clear_workflow_state");
const forgedIncompleteConfirmed = {
  ...confirmed,
  readiness: { ...confirmed.readiness, checks: confirmed.readiness.checks.map((item) => ({ ...item, complete: item.evidenceKey === "recoveryPlan" ? false : item.complete })) }
};
error(() => api.transitionGenericObdDtcClearWorkflow(forgedIncompleteConfirmed, { type: "request_dispatch", revision: 0 }), "invalid_dtc_clear_workflow_state");
const forgedMissingTargetConfirmed = { ...confirmed, target: null, confirmation: { ...confirmed.confirmation, target: null } };
error(() => api.transitionGenericObdDtcClearWorkflow(forgedMissingTargetConfirmed, { type: "request_dispatch", revision: 0 }), "invalid_dtc_clear_workflow_state");
const forgedBooleanConfirmed = { ...confirmed, confirmation: { ...confirmed.confirmation, recorded: "true" } };
error(() => api.transitionGenericObdDtcClearWorkflow(forgedBooleanConfirmed, { type: "request_dispatch", revision: 0 }), "invalid_dtc_clear_workflow_state");
error(() => api.transitionGenericObdDtcClearWorkflow(confirmed, { type: "dispatch_result", revision: 0, outcome: "sent" }), "invalid_dtc_clear_workflow_event");
error(() => api.transitionGenericObdDtcClearWorkflow({ ...confirmed, revision: Number.MAX_SAFE_INTEGER }, { type: "request_dispatch", revision: Number.MAX_SAFE_INTEGER }), "invalid_dtc_clear_workflow_state");
const nearLimit = { ...confirmed, revision: Number.MAX_SAFE_INTEGER - 1, confirmation: { ...confirmed.confirmation, revision: Number.MAX_SAFE_INTEGER - 1 } };
error(() => api.transitionGenericObdDtcClearWorkflow(nearLimit, { type: "update_input", revision: Number.MAX_SAFE_INTEGER - 1, evidence }), "dtc_clear_workflow_revision_overflow");
check(Object.isFrozen(confirmed) && Object.isFrozen(confirmed.target) && Object.isFrozen(confirmed.confirmation), "Workflow target/session confirmation is mutable");
const blocked = api.transitionGenericObdDtcClearWorkflow(confirmed, { type: "request_dispatch", revision: 0 });
check(blocked.state === "dispatch_blocked", "Dispatch did not remain blocked");
safe(blocked, "Blocked dispatch changed safety flags");
error(() => api.transitionGenericObdDtcClearWorkflow(blocked, { type: "request_dispatch", revision: 0 }), "invalid_dtc_clear_workflow_transition");
console.log(`DTC clear workflow checks: ${checks} / Errors: 0`);
