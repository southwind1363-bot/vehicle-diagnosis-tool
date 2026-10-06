import assert from "node:assert/strict";
import { createReadOnlySettingsPreparation } from "./fixtures/readonly-settings-preparation.js";
import { createReadOnlySettingsPreparationSession } from "./fixtures/readonly-settings-preparation-session.js";
import { createReadOnlySettingsTransition } from "./fixtures/readonly-settings-transition.js";
let checks = 0;
const check = (value, message) => { assert.ok(value, message); checks++; };
const commands = ["ATCAF1", "ATD0", "ATCEA"];
function fill(model, ticket, count = 3) {
  for (const command of commands.slice(0, count)) assert.ok(model.record(ticket, command, "complete", "OK").ok);
}
function noAuthority(summary) {
  check(summary.profile === null && !summary.profileVerified && !summary.executionEnabled && !summary.vehicleCommandEnabled
    && !summary.wouldTransmit && !summary.canExecute && !summary.realTransportProofAvailable && !summary.restorationVerified
    && !summary.automaticRetryAllowed && !summary.rawRetained && summary.provenance === "simulated_only", "protocol observation grants no profile, capture or execution authority");
}
for (const response of ["6", "8", "A6", "A8"]) {
  const model = createReadOnlySettingsPreparation(), ticket = model.begin().ticket;
  fill(model, ticket);
  check(model.inspect(ticket).summary.protocolNumberReported === null, "acknowledgements alone do not infer protocol");
  check(model.recordProtocol(ticket, "ATDPN", "complete", response).ok, "one exact candidate report accepted");
  const summary = model.inspect(ticket).summary;
  check(summary.phase === "protocol_observed" && summary.protocolNumberReported === response && summary.nextCommand === null, "bounded reported value, no next sender step");
  noAuthority(summary);
  check(!model.recordProtocol(ticket, "ATDPN", "complete", response).ok, "repeat query expires prior observation");
  check(model.inspect(ticket).summary.protocolNumberReported === null, "repeated query retains no stale report");
}
for (const count of [0, 1, 2]) {
  const model = createReadOnlySettingsPreparation(), ticket = model.begin().ticket; fill(model, ticket, count);
  check(!model.recordProtocol(ticket, "ATDPN", "complete", "A6").ok, "early protocol cannot be applied retroactively");
  check(!model.record(ticket, commands[count], "complete", "OK").ok, "early protocol ends this attempt");
}
let coercions = 0;
const object = { toString() { coercions++; return "A6"; } };
for (const [command, completion, response] of [
  ...["0", "1", "7", "9", "A7", "AA", "B", "C", "a6", " A6", "A6\n", "A6\nA8", "ATDPN\nA6", "ERROR", "?", "", null, undefined, 6, object].map(value => ["ATDPN", "complete", value]),
  ...["timeout", "disconnected", "error", undefined, object].map(value => ["ATDPN", value, "A6"]),
  ...["ATDP", "03", "04", "ATCAF1", undefined, object].map(value => [value, "complete", "A6"])
]) {
  const model = createReadOnlySettingsPreparation(), ticket = model.begin().ticket; fill(model, ticket);
  check(!model.recordProtocol(ticket, command, completion, response).ok, "malformed/incomplete/out-of-scope report rejected");
  const summary = model.inspect(ticket).summary;
  check(summary.phase === "rejected" && summary.acceptedCommands.length === 0 && summary.protocolNumberReported === null && summary.nextCommand === null, "failure discards accepted settings and stops");
  check(!model.recordProtocol(ticket, "ATDPN", "complete", "A6").ok, "late valid report cannot revive failed attempt");
  noAuthority(summary);
}
check(coercions === 0, "external coercion never runs");
const context = () => ({ port: {}, reader: {}, writer: {}, settingsTicket: {}, revision: 1, connected: true, unlocked: true });
for (const kind of ["session", "transition"]) {
  function make(state, provider = () => state) {
    return kind === "session" ? createReadOnlySettingsPreparationSession(provider)
      : createReadOnlySettingsTransition(provider, () => true, () => { state.settingsTicket = {}; return true; });
  }
  for (const stage of ["before_report", "after_report"]) for (const key of Object.keys(context())) {
    const state = context(), model = make(state), ticket = model.begin().ticket; fill(model, ticket);
    const original = { ...state };
    if (stage === "after_report") check(model.recordProtocol(ticket, "ATDPN", "complete", "A6").ok, "same generation accepts report");
    state[key] = key === "revision" ? 2 : ["connected", "unlocked"].includes(key) ? false : {};
    if (stage === "before_report") check(!model.recordProtocol(ticket, "ATDPN", "complete", "A6").ok, "changed context rejects report");
    check(model.inspect(ticket).summary === null, "changed context hides final observations");
    Object.assign(state, original);
    check(!model.recordProtocol(ticket, "ATDPN", "complete", "A6").ok, "restoring references does not revive old report");
  }
  {
    const state = context(); let reads = 0;
    const model = make(state, () => { reads++; return state; });
    const old = model.begin().ticket, ticket = model.begin().ticket; fill(model, ticket);
    for (const foreign of [old, {}, { ...ticket }, null, undefined]) {
      const before = reads;
      check(!model.recordProtocol(foreign, "ATDPN", "complete", "A6").ok && reads === before, "foreign report skips provider and preserves current attempt");
    }
    check(model.recordProtocol(ticket, "ATDPN", "complete", "A8").ok, "current report survives stale calls");
    noAuthority(model.inspect(ticket).summary);
    model.invalidate(); check(model.inspect(ticket).summary === null, "explicit invalidation removes final report");
  }
  {
    const state = context(); let reenter = false, fresh;
    const model = make(state, () => { if (reenter) { reenter = false; fresh = model.begin().ticket; } return state; });
    const old = model.begin().ticket; fill(model, old); reenter = true;
    check(!model.recordProtocol(old, "ATDPN", "complete", "A6").ok, "provider reentry rejects old report");
    const summary = model.inspect(fresh).summary;
    check(summary.phase === "preparing" && summary.protocolNumberReported === null && summary.acceptedCommands.length === 0, "old report cannot modify replacement");
  }
}
console.log(`Settings preparation protocol: ${checks} checks passed; synthetic reports only, no transport or profile authorization`);
