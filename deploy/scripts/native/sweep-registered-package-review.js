import { createJ2534RegisteredSweepSelectionHandoff } from "../../local-bridge-readonly.js";
import { createSweepSelectionReviewFromHandoff } from "./sweep-selection-review.js";

// Development-only observation. The private host resolves and revalidates the
// descriptor. Callers cannot replace its handoff, clock or lifetime via options.
// The catalog is empty by default; even a match never permits execution.
export function createRegisteredSweepPackageReview({ catalog = [] } = {}) {
  return createSweepSelectionReviewFromHandoff({
    handoff: createJ2534RegisteredSweepSelectionHandoff(),
    now: () => performance.now(), ttlMs: 5000, catalog
  });
}
