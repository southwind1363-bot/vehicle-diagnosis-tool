// Development-only composition of a timed receipt owner and a trusted synthetic reader.
// No built-in transport, retry, persistence or vehicle authorization.
import { createTimedReadOnlyReceiptSession } from "./readonly-timed-receipt-session.js";

export function createReadOnlyReceiptRun(readContext, api, profile, readClock, readCommand) {
  if (typeof readCommand !== "function") throw new TypeError("explicit_receipt_reader_required");
  const receipts = createTimedReadOnlyReceiptSession(readContext, api, profile, readClock);
  const commands = ["03", "07", "0A", "0101"];
  let active = null, running = false;
  const snapshot = (record, ok, reason = null, summary = null) => Object.freeze({ ok, reason,
    completedCommandCount: record?.completed || 0, summary, provenance: "simulated_only", executionEnabled: false });
  const stop = (record, reason) => {
    record.reason ||= reason;
    receipts.invalidate();
    return snapshot(record, false, record.reason);
  };
  return Object.freeze({
    cancel() {
      if (!active || !running) return false;
      stop(active, "readout_cancelled");
      return true;
    },
    async run() {
      if (running) return snapshot(active, false, "readout_busy");
      running = true;
      const record = { completed: 0, reason: null };
      active = record;
      try {
        const started = receipts.begin();
        if (!started.ok || record.reason) return stop(record, started.reason || "readout_cancelled");
        const attempt = started.ticket;
        for (const command of commands) {
          if (record.reason) return stop(record, record.reason);
          const entry = receipts.startCommand(attempt, command);
          if (!entry.ok || record.reason) return stop(record, entry.reason || "readout_cancelled");
          let accepting = true, completion;
          try {
            completion = await readCommand(command, chunk => {
              if (!accepting || !running || active !== record || record.reason) return false;
              const result = receipts.append(attempt, entry.ticket, chunk);
              if (!result.ok) stop(record, result.reason);
              return result.ok;
            });
          } catch { return stop(record, "readout_failed"); }
          finally { accepting = false; }
          if (record.reason) return stop(record, record.reason);
          const ended = receipts.endCommand(attempt, entry.ticket, completion);
          if (!ended.ok || record.reason) return stop(record, ended.reason || "readout_cancelled");
          record.completed++;
        }
        const result = receipts.finish(attempt, "complete");
        if (!result.ok || record.reason) return stop(record, result.reason || "readout_cancelled");
        return snapshot(record, true, null, result.summary);
      } catch { return stop(record, "readout_failed"); }
      finally {
        receipts.invalidate();
        active = null;
        running = false;
      }
    }
  });
}
