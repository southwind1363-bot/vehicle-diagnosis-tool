// Development-only sequence of trusted synthetic responses. No transport or sender.
import { createReadOnlySettingsTransition } from "./readonly-settings-transition.js";

export function createReadOnlySettingsPreparationRun(readContext, invalidateReceipts, beginSettingsGeneration, readResponse) {
  if (typeof readResponse !== "function") throw new TypeError("explicit_settings_response_reader_required");
  const transition = createReadOnlySettingsTransition(readContext, invalidateReceipts, beginSettingsGeneration);
  let active = null;
  const snapshot = (record, ok, reason = null, summary = null) => Object.freeze({
    ok, reason, completedResponseCount: record?.completed || 0, summary,
    provenance: "simulated_only", executionEnabled: false, vehicleCommandEnabled: false, wouldTransmit: false
  });
  const stop = (record, reason) => {
    record.reason ||= reason;
    transition.invalidate();
    return snapshot(record, false, record.reason);
  };
  return Object.freeze({
    cancel() {
      if (!active) return false;
      stop(active, "settings_preparation_cancelled");
      return true;
    },
    async run() {
      if (active) return snapshot(active, false, "settings_preparation_busy");
      const record = { completed: 0, reason: null };
      active = record;
      try {
        const started = transition.begin();
        if (!started.ok || record.reason) return stop(record, started.reason || record.reason);
        const ticket = started.ticket;
        for (const command of ["ATCAF1", "ATD0", "ATCEA", "ATDPN"]) {
          if (record.reason) return stop(record, record.reason);
          const before = transition.inspect(ticket);
          if (!before.ok || record.reason) return stop(record, before.reason || record.reason);
          const response = await readResponse(command);
          if (record.reason) return stop(record, record.reason);
          const accepted = command === "ATDPN"
            ? transition.recordProtocol(ticket, command, response.completion, response.response)
            : transition.record(ticket, command, response.completion, response.response);
          if (!accepted.ok || record.reason) return stop(record, accepted.reason || record.reason);
          record.completed++;
        }
        const result = transition.inspect(ticket);
        if (!result.ok || record.reason) return stop(record, result.reason || record.reason);
        return snapshot(record, true, null, result.summary);
      } catch { return stop(record, "settings_preparation_failed"); }
      finally { transition.invalidate(); active = null; }
    }
  });
}
