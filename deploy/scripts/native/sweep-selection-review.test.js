import assert from "node:assert/strict";
import nodeTest from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { createSweepSelectionReview } from "./sweep-selection-review.js";
import { createSignatureObservationWorker } from "./signature-observation-worker.js";

const test = (name, run) => nodeTest(name, { skip: process.platform !== "win32" }, run);

async function fixture(run) {
  const root = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), "sweep-review-")));
  const file = path.join(root, "driver.dll");
  try {
    fs.writeFileSync(file, "abc"); // Inert bytes, never a loaded library.
    const sha256 = "BA7816BF8F01CFEA414140DE5DAE2223B00361A396177A9CB410FF61F20015AD";
    const metadata = { vendor: "Synthetic", version: "1", architecture: "x64",
      source_url: "https://example.invalid/package.zip", entry: "driver.dll" };
    const descriptor = Object.freeze({});
    const original = { selected_device_id: "j2534-0123456789abcdef", path: file,
      sha256, size: 3, architecture: "x64" };
    const state = { time: 100, current: original, validate: () => state.current };
    const dependencies = { now: () => state.time, resolveDescriptor: d => d === descriptor ? state.current : null,
      revalidateDescriptor: () => state.validate() };
    const catalog = [{ ...metadata, files: [{ name: "driver.dll", size: 3, sha256 }] }];
    const request = { request_ecu: 0x7e7, services: [3, 7, 10], pids: [0, 5, 12] };
    const report = JSON.stringify({ observation_status: "observed_only", signature_status: "Valid",
      signature_type: "Authenticode", signer_certificate_sha256: "A".repeat(64), file_sha256: sha256,
      publisher_verified: false, dependency_closure_verified: false, execution_enabled: false });
    await run({ root, file, metadata, descriptor, original, state, dependencies, catalog, request, report });
  } finally { fs.unlinkSync(file); fs.rmdirSync(root); }
}

const completed = report => ({ execution_status: "worker_completed", worker_started: true, worker_exited: true,
  termination_requested: false, termination_signal_sent: false, errors: [], parsed_result: {
    reason: "observation_only", signature_report: report, execution_enabled: false,
    publisher_verified: false, dependency_closure_verified: false } });

test("supervised sweep observations retain valid/unsigned meanings and never permit execution", () => fixture(f => {
  const review = createSweepSelectionReview(f.dependencies, f.catalog);
  for (const status of ["Valid", "NotSigned"]) {
    const report = JSON.parse(f.report);
    if (status === "NotSigned") Object.assign(report, { signature_status: status,
      signature_type: "None", signer_certificate_sha256: null });
    const ticket = review.prepare(f.descriptor, f.request);
    const result = review.inspectSupervisedCompletion(ticket, f.root, f.metadata, completed(JSON.stringify(report)));
    assert.equal(result.selection_bound, true);
    assert.equal(result.signature_completion_reason, "observation_only");
    assert.equal(result.entry_signature.signature_status, status);
    for (const key of ["execution_enabled", "publisher_verified", "dependency_closure_verified"])
      assert.equal(result[key], false);
    assert.ok(!JSON.stringify(result).includes(f.root));
    assert.equal(review.inspect(ticket, f.root, f.metadata, f.report).reason, "sweep_review_ticket_unavailable");
  }
}));

test("failed supervised completion consumes ticket before any folder access; raw report cannot rescue it", () => fixture(f => {
  const review = createSweepSelectionReview(f.dependencies, f.catalog);
  const good = completed(f.report);
  const variants = [null, f.report, ...[
    { worker_started: false }, { worker_exited: false }, { execution_status: "worker_timed_out" },
    { termination_requested: true }, { termination_signal_sent: true }, { errors: [f.root] },
    { parsed_result: null }, { parsed_result: { ...good.parsed_result, execution_enabled: true } },
    { parsed_result: { ...good.parsed_result, signature_report: f.report.replace(f.original.sha256, "C".repeat(64)) } }
  ].map(changes => ({ ...good, ...changes }))];
  const opendir = fs.opendirSync;
  let reads = 0;
  fs.opendirSync = () => { reads++; throw new Error("Unexpected folder read"); };
  try {
    for (const completion of variants) {
      const ticket = review.prepare(f.descriptor, f.request);
      const result = review.inspectSupervisedCompletion(ticket, f.root, f.metadata, completion);
      assert.equal(result.reason, "sweep_review_signature_unavailable");
      assert.equal(Object.hasOwn(result, "entry_signature"), false);
      assert.equal(result.execution_enabled, false);
      assert.ok(!JSON.stringify(result).includes(f.root));
      assert.equal(review.inspect(ticket, f.root, f.metadata, f.report).reason, "sweep_review_ticket_unavailable");
    }
    assert.equal(reads, 0);
  } finally { fs.opendirSync = opendir; }
}));

