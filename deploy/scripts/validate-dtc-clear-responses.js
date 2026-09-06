import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync(new URL("../obd-readonly.js", import.meta.url), "utf8");
const context = vm.createContext({ window: {}, navigator: {} });
vm.runInContext(source, context);
const api = context.window.ObdReadOnly;
let checks = 0;
const check = (value, message) => { assert.ok(value, message); checks += 1; };
const typeError = (fn, message) => { assert.throws(fn, (error) => error?.name === "TypeError", message); checks += 1; };
const rangeError = (fn, message) => { assert.throws(fn, (error) => error?.name === "RangeError", message); checks += 1; };
const evaluate = (input) => api.evaluateGenericObdDtcClearResponses(input);
const followupPlanJson = JSON.stringify({
  required: true,
  readOnly: true,
  intents: ["read_stored_dtc", "read_pending_dtc", "read_permanent_dtc", "read_readiness"],
  automaticRetryAllowed: false,
  operationOutcomeInferred: false,
  repairCompleteInferenceAllowed: false,
  execution: { wouldTransmit: false, canExecute: false, retryAllowed: false }
});
const checkFollowupPlan = (result, message) => check(Object.keys(result).join(",") === "schemaVersion,completion,expectedSources,unexpectedSources,counts,allExpectedSourcesAffirmativeObserved,responseEvaluationComplete,postOperationReadOnlyFollowupPlan,execution"
  && JSON.stringify(result.postOperationReadOnlyFollowupPlan) === followupPlanJson
  && Object.isFrozen(result.postOperationReadOnlyFollowupPlan) && Object.isFrozen(result.postOperationReadOnlyFollowupPlan.intents) && Object.isFrozen(result.postOperationReadOnlyFollowupPlan.execution), message);

const normalInput = {
  expectedSourceIds: ["engine", "transmission"],
  frames: [
    { sourceId: "engine", payload: [0x44] },
    { sourceId: "transmission", payload: [0x44] }
  ],
  completion: "complete"
};
const normalBefore = JSON.stringify(normalInput);
const normal = evaluate(normalInput);
check(JSON.stringify(normalInput) === normalBefore, "Evaluation changed the caller input");
check(normal.schemaVersion === 1 && normal.completion === "complete" && normal.expectedSources.map((item) => item.sourceId).join(",") === "engine,transmission"
  && normal.expectedSources.every((item) => item.observation === "affirmative_observed" && item.frameCount === 1 && item.affirmativeFrameCount === 1 && item.unrecognizedFrameCount === 0)
  && normal.unexpectedSources.length === 0 && normal.counts.expectedSourceCount === 2 && normal.counts.observedExpectedSourceCount === 2 && normal.counts.unexpectedSourceCount === 0 && normal.counts.frameCount === 2
  && normal.allExpectedSourcesAffirmativeObserved === true && normal.responseEvaluationComplete === true
  && normal.execution.wouldTransmit === false && normal.execution.canExecute === false && normal.execution.retryAllowed === false, "Complete affirmative responses were not evaluated correctly");
check(Object.isFrozen(normal) && Object.isFrozen(normal.expectedSources) && Object.isFrozen(normal.expectedSources[0]) && Object.isFrozen(normal.unexpectedSources)
  && Object.isFrozen(normal.counts) && Object.isFrozen(normal.execution), "Response evaluation result is not deeply frozen");
checkFollowupPlan(normal, "Normal response result did not retain the exact frozen read-only follow-up plan");
check(JSON.stringify(evaluate(normalInput)) === JSON.stringify(normal), "Repeated evaluation is not deterministic");

const mixed = evaluate({ expectedSourceIds: ["a", "b", "c"], frames: [
  { sourceId: "a", payload: [0x44] }, { sourceId: "a", payload: [0x44, 0x00] }, { sourceId: "b", payload: [0x44] }, { sourceId: "outside", payload: [0x44] }, { sourceId: "outside", payload: [0x01] }, { sourceId: "later", payload: [0x44] }
], completion: "complete" });
check(mixed.expectedSources.map((item) => item.observation).join(",") === "response_uncertain,affirmative_observed,no_response_observed"
  && mixed.unexpectedSources.map((item) => item.sourceId).join(",") === "outside,later" && mixed.unexpectedSources[0].frameCount === 2 && mixed.unexpectedSources[0].affirmativeFrameCount === 1 && mixed.unexpectedSources[0].unrecognizedFrameCount === 1
  && mixed.counts.observedExpectedSourceCount === 2 && mixed.counts.unexpectedSourceCount === 2 && mixed.allExpectedSourcesAffirmativeObserved === false && mixed.responseEvaluationComplete === false, "Mixed, unknown, and absent responses were not preserved correctly");
