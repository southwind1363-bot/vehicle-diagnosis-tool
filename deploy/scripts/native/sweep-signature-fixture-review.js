import fs from "node:fs";
import path from "node:path";
import { createSignatureFixtureSupervisor } from "./signature-fixture-supervisor.js";
import { createSweepSelectionReview } from "./sweep-selection-review.js";
import { createSweepSignatureReviewOperation } from "./sweep-signature-review-operation.js";

// Generated unsigned fixtures only, using the existing pinned signature probe.
// This synthetic selection is NOT a live registry descriptor or a driver grant.
export function createSweepSignatureFixtureReview(signatureDescriptor) {
  try {
    const keys = ["root", "architecture", "worker_sha256", "fixture_sha256"];
    if (!signatureDescriptor || Object.keys(signatureDescriptor).length !== keys.length
      || !keys.every(key => Object.hasOwn(signatureDescriptor, key))) throw 0;
    const pin = Object.freeze(Object.fromEntries(keys.map(key => [key, signatureDescriptor[key]])));
    const observe = createSignatureFixtureSupervisor(pin);
    const entry = `unsigned-${pin.architecture}.dll`;
    const file = path.join(pin.root, entry);
    const selection = Object.freeze({ selected_device_id: "j2534-0123456789abcdef", path: file,
      sha256: pin.fixture_sha256, size: fs.statSync(file).size, architecture: pin.architecture });
    const descriptor = Object.freeze({});
    const resolve = candidate => candidate === descriptor ? selection : null;
    const review = createSweepSelectionReview({ resolveDescriptor: resolve, revalidateDescriptor: resolve,
      now: () => performance.now() });
    return createSweepSignatureReviewOperation({ review, observe, descriptor, root: pin.root,
      metadata: { vendor: "Synthetic", version: "test-1", architecture: pin.architecture,
        source_url: "https://example.invalid/unsigned.zip", entry } });
  } catch { throw new Error("sweep_signature_fixture_invalid"); }
}
