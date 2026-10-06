import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { createReadOnlySettingsPreparation } from "./fixtures/readonly-settings-preparation.js";
const commands = ["ATCAF1", "ATD0", "ATCEA"];
let checks = 0;
const check = (value, message) => { assert.ok(value, message); checks++; };
function prefix(model, ticket, length) {
  for (const command of commands.slice(0, length)) check(model.record(ticket, command, "complete", "OK").ok, "prior acknowledgement");
}
for (let index = 0; index < 3; index++) {
  for (const [completion, response] of [["timeout", "OK"], ["disconnected", "OK"], ["error", "OK"], ["complete", "ERROR"],
    ["complete", "?"], ["complete", "OK\nOK"], ["complete", "ATCAF1\nOK"], ["complete", " OK "], ["complete", null]]) {
    const model = createReadOnlySettingsPreparation(), ticket = model.begin().ticket;
    prefix(model, ticket, index);
    check(!model.record(ticket, commands[index], completion, response).ok, "failed response rejects preparation");
    const summary = model.inspect(ticket).summary;
    check(summary.nextCommand === null && summary.acceptedCommands.length === 0 && !summary.automaticRetryAllowed, "failure clears observations and stops sequence");
    check(!model.record(ticket, commands[index], "complete", "OK").ok, "late OK cannot resume failed attempt");
  }
  for (const wrong of [...commands.filter(command => command !== commands[index]), "04", "ATCEA01", {}, undefined]) {
    const model = createReadOnlySettingsPreparation(), ticket = model.begin().ticket;
    prefix(model, ticket, index);
    check(!model.record(ticket, wrong, "complete", "OK").ok, "wrong or arbitrary command rejected");
    check(model.inspect(ticket).summary.nextCommand === null, "out of order preparation stops");
  }
}
{
  const model = createReadOnlySettingsPreparation(), old = model.begin().ticket, ticket = model.begin().ticket;
  const foreign = createReadOnlySettingsPreparation().begin().ticket;
  for (const invalid of [old, foreign, {}, { ...ticket }, null, undefined]) {
    check(!model.record(invalid, "ATCAF1", "complete", "OK").ok, "foreign ticket rejected");
    check(model.inspect(ticket).summary.nextCommand === "ATCAF1", "foreign ticket leaves current attempt intact");
  }
  for (const command of commands) {
    check(model.inspect(ticket).summary.nextCommand === command, "fixed next command");
    check(model.record(ticket, command, "complete", "OK").ok, "exact OK accepted");
  }
  const summary = model.inspect(ticket).summary;
  check(summary.phase === "acknowledgements_observed" && summary.nextCommand === null, "all acknowledgements observed");
  check(summary.profile === null && !summary.profileVerified && !summary.executionEnabled && !summary.vehicleCommandEnabled
    && !summary.wouldTransmit && !summary.canExecute && !summary.realTransportProofAvailable && !summary.restorationVerified, "success grants no authority or restoration claim");
  check(Object.isFrozen(summary) && Object.isFrozen(summary.acceptedCommands), "immutable summary");
  check(!model.record(ticket, "ATCAF1", "complete", "OK").ok, "completed preparation cannot restart");
  model.invalidate(); check(model.inspect(ticket).summary === null, "explicit invalidation");
}
// Enforce that this development model has not enabled the proposed commands in normal transport.
const source = fs.readFileSync(new URL("../script.js", import.meta.url), "utf8");
const context = vm.createContext({});
vm.runInContext(source.match(/const WEB_SERIAL_READ_ONLY_COMMANDS = [\s\S]*?\);/)[0] + "\nglobalThis.allowed = WEB_SERIAL_READ_ONLY_COMMANDS", context);
for (const command of [...commands, "04"]) check(!context.allowed.includes(command), "normal transport remains blocked");
console.log(`Read-only settings preparation: ${checks} checks passed; no sender, no profile or execution authorization`);
