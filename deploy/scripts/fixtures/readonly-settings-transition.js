// Development-only orchestration of trusted local owners; no transport or sender.
import { createReadOnlySettingsPreparationSession } from "./readonly-settings-preparation-session.js";

export function createReadOnlySettingsTransition(readContext, invalidateReceipts, beginSettingsGeneration) {
  if (typeof invalidateReceipts !== "function" || typeof beginSettingsGeneration !== "function") {
    throw new TypeError("invalid_settings_transition_owners");
  }
  const preparation = createReadOnlySettingsPreparationSession(readContext);
  let generation = 0, current = null;
  const reject = reason => Object.freeze({ ok: false, reason, ticket: null, summary: null });
  const invalidate = () => { generation++; current = null; preparation.invalidate(); };
  return Object.freeze({
    begin() {
      invalidate();
      const started = generation;
      try {
        // Invalidate previous receipts before creating any new settings generation.
        // Only a synchronous, explicitly confirmed invalidation permits the next stage.
        const cleared = invalidateReceipts();
        if (generation !== started) return reject("settings_transition_replaced");
        if (cleared !== true) return reject("receipt_invalidation_unconfirmed");
        const rotated = beginSettingsGeneration();
        if (generation !== started) return reject("settings_transition_replaced");
        if (rotated !== true) return reject("settings_generation_unconfirmed");
        const begun = preparation.begin();
        if (generation !== started) return reject("settings_transition_replaced");
        if (!begun.ok) return begun;
        const ticket = Object.freeze({});
        current = { ticket, preparationTicket: begun.ticket };
        return Object.freeze({ ok: true, reason: null, ticket });
      } catch {
        if (generation !== started) return reject("settings_transition_replaced");
        preparation.invalidate();
        return reject("settings_transition_failed");
      }
    },
    record(ticket, command, completion, response) {
      const record = current;
      if (!record || record.ticket !== ticket) return reject("unknown_or_expired_transition");
      const result = preparation.record(record.preparationTicket, command, completion, response);
      return current === record ? result : reject("settings_transition_replaced");
    },
    inspect(ticket) {
      const record = current;
      if (!record || record.ticket !== ticket) return reject("unknown_or_expired_transition");
      const result = preparation.inspect(record.preparationTicket);
      return current === record ? result : reject("settings_transition_replaced");
    },
    invalidate
  });
}
