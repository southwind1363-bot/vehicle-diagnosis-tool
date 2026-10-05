import assert from "node:assert/strict";
import { createMonitorPairPreview, createMonitorPairPreviewSession } from "./preview-dtc-clear-monitor-pairs.js";
import { createMonitorPreviewReview } from "./fixtures/monitor-preview-review.js";

const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const expected = createMonitorPairPreview();
const session = createMonitorPairPreviewSession();
assert.equal(session.inspect().text, expected);
session.dispose(); session.dispose();
assert.deepEqual(session.inspect(), { ok: false, text: null });

const queue = [];
let calls = 0;
const review = createMonitorPreviewReview(() => { calls++; const gate = deferred(); queue.push(gate); return gate.promise; });
assert.equal(review.inspect().status, "empty");
const first = review.read();
assert.equal(review.inspect().status, "reading");
assert.equal(await review.read(), false);
assert.equal(calls, 1, "Busy read must not start another acquisition");
queue[0].resolve({ text: "forged external output" });
assert.equal(await first, true);
assert.equal(review.inspect().text, expected, "Scheduler result must not become display data");
const snapshot = review.inspect();
assert(Object.isFrozen(snapshot));
review.invalidate();
assert.equal(review.inspect().text, null);
assert.equal(review.inspect().status, "invalidated");
assert.equal(snapshot.text, expected, "Already copied snapshots cannot be revoked");

// A closed/reopened review must reject both successful and failed late completions.
for (const rejectOld of [false, true]) {
  const old = review.read(), oldGate = queue.at(-1);
  review.invalidate();
  const fresh = review.read(), freshGate = queue.at(-1);
  if (rejectOld) oldGate.reject(new Error("private-source-detail")); else oldGate.resolve();
  assert.equal(await old, false);
  assert.equal(review.inspect().status, "reading");
  assert.equal(review.inspect().text, null);
  freshGate.resolve();
  assert.equal(await fresh, true);
  assert.equal(review.inspect().text, expected);
}
const stale = review.read(), staleGate = queue.at(-1);
review.invalidate();
const replacement = review.read();
queue.at(-1).resolve();
assert.equal(await replacement, true);
const replacementSnapshot = review.inspect();
staleGate.reject(new Error("late failure after replacement completed"));
assert.equal(await stale, false);
assert.equal(review.inspect(), replacementSnapshot, "Late failure must not dispose or replace the newer result");
const failed = review.read();
assert.equal(review.inspect().text, null, "Refresh must clear old display synchronously");
queue.at(-1).reject(new Error("private-source-detail"));
assert.equal(await failed, false);
assert.equal(review.inspect().status, "unavailable");
assert.equal(review.inspect().text, null);
assert(!JSON.stringify(review.inspect()).includes("private-source-detail"));
const pending = review.read();
review.invalidate(); review.invalidate();
queue.at(-1).resolve();
assert.equal(await pending, false);
assert.equal(review.inspect().status, "invalidated");
for (const key of ["executionEnabled", "vehicleCommandEnabled", "wouldTransmit", "canExecute"]) assert.equal(review.inspect()[key], false);
const throwing = createMonitorPreviewReview(() => { throw new Error("private"); });
assert.equal(await throwing.read(), false);
assert.equal(throwing.inspect().status, "unavailable");
throwing.invalidate();
console.log("Monitor preview lifecycle: disposal, busy, refresh, invalidation, late success/failure and scheduler isolation passed");
