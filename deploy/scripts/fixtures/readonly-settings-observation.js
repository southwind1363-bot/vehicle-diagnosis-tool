// Development-only observations of normalized command responses. No transport, settings writes or persistence.
export function createReadOnlySettingsObservation() {
  const steps = ["ATZ", "ATE0", "ATL0", "ATS0", "ATH1", "ATSP0"];
  let current = null;
  const result = (ok, reason = null) => Object.freeze({ ok, reason });
  const matches = ticket => current !== null && current.ticket === ticket;
  const invalidate = () => { current = null; };
  const fail = reason => {
    current.phase = "rejected"; current.reason = reason;
    current.acknowledged = []; current.protocol = null;
    return result(false, reason);
  };
  return Object.freeze({
    begin() {
      invalidate();
      current = { ticket: Object.freeze({}), phase: "initializing", count: 0, acknowledged: [], protocol: null };
      return current.ticket;
    },
    recordInitialization(ticket, command, response) {
      if (!matches(ticket)) return result(false, "unknown_or_expired_settings_attempt");
      if (current.phase !== "initializing") return result(false, "settings_attempt_ended");
      if (command !== steps[current.count]) return fail("settings_command_order_mismatch");
      if (typeof response !== "string" || !response.length || response.length > 12000) return fail("settings_response_invalid");
      // A reset banner is not proof of defaults, identity, or successful hardware reset.
      if (command !== "ATZ") {
        // The first echo-off command may still echo. No broad search for an OK substring.
        if (response !== "OK" && !(command === "ATE0" && response === "ATE0\nOK")) return fail("settings_acknowledgement_unavailable");
        current.acknowledged.push(command);
      }
      current.count++;
      if (current.count === steps.length) current.phase = "awaiting_protocol";
      return result(true);
    },
    recordProtocol(ticket, response) {
      if (!matches(ticket)) return result(false, "unknown_or_expired_settings_attempt");
      if (current.phase !== "awaiting_protocol") return result(false, "settings_protocol_out_of_order");
      // Only one exact normalized ATDPN result; it is an adapter report, not verified bus configuration.
      if (typeof response !== "string" || !/^(?:A?[0-9A-C])$/.test(response)) return fail("settings_protocol_unavailable");
      current.protocol = response;
      current.phase = "observed";
      return result(true);
    },
    inspect(ticket) {
      if (!matches(ticket)) return Object.freeze({ ok: false, reason: "unknown_or_expired_settings_attempt", summary: null });
      if (current.phase === "rejected") return Object.freeze({ ok: false, reason: current.reason, summary: null });
      const protocol11bitReported = ["6", "8", "A6", "A8"].includes(current.protocol);
      const missing = ["can_auto_format", "dlc_display", "can_addressing"];
      if (current.count !== steps.length) missing.unshift("initialization_incomplete");
      if (!protocol11bitReported) missing.push(current.protocol === null ? "protocol_not_observed" : "supported_11bit_protocol_not_reported");
      const summary = Object.freeze({ phase: current.phase, provenance: "simulated_only",
        acknowledgedCommands: Object.freeze([...current.acknowledged]),
        protocolNumberReported: current.protocol, protocol11bitReported,
        spacesOffAcknowledged: current.acknowledged.includes("ATS0"),
        missingSettings: Object.freeze(missing), profile: null, profileVerified: false,
        evidence: "command_responses_only", rawRetained: false,
        realTransportProofAvailable: false, executionEnabled: false, vehicleCommandEnabled: false,
        wouldTransmit: false, canExecute: false });
      return Object.freeze({ ok: true, reason: null, summary });
    },
    invalidate
  });
}
