import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { createReadOnlyDevelopmentSession } from "./fixtures/readonly-development-session.js";
import { formatSingleReadoutReceiptPreview } from "./fixtures/single-readout-receipt-preview.js";
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
// A backwards clock may occur after a response or before the next command.
// Exercise the shared owner, including recovery after a previously good result.
for (const boundary of [1, 2, 3, 4, 5, 6, 7]) {
  const state = { port: {}, reader: {}, writer: {}, settingsTicket: {}, revision: 1, connected: true, unlocked: true };
  const commands = ["03", "07", "0A", "0101"], sent = [], callbacks = [];
  let failureAt = -1, ticks = 0, parses = 0, settingsCalls = 0, stale = [];
  const session = createReadOnlyDevelopmentSession({ readContext: () => state,
    api: { ...api, parseElmReadOnlyRawTranscript(input) { parses++; return api.parseElmReadOnlyRawTranscript(input); } },
    profile: "iso15765_11bit_normal_h1_caf1_d0_s1_e0",
    readClock() { const position = ticks++; return position === failureAt ? 0 : 10 + position; },
    async readCommand(command, append) {
      for (const previous of stale) assert.equal(previous("late>"), false);
      sent.push(command); callbacks.push(append);
      assert.equal(append("NO DATA\r>"), true); return "complete";
    },
    invalidateReceipts() { settingsCalls++; return true; },
    beginSettingsGeneration() { settingsCalls++; return true; },
    readResponse() { settingsCalls++; throw Error("unexpected_settings_callback"); }
  });
  try {
    const previous = await session.read(); assert.equal(previous.ok, true);
    const previousText = JSON.stringify(previous);
    stale = [...callbacks]; callbacks.length = 0; sent.length = 0; parses = 0; ticks = 0; failureAt = boundary;
    const failed = await session.read();
    assert.equal(failed.reason, "receipt_clock_unavailable");
    assert.equal(failed.ok, false); assert.equal(failed.summary, null);
    assert.equal(failed.completedCommandCount, Math.floor(boundary / 2));
    assert.equal(ticks, boundary + 1);
    assert.deepEqual(sent, commands.slice(0, Math.ceil(boundary / 2)));
    assert.equal(parses, 0, "An incomplete timed run must not reach the completed-record parser");
    assert.equal(session.inspect().status, "idle"); assert.equal(session.inspect().pending, false);
    assert.equal(JSON.stringify(previous), previousText, "Failure must not mutate an already delivered result");
    stale.push(...callbacks); callbacks.length = 0; sent.length = 0; ticks = 0; failureAt = -1;
    const recovered = await session.read();
    assert.equal(recovered.ok, true); assert.notEqual(recovered.summary, previous.summary);
    assert.deepEqual(sent, commands); assert.equal(parses, 4);
    assert.equal(settingsCalls, 0, "Clock recovery does not implicitly prepare settings");
    assert.equal(recovered.executionEnabled, false);
    cases++;
  } finally { session.dispose(); }
}
// All bytes may arrive successfully while final parsing/observation still fails.
for (const failAt of [0, 1, 2, 3, 'observation']) {
  const state = { port: {}, reader: {}, writer: {}, settingsTicket: {}, revision: 1, connected: true, unlocked: true };
  const commands = ['03', '07', '0A', '0101'], sent = [], callbacks = [];
  let inject = false, ticks = 0, parses = 0, observations = 0, settingsCalls = 0;
  const session = createReadOnlyDevelopmentSession({ readContext: () => state,
    api: { ...api,
      parseElmReadOnlyRawTranscript(input) {
        const index = parses++;
        if (inject && index === failAt) throw Error('private_parser_failure');
        return api.parseElmReadOnlyRawTranscript(input);
      },
      evaluateSingleReadoutRawReceipts(input) {
        observations++;
        if (inject && failAt === 'observation') throw Error('private_observer_failure');
        return api.evaluateSingleReadoutRawReceipts(input);
      }
    },
    profile: 'iso15765_11bit_normal_h1_caf1_d0_s1_e0', readClock: () => ticks++,
    async readCommand(command, append) { sent.push(command); callbacks.push(append); append('NO DATA\r>'); return 'complete'; },
    invalidateReceipts() { settingsCalls++; return true; },
    beginSettingsGeneration() { settingsCalls++; return true; },
    readResponse() { settingsCalls++; throw Error('unexpected_settings_callback'); }
  });
  try {
    const previous = await session.read(); assert.equal(previous.ok, true);
    const previousText = JSON.stringify(previous);
    inject = true; parses = 0; observations = 0; sent.length = 0;
    const failed = await session.read();
    assert.equal(failed.ok, false); assert.equal(failed.reason, 'raw_validation_failed');
    assert.equal(failed.completedCommandCount, 4); assert.equal(failed.summary, null);
    assert.deepEqual(sent, commands, 'Acquisition completion does not imply successful validation');
    assert.equal(parses, failAt === 'observation' ? 4 : failAt + 1);
    assert.equal(observations, failAt === 'observation' ? 1 : 0);
    assert.equal(formatSingleReadoutReceiptPreview(failed).text, null);
    assert(!JSON.stringify(failed).includes('private_'));
    assert.equal(JSON.stringify(previous), previousText);
    assert.equal(session.inspect().status, 'idle'); assert.equal(session.inspect().pending, false);
    for (const append of callbacks) assert.equal(append('late>'), false);
    inject = false; parses = 0; observations = 0; sent.length = 0;
    const recovered = await session.read();
    assert.equal(recovered.ok, true); assert.notEqual(recovered.summary, previous.summary);
    assert.equal(parses, 4); assert.equal(observations, 1); assert.deepEqual(sent, commands);
    assert.match(formatSingleReadoutReceiptPreview(recovered).text, /NO DATA報告あり/);
    assert.equal(settingsCalls, 0); assert.equal(recovered.executionEnabled, false);
    cases++;
  } finally { session.dispose(); }
}
console.log(`Development session: ${cases} exclusion/cancellation/failure/disposal, backwards-clock and final-validation recovery cases passed; synthetic callbacks only`);
