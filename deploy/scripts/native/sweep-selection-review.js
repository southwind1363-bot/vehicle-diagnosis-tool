import { createJ2534SweepSelectionHandoff } from "../j2534-sweep-selection-handoff.js";
import { createVendorFolderReview } from "./vendor-package-folder-review.js";
import { convertSupervisedSignatureResult } from "./native-signature-result.js";

const denied = reason => Object.freeze({ status: "unverified", reason,
  execution_enabled: false, publisher_verified: false, dependency_closure_verified: false });
const sameSelection = (a, b) => b && ["selected_device_id", "path", "sha256", "size", "architecture", "request_ecu"]
  .every(key => a[key] === b[key]);

// Private development review only. No worker, loader, public route or saved data.
// Tickets are local capabilities; caller-supplied review results are never used.
export function createSweepSelectionReview(dependencies, catalog = []) {
  const handoff = createJ2534SweepSelectionHandoff(dependencies);
  return createSweepSelectionReviewFromHandoff({ handoff, now: dependencies.now,
    ttlMs: dependencies.ttlMs ?? 5000, catalog });
}

// Internal composition hook. Production composition supplies the host's private
// registered handoff; importing this helper does not grant registry authority.
export function createSweepSelectionReviewFromHandoff({ handoff, now, ttlMs = 5000, catalog = [] }) {
  if (!handoff || typeof handoff.prepare !== "function" || typeof handoff.consume !== "function"
    || typeof now !== "function" || !Number.isInteger(ttlMs) || ttlMs < 1 || ttlMs > 60000)
    throw new TypeError("sweep_review_dependencies_invalid");
  const prepare = handoff.prepare.bind(handoff), consume = handoff.consume.bind(handoff);
  const review = createVendorFolderReview(catalog);
  const tickets = new WeakMap();
  const ttl = ttlMs;
  function inspect(ticket, root, metadata, signatureInput, supervised) {
    try {
      const record = ticket && typeof ticket === "object" ? tickets.get(ticket) : null;
      if (!record) return denied("sweep_review_ticket_unavailable");
      tickets.delete(ticket); // Failure also consumes the outer capability.
      const startedAt = now();
      if (!Number.isFinite(startedAt) || startedAt < record.issuedAt || startedAt - record.issuedAt >= ttl)
        return denied("sweep_review_selection_unavailable");
      const { path, sha256, size, architecture } = record.selection;
      const converted = supervised ? convertSupervisedSignatureResult(signatureInput, sha256) : null;
      // Reject unconfirmed/failed workers before inspecting any folder. Never
      // fall back to the untrusted parsed report or a second execution attempt.
      if (supervised && converted.signature_report === null)
        return Object.freeze({ ...denied("sweep_review_signature_unavailable"),
          signature_completion_reason: converted.reason });
      const signatureReport = supervised ? converted.signature_report : signatureInput;
      const observed = review.inspect(root, metadata, signatureReport, { path, sha256, size, architecture });
      const current = consume(record.inner);
      const finishedAt = now();
      if (!sameSelection(record.selection, current) || !Number.isFinite(finishedAt)
        || finishedAt < startedAt || finishedAt - record.issuedAt >= ttl)
        return denied("sweep_review_selection_unavailable");
      if (observed.selected_entry_matches !== true) return denied("sweep_review_inventory_unavailable");
      // Observation only: do not return private identity, path/hash or requests.
      return Object.freeze({ ...observed, selection_bound: true,
        ...(supervised ? { signature_completion_reason: converted.reason } : {}),
        execution_enabled: false, publisher_verified: false, dependency_closure_verified: false });
    } catch { return denied("sweep_review_unavailable"); }
  }
  return Object.freeze({
    prepare(descriptor, request) {
      try {
        const issuedAt = now();
        if (!Number.isFinite(issuedAt)) return null;
        const selection = consume(prepare(descriptor, request));
        if (!selection) return null;
        const inner = prepare(descriptor, { request_ecu: selection.request_ecu,
          services: selection.services, pids: selection.pids });
        if (!inner) return null;
        const ticket = Object.freeze({});
        tickets.set(ticket, { selection, inner, issuedAt });
        return ticket;
      } catch { return null; }
    },
    inspect: (ticket, root, metadata, report) => inspect(ticket, root, metadata, report, false),
    // Trusted bounded parent's in-memory completion only, not public/imported JSON.
    inspectSupervisedCompletion: (ticket, root, metadata, completion) =>
      inspect(ticket, root, metadata, completion, true)
  });
}
