// Development-only connection lifetime model. No port access or settings inference.
import { createReadOnlyReceiptCapture } from "./readonly-receipt-capture.js";

export function createReadOnlyReceiptSession(readContext, api, profile) {
  if (typeof readContext !== "function") throw new TypeError("invalid_receipt_context_provider");
  if (typeof profile !== "string") throw new TypeError("explicit_receipt_profile_required");
  const capture = createReadOnlyReceiptCapture(api, profile);
  const fields = ["port", "reader", "writer", "settingsTicket", "revision", "connected", "unlocked"];
  let current = null, generation = 0;
  const reject = reason => Object.freeze({ ok: false, reason, ticket: null, summary: null });
  const invalidate = () => { generation++; current = null; capture.invalidate(); };
  const snapshot = () => {
    try {
      const input = readContext(), copy = {};
      if (!input || typeof input !== "object" || Array.isArray(input)) return null;
      for (const key of fields) {
        const descriptor = Object.getOwnPropertyDescriptor(input, key);
        if (!descriptor || !Object.hasOwn(descriptor, "value")) return null;
        copy[key] = descriptor.value;
      }
      if ([copy.port, copy.reader, copy.writer, copy.settingsTicket].some(value => !value || typeof value !== "object")
        || !Number.isSafeInteger(copy.revision) || copy.revision < 0 || copy.connected !== true || copy.unlocked !== true) return null;
      return copy;
    } catch { return null; }
  };
  const run = (attempt, command, action, needsCommand = false) => {
    const record = current;
    if (!record || record.ticket !== attempt || (needsCommand && (!record.command || record.command.ticket !== command))) {
      return reject("unknown_or_expired_receipt_session");
    }
    const context = snapshot();
    if (current !== record) return reject("unknown_or_expired_receipt_session");
    if (!context || fields.some(key => context[key] !== record.context[key])) {
      invalidate(); return reject("receipt_context_changed");
    }
    const result = action(record);
    if (current !== record) return reject("unknown_or_expired_receipt_session");
    const after = snapshot();
    if (current !== record) return reject("unknown_or_expired_receipt_session");
    if (!after || fields.some(key => after[key] !== record.context[key])) {
      invalidate(); return reject("receipt_context_changed");
    }
    return result;
  };
  return Object.freeze({
    begin() {
      invalidate();
      const started = generation, context = snapshot();
      if (generation !== started) return reject("receipt_context_changed");
      if (!context) return reject("receipt_context_unavailable");
      const ticket = Object.freeze({});
      current = { ticket, context, captureTicket: capture.begin(), command: null };
      return Object.freeze({ ok: true, reason: null, ticket });
    },
    startCommand(attempt, command, startedAt) {
      return run(attempt, undefined, record => {
        const result = capture.startCommand(record.captureTicket, command, profile, startedAt);
        if (!result.ok) return result;
        const ticket = Object.freeze({});
        record.command = { ticket, captureTicket: result.ticket };
        return Object.freeze({ ok: true, reason: null, ticket });
      });
    },
    append(attempt, commandTicket, chunk) {
      return run(attempt, commandTicket, record => capture.append(record.command.captureTicket, chunk), true);
    },
    endCommand(attempt, commandTicket, completedAt, completion) {
      return run(attempt, commandTicket, record => {
        const result = capture.endCommand(record.command.captureTicket, completedAt, completion);
        record.command = null;
        return result;
      }, true);
    },
    finish(attempt, completion) { return run(attempt, undefined, record => capture.finish(record.captureTicket, completion)); },
    inspect(attempt) { return run(attempt, undefined, record => capture.inspect(record.captureTicket)); },
    invalidate
  });
}
