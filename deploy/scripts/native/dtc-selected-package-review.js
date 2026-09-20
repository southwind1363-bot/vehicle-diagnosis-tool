import { createVendorFolderReview } from "./vendor-package-folder-review.js";
import { convertNativeSignatureResult, convertSupervisedSignatureResult } from "./native-signature-result.js";

// This stage reports why execution remains blocked; it has no approval branch.
// Even an observed Valid signature does not establish publisher/dependency trust.
const blocked = observation => {
  const blockers = [];
  if (observation.selected_entry_matches !== true) blockers.push("selected_entry_unverified");
  if (observation.status !== "metadata_match_only") blockers.push(observation.reason);
  const signature = observation.entry_signature;
  if (!signature || signature.observation_accepted !== true) blockers.push("signature_unverified");
  else if (signature.signature_status !== "Valid") blockers.push("signature_not_valid");
  blockers.push("publisher_unverified", "dependency_closure_unverified", "execution_not_authorized");
  return Object.freeze({ ...observation, execution_status: "blocked", execution_blockers: Object.freeze(blockers) });
};
const unavailable = () => blocked({ status: "unverified", reason: "selection_unavailable",
  inventory_observed: false, execution_enabled: false, publisher_verified: false,
  dependency_closure_verified: false });

// Internal composition only. Supply the registered DTC or Mode01 handoff from
// the trusted host; never a UI-provided selection or an imported descriptor.
// Consumes its expiring, one-use ticket BEFORE any folder inspection.
export function createDtcSelectedPackageReview({ handoff, catalog = [] }) {
  if (!handoff || typeof handoff.prepare !== "function" || typeof handoff.consume !== "function")
    throw new TypeError("selected_package_handoff_required");
  const prepare = handoff.prepare.bind(handoff), consume = handoff.consume.bind(handoff);
  const review = createVendorFolderReview(catalog);
  function inspect(descriptor, request, root, metadata, signatureInput, nativeCompletion) {
      try {
        const ticket = prepare(descriptor, request);
        if (!ticket) return unavailable();
        const selection = consume(ticket);
        if (!selection) return unavailable();
        const converted = nativeCompletion ? nativeCompletion(signatureInput, selection.sha256) : null;
        const signatureReport = nativeCompletion ? converted.signature_report : signatureInput;
        const observation = review.inspect(root, metadata, signatureReport, { path: selection.path,
          sha256: selection.sha256, size: selection.size, architecture: selection.architecture });
        return blocked({ ...observation, ...(converted ? { signature_completion_reason: converted.reason } : {}) });
      } catch { return unavailable(); }
  }
  return Object.freeze({
    inspect: (descriptor, request, root, metadata, report) => inspect(descriptor, request, root, metadata, report, false),
    // Trusted parent's spawnSync completion only, never serialized client JSON.
    inspectNativeCompletion: (descriptor, request, root, metadata, completion) =>
      inspect(descriptor, request, root, metadata, completion, convertNativeSignatureResult),
    inspectSupervisedCompletion: (descriptor, request, root, metadata, completion) =>
      inspect(descriptor, request, root, metadata, completion, convertSupervisedSignatureResult)
  });
}
