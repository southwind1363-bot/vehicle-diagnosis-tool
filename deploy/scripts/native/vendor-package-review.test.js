import assert from "node:assert/strict";
import test from "node:test";
import { createVendorPackageReview } from "./vendor-package-review.js";

const fixture = () => ({ vendor: "Synthetic vendor", version: "test-1", architecture: "x64",
  source_url: "https://example.invalid/fixture.zip", entry: "driver.dll", files: [
    { name: "driver.dll", size: 64, sha256: "a".repeat(64) },
    { name: "lib/helper.dll", size: 32, sha256: "b".repeat(64) }
  ] });
const denied = result => {
  assert.equal(result.status, "unverified");
  assert.equal(result.execution_enabled, false);
};
test("empty catalog never admits a candidate", () => {
  denied(createVendorPackageReview().compare(fixture()));
});
test("full inventory comparison is order independent and never grants authority", () => {
  const source = fixture();
  const review = createVendorPackageReview([source]);
  source.files[0].sha256 = "c".repeat(64);
  const observed = fixture();
  observed.files.reverse();
  observed.files[0].name = "LIB/HELPER.DLL";
  const result = review.compare(observed);
  assert.deepEqual(result, { status: "metadata_match_only", execution_enabled: false,
    publisher_verified: false, dependency_closure_verified: false });
  assert.ok(Object.isFrozen(result));
  denied(review.compare(source));
});
test("changed, missing and additional metadata cannot match", () => {
  const review = createVendorPackageReview([fixture()]);
  for (const mutate of [
    c => c.files.pop(), c => c.files.push({ name: "extra.dll", size: 1, sha256: "c".repeat(64) }),
    c => c.files[1].sha256 = "c".repeat(64), c => c.files[1].size++,
    c => c.vendor = "Other", c => c.version = "test-2", c => c.architecture = "x86",
    c => c.entry = "lib/helper.dll", c => c.source_url = "https://example.invalid/other.zip",
    c => c.execution_enabled = true
  ]) { const candidate = fixture(); mutate(candidate); denied(review.compare(candidate)); }
});
test("unsafe and ambiguous inventories are rejected", () => {
  for (const name of ["../driver.dll", "/driver.dll", "C:/driver.dll", "lib\\driver.dll",
    "driver.dll:stream", "driver.dll.", "CON.dll", "lib//helper.dll", "lib/./helper.dll", "driver.dll "]) {
    const candidate = fixture(); candidate.files[0].name = name; candidate.entry = name;
    assert.throws(() => createVendorPackageReview([candidate]), /vendor_review_catalog_invalid/);
    denied(createVendorPackageReview().compare(candidate));
  }
  const duplicate = fixture(); duplicate.files.push({ ...duplicate.files[0], name: "DRIVER.DLL" });
  assert.throws(() => createVendorPackageReview([duplicate]), /vendor_review_catalog_invalid/);
});
test("invalid sources and throwing inputs fail closed", () => {
  const review = createVendorPackageReview([fixture()]);
  for (const source_url of ["http://example.invalid/file", "https://user:secret@example.invalid/file",
    "https://example.invalid/file?token=secret", "https://example.invalid/file#hash", "bad"]) {
    const candidate = { ...fixture(), source_url };
    assert.throws(() => createVendorPackageReview([candidate]), /vendor_review_catalog_invalid/);
    denied(review.compare(candidate));
  }
  for (const candidate of [null, [], {}, new Proxy({}, { ownKeys() { throw new Error("private"); } })]) {
    denied(review.compare(candidate));
  }
  const sparse = Array(2);
  assert.throws(() => createVendorPackageReview(sparse), /vendor_review_catalog_invalid/);
});
