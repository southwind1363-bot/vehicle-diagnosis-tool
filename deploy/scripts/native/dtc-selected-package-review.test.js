import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createJ2534DtcSelectionHandoff } from "../j2534-dtc-selection-handoff.js";
import { createDtcSelectedPackageReview } from "./dtc-selected-package-review.js";

test("existing one-use handoff feeds same-file review without exposing selection", { skip: process.platform !== "win32" }, () => {
  const root = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), "selected-review-")));
  fs.writeFileSync(path.join(root, "driver.dll"), "abc"); // Data only, never loaded.
  const descriptor = Object.freeze({});
  const selected = { selected_device_id: "j2534-0123456789abcdef", path: path.join(root, "driver.dll"),
    sha256: "BA7816BF8F01CFEA414140DE5DAE2223B00361A396177A9CB410FF61F20015AD", size: 3, architecture: "x64" };
  let valid = true, time = 0, reads = 0, expire = false;
  const handoff = createJ2534DtcSelectionHandoff({ now: () => time,
    resolveDescriptor: item => item === descriptor ? selected : null,
    revalidateDescriptor: () => { reads++; if (expire) time += 5000; return valid ? selected : null; } });
  const review = createDtcSelectedPackageReview({ handoff });
  const request = { request_ecu: 0x7e0, service: 3 };
  const metadata = { vendor: "Synthetic", version: "test", architecture: "x64", entry: "driver.dll",
    source_url: "https://example.invalid/package.zip" };
  const result = review.inspect(descriptor, request, root, metadata);
  assert.equal(result.selected_entry_matches, true);
  assert.equal(result.reason, "catalog_empty");
  assert.equal(result.execution_enabled, false);
  assert.equal(reads, 1);
  assert.ok(!JSON.stringify(result).includes(root));
  assert.ok(!JSON.stringify(result).includes(selected.selected_device_id));
  assert.equal(review.inspect({}, request, root, metadata).reason, "selection_unavailable");
  assert.equal(reads, 1);
  valid = false;
  assert.equal(review.inspect(descriptor, request, root, metadata).inventory_observed, false);
  valid = true; expire = true;
  assert.equal(review.inspect(descriptor, request, root, metadata).reason, "selection_unavailable");
  expire = false;
  fs.writeFileSync(selected.path, "abd");
  assert.equal(review.inspect(descriptor, request, root, metadata).reason, "selection_mismatch");
});

test("handoff failure never reaches folder inspection or leaks private errors", () => {
  const review = createDtcSelectedPackageReview({ handoff: {
    prepare() { throw new Error("private descriptor path"); }, consume() { throw new Error("unexpected"); }
  } });
  const result = review.inspect({}, {}, "not-a-folder", {});
  assert.equal(result.reason, "selection_unavailable");
  assert.equal(result.inventory_observed, false);
  assert.ok(!JSON.stringify(result).includes("private"));
});
