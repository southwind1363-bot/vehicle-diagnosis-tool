import assert from "node:assert/strict";
import { createMonitorPairPreview, createMonitorPairPreviewSession } from "./preview-dtc-clear-monitor-pairs.js";
import { createMonitorPreviewReview } from "./fixtures/monitor-preview-review.js";
import { createSimulatedReviewController } from "./fixtures/monitor-preview-controller.js";

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
// Notifications remove stale presentation synchronously, without polling inspect().
const observed = createMonitorPreviewReview();
let displayed = null;
const states = [];
const stop = observed.subscribe(value => { displayed = value.text; states.push(value.status); });
assert.equal(await observed.read(), true);
assert.equal(displayed, expected);
observed.invalidate();
assert.equal(displayed, null);
assert.deepEqual(states, ["reading", "ready", "invalidated"]);
stop(); stop();
await observed.read();
assert.equal(states.length, 3, "Unsubscribed views must not receive later results");
observed.invalidate();

// An earlier observer can close the view before a later observer receives ready.
const reentrant = createMonitorPreviewReview();
const laterStates = [];
let nestedRead;
reentrant.subscribe(value => {
  if (value.status === "ready") { reentrant.invalidate(); nestedRead = reentrant.read(); }
});
reentrant.subscribe(value => laterStates.push(value.status));
assert.equal(await reentrant.read(), false);
assert.equal(await nestedRead, false, "Observer callbacks must not start recursive acquisitions");
assert.deepEqual(laterStates, ["reading", "invalidated"]);

let scheduled = 0;
const closedOnStart = createMonitorPreviewReview(() => { scheduled++; });
closedOnStart.subscribe(value => { if (value.status === "reading") closedOnStart.invalidate(); });
assert.equal(await closedOnStart.read(), false);
assert.equal(scheduled, 0, "Closed view must not acquire after reading notification");

const broken = createMonitorPreviewReview();
const survivingStates = [];
broken.subscribe(() => { throw new Error("private observer detail"); });
broken.subscribe(value => survivingStates.push(value.status));
assert.equal(await broken.read(), false);
assert.deepEqual(survivingStates, ["unavailable"]);
assert.equal(broken.inspect().text, null);
assert(!JSON.stringify(broken.inspect()).includes("private observer"));
assert.equal(await broken.read(), true, "Failed observer must be removed");
broken.invalidate();

