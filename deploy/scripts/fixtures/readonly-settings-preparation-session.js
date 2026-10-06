// Non-executing preparation lifetime model. Context identities are caller-owned observations.
import { createReadOnlySettingsPreparation } from "./readonly-settings-preparation.js";

export function createReadOnlySettingsPreparationSession(readContext) {
  if (typeof readContext !== "function") throw new TypeError("invalid_preparation_context_provider");
  const owner = createReadOnlySettingsPreparation();
  const fields = ["port", "reader", "writer", "settingsTicket", "revision", "connected", "unlocked"];
  let current = null, generation = 0;
  const reject = reason => Object.freeze({ ok: false, reason, ticket: null, summary: null });
  const invalidate = () => { generation++; current = null; owner.invalidate(); };
  const snapshot = () => {
    try {
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
    } catch { return null; }
  };
  const run = (ticket, action) => {
    const record = current;
    if (!record || record.ticket !== ticket) return reject("unknown_or_expired_preparation_session");
    const context = snapshot();
    if (current !== record) return reject("unknown_or_expired_preparation_session");
    if (!context || fields.some(key => context[key] !== record.context[key])) {
      invalidate(); return reject("preparation_context_changed");
    }
    // The private owner only compares primitives; it calls no external code.
    return action(record.ownerTicket);
  };
  return Object.freeze({
    begin() {
      invalidate();
      const started = generation, context = snapshot();
      if (generation !== started) return reject("preparation_context_changed");
      if (!context) return reject("preparation_context_unavailable");
      const ticket = Object.freeze({});
      current = { ticket, context, ownerTicket: owner.begin().ticket };
      return Object.freeze({ ok: true, reason: null, ticket });
    },
    record(ticket, command, completion, response) {
      return run(ticket, ownerTicket => owner.record(ownerTicket, command, completion, response));
    },
    recordProtocol(ticket, command, completion, response) {
      return run(ticket, ownerTicket => owner.recordProtocol(ownerTicket, command, completion, response));
    },
    inspect(ticket) { return run(ticket, ownerTicket => owner.inspect(ownerTicket)); },
    invalidate
  });
}
