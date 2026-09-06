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
    && workflow.readiness.publicExecutionEnabled === false && workflow.readiness.public_execution_enabled === false
    && workflow.readiness.executionEnabled === false && workflow.readiness.execution_enabled === false
    && workflow.readiness.vehicleCommandEnabled === false && workflow.readiness.vehicle_command_enabled === false
    && workflow.readiness.wouldTransmit === false && workflow.readiness.would_transmit === false
    && workflow.readiness.canExecute === false && workflow.readiness.can_execute === false
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
const cancellationSources = [empty, ready, confirmed, blocked];
for (const sourceWorkflow of cancellationSources) {
  const cancelEvent = { type: "cancel", revision: sourceWorkflow.revision };
  const cancelled = api.transitionGenericObdDtcClearWorkflow(sourceWorkflow, cancelEvent);
  check(sourceWorkflow.state !== "cancelled" && sourceWorkflow.revision === cancelEvent.revision && cancelEvent.type === "cancel", "Cancellation changed its input or event");
  check(cancelled.state === "cancelled" && cancelled.revision === sourceWorkflow.revision
    && (sourceWorkflow.target === null ? cancelled.target === null : cancelled.target !== sourceWorkflow.target)
    && cancelled.preOperationSessionId === sourceWorkflow.preOperationSessionId
    && cancelled.readiness !== sourceWorkflow.readiness, "Cancellation did not retain independent target, session, evidence, and revision snapshots");
  check(sourceWorkflow.target === null || (cancelled.target.vehicleId === sourceWorkflow.target.vehicleId
    && cancelled.target.ecuId === sourceWorkflow.target.ecuId && cancelled.target.transportId === sourceWorkflow.target.transportId), "Cancellation did not retain all target values");
  check(keys.every((key) => cancelled.readiness.checks.find((check) => check.evidenceKey === key).complete === sourceWorkflow.readiness.checks.find((check) => check.evidenceKey === key).complete)
    && cancelled.confirmation.recorded === false && cancelled.confirmation.revision === null && cancelled.confirmation.target === null && cancelled.confirmation.preOperationSessionId === null
    && cancelled.readiness.checks.find((check) => check.evidenceKey === "impactAcknowledged").complete === false, "Cancellation did not retain evidence while removing confirmation");
  safe(cancelled, "Cancellation changed safety flags");
  check(Object.isFrozen(cancelled) && Object.isFrozen(cancelled.target) && Object.isFrozen(cancelled.readiness) && Object.isFrozen(cancelled.confirmation) && Object.isFrozen(cancelled.dispatch), "Cancellation output is mutable");
}
error(() => api.transitionGenericObdDtcClearWorkflow(ready, { type: "cancel", revision: 1 }), "stale_dtc_clear_workflow_revision");
error(() => api.transitionGenericObdDtcClearWorkflow(ready, { type: "cancel" }), "stale_dtc_clear_workflow_revision");
error(() => api.transitionGenericObdDtcClearWorkflow(ready, { type: "cancel", revision: "0" }), "stale_dtc_clear_workflow_revision");
error(() => api.transitionGenericObdDtcClearWorkflow(ready, { revision: 0 }), "invalid_dtc_clear_workflow_event");
error(() => api.transitionGenericObdDtcClearWorkflow(ready, null), "stale_dtc_clear_workflow_revision");
error(() => api.transitionGenericObdDtcClearWorkflow(ready, { type: "cancel", revision: 0, extra: true }), "invalid_dtc_clear_workflow_event");
error(() => api.transitionGenericObdDtcClearWorkflow(ready, { type: "cancel", revision: 0, target }), "invalid_dtc_clear_workflow_event");
const mutableWorkflow = JSON.parse(JSON.stringify(confirmed));
const mutableCancelEvent = JSON.parse(JSON.stringify({ type: "cancel", revision: 0 }));
const mutableWorkflowBefore = JSON.stringify(mutableWorkflow);
const mutableCancelEventBefore = JSON.stringify(mutableCancelEvent);
const cancelledFromMutableInput = api.transitionGenericObdDtcClearWorkflow(mutableWorkflow, mutableCancelEvent);
check(JSON.stringify(mutableWorkflow) === mutableWorkflowBefore && JSON.stringify(mutableCancelEvent) === mutableCancelEventBefore, "Cancellation changed JSON-cloned workflow input or event");
mutableWorkflow.target.vehicleId = "caller-mutated";
check(cancelledFromMutableInput.target.vehicleId === target.vehicleId && cancelledFromMutableInput.target !== mutableWorkflow.target, "Cancellation retained a caller-owned target reference");
const cancelled = api.transitionGenericObdDtcClearWorkflow(confirmed, { type: "cancel", revision: 0 });
for (const event of [
  { type: "cancel", revision: 0 },
  { type: "update_input", revision: 0, evidence },
  { type: "record_confirmation", revision: 0, target, preOperationSessionId: session, impactAcknowledged: true },
  { type: "request_dispatch", revision: 0 },
  { type: "unknown", revision: 0 }
]) {
  error(() => api.transitionGenericObdDtcClearWorkflow(cancelled, event), "invalid_dtc_clear_workflow_transition");
}
error(() => api.transitionGenericObdDtcClearWorkflow(cancelled, { type: "cancel", revision: 1 }), "stale_dtc_clear_workflow_revision");
error(() => api.transitionGenericObdDtcClearWorkflow(cancelled, { type: "cancel", revision: 0, extra: true }), "invalid_dtc_clear_workflow_transition");
error(() => api.transitionGenericObdDtcClearWorkflow({ ...cancelled, confirmation: { ...cancelled.confirmation, recorded: true } }, { type: "cancel", revision: 0 }), "invalid_dtc_clear_workflow_state");
error(() => api.transitionGenericObdDtcClearWorkflow({ ...cancelled, readiness: { ...cancelled.readiness, checks: cancelled.readiness.checks.map((check) => ({ ...check, complete: check.evidenceKey === "recoveryPlan" ? false : check.complete })) } }, { type: "cancel", revision: 0 }), "invalid_dtc_clear_workflow_state");
error(() => api.transitionGenericObdDtcClearWorkflow({ ...cancelled, executionEnabled: true }, { type: "cancel", revision: 0 }), "invalid_dtc_clear_workflow_state");
error(() => api.transitionGenericObdDtcClearWorkflow({ ...cancelled, dispatch: { ...cancelled.dispatch, attempted: true } }, { type: "cancel", revision: 0 }), "invalid_dtc_clear_workflow_state");
const nearLimitCancelled = api.transitionGenericObdDtcClearWorkflow(nearLimit, { type: "cancel", revision: Number.MAX_SAFE_INTEGER - 1 });
check(nearLimitCancelled.state === "cancelled" && nearLimitCancelled.revision === Number.MAX_SAFE_INTEGER - 1, "Cancellation did not retain the maximum valid revision");
error(() => api.transitionGenericObdDtcClearWorkflow(nearLimitCancelled, { type: "cancel", revision: Number.MAX_SAFE_INTEGER - 1 }), "invalid_dtc_clear_workflow_transition");
const controller = api.createGenericObdDtcClearController({ target, preOperationSessionId: session, evidence });
const controllerReady = controller.getSnapshot();
check(Object.isFrozen(controller) && Object.isFrozen(controllerReady), "DTC clear controller or initial snapshot is mutable");
safe(controllerReady, "Controller initial snapshot changed safety flags");
const controllerConfirmed = controller.transition(controllerReady, { type: "record_confirmation", revision: 0, target, preOperationSessionId: session, impactAcknowledged: true });
check(controller.getSnapshot() === controllerConfirmed && Object.isFrozen(controllerConfirmed), "Controller did not retain its confirmed snapshot");
safe(controllerConfirmed, "Controller confirmation changed safety flags");
error(() => controller.transition(controllerReady, { type: "cancel", revision: 0 }), "stale_dtc_clear_workflow_snapshot");
check(controller.getSnapshot() === controllerConfirmed, "Stale pre-confirmation snapshot changed controller state");
const controllerCancelled = controller.transition(controllerConfirmed, { type: "cancel", revision: 0 });
check(controller.getSnapshot() === controllerCancelled && controllerCancelled.state === "cancelled" && Object.isFrozen(controllerCancelled), "Controller cancellation did not retain a frozen terminal snapshot");
safe(controllerCancelled, "Controller cancellation changed safety flags");
error(() => controller.transition(controllerConfirmed, { type: "cancel", revision: 0 }), "stale_dtc_clear_workflow_snapshot");
error(() => controller.transition(controllerCancelled, { type: "cancel", revision: 0 }), "invalid_dtc_clear_workflow_transition");
check(controller.getSnapshot() === controllerCancelled, "Terminal controller transition changed its snapshot");
const invalidController = api.createGenericObdDtcClearController({ target, preOperationSessionId: session, evidence });
const invalidControllerSnapshot = invalidController.getSnapshot();
error(() => invalidController.transition(invalidControllerSnapshot, { type: "unknown", revision: 0 }), "invalid_dtc_clear_workflow_event");
check(invalidController.getSnapshot() === invalidControllerSnapshot, "Invalid controller event changed its snapshot");
error(() => invalidController.transition(JSON.parse(JSON.stringify(invalidControllerSnapshot)), { type: "cancel", revision: 0 }), "stale_dtc_clear_workflow_snapshot");
const otherController = api.createGenericObdDtcClearController({ target, preOperationSessionId: session, evidence });
error(() => invalidController.transition(otherController.getSnapshot(), { type: "cancel", revision: 0 }), "stale_dtc_clear_workflow_snapshot");
let staleEventGetterRead = false;
const staleEvent = { get type() { staleEventGetterRead = true; throw new Error("stale event getter read"); }, revision: 0 };
error(() => invalidController.transition(JSON.parse(JSON.stringify(invalidControllerSnapshot)), staleEvent), "stale_dtc_clear_workflow_snapshot");
check(staleEventGetterRead === false, "Stale controller event getter was read");
const reentrantController = api.createGenericObdDtcClearController({ target, preOperationSessionId: session, evidence });
const reentrantSnapshot = reentrantController.getSnapshot();
const reentrantEvent = {
  get type() { return reentrantController.transition(reentrantController.getSnapshot(), { type: "cancel", revision: 0 }); },
  revision: 0
};
error(() => reentrantController.transition(reentrantSnapshot, reentrantEvent), "reentrant_dtc_clear_workflow_transition");
check(reentrantController.getSnapshot() === reentrantSnapshot, "Reentrant controller event changed its snapshot");
const reentrantCancelled = reentrantController.transition(reentrantSnapshot, { type: "cancel", revision: 0 });
check(reentrantController.getSnapshot() === reentrantCancelled && reentrantCancelled.state === "cancelled", "Reentrancy guard did not reset for a valid cancellation");
safe(reentrantCancelled, "Reentrancy recovery changed safety flags");
console.log(`DTC clear workflow checks: ${checks} / Errors: 0`);