const independent = createMonitorPreviewReview();
let received = 0;
const listener = () => { received++; };
const stopFirst = independent.subscribe(listener);
const stopSecond = independent.subscribe(listener);
stopFirst();
independent.invalidate();
assert.equal(received, 1);
stopSecond();
const removal = createMonitorPreviewReview();
let removedCalls = 0;
let removeLater;
removal.subscribe(() => removeLater());
removeLater = removal.subscribe(() => { removedCalls++; });
await removal.read();
assert.equal(removedCalls, 0, "Observer removed during delivery must not receive a queued snapshot");
removal.invalidate();
const failedReady = createMonitorPreviewReview();
let lastText;
failedReady.subscribe(value => { if (value.status === "ready") throw new Error("private-render-failure"); });
failedReady.subscribe(value => { lastText = value.text; });
assert.equal(await failedReady.read(), false);
assert.equal(lastText, null);
assert.equal(failedReady.inspect().status, "unavailable");
failedReady.invalidate();
// Invalidation inside a trusted factory/inspection must not resurrect ready text
// or overwrite a newer session. Include property access when copying the result.
for (const phase of ["factory", "inspect", "text"]) {
  for (const replace of [false, true]) {
    let controller, newer, calls = 0, scheduled = 0;
    const disposed = [], statuses = [];
    const cancel = () => { controller.invalidate(); if (replace) newer = controller.read(); };
    controller = createSimulatedReviewController(() => {
      const id = ++calls;
      const session = {
        inspect() {
          if (id === 1 && phase === "inspect") cancel();
          return { ok: true, get text() {
            if (id === 1 && phase === "text") cancel();
            return id === 1 ? "stale" : "fresh";
          } };
        },
        dispose() { disposed.push(id); }
      };
      if (id === 1 && phase === "factory") cancel();
      return session;
    }, () => { scheduled++; });
    controller.subscribe(value => statuses.push([value.status, value.text]));
    assert.equal(await controller.read(), false, `${phase}/${replace}`);
    if (replace) {
      assert.equal(await newer, true);
      assert.equal(controller.inspect().text, "fresh");
      assert.equal(calls, 2);
    } else {
      assert.equal(controller.inspect().status, "invalidated");
      assert.equal(controller.inspect().text, null);
    }
    assert(!statuses.some(([, text]) => text === "stale"));
    assert.deepEqual(disposed, [1], "Old cleanup must not dispose the replacement");
    assert.equal(scheduled, (phase === "factory" ? 0 : 1) + Number(replace));
    controller.invalidate();
    assert.deepEqual(disposed, replace ? [1, 2] : [1]);
  }
}
for (const trigger of ["invalidate", "refresh", "scheduler", "observer"]) {
  let controller, calls = 0, nested, disposals = 0;
  const seen = [];
  controller = createSimulatedReviewController(() => {
    const id = ++calls;
    return {
      inspect() { return { ok: true, text: id === 1 ? "old" : "fresh" }; },
      dispose() {
        disposals++;
        if (id !== 1) return;
        controller.invalidate();
        nested = controller.read();
        throw new Error("private_cleanup_detail");
      }
    };
  }, () => { if (trigger === "scheduler" && calls === 1) throw new Error("private_wait_detail"); });
  if (trigger === "observer") controller.subscribe(value => {
    if (value.status === "ready" && calls === 1) throw new Error("private_view_detail");
  });
  controller.subscribe(value => seen.push(value));
  assert.equal(await controller.read(), !["scheduler", "observer"].includes(trigger));
  if (trigger === "invalidate") controller.invalidate();
  if (trigger === "refresh") assert.equal(await controller.read(), false);
  assert.equal(await nested, false, "Cleanup must not recursively acquire");
  assert.equal(controller.inspect().status, "unavailable");
  assert.equal(controller.inspect().text, null);
  assert.equal(disposals, 1, "Detach before disposing to prevent recursive cleanup");
  assert.equal(calls, 1, "No automatic retry after failed cleanup");
  assert.equal(seen.at(-1).text, null);
  assert(!JSON.stringify(seen).includes("private_"));
  assert.equal(await controller.read(), true, "A later explicit read uses a fresh session");
  assert.equal(controller.inspect().text, "fresh");
  controller.invalidate();
  assert.equal(disposals, 2);
}
for (const reason of ["receipt_incomplete", "receipt_clock_unavailable", "receipt_context_changed", "semantic_observation_unavailable", "raw_validation_failed", "private_error", "constructor", null]) {
  let fail = true;
  const controller = createSimulatedReviewController(() => ({
    inspect() { return fail ? { ok: false, reason, text: "private_partial_result" } : { ok: true, text: "fresh" }; },
    dispose() {}
  }));
  assert.equal(await controller.read(), false);
  assert.equal(controller.inspect().failureReason, ["receipt_incomplete", "receipt_clock_unavailable", "receipt_context_changed", "semantic_observation_unavailable", "raw_validation_failed"].includes(reason) ? reason : null);
  assert.equal(controller.inspect().text, null);
  assert(!JSON.stringify(controller.inspect()).includes("private"));
  controller.invalidate();
  assert.equal(controller.inspect().failureReason, null);
  fail = false;
  assert.equal(await controller.read(), true);
  assert.equal(controller.inspect().failureReason, null);
}
console.log("Monitor preview lifecycle: callback invalidation, cleanup failure/reentry, bounded failure reasons, late completions and notifications passed");
