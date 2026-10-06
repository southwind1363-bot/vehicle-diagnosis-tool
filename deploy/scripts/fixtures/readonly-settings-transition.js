// Development-only orchestration of trusted local owners; no transport or sender.
import { createReadOnlySettingsPreparationSession } from "./readonly-settings-preparation-session.js";

export function createReadOnlySettingsTransition(readContext, invalidateReceipts, beginSettingsGeneration) {
  if (typeof readContext !== "function" || typeof invalidateReceipts !== "function" || typeof beginSettingsGeneration !== "function") {
    throw new TypeError("invalid_settings_transition_owners");
  }
  const fields = ["port", "reader", "writer", "revision", "connected", "unlocked", "settingsTicket"];
  let generation = 0, current = null, expectedContext = null;
  const snapshot = () => {
    const value = readContext(), copy = {};
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    for (const key of fields) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || !Object.hasOwn(descriptor, "value")) return null;
      copy[key] = descriptor.value;
    }
    if ([copy.port, copy.reader, copy.writer, copy.settingsTicket].some(value => !value || typeof value !== "object")
      || !Number.isSafeInteger(copy.revision) || copy.revision < 0 || copy.connected !== true || copy.unlocked !== true) return null;
    return copy;
  };
  const preparation = createReadOnlySettingsPreparationSession(() => {
    const value = snapshot();
    return expectedContext && value && fields.every(key => value[key] === expectedContext[key]) ? value : null;
  });
  const reject = reason => Object.freeze({ ok: false, reason, ticket: null, summary: null });
  const invalidate = () => { generation++; current = null; expectedContext = null; preparation.invalidate(); };
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
        const before = snapshot();
        if (generation !== started) return reject("settings_transition_replaced");
        if (!before) return reject("settings_context_unavailable");
        const rotated = beginSettingsGeneration();
        if (generation !== started) return reject("settings_transition_replaced");
        if (rotated !== true) return reject("settings_generation_unconfirmed");
        const after = snapshot();
        if (generation !== started) return reject("settings_transition_replaced");
        if (!after || fields.some(key => key !== "settingsTicket" && after[key] !== before[key])) return reject("settings_context_changed");
        if (after.settingsTicket === before.settingsTicket) return reject("settings_generation_unchanged");
        expectedContext = after;
        const begun = preparation.begin();
        if (generation !== started) return reject("settings_transition_replaced");
        if (!begun.ok) { expectedContext = null; return begun; }
        const ticket = Object.freeze({});
        current = { ticket, preparationTicket: begun.ticket };
        return Object.freeze({ ok: true, reason: null, ticket });
      } catch {
        if (generation !== started) return reject("settings_transition_replaced");
        expectedContext = null;
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
    recordProtocol(ticket, command, completion, response) {
      const record = current;
      if (!record || record.ticket !== ticket) return reject("unknown_or_expired_transition");
      const result = preparation.recordProtocol(record.preparationTicket, command, completion, response);
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
