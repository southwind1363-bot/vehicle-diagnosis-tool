import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { createTimedReadOnlyReceiptSession } from "./fixtures/readonly-timed-receipt-session.js";
const host = vm.createContext({ window: {} });
vm.runInContext(fs.readFileSync(new URL("../obd-readonly.js", import.meta.url), "utf8"), host);
const api = host.window.ObdReadOnly;
const profile = "iso15765_11bit_normal_h1_caf1_d0_s1_e0";
const context = () => ({ port: {}, reader: {}, writer: {}, settingsTicket: {}, revision: 1, connected: true, unlocked: true });
const commands = ["03", "07", "0A", "0101"];
assert.throws(() => createTimedReadOnlyReceiptSession(context, api, profile), /explicit_receipt_clock_required/);
{
  const state = context(); let reads = 0;
  const session = createTimedReadOnlyReceiptSession(() => state, api, profile, () => reads++);
  for (const ticket of [undefined, null, {}, Object.freeze({})]) {
    assert.equal(session.startCommand(ticket, "03").ok, false);
    assert.equal(session.append(ticket, {}, "NO DATA\r>").ok, false);
    assert.equal(session.endCommand(ticket, {}, "complete").ok, false);
    assert.equal(session.finish(ticket, "complete").ok, false);
    assert.equal(session.inspect(ticket).ok, false);
  }
  assert.equal(reads, 0);
}
for (const times of [[0, 0, 0, 0, 0, 0, 0, 0], [10, 11, 13, 17, 21, 24, 30, 35]]) {
  const state = context(); let reads = 0;
  const session = createTimedReadOnlyReceiptSession(() => state, api, profile, () => times[reads++]);
  const ticket = session.begin().ticket;
  for (const command of commands) {
    const started = session.startCommand(ticket, command); assert.equal(started.ok, true);
    assert.equal(session.append(ticket, started.ticket, "NO DATA\r>").ok, true);
    assert.equal(session.endCommand(ticket, started.ticket, "complete").ok, true);
  }
  const result = session.finish(ticket, "complete");
  assert.equal(reads, 8); assert.equal(result.ok, true);
  assert.equal(result.summary.receiptCount, 4); assert.equal(result.summary.realTransportProofAvailable, false);
  assert.equal(result.summary.wouldTransmit, false); assert.equal(result.summary.rawTranscriptValidation.status, "parsed");
  assert.equal(session.startCommand(ticket, "03").ok, false); assert.equal(reads, 8);
  state.settingsTicket = {}; assert.equal(session.inspect(ticket).ok, false);
}
for (const invalid of [-1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, "1", null, {}, () => { throw Error("private_clock_error"); }]) {
  for (const boundary of [0, 1, 2, 3, 4, 5, 6, 7]) {
    let count = 0; const state = context();
    const session = createTimedReadOnlyReceiptSession(() => state, api, profile, () => {
      const position = count++;
      return position === boundary ? (typeof invalid === "function" ? invalid() : invalid) : position;
    });
    const ticket = session.begin().ticket;
    let failure;
    for (const command of commands) {
      const started = session.startCommand(ticket, command);
      if (!started.ok) { failure = started; break; }
      assert.equal(session.append(ticket, started.ticket, "NO DATA\r>").ok, true);
      const ended = session.endCommand(ticket, started.ticket, "complete");
      if (!ended.ok) { failure = ended; break; }
    }
    assert.equal(count, boundary + 1);
    assert.equal(failure.reason, "receipt_clock_unavailable");
    assert.equal(session.inspect(ticket).ok, false);
    assert.equal(session.finish(ticket, "complete").ok, false);
  }
}
for (const boundary of [1, 2, 3, 4, 5, 6, 7]) {
  let count = 0; const state = context();
  const session = createTimedReadOnlyReceiptSession(() => state, api, profile, () => count++ === boundary ? 0 : 10);
  const ticket = session.begin().ticket;
  for (const command of commands) {
    const started = session.startCommand(ticket, command);
    if (!started.ok) break;
    session.append(ticket, started.ticket, "NO DATA\r>");
    if (!session.endCommand(ticket, started.ticket, "complete").ok) break;
  }
  assert.equal(count, boundary + 1); assert.equal(session.inspect(ticket).ok, false);
}
{
  const state = context(); let reads = 0, callback = () => {};
  const session = createTimedReadOnlyReceiptSession(() => state, api, profile, () => { reads++; callback(); return reads; });
  const old = session.begin().ticket, ticket = session.begin().ticket;
  assert.equal(session.startCommand(old, "03").ok, false); assert.equal(reads, 0);
  const command = session.startCommand(ticket, "03").ticket;
  assert.equal(session.endCommand(ticket, {}, "complete").ok, false); assert.equal(reads, 1);
  assert.equal(session.startCommand(ticket, "03").ok, false); assert.equal(reads, 1);
  callback = () => {
    assert.equal(session.begin().ok, false);
    assert.equal(session.finish(ticket, "complete").ok, false);
  };
  session.append(ticket, command, "NO DATA\r>");
  assert.equal(session.endCommand(ticket, command, "complete").ok, true);
  callback = () => session.invalidate();
  assert.equal(session.startCommand(ticket, "07").ok, false);
  assert.equal(session.inspect(ticket).ok, false);
  callback = () => {};
  assert.equal(session.begin().ok, true);
}
for (const changed of ["port", "reader", "writer", "settingsTicket", "revision", "connected", "unlocked"]) {
  const state = context(); let change = false, time = 0;
  const session = createTimedReadOnlyReceiptSession(() => state, api, profile, () => {
    if (change) state[changed] = changed === "revision" ? 2 : ["connected", "unlocked"].includes(changed) ? false : {};
    return time++;
  });
  const ticket = session.begin().ticket, command = session.startCommand(ticket, "03").ticket;
  session.append(ticket, command, "NO DATA\r>"); change = true;
  assert.equal(session.endCommand(ticket, command, "complete").ok, false);
  assert.equal(session.inspect(ticket).ok, false);
}
console.log("Timed receipt session: sampled intervals, invalid/backward clocks, stale commands, reentry and connection changes passed; no transport or UTC evidence");
