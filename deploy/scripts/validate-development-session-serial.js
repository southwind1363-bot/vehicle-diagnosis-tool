// Production send/read functions, but only an in-memory byte queue. No physical device.
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { client, attachWire } from "./fixtures/serial-runtime-harness.js";
import { createReadOnlyDevelopmentSession } from "./fixtures/readonly-development-session.js";

const runtime = vm.createContext({ window: {} });
vm.runInContext(fs.readFileSync(new URL("../obd-readonly.js", import.meta.url), "utf8"), runtime);
const commands = ["03", "07", "0A", "0101"];
const initialization = ["ATZ", "ATE0", "ATL0", "ATS0", "ATH1", "ATSP0"];
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
let cases = 0;
const lifecycleEvents = ["pagehide", "reset", "reinitialize", "disconnect"];
for (const finish of ["complete", "cancel", "dispose", "timeout", ...lifecycleEvents]) {
  for (const at of [0, 1, 2, 3]) {
    const c = client(), gate = deferred(), reached = deferred();
    const replies = Object.fromEntries(commands.map((command, index) =>
      [command, finish === "timeout" && index === at ? "NO DATA\r" : "NO DATA\r>"]));
    const wire = attachWire(c, 7, replies);
    let owner, sink = null, oldAppend, disconnect, ticks = 0, settingsCalls = 0;
    try {
      await c.context.initializeElmDeveloperAdapter();
      const state = c.context.obdDevSession;
      const retained = Object.freeze({ dtcSnapshot: Object.freeze({ codes: Object.freeze(["P0133"]) }) });
      state.lastSession = retained;
      c.context.obdSerialResultOwner.expectedLastSession = retained;
      const decoder = state.decoder, write = state.writer.write;
      state.decoder = { decode(value, options) {
        const chunk = decoder.decode(value, options); if (chunk) sink?.(chunk); return chunk;
      } };
      state.writer.write = async bytes => {
        if (new TextDecoder().decode(bytes) === commands[at] + "\r") {
          reached.resolve(); await gate.promise;
        }
        return write(bytes);
      };
      owner = createReadOnlyDevelopmentSession({
        readContext: () => ({ port: state.port, reader: state.reader, writer: state.writer,
          settingsTicket: state.settingsObservation.owner.inspect(state.settingsObservation.ticket).ok ? state.settingsObservation.ticket : null,
          revision: c.context.obdSerialRevision, connected: state.readLoopActive && !c.context.obdSerialDisconnectOperation,
          unlocked: c.context.isCurrentObdSerialOperation(c.context.obdSerialRevision) }),
        api: runtime.window.ObdReadOnly, profile: "iso15765_11bit_normal_h1_caf1_d0_s1_e0", readClock: () => ticks++,
        async readCommand(command, append) {
          sink = oldAppend = append;
          try { await c.context.sendElmDeveloperCommand(command, 80); return "complete"; }
          finally { sink = null; }
        },
        // Actual settings preparation stays unavailable in this binding.
        invalidateReceipts() { settingsCalls++; return false; },
        beginSettingsGeneration() { throw Error("unexpected_settings_rotation"); },
        readResponse() { throw Error("unexpected_settings_reader"); }
      });
      const pending = owner.read();
      await reached.promise;
      const writes = [...wire.writes];
      assert.equal(owner.inspect().pending, true);
      assert.equal((await owner.read()).reason, "development_operation_busy");
      assert.equal((await owner.prepareSettings()).reason, "development_operation_busy");
      assert.equal(settingsCalls, 0);
      if (finish === "cancel") assert.equal(owner.cancel(), true);
      if (finish === "dispose") owner.dispose();
      if (finish === "pagehide") c.pagehide();
      if (finish === "reset") c.context.resetWebSerialConnectionAttemptMetadata();
      if (finish === "reinitialize") {
        await assert.rejects(c.context.initializeElmDeveloperAdapter(), /elm_write_busy/);
      }
      if (finish === "disconnect") disconnect = c.context.disconnectObdDeveloperVci({ reason: "device_disconnected" });
      if (lifecycleEvents.includes(finish)) {
        assert.equal(oldAppend("late>"), false, "Changed lifecycle invalidates the active capture");
        assert.equal(owner.inspect().pending, true);
        assert.equal((await owner.read()).reason, "development_operation_busy");
        assert.equal((await owner.prepareSettings()).reason, "development_operation_busy");
      }
      if (["cancel", "dispose"].includes(finish)) {
        assert.equal(oldAppend("late>"), false);
        assert.equal(owner.inspect().pending, true, "Cancellation is not transport completion");
        const reason = finish === "dispose" ? "development_session_disposed" : "development_operation_busy";
        assert.equal((await owner.read()).reason, reason);
        assert.equal((await owner.prepareSettings()).reason, reason);
      }
      assert.deepEqual(wire.writes, writes);
      assert.equal(settingsCalls, 0);
      // Let the already pending synthetic write finish; cancellation cannot retract it.
      gate.resolve();
      const result = await pending;
      if (disconnect) await disconnect;
      assert.equal(result.ok, finish === "complete");
      if (finish !== "complete") assert.equal(result.summary, null);
      else {
        assert.equal(result.summary.receiptCount, 4);
        assert.equal(result.summary.realTransportProofAvailable, false);
      }
      assert.equal(oldAppend("late>"), false);
      assert.equal(state.lastSession, retained);
      assert.equal(c.context.obdSerialResultOwner.expectedLastSession, retained);
      assert.deepEqual(wire.writes, [...initialization, ...commands.slice(0, finish === "complete" ? 4 : at + 1)].map(command => command + "\r"));
      assert.equal(owner.inspect().pending, false);
      assert.equal(owner.inspect().executionEnabled, false);
      const finishedWrites = [...wire.writes];
      assert.equal((await owner.prepareSettings()).ok, false);
      assert.deepEqual(wire.writes, finishedWrites, "No settings commands sent even on explicit preparation");
      assert.equal(settingsCalls, finish === "dispose" ? 0 : 1);
      for (const command of ["ATCAF1", "ATD0", "ATCEA", "04"]) {
        assert.equal(c.context.isAllowedObdDeveloperCommand(command), false);
      }
      if (lifecycleEvents.includes(finish)) {
        const expiredAppend = oldAppend;
        assert.equal((await owner.read()).ok, false, "No new capture before valid settings context");
        assert.deepEqual(wire.writes, finishedWrites, "Invalid context must fail before send");
        if (finish !== "disconnect") {
          // Explicit new initialization on the synthetic wire; never auto-retry.
          await c.context.initializeElmDeveloperAdapter();
          assert.equal(expiredAppend("late>"), false, "New settings cannot revive the previous receipt");
          assert.equal(state.settingsObservation.owner.inspect(state.settingsObservation.ticket).summary.profile, null);
          assert.equal((await owner.read()).ok, true);
          assert.deepEqual(wire.writes, [...finishedWrites, ...initialization.map(command => command + "\r"), ...commands.map(command => command + "\r")]);
          assert.equal(state.lastSession, retained);
        } else {
          assert.equal(state.port, null);
          assert.equal(state.connectionState, "disconnected");
        }
      }
      cases++;
    } finally { gate.resolve(); owner?.dispose(); await wire.close(); }
  }
}
console.log(`Development session / production serial functions: ${cases} completion/cancel/dispose/timeout/lifecycle paths passed; synthetic wire only`);
