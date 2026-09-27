import { createJ2534RegisteredSweepSelectionHandoff } from "../../local-bridge-readonly.js";
import { createSweepSignatureFixtureSource } from "./sweep-signature-fixture-review.js";
import { createSweepSelectionReviewFromHandoff } from "./sweep-selection-review.js";
import { createSweepSignatureReviewOperation } from "./sweep-signature-review-operation.js";

// Private, generated-fixture-only composition. Selection confirms independent
// build facts; it can never replace the probe's path, hash or architecture.
export function createRegisteredSweepSignatureFixtureReview({ signatureDescriptor, descriptor }) {
  const fixture = createSweepSignatureFixtureSource(signatureDescriptor);
  const handoff = createJ2534RegisteredSweepSelectionHandoff();
  const prepare = handoff.prepare.bind(handoff), consume = handoff.consume.bind(handoff);
  const selected = fixture.selection;
  const pinnedHandoff = Object.freeze({ prepare,
    consume(ticket) {
      const value = consume(ticket);
      if (!value || !["path", "sha256", "size", "architecture"].every(key =>
        value[key] === (key === "sha256" ? selected[key].toUpperCase() : selected[key]))
        || value.request_ecu !== 0x7e0) return null;
      return value;
    }
  });
  const review = createSweepSelectionReviewFromHandoff({ handoff: pinnedHandoff, now: () => performance.now() });
  return createSweepSignatureReviewOperation({ review, observe: fixture.observe, descriptor,
    root: fixture.root, metadata: fixture.metadata });
}
