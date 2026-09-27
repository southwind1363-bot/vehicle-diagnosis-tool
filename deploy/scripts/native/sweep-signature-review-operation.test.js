import assert from "node:assert/strict";
import test from "node:test";
import { createSweepSignatureReviewOperation } from "./sweep-signature-review-operation.js";
import { createSweepSignatureFixtureReview } from "./sweep-signature-fixture-review.js";

test("operation owns completion and ticket, snapshots metadata, and refuses concurrent/repeated calls", async () => {
  let finish, observed = 0, inspected = 0;
  const ticket = Object.freeze({}), descriptor = {}, completion = {};
  const result = Object.freeze({ execution_enabled: false });
  const metadata = { entry: "unsigned-x64.dll" };
  const review = { prepare(d, request) {
    assert.equal(d, descriptor);
    assert.deepEqual(request, { request_ecu: 0x7e0, services: [3, 7, 10], pids: [0, 5, 12] });
    assert.ok(Object.isFrozen(request.services)); return ticket;
  }, inspectSupervisedCompletion(t, root, declared, value) {
    inspected++; assert.equal(t, ticket); assert.equal(root, "fixture");
    assert.equal(declared.entry, "unsigned-x64.dll"); assert.equal(value, completion); return result;
  } };
  const run = createSweepSignatureReviewOperation({ review, descriptor, root: "fixture", metadata,
    observe() { observed++; return new Promise(resolve => { finish = resolve; }); } });
  metadata.entry = "changed"; review.prepare = () => assert.fail("Replaced method");
  const pending = run();
  assert.equal((await run()).reason, "sweep_signature_already_attempted");
  assert.equal(inspected, 0); finish(completion);
  assert.equal(await pending, result);
  assert.equal((await run()).reason, "sweep_signature_already_attempted");
  assert.equal(observed, 1); assert.equal(inspected, 1);
});

test("unavailable selection and exceptions never retry or expose private details", async () => {
  for (const stage of ["missing", "prepare", "observe", "inspect", "arguments"]) {
    let starts = 0, inspections = 0;
    const run = createSweepSignatureReviewOperation({ descriptor: {}, root: "private", metadata: {},
      review: { prepare() {
        if (stage === "prepare") throw new Error("private");
        return stage === "missing" ? null : {};
      }, inspectSupervisedCompletion() { inspections++; throw new Error("private"); } },
      async observe() { starts++; if (stage === "observe") throw new Error("private"); return {}; } });
    const value = stage === "arguments" ? await run({ parsed_result: {} }) : await run();
    assert.equal(value.status, "unverified"); assert.equal(value.execution_enabled, false);
    assert.ok(!JSON.stringify(value).includes("private")); assert.ok(Object.isFrozen(value));
    assert.equal((await run()).reason, "sweep_signature_already_attempted");
    assert.equal(starts, ["observe", "inspect"].includes(stage) ? 1 : 0);
    assert.equal(inspections, stage === "inspect" ? 1 : 0);
  }
});

test("fixture factory rejects callback injection and arbitrary targets before execution", () => {
  for (const descriptor of [null, {}, { root: "C:\\private", architecture: "x64", worker_sha256: "a".repeat(64),
    fixture_sha256: "b".repeat(64), observe() { assert.fail("Injected observer"); } }]) {
    assert.throws(() => createSweepSignatureFixtureReview(descriptor), /^Error: sweep_signature_fixture_invalid$/);
  }
});
