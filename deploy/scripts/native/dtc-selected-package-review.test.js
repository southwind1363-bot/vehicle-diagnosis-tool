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
  assert.equal(result.execution_status, "blocked");
  assert.ok(result.execution_blockers.includes("catalog_empty"));
  assert.ok(result.execution_blockers.includes("signature_unverified"));
  assert.ok(!JSON.stringify(result).includes(root));
  assert.ok(!JSON.stringify(result).includes(selected.selected_device_id));
  assert.equal(review.inspect({}, request, root, metadata).reason, "selection_unavailable");
  assert.equal(reads, 1);
  const matchedReview = createDtcSelectedPackageReview({ handoff, catalog: [{ ...metadata,
    files: [{ name: "driver.dll", size: 3, sha256: selected.sha256 }] }] });
  for (const status of ["Valid", "NotSigned", "NotTrusted"]) {
    const report = JSON.stringify({ observation_status: "observed_only", signature_status: status,
      signature_type: status === "NotSigned" ? "None" : "Authenticode",
      signer_certificate_sha256: status === "NotSigned" ? null : "A".repeat(64),
      file_sha256: selected.sha256, publisher_verified: false, dependency_closure_verified: false, execution_enabled: false });
    const checked = matchedReview.inspect(descriptor, request, root, metadata, report);
    assert.equal(checked.entry_signature.signature_status, status);
    assert.equal(checked.execution_status, "blocked");
    assert.equal(checked.execution_enabled, false);
    assert.deepEqual(checked.execution_blockers, [...(status === "Valid" ? [] : ["signature_not_valid"]),
      "publisher_unverified", "dependency_closure_unverified", "execution_not_authorized"]);
    assert.ok(Object.isFrozen(checked.execution_blockers));
  }
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
  assert.ok(result.execution_blockers.includes("selection_unavailable"));
  assert.ok(!JSON.stringify(result).includes("private"));
});
