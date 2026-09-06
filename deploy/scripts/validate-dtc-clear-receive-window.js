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
const makeFrame = () => ({ sourceId: "engine", payload: [0x44] });
const makeWindow = (connectionToken = {}, expectedSourceIds = ["engine"]) => api.createGenericObdDtcClearReceiveWindow({ expectedSourceIds, connectionToken });
const safeSnapshot = (snapshot) => check(Object.isFrozen(snapshot) && Object.isFrozen(snapshot.attemptToken) && Object.isFrozen(snapshot.execution)
  && snapshot.execution.wouldTransmit === false && snapshot.execution.canExecute === false && snapshot.execution.retryAllowed === false
  && !("frames" in snapshot) && !("connectionToken" in snapshot), "Snapshot exposed unsafe receipt data");

const connection = {};
const receiveWindow = makeWindow(connection);
check(Object.isFrozen(receiveWindow) && Object.isFrozen(receiveWindow.attemptToken), "Public factory result is not frozen");
check(Object.isFrozen(connection) === false, "Factory froze caller-owned connection token");
safeSnapshot(receiveWindow.getSnapshot());
check(receiveWindow.append({}, connection, { sourceId: "engine", payload: [] }).reason === "stale_attempt", "Stale attempt inspected frame");
check(receiveWindow.append(receiveWindow.attemptToken, {}, { sourceId: "engine", payload: [] }).reason === "stale_connection", "Stale connection inspected frame");
check(receiveWindow.getSnapshot().receiptIntegrity === "valid", "Stale frame poisoned receipt");
const callerFrame = makeFrame();
check(receiveWindow.append(receiveWindow.attemptToken, connection, callerFrame).ok, "Valid frame was rejected");
callerFrame.sourceId = "changed";
callerFrame.payload[0] = 0;
const completed = receiveWindow.finish(receiveWindow.attemptToken, connection, "complete").snapshot;
check(completed.state === "terminal" && completed.resultStatus === "evaluated" && completed.evaluation?.responseEvaluationComplete === true, "Complete frame was not evaluated");
safeSnapshot(completed);
const completedJson = JSON.stringify(completed);
check(receiveWindow.append(receiveWindow.attemptToken, connection, makeFrame()).reason === "already_terminal" && receiveWindow.finish(receiveWindow.attemptToken, connection, "complete").reason === "already_terminal"
  && JSON.stringify(receiveWindow.getSnapshot()) === completedJson, "Terminal receipt mutated");

const crossAttempt = makeWindow(connection);
const otherAttempt = makeWindow(connection);
check(crossAttempt.append(otherAttempt.attemptToken, connection, makeFrame()).reason === "stale_attempt", "Cross-attempt token accepted");
const crossConnection = makeWindow({});
check(crossConnection.append(crossConnection.attemptToken, connection, makeFrame()).reason === "stale_connection", "Cross-connection token accepted");

const sparsePayload = [0x44]; delete sparsePayload[0];
for (const invalidFrame of [{ sourceId: "engine", payload: [] }, { sourceId: "engine", payload: sparsePayload }]) {
  const malformed = makeWindow(connection);
  check(malformed.append(malformed.attemptToken, connection, invalidFrame).reason === "invalid_frame", "Malformed current frame did not poison receipt");
  check(malformed.getSnapshot().receiptError === "invalid_frame" && malformed.append(malformed.attemptToken, connection, makeFrame()).reason === "receipt_poisoned", "Receipt poison was reversible");
}
const accessor = makeWindow(connection);
const accessorFrame = { sourceId: "engine" };
Object.defineProperty(accessorFrame, "payload", { enumerable: true, get() { throw new Error("accessor read"); } });
check(accessor.append(accessor.attemptToken, connection, accessorFrame).reason === "invalid_frame", "Accessor frame did not poison receipt");
const poisonAfterValid = makeWindow(connection);
poisonAfterValid.append(poisonAfterValid.attemptToken, connection, makeFrame());
check(poisonAfterValid.append(poisonAfterValid.attemptToken, connection, { sourceId: "engine", payload: [] }).reason === "invalid_frame", "Invalid frame after valid frame did not poison receipt");
const poisonedSnapshot = poisonAfterValid.finish(poisonAfterValid.attemptToken, connection, "complete").snapshot;
check(poisonedSnapshot.completion === "error" && poisonedSnapshot.resultStatus === "result_unknown"
  && poisonedSnapshot.evaluation?.expectedSources[0]?.affirmativeFrameCount === 1
  && poisonedSnapshot.evaluation?.responseEvaluationComplete === false, "Poisoned receipt discarded prior affirmative evidence");
