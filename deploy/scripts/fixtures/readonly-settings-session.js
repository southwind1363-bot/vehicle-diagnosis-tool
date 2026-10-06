// Non-communicating lifecycle model. The trusted context provider does not establish real transport provenance.
import { createReadOnlySettingsObservation } from "./readonly-settings-observation.js";

export function createReadOnlySettingsSession(readContext) {
  if (typeof readContext !== "function") throw new TypeError("invalid_settings_context_provider");
  const fields = ["port", "reader", "writer", "revision", "connected", "unlocked"];
  let current = null, generation = 0;
  const reject = reason => Object.freeze({ ok: false, reason, ticket: null, summary: null });
  const invalidate = () => {
    generation++;
    if (current) current.owner.invalidate();
    current = null;
  };
  const snapshot = () => {
    try {
      const input = readContext();
      if (!input || typeof input !== "object" || Array.isArray(input)) return null;
      const copy = {};
      for (const key of fields) {
        const descriptor = Object.getOwnPropertyDescriptor(input, key);
        if (!descriptor || !Object.hasOwn(descriptor, "value")) return null;
        copy[key] = descriptor.value;
      }
      if ([copy.port, copy.reader, copy.writer].some(value => !value || typeof value !== "object")
        || !Number.isSafeInteger(copy.revision) || copy.revision < 0 || copy.connected !== true || copy.unlocked !== true) return null;
      return Object.freeze(copy);
    } catch { return null; }
  };
  const withCurrent = (ticket, action) => {
    const record = current;
    if (!record || record.ticket !== ticket) return reject("unknown_or_expired_settings_session");
    const observed = snapshot();
    // The provider or descriptor traps may synchronously begin/invalidate another session.
    if (current !== record) return reject("unknown_or_expired_settings_session");
    if (!observed || fields.some(key => observed[key] !== record.context[key])) {
      invalidate();
      return reject("settings_context_changed");
    }
    return action(record);
  };
  return Object.freeze({
    begin() {
      invalidate();
      const started = generation, context = snapshot();
      if (generation !== started) return reject("settings_context_changed");
      if (!context) return reject("settings_context_unavailable");
      const owner = createReadOnlySettingsObservation(), ticket = Object.freeze({});
      current = { ticket, context, owner, observationTicket: owner.begin() };
      return Object.freeze({ ok: true, reason: null, ticket });
    },
    recordInitialization(ticket, command, response) {
      return withCurrent(ticket, record => record.owner.recordInitialization(record.observationTicket, command, response));
    },
    recordProtocol(ticket, response) {
      return withCurrent(ticket, record => record.owner.recordProtocol(record.observationTicket, response));
    },
    inspect(ticket) {
      return withCurrent(ticket, record => record.owner.inspect(record.observationTicket));
    },
    invalidate
  });
}
