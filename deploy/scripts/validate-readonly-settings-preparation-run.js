import assert from "node:assert/strict";
import { createReadOnlySettingsPreparationRun } from "./fixtures/readonly-settings-preparation-run.js";

const commands = ["ATCAF1", "ATD0", "ATCEA", "ATDPN"];
const context = () => ({ port: {}, reader: {}, writer: {}, settingsTicket: {}, revision: 1, connected: true, unlocked: true });
const response = command => ({ completion: "complete", response: command === "ATDPN" ? "A6" : "OK" });
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
let cases = 0;
for (const failure of [null, "incomplete", "invalid", "throw", "context"]) {
  for (const failAt of failure ? [0, 1, 2, 3] : [4]) {
    const state = context(), calls = [], order = [];
    const oldTicket = state.settingsTicket;
    const run = createReadOnlySettingsPreparationRun(() => state,
      () => { order.push("invalidate"); return true; },
      () => { order.push("rotate"); state.settingsTicket = {}; return true; },
      async command => {
        const index = calls.length; calls.push(command); order.push(command);
        if (index === failAt) {
          if (failure === "throw") throw Error("private_reader_detail");
          if (failure === "incomplete") return { completion: "timeout", response: "OK" };
          if (failure === "invalid") return { completion: "complete", response: "UNKNOWN" };
          if (failure === "context") state.settingsTicket = {};
        }
        return response(command);
      });
    const result = await run.run();
    assert.equal(result.ok, failure === null);
    assert.equal(result.completedResponseCount, failAt);
    assert.deepEqual(calls, commands.slice(0, failure ? failAt + 1 : 4));
    assert.deepEqual(order.slice(0, 2), ["invalidate", "rotate"]);
    assert.notEqual(state.settingsTicket, oldTicket);
    assert.equal(result.executionEnabled, false);
    assert.equal(result.vehicleCommandEnabled, false);
    assert.equal(result.wouldTransmit, false);
    assert(!JSON.stringify(result).includes("private_"));
    assert(Object.isFrozen(result));
    if (failure) assert.equal(result.summary, null);
    else {
      assert.equal(result.summary.phase, "protocol_observed");
      assert.equal(result.summary.profile, null);
      assert.equal(result.summary.profileVerified, false);
      assert.equal(result.summary.restorationVerified, false);
      assert.equal(result.summary.protocolNumberReported, "A6");
    }
    assert.equal(run.cancel(), false);
    cases++;
  }
}
for (const phase of ["invalidate", "rotate"]) {
  const state = context(), calls = [];
  const run = createReadOnlySettingsPreparationRun(() => state,
    () => phase !== "invalidate", () => false, async command => { calls.push(command); return response(command); });
  assert.equal((await run.run()).reason, phase === "invalidate" ? "receipt_invalidation_unconfirmed" : "settings_generation_unconfirmed");
  assert.deepEqual(calls, []); cases++;
}
for (const cancelAt of [0, 1, 2, 3]) {
  const state = context(), pending = deferred(), reached = deferred(), calls = [];
  let pause = true;
  const run = createReadOnlySettingsPreparationRun(() => state, () => true,
    () => { state.settingsTicket = {}; return true; }, async command => {
      const index = calls.length; calls.push(command);
      if (pause && index === cancelAt) { reached.resolve(); await pending.promise; }
      return response(command);
    });
  const first = run.run(); await reached.promise;
  assert.equal(run.cancel(), true);
  assert.equal((await run.run()).reason, "settings_preparation_busy");
  pending.resolve();
  const cancelled = await first;
  assert.equal(cancelled.reason, "settings_preparation_cancelled");
  assert.equal(cancelled.summary, null);
  assert.deepEqual(calls, commands.slice(0, cancelAt + 1));
  pause = false;
  assert.equal((await run.run()).ok, true);
  assert.deepEqual(calls.slice(cancelAt + 1), commands);
  cases++;
}
console.log(`Settings preparation run: ${cases} synthetic sequencing/failure/cancellation cases passed; no sender, profile or vehicle authorization`);
