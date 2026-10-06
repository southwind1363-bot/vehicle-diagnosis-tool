import assert from "node:assert/strict";
import { createReadOnlySettingsSession } from "./fixtures/readonly-settings-session.js";

let checks = 0;
const check = (value, message) => { assert.ok(value, message); checks++; };
const context = () => ({ port: {}, reader: {}, writer: {}, revision: 1, connected: true, unlocked: true });
const fill = (session, ticket) => {
  for (const command of ["ATZ", "ATE0", "ATL0", "ATS0", "ATH1", "ATSP0"]) {
    check(session.recordInitialization(ticket, command, command === "ATZ" ? "synthetic" : "OK").ok, command);
  }
  check(session.recordProtocol(ticket, "A6").ok, "protocol report");
};
for (const phase of ["initializing", "observed"]) {
  for (const key of ["port", "reader", "writer", "revision", "connected", "unlocked"]) {
    const state = context(), original = { ...state };
    const session = createReadOnlySettingsSession(() => state), { ticket } = session.begin();
    if (phase === "observed") fill(session, ticket);
    state[key] = key === "revision" ? 2 : ["connected", "unlocked"].includes(key) ? false : {};
    check(session.inspect(ticket).summary === null, `${phase}/${key}: stale summary`);
    Object.assign(state, original);
    check(!session.recordInitialization(ticket, "ATZ", "old").ok && !session.inspect(ticket).ok, "restoring references cannot revive expired session");
    const next = session.begin(); fill(session, next.ticket);
    const summary = session.inspect(next.ticket).summary;
    check(summary.profile === null && !summary.profileVerified && !summary.wouldTransmit, "new observations remain incomplete");
    session.invalidate(); check(!session.inspect(next.ticket).ok, "explicit invalidation");
  }
}
const state = context();
let returned = state, reads = 0;
const session = createReadOnlySettingsSession(() => { reads++; return returned; });
const old = session.begin().ticket, fresh = session.begin().ticket;
for (const ticket of [old, { ...fresh }, JSON.parse(JSON.stringify(fresh)), null, {}]) {
  const before = reads;
  check(!session.recordInitialization(ticket, "ATZ", "stale").ok && reads === before, "foreign reference must not read context");
}
fill(session, fresh);
returned = { ...state }; // A new context wrapper with the same identities remains valid.
check(session.inspect(fresh).ok, "wrapper identity is not transport identity");
let accessed = 0;
returned = Object.defineProperty({ ...state }, "port", { get() { accessed++; return state.port; } });
check(!session.inspect(fresh).ok && accessed === 0, "accessor not invoked");
returned = state;
check(!session.inspect(fresh).ok, "failed observation stays expired");
for (const bad of [null, [], {}, { ...state, revision: NaN }, { ...state, revision: -1 }, { ...state, port: null },
  { ...state, reader: "reader" }, { ...state, connected: 1 }, { ...state, unlocked: false }]) {
  returned = bad; check(!session.begin().ok, "invalid context cannot begin");
}
let replacement, reenter = false;
const nested = createReadOnlySettingsSession(() => {
  if (reenter) { reenter = false; replacement = nested.begin(); }
  return state;
});
const first = nested.begin(); fill(nested, first.ticket);
reenter = true;
check(!nested.inspect(first.ticket).ok, "provider reentry discards old summary");
check(nested.inspect(replacement.ticket).summary.phase === "initializing", "old completion leaves replacement untouched");
fill(nested, replacement.ticket);
let invalidateDuringRead = false;
const changing = createReadOnlySettingsSession(() => {
  if (invalidateDuringRead) changing.invalidate();
  return state;
});
invalidateDuringRead = true;
check(!changing.begin().ok, "reentry during begin cannot install obsolete context");
const throwing = createReadOnlySettingsSession(() => { throw new Error("private context detail"); });
check(throwing.begin().reason === "settings_context_unavailable", "provider exception stays private");
let trap = false;
const reflective = createReadOnlySettingsSession(() => new Proxy(state, {
  getOwnPropertyDescriptor(target, key) {
    if (trap) { trap = false; reflective.invalidate(); }
    return Object.getOwnPropertyDescriptor(target, key);
  }
}));
const reflected = reflective.begin(); fill(reflective, reflected.ticket);
trap = true;
check(!reflective.inspect(reflected.ticket).ok, "descriptor reentry discards old observation");
trap = true;
check(!reflective.begin().ok, "descriptor reentry cannot install obsolete context");
// A disconnect signal invalidates immediately even if cleanup never finishes or revision is unchanged.
returned = state;
const pending = session.begin(); fill(session, pending.ticket);
const revisionBefore = state.revision;
session.invalidate();
check(state.revision === revisionBefore && !session.recordProtocol(pending.ticket, "A6").ok, "disconnect does not depend on a revision increment");
console.log(`Read-only settings session: ${checks} checks passed; reference changes, locks, disconnect, late observations and reentry (no transport)`);