test("real supervisor with artificial process events joins sweep review only after close", () => fixture(async f => {
  const child = Object.assign(new EventEmitter(), { stdout: new PassThrough(), stderr: new PassThrough(),
    pid: 123, exitCode: null, signalCode: null, kill: () => true });
  let starts = 0, settled = false;
  const observe = createSignatureObservationWorker({ expectedFileSha256: f.original.sha256,
    spawnWorker: () => { starts++; return child; } });
  const review = createSweepSelectionReview(f.dependencies, f.catalog);
  const ticket = review.prepare(f.descriptor, f.request);
  const pending = observe().then(value => { settled = true; return value; });
  child.emit("spawn");
  child.stdout.write(JSON.stringify({ observation_status: "observed_only", wintrust_status: "0x800B0100",
    file_sha256: f.original.sha256, signer_certificate_sha256: null, scope: "embedded_file", cache_only: true,
    publisher_verified: false, dependency_closure_verified: false, execution_enabled: false }));
  child.emit("exit", 0, null);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(settled, false);
  child.emit("close", 0, null);
  const completion = await pending;
  const result = review.inspectSupervisedCompletion(ticket, f.root, f.metadata, completion);
  assert.equal(result.entry_signature.signature_status, "NotSigned");
  assert.equal(result.execution_enabled, false);
  for (const mutation of [() => { f.state.time += 5000; },
    () => { f.state.current = { ...f.original, sha256: "B".repeat(64) }; },
    () => fs.writeFileSync(f.file, "abd")]) {
    f.state.time = 100; f.state.current = f.original; fs.writeFileSync(f.file, "abc");
    const next = review.prepare(f.descriptor, f.request); mutation();
    const refused = review.inspectSupervisedCompletion(next, f.root, f.metadata, completion);
    assert.equal(refused.status, "unverified");
    assert.equal(Object.hasOwn(refused, "entry_signature"), false);
  }
  assert.equal(starts, 1);
}));

test("general sweep review binds private selection and inventory without granting permission", () => fixture(f => {
  const review = createSweepSelectionReview(f.dependencies, f.catalog);
  const ticket = review.prepare(f.descriptor, f.request);
  assert.ok(Object.isFrozen(ticket));
  const result = review.inspect(ticket, f.root, f.metadata, f.report);
  assert.equal(result.selection_bound, true);
  assert.equal(result.status, "metadata_match_only");
  assert.equal(result.entry_signature.observation_accepted, true);
  for (const key of ["execution_enabled", "publisher_verified", "dependency_closure_verified"])
    assert.equal(result[key], false);
  for (const privateValue of [f.root, f.original.sha256, f.original.selected_device_id])
    assert.ok(!JSON.stringify(result).includes(privateValue));
  assert.ok(Object.isFrozen(result));
  assert.equal(review.inspect(ticket, f.root, f.metadata).reason, "sweep_review_ticket_unavailable");
}));

test("empty catalog and absent signature remain unverified", () => fixture(f => {
  const review = createSweepSelectionReview(f.dependencies);
  const result = review.inspect(review.prepare(f.descriptor, f.request), f.root, f.metadata);
  assert.equal(result.selection_bound, true);
  assert.equal(result.reason, "catalog_empty");
  assert.equal(result.status, "unverified");
  assert.equal(result.execution_enabled, false);
  assert.equal(Object.hasOwn(result, "entry_signature"), false);
}));

test("foreign, copied, expired tickets and unsupported requests are rejected", () => fixture(f => {
  const review = createSweepSelectionReview(f.dependencies);
  const other = createSweepSelectionReview(f.dependencies);
  const ticket = review.prepare(f.descriptor, f.request);
  for (const invalid of [{}, JSON.parse(JSON.stringify(ticket)), null, other.prepare(f.descriptor, f.request)])
    assert.equal(review.inspect(invalid, f.root, f.metadata).reason, "sweep_review_ticket_unavailable");
  assert.equal(review.prepare({}, f.request), null);
  assert.equal(review.prepare(f.descriptor, { ...f.request, services: [4] }), null);
  f.state.time += 5000;
  assert.equal(review.inspect(ticket, f.root, f.metadata).reason, "sweep_review_selection_unavailable");
}));

test("selection changes during review, clock rollback, expiry and resolver exceptions discard evidence", () => fixture(f => {
  const mutations = Object.keys(f.original).map(key => () => ({ ...f.original,
    [key]: key === "size" ? 4 : key === "architecture" ? "x86" : "changed" }));
  mutations.push(() => { f.state.time += 5000; return f.original; },
    () => { f.state.time--; return f.original; }, () => { throw new Error(f.root); });
  for (const change of mutations) {
    f.state.time = 100; f.state.validate = () => f.original;
    const review = createSweepSelectionReview(f.dependencies, f.catalog);
    const ticket = review.prepare(f.descriptor, f.request);
    f.state.validate = change;
    const result = review.inspect(ticket, f.root, f.metadata, f.report);
    assert.equal(result.reason, "sweep_review_selection_unavailable");
    assert.equal(Object.hasOwn(result, "entry_signature"), false);
    assert.equal(result.execution_enabled, false);
    assert.ok(!JSON.stringify(result).includes(f.root));
    assert.equal(review.inspect(ticket, f.root, f.metadata).reason, "sweep_review_ticket_unavailable");
  }
}));

test("same-size file changes and mismatched folder metadata cannot bind a selection", () => fixture(f => {
  const review = createSweepSelectionReview(f.dependencies, f.catalog);
  const ticket = review.prepare(f.descriptor, f.request);
  fs.writeFileSync(f.file, "abd");
  assert.equal(review.inspect(ticket, f.root, f.metadata, f.report).reason, "sweep_review_inventory_unavailable");
  fs.writeFileSync(f.file, "abc");
  assert.equal(review.inspect(review.prepare(f.descriptor, f.request), f.root,
    { ...f.metadata, architecture: "x86" }, f.report).reason, "sweep_review_inventory_unavailable");
}));
