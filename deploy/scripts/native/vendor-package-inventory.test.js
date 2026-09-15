import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { collectVendorPackageInventory } from "./vendor-package-inventory.js";
import { createVendorPackageReview } from "./vendor-package-review.js";

function fixture(run) {
  const root = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), "vendor-inventory-")));
  try { run(root); } finally { fs.rmSync(root, { recursive: true }); }
}
const metadata = files => ({ vendor: "Synthetic", version: "test-1", architecture: "x64",
  source_url: "https://example.invalid/package.zip", entry: "driver.dll", files });
const expected = [{ name: "driver.dll", size: 3,
  sha256: "BA7816BF8F01CFEA414140DE5DAE2223B00361A396177A9CB410FF61F20015AD" }];

test("synthetic bytes are hashed and passed through review without execution", () => fixture(root => {
  fs.writeFileSync(path.join(root, "driver.dll"), "abc"); // Text only; never executable code.
  const files = collectVendorPackageInventory(root);
  assert.deepEqual(files, expected);
  assert.ok(Object.isFrozen(files) && Object.isFrozen(files[0]));
  const review = createVendorPackageReview([metadata(expected)]);
  assert.equal(review.compare(metadata(files)).status, "metadata_match_only");
  assert.equal(review.compare(metadata(files)).execution_enabled, false);
  fs.mkdirSync(path.join(root, "lib"));
  fs.writeFileSync(path.join(root, "lib", "helper.dll"), "abc");
  assert.equal(review.compare(metadata(collectVendorPackageInventory(root))).status, "unverified");
  fs.writeFileSync(path.join(root, "driver.dll"), "abd");
  assert.notEqual(collectVendorPackageInventory(root)[0].sha256, expected[0].sha256);
}));
test("empty, missing and relative roots never yield partial inventories", () => fixture(root => {
  for (const target of [root, path.join(root, "missing"), ".", "", null, path.parse(root).root]) {
    assert.throws(() => collectVendorPackageInventory(target), /^Error: vendor_inventory_unverified$/);
  }
}));
test("empty files and hard links are rejected", () => fixture(root => {
  const file = path.join(root, "driver.dll");
  fs.writeFileSync(file, "");
  assert.throws(() => collectVendorPackageInventory(root), /vendor_inventory_unverified/);
  fs.writeFileSync(file, "abc");
  fs.linkSync(file, path.join(root, "alias.dll"));
  assert.throws(() => collectVendorPackageInventory(root), /vendor_inventory_unverified/);
}));
test("directory junctions cannot supply an inventory", () => fixture(root => {
  fs.mkdirSync(path.join(root, "actual"));
  fs.writeFileSync(path.join(root, "actual", "driver.dll"), "abc");
  fs.symlinkSync(path.join(root, "actual"), path.join(root, "alias"), process.platform === "win32" ? "junction" : "dir");
  assert.throws(() => collectVendorPackageInventory(root), /vendor_inventory_unverified/);
}));
test("entry count limit fails the whole observation", () => fixture(root => {
  for (let i = 0; i < 513; i++) fs.writeFileSync(path.join(root, `f${i}.dll`), "abc");
  assert.throws(() => collectVendorPackageInventory(root), /vendor_inventory_unverified/);
}));