const poisonedInvalidate = makeWindow(connection);
poisonedInvalidate.append(poisonedInvalidate.attemptToken, connection, makeFrame());
poisonedInvalidate.append(poisonedInvalidate.attemptToken, connection, { sourceId: "engine", payload: [] });
const poisonedInvalidateSnapshot = poisonedInvalidate.invalidate(poisonedInvalidate.attemptToken, connection).snapshot;
check(poisonedInvalidateSnapshot.completion === "error" && poisonedInvalidateSnapshot.evaluation?.completion === "error"
  && poisonedInvalidateSnapshot.evaluation?.expectedSources[0]?.affirmativeFrameCount === 1
  && poisonedInvalidateSnapshot.evaluation?.responseEvaluationComplete === false, "Poisoned invalidate discarded terminal evaluation");

const mixed = makeWindow(connection, ["engine", "transmission"]);
mixed.append(mixed.attemptToken, connection, makeFrame());
mixed.append(mixed.attemptToken, connection, { sourceId: "outside", payload: [0x44] });
const mixedSnapshot = mixed.finish(mixed.attemptToken, connection, "complete").snapshot;
check(mixedSnapshot.resultStatus === "result_unknown" && mixedSnapshot.evaluation?.completion === "complete"
  && mixedSnapshot.evaluation?.expectedSources.map((item) => item.observation).join(",") === "affirmative_observed,no_response_observed"
  && mixedSnapshot.evaluation?.unexpectedSources[0]?.sourceId === "outside" && mixedSnapshot.evaluation?.responseEvaluationComplete === false,
"Mixed, missing, and unexpected observations were not retained");

const full = makeWindow(connection);
for (let index = 0; index < 128; index += 1) check(full.append(full.attemptToken, connection, makeFrame()).ok, "In-capacity frame rejected");
check(full.append(full.attemptToken, connection, makeFrame()).reason === "frame_overflow" && full.getSnapshot().frameCount === 128, "129th frame was retained");
const overflowSnapshot = full.finish(full.attemptToken, connection, "complete").snapshot;
check(overflowSnapshot.resultStatus === "result_unknown" && overflowSnapshot.evaluation?.completion === "error"
  && overflowSnapshot.evaluation?.counts.frameCount === 128 && overflowSnapshot.evaluation?.responseEvaluationComplete === false, "Overflow receipt lost its terminal evaluation");
for (const completion of ["timeout", "disconnected", "error"]) {
  const current = makeWindow(connection);
  current.append(current.attemptToken, connection, makeFrame());
  const snapshot = current.finish(current.attemptToken, connection, completion).snapshot;
  check(snapshot.resultStatus === "result_unknown" && snapshot.evaluation?.completion === completion
    && snapshot.evaluation?.expectedSources[0]?.observation === "affirmative_observed"
    && snapshot.evaluation?.responseEvaluationComplete === false, `${completion} receipt lost incomplete observations`);
}
const invalidated = makeWindow(connection);
invalidated.append(invalidated.attemptToken, connection, makeFrame());
const invalidatedSnapshot = invalidated.invalidate(invalidated.attemptToken, connection).snapshot;
check(invalidatedSnapshot.completion === "disconnected" && invalidatedSnapshot.evaluation?.completion === "disconnected"
  && invalidatedSnapshot.evaluation?.responseEvaluationComplete === false, "Invalidate did not retain disconnected evaluation");
const badCompletion = makeWindow(connection);
typeError(() => badCompletion.finish(badCompletion.attemptToken, connection, "pending"), "Invalid completion accepted");
check(badCompletion.getSnapshot().state === "collecting", "Invalid completion mutated receipt");
typeError(() => makeWindow(null), "Null connection token accepted");
typeError(() => makeWindow(connection, ["bad id"]), "Invalid expected source accepted");

let reentry;
let descriptorReads = 0;
const reentrant = makeWindow(connection);
let entered = false;
const proxyFrame = new Proxy(makeFrame(), { getOwnPropertyDescriptor(target, key) {
  descriptorReads += 1;
  if (!entered) { entered = true; reentry = reentrant.append(reentrant.attemptToken, connection, makeFrame()); }
  return Reflect.getOwnPropertyDescriptor(target, key);
} });
check(reentrant.append(reentrant.attemptToken, connection, proxyFrame).ok === true && reentry?.reason === "operation_in_progress" && descriptorReads === 2, "Proxy frame was reentered or copied more than once");

console.log(`DTC clear receive-window checks: ${checks} / Errors: 0`);
