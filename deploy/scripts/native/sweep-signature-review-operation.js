const blocked = reason => Object.freeze({ status: "unverified", reason,
  execution_enabled: false, publisher_verified: false, dependency_closure_verified: false });

// Internal parent composition, never a public input or worker authenticator.
// The fixture factory owns these dependencies; only the result escapes.
export function createSweepSignatureReviewOperation({ review, observe, descriptor, root, metadata }) {
  if (!review || typeof review.prepare !== "function" || typeof review.inspectSupervisedCompletion !== "function"
    || typeof observe !== "function") throw new TypeError("sweep_signature_dependencies_invalid");
  const prepare = review.prepare.bind(review), inspect = review.inspectSupervisedCompletion.bind(review);
  const declared = Object.freeze({ ...metadata });
  const request = Object.freeze({ request_ecu: 0x7e0,
    services: Object.freeze([3, 7, 10]), pids: Object.freeze([0, 5, 12]) });
  let attempted = false;
  return Object.freeze(async function run(...args) {
    if (attempted) return blocked("sweep_signature_already_attempted");
    attempted = true; // Includes concurrent calls, invalid arguments and failure.
    if (args.length) return blocked("sweep_signature_arguments_invalid");
    try {
      const ticket = prepare(descriptor, request);
      if (!ticket) return blocked("sweep_signature_selection_unavailable");
      const completion = await observe();
      return inspect(ticket, root, declared, completion);
    } catch { return blocked("sweep_signature_review_failed"); }
  });
}
