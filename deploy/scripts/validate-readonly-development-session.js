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
console.log(`Development session: ${cases} cross-operation exclusion/cancellation/failure cases passed; synthetic callbacks only`);
