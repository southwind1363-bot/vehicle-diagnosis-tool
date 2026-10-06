import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { createReadOnlyReceiptSession } from "./fixtures/readonly-receipt-session.js";
const runtime = vm.createContext({ window: {} });
vm.runInContext(fs.readFileSync(new URL("../obd-readonly.js", import.meta.url), "utf8"), runtime);
const api = runtime.window.ObdReadOnly;
const profile = "iso15765_11bit_normal_h1_caf1_d0_s1_e0";
const context = () => ({ port: {}, reader: {}, writer: {}, settingsTicket: {}, revision: 1, connected: true, unlocked: true });
let checks = 0;
const check = (value, message) => { assert.ok(value, message); checks++; };
function fill(session, ticket) {
  for (const [index, command] of ["03", "07", "0A", "0101"].entries()) {
    const started = session.startCommand(ticket, command, index * 2);
    check(started.ok, "command begins");
    check(session.append(ticket, started.ticket, "NO DATA\r>").ok, "exact raw text accepted");
    check(session.endCommand(ticket, started.ticket, index * 2 + 1, "complete").ok, "command ends");
  }
}
for (const selected of [profile, profile.replace("s1", "s0")]) {
  const state = context(), session = createReadOnlyReceiptSession(() => ({ ...state }), api, selected), ticket = session.begin().ticket;
  fill(session, ticket);
  const result = session.finish(ticket, "complete");
  check(result.ok && result.summary.rawTranscriptValidation.status === "parsed", "complete raw evaluation");
  check(!result.summary.payloadSemanticsVerified && !result.summary.wouldTransmit && !result.summary.sameVehicleVerified, "no vehicle or execution authority");
  check(!JSON.stringify(result.summary).includes("NO DATA"), "raw text excluded from summary");
  state.connected = false;
  check(session.inspect(ticket).summary === null, "finished observations expire on disconnect");
}
for (const method of ["startCommand", "append", "endCommand", "finish", "inspect"]) {
  for (const key of ["port", "reader", "writer", "settingsTicket", "revision", "connected", "unlocked"]) {
    const state = context(), original = { ...state }, session = createReadOnlyReceiptSession(() => state, api, profile);
    const ticket = session.begin().ticket;
    let command;
    if (["append", "endCommand"].includes(method)) command = session.startCommand(ticket, "03", 0).ticket;
    if (method === "finish") fill(session, ticket);
    state[key] = key === "revision" ? 2 : ["connected", "unlocked"].includes(key) ? false : {};
    const args = { startCommand: [ticket, "03", 0], append: [ticket, command, "NO DATA\r>"],
      endCommand: [ticket, command, 1, "complete"], finish: [ticket, "complete"], inspect: [ticket] };
    check(!session[method](...args[method]).ok, `${key}/${method}: changed connection rejects operation`);
    Object.assign(state, original);
    check(session.inspect(ticket).summary === null, "restored context cannot revive raw evidence");
  }
}
{
  const state = context(); let reads = 0;
  const session = createReadOnlyReceiptSession(() => { reads++; return state; }, api, profile);
  const old = session.begin().ticket, ticket = session.begin().ticket;
  for (const missing of [undefined, null, {}]) {
    check(!session.append(ticket, missing, "x").ok && !session.endCommand(ticket, missing, 1, "complete").ok, "missing command rejected before start");
  }
  const command = session.startCommand(ticket, "03", 0).ticket;
  check(!session.append(ticket, undefined, "x").ok && !session.endCommand(ticket, undefined, 1, "complete").ok, "missing command cannot reuse active command");
  for (const foreign of [old, {}, null, { ...ticket }]) {
    const before = reads;
    check(!session.append(foreign, command, "x").ok && reads === before, "foreign attempt does not consult provider");
  }
  check(!session.append(ticket, {}, "x").ok, "copied command rejected");
  check(session.append(ticket, command, "NO DATA\r>").ok, "foreign reference leaves current command intact");
  check(session.endCommand(ticket, command, 1, "complete").ok, "valid end");
  check(!session.append(ticket, command, "late").ok, "ended command cannot accept late bytes");
  const next = session.startCommand(ticket, "07", 2).ticket;
  check(!session.append(ticket, command, "late").ok && session.append(ticket, next, "NO DATA\r>").ok, "old command cannot corrupt next command");
  session.invalidate(); check(session.inspect(ticket).summary === null, "explicit invalidation");
}
{
  const state = context(); let returned = state, getterCalls = 0;
  const session = createReadOnlyReceiptSession(() => returned, api, profile);
  const ticket = session.begin().ticket;
  returned = Object.defineProperty({ ...state }, "reader", { get() { getterCalls++; return state.reader; } });
  check(!session.inspect(ticket).ok && getterCalls === 0, "context getter is not executed");
  for (const bad of [null, [], {}, { ...state, connected: 1 }, { ...state, revision: NaN }, { ...state, port: null },
    { ...state, settingsTicket: null }, { ...state, settingsTicket: undefined }, { ...state, settingsTicket: "declared" }]) {
    returned = bad; check(!session.begin().ok, "invalid context refuses begin");
  }
}
{
  let reenter = false, fresh;
  const state = context(), session = createReadOnlyReceiptSession(() => {
    if (reenter) { reenter = false; fresh = session.begin().ticket; }
    return state;
  }, api, profile);
  const ticket = session.begin().ticket;
  reenter = true;
  check(!session.inspect(ticket).ok && session.inspect(fresh).ok, "provider reentry preserves replacement");
  reenter = true;
  check(!session.begin().ok && session.inspect(fresh).ok, "begin reentry cannot install stale context");
}
{
  let session, fresh;
  const state = context(), parser = { parseElmReadOnlyRawTranscript(value) {
    if (!fresh) fresh = session.begin().ticket;
    return api.parseElmReadOnlyRawTranscript(value);
  } };
  session = createReadOnlyReceiptSession(() => state, parser, profile);
  const ticket = session.begin().ticket; fill(session, ticket);
  check(!session.finish(ticket, "complete").ok, "parser reentry discards old result");
  check(session.inspect(fresh).ok && session.startCommand(fresh, "03", 0).ok, "parser reentry leaves replacement usable");
}
assert.throws(() => createReadOnlyReceiptSession(context, api), /explicit_receipt_profile_required/); checks++;
{
  const state = context(), parser = { parseElmReadOnlyRawTranscript(value) {
    state.connected = false;
    return api.parseElmReadOnlyRawTranscript(value);
  } };
  const session = createReadOnlyReceiptSession(() => state, parser, profile), ticket = session.begin().ticket;
  fill(session, ticket);
  check(session.finish(ticket, "complete").summary === null, "context change during parsing discards completed result");
  state.connected = true;
  check(session.inspect(ticket).summary === null, "parser-time disconnect cannot be reversed");
}
assert.throws(() => createReadOnlyReceiptSession(context, api, "unknown"), /invalid_receipt_profile/); checks++;
const throwing = createReadOnlyReceiptSession(() => { throw new Error("private"); }, api, profile);
check(throwing.begin().reason === "receipt_context_unavailable", "provider exception remains private");
console.log(`Read-only receipt session: ${checks} checks passed; synthetic context only, no transport or settings proof`);
