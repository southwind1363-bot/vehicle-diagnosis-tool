import { createJ2534RegisteredMode01SelectionHandoff } from "../../local-bridge-readonly.js";
import { createDtcSelectedPackageReview } from "./dtc-selected-package-review.js";

// Development-only, non-executing composition. Obtain the private handoff from
// the host, not from imported/UI metadata. The shared review always blocks
// execution, including when metadata and an observed signature match.
export function createRegisteredMode01PackageReview({ catalog = [] } = {}) {
  return createDtcSelectedPackageReview({ handoff: createJ2534RegisteredMode01SelectionHandoff(), catalog });
}
