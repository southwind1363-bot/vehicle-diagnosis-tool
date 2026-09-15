import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { createSignatureObservationWorker } from "./signature-observation-worker.js";

const digest = "A".repeat(64);
const report = JSON.stringify({ observation_status: "observed_only", wintrust_status: "0x800B0100",
  file_sha256: digest, signer_certificate_sha256: null, scope: "embedded_file", cache_only: true,
  publisher_verified: false, dependency_closure_verified: false, execution_enabled: false });
function setup() {
  const child = new EventEmitter();
  Object.assign(child, { stdout: new PassThrough(), stderr: new PassThrough(),
    pid: 123, exitCode: null, signalCode: null, kill: () => true });
  let spawns = 0;
  const observe = createSignatureObservationWorker({ expectedFileSha256: digest,
    spawnWorker: () => { spawns++; return child; } });
  return { child, observe, count: () => spawns };
}
test("signature output remains pending until successful close; instance runs once", async () => {
  const { child, observe, count } = setup();
  let resolved = false;
  const pending = observe().then(value => { resolved = true; return value; });
  child.emit("spawn"); child.stdout.write(report);
  child.emit("exit", 0, null);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(resolved, false);
  assert.equal((await observe()).parsed_result, null);
  child.emit("close", 0, null);
  const value = await pending;
  assert.equal(value.execution_status, "worker_completed");
  assert.equal(JSON.parse(value.parsed_result.signature_report).signature_status, "NotSigned");
  assert.equal(value.parsed_result.execution_enabled, false);
  assert.equal((await observe()).errors[0], "signature_worker_already_attempted");
  assert.equal(count(), 1);
});
test("failure, stderr, excessive output and wrong-file reports cannot become observations", async () => {
  for (const kind of ["exit", "stderr", "limit", "hash", "malformed"]) {
    const { child, observe } = setup();
    const pending = observe(); child.emit("spawn");
    child.stdout.write(kind === "limit" ? "x".repeat(4097) : kind === "hash"
      ? report.replace(digest, "B".repeat(64)) : kind === "malformed" ? "{" : report);
    if (kind === "stderr") child.stderr.write("private failure");
    child.emit("close", kind === "exit" ? 1 : 0, null);
    const value = await pending;
    assert.equal(value.parsed_result, null);
    assert.notEqual(value.execution_status, "worker_completed");
    assert.ok(!JSON.stringify(value).includes("private failure"));
  }
});
test("spawn failure consumes the one attempt and exposes no exception detail", async () => {
  let calls = 0;
  const observe = createSignatureObservationWorker({ expectedFileSha256: digest,
    spawnWorker: () => { calls++; throw new Error("private path"); } });
  assert.equal((await observe()).errors[0], "worker_spawn_failed");
  assert.equal((await observe()).errors[0], "signature_worker_already_attempted");
  assert.equal(calls, 1);
  assert.throws(() => createSignatureObservationWorker({ spawnWorker() {}, expectedFileSha256: "bad" }), TypeError);
});
test("unconfirmed termination discards early JSON and late close cannot revive it", async () => {
  const { child, observe, count } = setup();
  child.kill = () => false; // Artificial events only, no real unkillable process.
  const pending = observe(); child.emit("spawn"); child.stdout.write(report);
  const value = await pending;
  assert.equal(value.errors[0], "worker_termination_unconfirmed");
  assert.equal(value.worker_exited, false);
  assert.equal(value.parsed_result, null);
  assert.equal(value.termination_requested, true);
  assert.equal(value.termination_signal_sent, false);
  child.emit("close", 0, null);
  assert.equal(value.worker_exited, false);
  assert.equal(value.parsed_result, null);
  assert.equal((await observe()).errors[0], "signature_worker_already_attempted");
  assert.equal(count(), 1);
});
