import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { createReadOnlyDevelopmentSession } from "./fixtures/readonly-development-session.js";
const runtime = vm.createContext({ window: {} });
vm.runInContext(fs.readFileSync(new URL("../obd-readonly.js", import.meta.url), "utf8"), runtime);
const api = runtime.window.ObdReadOnly;
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
let cases = 0;
for (const kind of ["readout", "settings"]) {
  for (const finish of ["complete", "cancel", "throw"]) {
    for (const at of [0, 1, 2, 3]) {
      const state = { port: {}, reader: {}, writer: {}, settingsTicket: {}, revision: 1, connected: true, unlocked: true };
      const gate = deferred(), reached = deferred(), reads = [], settings = [];
      let pause = true, ticks = 0, rotations = 0, invalidations = 0, oldAppend;
      const wait = async (operation, index) => {
        if (pause && kind === operation && index === at) {
          reached.resolve(); await gate.promise;
          if (finish === "throw") throw Error("private_callback_detail");
        }
      };
      const session = createReadOnlyDevelopmentSession({ readContext: () => state, api,
        profile: "iso15765_11bit_normal_h1_caf1_d0_s1_e0", readClock: () => ticks++,
        async readCommand(command, append) {
          const index = reads.length; reads.push(command); oldAppend = append;
          await wait("readout", index); append("NO DATA\r>"); return "complete";
        },
        invalidateReceipts() { invalidations++; return true; },
        beginSettingsGeneration() { rotations++; state.settingsTicket = {}; return true; },
        async readResponse(command) {
          const index = settings.length; settings.push(command);
          await wait("settings", index);
          return { completion: "complete", response: command === "ATDPN" ? "A6" : "OK" };
        }
      });
      assert.equal(session.inspect().status, "idle");
      const pending = kind === "readout" ? session.read() : session.prepareSettings();
      await reached.promise;
      assert.equal(session.inspect().operation, kind);
      assert.equal(session.inspect().status, "running");
      const counts = [reads.length, settings.length, invalidations, rotations];
      assert.equal((await session.read()).reason, "development_operation_busy");
      assert.equal((await session.prepareSettings()).reason, "development_operation_busy");
      if (finish === "cancel") {
        assert.equal(session.cancel(), true);
        assert.equal(session.inspect().status, "cancelling");
        assert.equal((await session.read()).reason, "development_operation_busy");
        assert.equal((await session.prepareSettings()).reason, "development_operation_busy");
        if (kind === "readout") assert.equal(oldAppend("late>"), false);
      }
      assert.deepEqual([reads.length, settings.length, invalidations, rotations], counts);
      gate.resolve();
      const result = await pending;
      assert.equal(result.ok, finish === "complete");
      assert(!JSON.stringify(result).includes("private_"));
      if (finish !== "complete") assert.equal(result.summary, null);
      if (kind === "settings" && finish === "complete") assert.equal(result.summary.profile, null);
      assert.equal(session.inspect().status, "idle");
      assert.equal(session.cancel(), false);
      assert.equal((kind === "readout" ? reads : settings).length, finish === "complete" ? 4 : at + 1);
      pause = false;
      const next = kind === "readout" ? await session.prepareSettings() : await session.read();
      assert.equal(next.ok, true, "Only explicit invocation starts the other operation");
      assert.equal(session.inspect().executionEnabled, false);
      assert(Object.isFrozen(session.inspect()));
      cases++;
    }
  }
}
for (const kind of ["readout", "settings"]) {
  for (const at of [-1, 0, 1, 2, 3, 4]) {
    const state = { port: {}, reader: {}, writer: {}, settingsTicket: {}, revision: 1, connected: true, unlocked: true };
    const reached = deferred(), gate = deferred();
    let calls = 0, tick = 0, oldAppend;
    const wait = async () => { if (calls++ === at) { reached.resolve(); await gate.promise; } };
    const session = createReadOnlyDevelopmentSession({ readContext: () => state, api,
      profile: "iso15765_11bit_normal_h1_caf1_d0_s1_e0", readClock: () => tick++,
      async readCommand(command, append) { oldAppend = append; await wait(); append("NO DATA\r>"); return "complete"; },
      invalidateReceipts: () => true,
      beginSettingsGeneration() { state.settingsTicket = {}; return true; },
      async readResponse(command) { await wait(); return { completion: "complete", response: command === "ATDPN" ? "A6" : "OK" }; }
    });
    let pending, delivered;
    if (at !== -1) {
      pending = kind === "readout" ? session.read() : session.prepareSettings();
      if (at === 4) { delivered = await pending; assert.equal(delivered.ok, true); }
      else await reached.promise;
    }
    session.dispose(); session.dispose();
    const count = calls;
    assert.equal(session.inspect().status, "disposed");
    assert.equal(session.inspect().pending, at >= 0 && at < 4);
    assert.equal(session.cancel(), false);
    assert.equal((await session.read()).reason, "development_session_disposed");
    assert.equal((await session.prepareSettings()).reason, "development_session_disposed");
    if (oldAppend) assert.equal(oldAppend("late>"), false);
    if (at >= 0 && at < 4) {
      gate.resolve();
      const result = await pending;
      assert.equal(result.reason, "development_session_disposed");
      assert.equal(result.summary, null);
    }
    assert.equal(session.inspect().status, "disposed");
    assert.equal(session.inspect().pending, false);
    assert.equal(session.inspect().operation, null);
    assert.equal(calls, count, "Disposal must not start subsequent callbacks");
    assert.equal((await session.read()).reason, "development_session_disposed");
    // Already delivered immutable results are not retroactively erased.
    if (delivered) assert.equal(delivered.ok, true);
    cases++;
  }
}
console.log(`Development session: ${cases} exclusion/cancellation/failure/disposal cases passed; synthetic callbacks only`);
