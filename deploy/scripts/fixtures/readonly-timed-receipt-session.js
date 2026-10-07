// Development-only timing adapter. A trusted clock returns integer monotonic milliseconds.
// These are local interval observations, never UTC timestamps or proof of vehicle I/O.
import { createReadOnlyReceiptSession } from "./readonly-receipt-session.js";

export function createTimedReadOnlyReceiptSession(readContext, api, profile, readClock) {
  if (typeof readClock !== "function") throw new TypeError("explicit_receipt_clock_required");
  const session = createReadOnlyReceiptSession(readContext, api, profile);
  let current = null, busy = false, generation = 0;
  const reject = reason => Object.freeze({ ok: false, reason, ticket: null, summary: null });
  const invalidate = () => { generation++; current = null; session.invalidate(); };
  const run = (ticket, action, commandTicket, needsCommand = false) => {
    if (busy) return reject("receipt_timing_busy");
    const record = current;
    if (!record || record.ticket !== ticket || (needsCommand && (!record.command || record.command !== commandTicket))) {
      return reject("unknown_or_expired_timed_receipt");
    }
    busy = true;
    try {
      const result = action(record);
      if (current !== record) return reject("unknown_or_expired_timed_receipt");
      if (!result.ok) invalidate();
      return result;
    } catch {
      if (current === record) invalidate();
      return reject("receipt_clock_unavailable");
    } finally { busy = false; }
  };
  const stamp = record => {
    const value = readClock();
    if (current !== record || !Number.isSafeInteger(value) || value < 0 || value < record.lastTime) throw null;
    record.lastTime = value;
    return value;
  };
  return Object.freeze({
    begin() {
      if (busy) return reject("receipt_timing_busy");
      busy = true;
      try {
        invalidate();
        const started = generation;
        const result = session.begin();
        if (generation !== started) return reject("unknown_or_expired_timed_receipt");
        if (result.ok) current = { ticket: result.ticket, command: null, lastTime: -1, finished: false };
        return result;
      } finally { busy = false; }
    },
    startCommand(ticket, command) {
      if (current && current.ticket === ticket && (current.command || current.finished)) return reject("timed_receipt_not_idle");
      return run(ticket, record => {
        const result = session.startCommand(ticket, command, stamp(record));
        if (result.ok) record.command = result.ticket;
        return result;
      });
    },
    append(ticket, commandTicket, chunk) {
      return run(ticket, () => session.append(ticket, commandTicket, chunk), commandTicket, true);
    },
    endCommand(ticket, commandTicket, completion) {
      return run(ticket, record => {
        const result = session.endCommand(ticket, commandTicket, stamp(record), completion);
        record.command = null;
        return result;
      }, commandTicket, true);
    },
    finish(ticket, completion) {
      return run(ticket, record => {
        const result = session.finish(ticket, completion);
        if (result.ok) record.finished = true;
        return result;
      });
    },
    inspect(ticket) { return run(ticket, () => session.inspect(ticket)); },
    invalidate
  });
}
