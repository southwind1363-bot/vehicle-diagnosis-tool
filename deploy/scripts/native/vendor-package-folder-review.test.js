import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { createVendorFolderReview, runVendorFolderReview } from "./vendor-package-folder-review.js";

const metadata = { vendor: "Synthetic", version: "test-1", architecture: "x64",
  source_url: "https://example.invalid/package.zip", entry: "driver.dll" };
const catalog = [{ ...metadata, files: [{ name: "driver.dll", size: 3,
  sha256: "BA7816BF8F01CFEA414140DE5DAE2223B00361A396177A9CB410FF61F20015AD" }] }];
function fixture(run) {
  const root = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), "vendor-review-")));
  try { fs.writeFileSync(path.join(root, "driver.dll"), "abc"); run(root); }
  finally { fs.rmSync(root, { recursive: true }); }
}
test("folder evidence is used instead of caller-supplied hashes", () => fixture(root => {
  const review = createVendorFolderReview(catalog);
  const observed = review.inspect(root, metadata);
  assert.equal(observed.status, "metadata_match_only");
  assert.equal(observed.reason, "metadata_match_only");
  assert.equal(observed.file_count, 1);
  assert.equal(observed.total_bytes, 3);
  assert.equal(observed.execution_enabled, false);
  assert.equal(observed.publisher_verified, false);
  assert.equal(observed.dependency_closure_verified, false);
  assert.ok(Object.isFrozen(observed));
  assert.equal(review.inspect(root, catalog[0]).inventory_observed, false);
  fs.writeFileSync(path.join(root, "driver.dll"), "abd");
  assert.equal(review.inspect(root, metadata).status, "unverified");
  assert.equal(review.inspect(root, metadata).reason, "metadata_mismatch");
}));
test("default review stays unverified and omits filenames and paths", () => fixture(root => {
  const result = createVendorFolderReview().inspect(root, metadata);
  assert.equal(result.inventory_observed, true);
  assert.equal(result.status, "unverified");
  assert.equal(result.reason, "catalog_empty");
  for (const secret of [root, "driver.dll", "example.invalid", "BA7816"]) {
    assert.ok(!JSON.stringify(result).includes(secret));
  }
  assert.equal(createVendorFolderReview().inspect(root, { ...metadata, entry: "../driver.dll" }).inventory_observed, false);
}));
test("CLI accepts only one exact target and does not signal approval", () => fixture(root => {
  const args = [root, metadata.vendor, metadata.version, metadata.architecture, metadata.source_url, metadata.entry];
  const cli = fileURLToPath(new URL("./vendor-package-folder-review.js", import.meta.url));
  const run = extra => spawnSync(process.execPath, [cli, ...args, ...extra], { encoding: "utf8", timeout: 10000, windowsHide: true });
  const good = run([]);
  assert.equal(good.status, 0);
  assert.equal(good.stderr, "");
  assert.equal(JSON.parse(good.stdout).status, "unverified");
  assert.equal(JSON.parse(good.stdout).execution_enabled, false);
  assert.equal(JSON.parse(good.stdout).reason, "catalog_empty");
  for (const extra of [["other-folder"], [""]]) {
    const bad = run(extra);
    assert.equal(bad.status, 1);
    assert.equal(JSON.parse(bad.stdout).inventory_observed, false);
    assert.equal(JSON.parse(bad.stdout).reason, "invalid_arguments");
    assert.equal(bad.stderr, "");
  }
  assert.equal(runVendorFolderReview([]).inventory_observed, false);
  assert.equal(runVendorFolderReview([root, "Synthetic", "1", "x64", "bad", "driver.dll"]).inventory_observed, false);
}));

test("failure reasons distinguish declaration from inventory without leaking inputs", () => fixture(root => {
  const review = createVendorFolderReview();
  const original = fs.opendirSync;
  let enumerations = 0;
  fs.opendirSync = (...args) => { enumerations++; return original(...args); };
  try {
    const invalid = review.inspect(root, { ...metadata, source_url: "secret-invalid-url" });
    assert.equal(invalid.reason, "invalid_metadata");
    assert.equal(enumerations, 0, "Invalid declarations must not enumerate the folder");
    const missing = review.inspect(path.join(root, "missing"), metadata);
    assert.equal(missing.reason, "inventory_unavailable");
    for (const result of [invalid, missing]) {
      assert.equal(result.inventory_observed, false);
      assert.equal(result.execution_enabled, false);
      assert.ok(Object.isFrozen(result));
      for (const secret of [root, "secret-invalid-url", "ENOENT", "driver.dll"]) {
        assert.ok(!JSON.stringify(result).includes(secret));
      }
    }
    const observed = review.inspect(root, metadata);
    assert.equal(observed.reason, "catalog_empty");
    assert.equal(observed.inventory_observed, true);
  } finally { fs.opendirSync = original; }
}));

test("catalog emptiness follows the copied catalog, not later caller mutation", () => fixture(root => {
  const mutable = [];
  const review = createVendorFolderReview(mutable);
  mutable.push(catalog[0]);
  assert.equal(review.inspect(root, metadata).reason, "catalog_empty");
}));

test("entry signature report binds to actual inventory bytes, never to claimed hashes", () => fixture(root => {
  const report = { observation_status: "observed_only", signature_status: "Valid",
    signature_type: "Authenticode", signer_certificate_sha256: "A".repeat(64),
    file_sha256: catalog[0].files[0].sha256, publisher_verified: false,
    dependency_closure_verified: false, execution_enabled: false };
  const review = createVendorFolderReview(catalog);
  const inspect = change => review.inspect(root, metadata, JSON.stringify({ ...report, ...change }));
  const good = inspect({});
  assert.equal(good.status, "metadata_match_only");
  assert.equal(good.entry_signature.observation_accepted, true);
  assert.ok(Object.isFrozen(good.entry_signature));
  for (const result of [good, inspect({ file_sha256: "0".repeat(64) }), inspect({ execution_enabled: true })]) {
    assert.equal(result.publisher_verified, false);
    assert.equal(result.execution_enabled, false);
    assert.equal(result.entry_signature.publisher_verified, false);
    assert.equal(result.entry_signature.execution_enabled, false);
    assert.ok(!JSON.stringify(result).includes(root));
  }
  assert.equal(inspect({ file_sha256: "0".repeat(64) }).entry_signature.reason, "file_mismatch");
  assert.equal(inspect({ execution_enabled: true }).entry_signature.observation_accepted, false);
  assert.equal(inspect({ signature_status: "NotTrusted" }).entry_signature.signature_status, "NotTrusted");
  assert.equal(createVendorFolderReview().inspect(root, metadata, JSON.stringify(report)).status, "unverified");
  fs.writeFileSync(path.join(root, "driver.dll"), "abd");
  const changed = inspect({});
  assert.equal(changed.status, "unverified");
  assert.equal(changed.entry_signature.reason, "file_mismatch");
  assert.equal(Object.hasOwn(review.inspect(root, metadata), "entry_signature"), false);
}));
