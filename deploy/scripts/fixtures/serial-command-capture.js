// Single-command integration component, not installed in the application's receive loop.
// Caller-owned operation/context and decoded text never prove device provenance.
export function createSerialCommandCapture({ readContext, readClock }) {
  if (typeof readContext !== "function" || typeof readClock !== "function") throw new TypeError("capture_dependencies_required");
  const fields = ["port", "reader", "writer", "settingsTicket", "revision", "connected", "unlocked"];
  let current = null, busy = false, generation = 0;
  const reject = reason => Object.freeze({ ok: false, reason, record: null });
  const accepted = () => Object.freeze({ ok: true, reason: null });
  const invalidate = () => {
    generation++;
    if (current) current.text = "";
    current = null;
  };
  const context = () => {
    const input = readContext(), copy = {};
    if (!input || typeof input !== "object" || Array.isArray(input)) throw Error();
    for (const field of fields) {
      const descriptor = Object.getOwnPropertyDescriptor(input, field);
      if (!descriptor || !Object.hasOwn(descriptor, "value")) throw Error();
      copy[field] = descriptor.value;
    }
    if ([copy.port, copy.reader, copy.writer, copy.settingsTicket].some(value => !value || typeof value !== "object")
      || !Number.isSafeInteger(copy.revision) || copy.revision < 0 || copy.connected !== true || copy.unlocked !== true) throw Error();
    return copy;
  };
  const clock = () => {
    const value = readClock();
    if (!Number.isFinite(value) || value < 0) throw Error();
    return value;
  };
  const validate = record => {
    const now = clock(), latest = context();
    if (current !== record || now < record.lastTime || fields.some(field => latest[field] !== record.context[field])) throw Error();
    record.lastTime = now;
    return now;
  };
  const run = (operation, action) => {
    if (busy) return reject("capture_busy");
    const record = current;
    if (!record || record.operation !== operation) return reject("capture_not_current");
    busy = true;
    try {
      const now = validate(record);
      return action(record, now);
    } catch {
      invalidate();
      return reject("capture_unavailable");
    } finally { busy = false; }
  };
  return Object.freeze({
    begin(operation, command) {
      if (busy || current) return reject("capture_busy");
      if (!operation || typeof operation !== "object" || !["03", "07", "0A", "0101"].includes(command)) return reject("capture_input_invalid");
      busy = true;
      const epoch = generation;
      try {
        const before = context(), startedAt = clock(), after = context();
        if (epoch !== generation || fields.some(field => before[field] !== after[field])) throw Error();
        current = { operation, command, context: after, startedAt, lastTime: startedAt, text: "", phase: "collecting" };
        return accepted();
      } catch { invalidate(); return reject("capture_unavailable"); }
      finally { busy = false; }
    },
    append(operation, chunk) {
      return run(operation, record => {
        if (record.phase !== "collecting") return reject("capture_ended");
        if (typeof chunk !== "string" || !chunk.length || record.text.length + chunk.length > 12000) {
          invalidate(); return reject("capture_input_invalid");
        }
        record.text += chunk;
        return accepted();
      });
    },
    finish(operation, completion) {
      return run(operation, (record, now) => {
        if (record.phase !== "collecting") return reject("capture_ended");
        if (completion !== "complete" || !record.text.length) {
          invalidate(); return reject("capture_incomplete");
        }
        record.phase = "finished";
        record.completedAt = now;
        return accepted();
      });
    },
    take(operation) {
      return run(operation, record => {
        if (record.phase !== "finished") return reject("capture_unfinished");
        const value = Object.freeze({ command: record.command, transcript: record.text,
          startedAt: record.startedAt, completedAt: record.completedAt,
          profile: null, profileVerified: false, realTransportProofAvailable: false, executionEnabled: false });
        invalidate();
        return Object.freeze({ ok: true, reason: null, record: value });
      });
    },
    invalidate
  });
}