checkFollowupPlan(mixed, "Mixed response result did not retain the exact frozen read-only follow-up plan");
for (const completion of ["timeout", "disconnected", "error"]) {
  const incomplete = evaluate({ ...normalInput, completion });
  check(incomplete.expectedSources.every((item) => item.observation === "affirmative_observed") && incomplete.allExpectedSourcesAffirmativeObserved === false && incomplete.responseEvaluationComplete === false, `${completion} completion was accepted as complete`);
  checkFollowupPlan(incomplete, `${completion} response result did not retain the exact frozen read-only follow-up plan`);
}
const empty = evaluate({ expectedSourceIds: [], frames: [], completion: "complete" });
check(empty.expectedSources.length === 0 && empty.unexpectedSources.length === 0 && empty.counts.frameCount === 0 && empty.allExpectedSourcesAffirmativeObserved === false && empty.responseEvaluationComplete === false, "Empty expected sources were accepted as affirmative");
checkFollowupPlan(empty, "Empty response result did not retain the exact frozen read-only follow-up plan");
check(normal.postOperationReadOnlyFollowupPlan === mixed.postOperationReadOnlyFollowupPlan && mixed.postOperationReadOnlyFollowupPlan === empty.postOperationReadOnlyFollowupPlan, "Response results did not reuse the same follow-up plan");
const nullPrototypeInput = Object.assign(Object.create(null), { expectedSourceIds: [], frames: [], completion: "complete" });
check(evaluate(nullPrototypeInput).completion === "complete", "Null-prototype input was rejected");

