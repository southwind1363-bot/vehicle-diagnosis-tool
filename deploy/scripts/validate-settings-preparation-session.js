import assert from "node:assert/strict";
import { createReadOnlySettingsPreparationSession } from "./fixtures/readonly-settings-preparation-session.js";
import { client, attachWire } from "./fixtures/serial-runtime-harness.js";
const commands = ["ATCAF1", "ATD0", "ATCEA"];
const context = () => ({ port: {}, reader: {}, writer: {}, settingsTicket: {}, revision: 1, connected: true, unlocked: true });
let checks = 0;
const check = (value, message) => { assert.ok(value, message); checks++; };
function fill(model, ticket, count = 3) {
  for (const command of commands.slice(0, count)) check(model.record(ticket, command, "complete", "OK").ok, "synthetic acknowledgement");
}
for (const count of [0, 1, 2, 3]) {
  for (const key of Object.keys(context())) {
    const state = context(), original = { ...state }, model = createReadOnlySettingsPreparationSession(() => ({ ...state }));
    const ticket = model.begin().ticket; fill(model, ticket, count);
    state[key] = key === "revision" ? 2 : ["connected", "unlocked"].includes(key) ? false : {};
    check(model.inspect(ticket).summary === null, "changed context hides partial/completed preparation");
    Object.assign(state, original);
    check(!model.record(ticket, commands[count] || commands[0], "complete", "OK").ok, "restoring context cannot revive old preparation");
    const fresh = model.begin().ticket; fill(model, fresh);
    check(model.inspect(fresh).summary.profile === null, "fresh completion has no verified profile");
  }
}
{
  const state = context(); let reads = 0, returned = state, getters = 0;
  const model = createReadOnlySettingsPreparationSession(() => { reads++; return returned; });
  const old = model.begin().ticket, fresh = model.begin().ticket;
  for (const ticket of [old, {}, { ...fresh }, null, undefined]) {
    const before = reads;
    check(!model.record(ticket, "ATCAF1", "complete", "OK").ok && reads === before, "foreign ticket does not call provider");
  }
  returned = Object.defineProperty({ ...state }, "settingsTicket", { get() { getters++; return state.settingsTicket; } });
  check(!model.inspect(fresh).ok && getters === 0, "context accessor not invoked");
  for (const invalid of [null, [], {}, { ...state, settingsTicket: null }, { ...state, revision: -1 }, { ...state, connected: 1 }]) {
    returned = invalid; check(!model.begin().ok, "invalid context cannot begin");
  }
}
{
  let reenter = false, fresh;
  const state = context(), model = createReadOnlySettingsPreparationSession(() => {
    if (reenter) { reenter = false; fresh = model.begin().ticket; }
    return state;
  });
  const old = model.begin().ticket; reenter = true;
  check(!model.record(old, "ATCAF1", "complete", "OK").ok, "provider reentry rejects old acknowledgement");
  check(model.inspect(fresh).summary.acceptedCommands.length === 0, "new preparation not changed by old acknowledgement");
  reenter = true;
  check(!model.begin().ok && model.inspect(fresh).ok, "begin reentry preserves nested generation");
}
const throwing = createReadOnlySettingsPreparationSession(() => { throw new Error("private provider failure"); });
check(throwing.begin().reason === "preparation_context_unavailable", "provider exception remains private");
for (const event of ["disconnect", "reinitialize", "pagehide", "owner_invalidate"]) {
  const c = client(), wire = attachWire(c, 7), state = c.context.obdDevSession;
  let model;
  try {
    await c.context.initializeElmDeveloperAdapter();
    model = createReadOnlySettingsPreparationSession(() => ({ port: state.port, reader: state.reader, writer: state.writer,
      settingsTicket: c.settings.owner.inspect(c.settings.ticket).ok ? c.settings.ticket : null,
      revision: c.context.obdSerialRevision, connected: state.readLoopActive && !c.context.obdSerialDisconnectOperation,
      unlocked: c.context.isCurrentObdSerialOperation(c.context.obdSerialRevision) }));
    const ticket = model.begin().ticket; fill(model, ticket, 1);
    if (event === "disconnect") await c.context.disconnectObdDeveloperVci({ reason: "device_disconnected" });
    if (event === "reinitialize") await c.context.initializeElmDeveloperAdapter();
    if (event === "pagehide") c.pagehide();
    if (event === "owner_invalidate") c.settings.owner.invalidate();
    check(!model.record(ticket, "ATD0", "complete", "OK").ok && model.inspect(ticket).summary === null, "real lifecycle event rejects late synthetic preparation OK");
    check(wire.writes.every(value => !commands.includes(value.trim())), "proposed setting commands were never sent");
  } finally { model?.invalidate(); await wire.close(); }
}
console.log(`Settings preparation session: ${checks} checks passed; preparation responses are synthetic, proposed commands are never sent`);
