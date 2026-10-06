import assert from "node:assert/strict";
import { createReadOnlySettingsTransition } from "./fixtures/readonly-settings-transition.js";
import { createReadOnlyReceiptSession } from "./fixtures/readonly-receipt-session.js";
import { createReadOnlySettingsSession } from "./fixtures/readonly-settings-session.js";
const profile = "iso15765_11bit_normal_h1_caf1_d0_s1_e0";
let checks = 0;
const check = (value, message) => { assert.ok(value, message); checks++; };
function owners() {
  const state = { port: {}, reader: {}, writer: {}, revision: 1, connected: true, unlocked: true };
  const settings = createReadOnlySettingsSession(() => state);
  state.settingsTicket = settings.begin().ticket;
  const receipts = createReadOnlyReceiptSession(() => state, undefined, profile);
  const attempt = receipts.begin().ticket;
  for (const [index, command] of ["03", "07", "0A", "0101"].entries()) {
    const started = receipts.startCommand(attempt, command, index * 2);
    receipts.append(attempt, started.ticket, "NO DATA\r>");
    receipts.endCommand(attempt, started.ticket, index * 2 + 1, "complete");
  }
  check(receipts.finish(attempt, "complete").ok, "old declared-profile receipt exists");
  return { state, settings, receipts, attempt };
}
{
  const o = owners(), order = [], oldSettings = o.state.settingsTicket;
  const transition = createReadOnlySettingsTransition(() => o.state,
    () => { order.push("clear"); o.receipts.invalidate(); return true; },
    () => {
      check(o.receipts.inspect(o.attempt).summary === null, "old receipt cleared before settings rotate");
      order.push("rotate"); o.settings.invalidate(); o.state.settingsTicket = o.settings.begin().ticket; return true;
    });
  const ticket = transition.begin().ticket;
  assert.deepEqual(order, ["clear", "rotate"]); checks++;
  check(!o.settings.inspect(oldSettings).ok, "old settings expired");
  for (const command of ["ATCAF1", "ATD0", "ATCEA"]) check(transition.record(ticket, command, "complete", "OK").ok, "new preparation records synthetic OK");
  const summary = transition.inspect(ticket).summary;
  check(summary.phase === "acknowledgements_observed" && summary.profile === null && !summary.wouldTransmit, "handoff grants no profile or send authorization");
  const fresh = transition.begin().ticket;
  check(!transition.record(ticket, "ATCAF1", "complete", "OK").ok && transition.inspect(fresh).ok, "old completion leaves new preparation intact");
  transition.invalidate(); check(transition.inspect(fresh).summary === null, "explicit invalidation");
}
for (const stage of ["clear", "rotate", "context"]) {
  for (const failure of ["throw", "unconfirmed"]) {
    const o = owners(), calls = [];
    const fail = () => { if (failure === "throw") throw new Error("private detail"); return undefined; };
    const transition = createReadOnlySettingsTransition(() => {
      calls.push("context"); return stage === "context" ? fail() : o.state;
    }, () => {
      calls.push("clear"); if (stage === "clear") return fail(); o.receipts.invalidate(); return true;
    }, () => {
      calls.push("rotate"); if (stage === "rotate") return fail(); o.settings.invalidate(); o.state.settingsTicket = o.settings.begin().ticket; return true;
    });
    const result = transition.begin();
    check(!result.ok && result.ticket === null && !JSON.stringify(result).includes("private"), "failure cannot issue preparation ticket or expose exception");
    check(calls.length === ["clear", "rotate", "context"].indexOf(stage) + 1, "no later stage or automatic retry after failure");
    if (stage !== "clear") check(o.receipts.inspect(o.attempt).summary === null, "later failure cannot restore old receipt");
  }
}
for (const stage of ["clear", "rotate", "context"]) {
  const o = owners(); let enter = false, fresh;
  const reenter = point => { if (enter && stage === point) { enter = false; fresh = transition.begin(); } };
  const transition = createReadOnlySettingsTransition(() => { reenter("context"); return o.state; },
    () => { o.receipts.invalidate(); reenter("clear"); return true; },
    () => { o.settings.invalidate(); o.state.settingsTicket = o.settings.begin().ticket; reenter("rotate"); return true; });
  enter = true;
  check(!transition.begin().ok && fresh.ok, "reentrant begin replaces outer transition");
  check(transition.inspect(fresh.ticket).summary.acceptedCommands.length === 0, "outer completion does not overwrite nested preparation");
}
for (const value of [false, null, {}, Promise.resolve(true)]) {
  const o = owners(); let later = 0;
  const transition = createReadOnlySettingsTransition(() => o.state, () => value, () => { later++; return true; });
  check(transition.begin().reason === "receipt_invalidation_unconfirmed" && later === 0, "only synchronous true confirms invalidation");
}
console.log(`Settings transition: ${checks} checks passed; trusted synthetic owners only, no transport or settings commands`);
