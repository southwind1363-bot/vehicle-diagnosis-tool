// Non-communicating capture model. Strings are already decoded; no port, clock or settings are inferred.
import { createReadOnlyReceiptOwner } from "./readonly-receipt-owner.js";

export function createReadOnlyReceiptCapture(api, selectedProfile = "iso15765_11bit_normal_h1_caf1_d0_s1_e0") {
  const owner = createReadOnlyReceiptOwner(api, selectedProfile);
  let current = null;
  const result = (ok, reason = null, ticket = null) => Object.freeze({ ok, reason, ticket });
  const isCurrent = ticket => current !== null && current.ticket === ticket;
  const clearCommand = record => {
    if (record.command) record.command.text = "";
    record.command = null;
  };
  const invalidate = () => {
    if (current) clearCommand(current);
    current = null;
    owner.invalidate();
  };
  const fail = reason => {
    const record = current;
    clearCommand(record);
    record.phase = "rejected";
    record.reason = reason;
    owner.invalidate();
    return result(false, reason);
  };
  const commandCurrent = ticket => current?.phase === "collecting" && current.command?.ticket === ticket;
  return Object.freeze({
    begin() {
      invalidate();
      current = { ticket: Object.freeze({}), ownerTicket: owner.begin(), phase: "collecting", command: null, count: 0 };
      return current.ticket;
    },
    startCommand(attempt, command, profile, startedAt) {
      if (!isCurrent(attempt)) return result(false, "unknown_or_expired_attempt");
      if (current.phase !== "collecting") return result(false, "attempt_ended");
      if (current.command) return result(false, "command_busy");
      if (command !== ["03", "07", "0A", "0101"][current.count] || current.count >= 4) return fail("command_order_mismatch");
      if (profile !== selectedProfile) return fail("profile_unavailable");
      if (!Number.isSafeInteger(startedAt) || startedAt < 0) return fail("invalid_timing");
      const ticket = Object.freeze({});
      current.command = { ticket, command, profile, startedAt, text: "" };
      return result(true, null, ticket);
    },
    append(commandTicket, chunk) {
      if (!commandCurrent(commandTicket)) return result(false, "unknown_or_expired_command");
      if (typeof chunk !== "string" || chunk.length === 0) return fail("invalid_chunk");
      if (current.command.text.length + chunk.length > 32768) return fail("transcript_limit");
      // Preserve CR/LF/prompt exactly. No trimming, prompt insertion or truncation.
      current.command.text += chunk;
      return result(true);
    },
    endCommand(commandTicket, completedAt, completion) {
      if (!commandCurrent(commandTicket)) return result(false, "unknown_or_expired_command");
      const command = current.command;
      const appended = owner.append(current.ownerTicket, { command: command.command, profile: command.profile,
        startedAt: command.startedAt, completedAt, completion, transcript: command.text });
      clearCommand(current);
      if (!appended.ok) return fail(appended.reason);
      current.count++;
      return result(true);
    },
    finish(attempt, completion) {
      if (!isCurrent(attempt)) return result(false, "unknown_or_expired_attempt");
      if (current.phase !== "collecting") return result(false, "attempt_ended");
      if (current.command) return fail("command_unfinished");
      const record = current;
      record.phase = "validating";
      const finished = owner.finish(record.ownerTicket, completion);
      if (current !== record) return result(false, "unknown_or_expired_attempt");
      record.phase = finished.ok ? "finished" : "rejected";
      record.reason = finished.reason;
      return finished;
    },
    inspect(attempt) {
      if (!isCurrent(attempt)) return Object.freeze({ ok: false, reason: "unknown_or_expired_attempt", summary: null });
      if (current.phase === "rejected") return Object.freeze({ ok: false, reason: current.reason, summary: null });
      return owner.inspect(current.ownerTicket);
    },
    invalidate
  });
}
