// Non-executing development model. Never pass these observations as transport authorization.
export function createReadOnlySettingsPreparation() {
  const commands = Object.freeze(["ATCAF1", "ATD0", "ATCEA"]);
  let current = null;
  const result = (ok, reason = null, ticket = null) => Object.freeze({ ok, reason, ticket });
  const matches = ticket => current !== null && current.ticket === ticket;
  const fail = reason => {
    current.phase = "rejected"; current.reason = reason; current.accepted = [];
    return result(false, reason);
  };
  return Object.freeze({
    begin() {
      const ticket = Object.freeze({});
      current = { ticket, phase: "preparing", accepted: [], reason: null };
      return result(true, null, ticket);
    },
    record(ticket, command, completion, response) {
      if (!matches(ticket)) return result(false, "unknown_or_expired_preparation");
      if (current.phase !== "preparing") return result(false, "preparation_ended");
      if (command !== commands[current.accepted.length]) return fail("preparation_command_order_mismatch");
      if (completion !== "complete") return fail("preparation_response_incomplete");
      if (response !== "OK") return fail("preparation_acknowledgement_unavailable");
      current.accepted.push(command);
      if (current.accepted.length === commands.length) current.phase = "acknowledgements_observed";
      return result(true);
    },
    inspect(ticket) {
      if (!matches(ticket)) return Object.freeze({ ok: false, reason: "unknown_or_expired_preparation", summary: null });
      const summary = Object.freeze({ phase: current.phase, reason: current.reason,
        provenance: "simulated_only", acceptedCommands: Object.freeze([...current.accepted]),
        nextCommand: current.phase === "preparing" ? commands[current.accepted.length] : null,
        profile: null, profileVerified: false, rawRetained: false,
        executionEnabled: false, vehicleCommandEnabled: false, wouldTransmit: false, canExecute: false,
        realTransportProofAvailable: false, automaticRetryAllowed: false, restorationVerified: false });
      return Object.freeze({ ok: current.phase !== "rejected", reason: current.reason, summary });
    },
    invalidate() { current = null; }
  });
}