typeError(() => evaluate(), "Missing input was accepted");
typeError(() => evaluate({ expectedSourceIds: [], frames: [], completion: "complete", extra: true }), "Extra input field was accepted");
typeError(() => evaluate({ expectedSourceIds: [], frames: [] }), "Missing input field was accepted");
typeError(() => evaluate({ expectedSourceIds: ["a", "a"], frames: [], completion: "complete" }), "Duplicate expected source was accepted");
typeError(() => evaluate({ expectedSourceIds: ["has space"], frames: [], completion: "complete" }), "Whitespace source id was accepted");
typeError(() => evaluate({ expectedSourceIds: new Uint8Array([1]), frames: [], completion: "complete" }), "Typed expected source array was accepted");
typeError(() => evaluate({ expectedSourceIds: [], frames: new Uint8Array(), completion: "complete" }), "Typed frame array was accepted");
typeError(() => evaluate({ expectedSourceIds: [], frames: [], completion: "pending" }), "Unknown completion was accepted");
typeError(() => evaluate({ expectedSourceIds: ["a"], frames: [{ sourceId: "a", payload: [0x44], extra: true }], completion: "complete" }), "Extra frame field was accepted");
typeError(() => evaluate({ expectedSourceIds: ["a"], frames: [{ sourceId: "a" }], completion: "complete" }), "Missing frame field was accepted");
typeError(() => evaluate({ expectedSourceIds: ["a"], frames: [{ sourceId: "a", payload: new Uint8Array([0x44]) }], completion: "complete" }), "Typed payload was accepted");
typeError(() => evaluate({ expectedSourceIds: ["a"], frames: [{ sourceId: "a", payload: ["68"] }], completion: "complete" }), "Byte coercion was accepted");
rangeError(() => evaluate({ expectedSourceIds: Array.from({ length: 33 }, (_, index) => `s${index}`), frames: [], completion: "complete" }), "Expected source count bound was not enforced");
rangeError(() => evaluate({ expectedSourceIds: [], frames: Array.from({ length: 129 }, () => ({ sourceId: "a", payload: [0x44] })), completion: "complete" }), "Frame count bound was not enforced");
rangeError(() => evaluate({ expectedSourceIds: ["a"], frames: [{ sourceId: "a", payload: [] }], completion: "complete" }), "Payload minimum length was not enforced");
rangeError(() => evaluate({ expectedSourceIds: ["a"], frames: [{ sourceId: "a", payload: Array(65).fill(0) }], completion: "complete" }), "Payload maximum length was not enforced");
rangeError(() => evaluate({ expectedSourceIds: ["a"], frames: [{ sourceId: "a", payload: [256] }], completion: "complete" }), "Byte upper bound was not enforced");
rangeError(() => evaluate({ expectedSourceIds: ["a"], frames: [{ sourceId: "a", payload: [-1] }], completion: "complete" }), "Byte lower bound was not enforced");
rangeError(() => evaluate({ expectedSourceIds: ["a".repeat(65)], frames: [], completion: "complete" }), "Source id maximum length was not enforced");
typeError(() => evaluate({ expectedSourceIds: ["a"], frames: [{ sourceId: "a", payload: [1.5] }], completion: "complete" }), "Fractional byte was accepted");
const sparseExpected = ["a"]; delete sparseExpected[0];
const sparseFrames = []; sparseFrames.length = 1;
const sparsePayload = [0x44]; delete sparsePayload[0];
typeError(() => evaluate({ expectedSourceIds: sparseExpected, frames: [], completion: "complete" }), "Sparse expected source array was accepted");
typeError(() => evaluate({ expectedSourceIds: [], frames: sparseFrames, completion: "complete" }), "Sparse frame array was accepted");
typeError(() => evaluate({ expectedSourceIds: ["a"], frames: [{ sourceId: "a", payload: sparsePayload }], completion: "complete" }), "Sparse payload array was accepted");
class Frame { constructor() { this.sourceId = "a"; this.payload = [0x44]; } }
typeError(() => evaluate({ expectedSourceIds: ["a"], frames: [new Frame()], completion: "complete" }), "Class frame instance was accepted");
class Input { constructor() { this.expectedSourceIds = []; this.frames = []; this.completion = "complete"; } }
typeError(() => evaluate(new Input()), "Class input instance was accepted");
const forgedPrototypeInput = Object.assign(Object.create({ constructor: Object }), { expectedSourceIds: [], frames: [], completion: "complete" });
typeError(() => evaluate(forgedPrototypeInput), "Forged plain-object prototype was accepted");
const hiddenInput = { expectedSourceIds: [], frames: [], completion: "complete" };
Object.defineProperty(hiddenInput, "hidden", { value: true });
typeError(() => evaluate(hiddenInput), "Hidden input field was accepted");
const symbolFrame = { sourceId: "a", payload: [0x44] };
symbolFrame[Symbol("extra")] = true;
typeError(() => evaluate({ expectedSourceIds: ["a"], frames: [symbolFrame], completion: "complete" }), "Symbol frame field was accepted");
const arrayExtra = ["a"];
Object.defineProperty(arrayExtra, "extra", { value: true });
typeError(() => evaluate({ expectedSourceIds: arrayExtra, frames: [], completion: "complete" }), "Array extra field was accepted");
let accessorRead = false;
const accessorCompletion = { expectedSourceIds: [], frames: [] };
Object.defineProperty(accessorCompletion, "completion", { enumerable: true, get() { accessorRead = true; return "complete"; } });
typeError(() => evaluate(accessorCompletion), "Completion accessor was accepted");
check(accessorRead === false, "Completion accessor was called");
const accessorPayloadFrame = { sourceId: "a" };
Object.defineProperty(accessorPayloadFrame, "payload", { enumerable: true, get() { accessorRead = true; return [0x44]; } });
typeError(() => evaluate({ expectedSourceIds: ["a"], frames: [accessorPayloadFrame], completion: "complete" }), "Payload accessor was accepted");
check(accessorRead === false, "Payload accessor was called");
const accessorSourceFrame = { payload: [0x44] };
Object.defineProperty(accessorSourceFrame, "sourceId", { enumerable: true, get() { accessorRead = true; return "a"; } });
typeError(() => evaluate({ expectedSourceIds: ["a"], frames: [accessorSourceFrame], completion: "complete" }), "Source id accessor was accepted");
check(accessorRead === false, "Source id accessor was called");
const accessorPayloadIndex = [];
Object.defineProperty(accessorPayloadIndex, "0", { enumerable: true, get() { accessorRead = true; return 0x44; } });
typeError(() => evaluate({ expectedSourceIds: ["a"], frames: [{ sourceId: "a", payload: accessorPayloadIndex }], completion: "complete" }), "Payload index accessor was accepted");
check(accessorRead === false, "Payload index accessor was called");

console.log(`DTC clear response checks: ${checks} / Errors: 0`);
