import assert from "node:assert/strict";
import nodeTest from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createSweepSelectionReview } from "./sweep-selection-review.js";

const test = (name, run) => nodeTest(name, { skip: process.platform !== "win32" }, run);

function fixture(run) {
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
    run({ root, file, metadata, descriptor, original, state, dependencies, catalog, request, report });
  } finally { fs.unlinkSync(file); fs.rmdirSync(root); }
}

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
