// Non-communicating development model. Caller declarations are never real transport evidence.
const commands = ["03", "07", "0A", "0101"];
const profile = "iso15765_11bit_normal_h1_caf1_d0_s1_e0";
const keys = ["command", "profile", "startedAt", "completedAt", "completion", "transcript"];

export function createReadOnlyReceiptOwner() {
  const registry = new WeakMap();
  let current = null;
  const reject = reason => Object.freeze({ ok: false, reason, summary: null });
  const find = ticket => ticket !== null && typeof ticket === "object" && ticket === current
    ? registry.get(ticket) : null;
  const snapshot = (record, status, reason) => Object.freeze({
    status, reason, provenance: "simulated_only", receiptCount: record.receipts.length,
    receiptStructureComplete: status === "finished",
    profileEvidence: "caller_declared_only", payloadSemanticsVerified: false,
    realTransportProofAvailable: false, sameVehicleVerified: false, clearBoundaryVerified: false,
    readoutCoverageComplete: false, comparisonAvailable: false, clearSucceededInferred: false,
    executionEnabled: false, vehicleCommandEnabled: false, wouldTransmit: false, canExecute: false
  });
  const terminate = (record, status, reason) => {
    record.summary = snapshot(record, status, reason);
    record.receipts.length = 0;
    record.phase = status;
    return status === "finished" ? Object.freeze({ ok: true, reason: null, summary: record.summary }) : reject(reason);
  };
  const invalidate = () => {
    const record = find(current);
    if (record) { record.receipts.length = 0; registry.delete(current); }
    current = null;
  };
  return Object.freeze({
    begin() {
      invalidate();
      current = Object.freeze({});
      registry.set(current, { phase: "collecting", receipts: [], summary: null });
      return current;
    },
    append(ticket, input) {
      const record = find(ticket);
      if (!record) return reject("unknown_or_expired_ticket");
      if (record.phase !== "collecting") return reject("attempt_ended");
      let failureReason = "invalid_receipt";
      const fail = reason => { failureReason = reason; throw null; };
      try {
        if (!input || typeof input !== "object" || Array.isArray(input)) fail("invalid_receipt");
        const ownKeys = Reflect.ownKeys(input);
        if (ownKeys.length !== keys.length) fail("invalid_receipt");
        const copy = {};
        for (const key of keys) {
          const descriptor = Object.getOwnPropertyDescriptor(input, key);
          if (!descriptor || !Object.hasOwn(descriptor, "value")) fail("invalid_receipt");
          copy[key] = descriptor.value;
        }
        if (record.receipts.length >= commands.length || copy.command !== commands[record.receipts.length]) fail("command_order_mismatch");
        if (copy.profile !== profile) fail("profile_unavailable");
        if (!Number.isSafeInteger(copy.startedAt) || !Number.isSafeInteger(copy.completedAt)
          || copy.startedAt < 0 || copy.completedAt < copy.startedAt
          || (record.receipts.length && copy.startedAt < record.receipts.at(-1).completedAt)) fail("invalid_timing");
        if (copy.completion !== "complete") fail("receipt_incomplete");
        if (typeof copy.transcript !== "string" || copy.transcript.length === 0 || copy.transcript.length > 32768) fail("transcript_limit");
        // No parsing or prompt repair. Structure completion is not a payload/zero-DTC claim.
        if (find(ticket) !== record) return reject("unknown_or_expired_ticket");
        if (record.phase !== "collecting") return reject("attempt_ended");
        record.receipts.push(Object.freeze(copy));
        return Object.freeze({ ok: true, reason: null, summary: null });
      } catch {
        // Reflection may reenter or throw arbitrary values. Never expose caller exceptions.
        if (find(ticket) !== record) return reject("unknown_or_expired_ticket");
        if (record.phase !== "collecting") return reject("attempt_ended");
        return terminate(record, "rejected", failureReason);
      }
    },
    finish(ticket, completion) {
      const record = find(ticket);
      if (!record) return reject("unknown_or_expired_ticket");
      if (record.phase !== "collecting") return reject("attempt_ended");
      if (completion !== "complete") return terminate(record, "rejected", "attempt_incomplete");
      if (record.receipts.length !== commands.length) return terminate(record, "rejected", "missing_receipt");
      return terminate(record, "finished", null);
    },
    inspect(ticket) {
      const record = find(ticket);
      if (!record) return reject("unknown_or_expired_ticket");
      return Object.freeze({ ok: true, reason: null, summary: record.summary || snapshot(record, "collecting", null) });
    },
    invalidate
  });
}
