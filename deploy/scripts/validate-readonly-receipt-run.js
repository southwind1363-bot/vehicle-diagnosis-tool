import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { createReadOnlyReceiptRun } from "./fixtures/readonly-receipt-run.js";
import { client, attachWire } from "./fixtures/serial-runtime-harness.js";
const host = vm.createContext({ window: {} });
vm.runInContext(fs.readFileSync(new URL("../obd-readonly.js", import.meta.url), "utf8"), host);
const api = host.window.ObdReadOnly;
const profile = "iso15765_11bit_normal_h1_caf1_d0_s1_e0";
const commands = ["03", "07", "0A", "0101"];
const initialization = ["ATZ", "ATE0", "ATL0", "ATS0", "ATH1", "ATSP0"];
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
const context = () => ({ port: {}, reader: {}, writer: {}, settingsTicket: {}, revision: 1, connected: true, unlocked: true });
for (const failure of [null, "reader", "clock_start", "clock_end"]) {
  for (const failAt of failure ? [0, 1, 2, 3] : [4]) {
    const c = client();
    const replies = Object.fromEntries(commands.map((command, index) => [command, failure === "reader" && index === failAt ? "NO DATA\r" : "NO DATA\r>"]));
    const wire = attachWire(c, 7, replies);
    let sink = null, ticks = 0;
    try {
      await c.context.initializeElmDeveloperAdapter();
      const state = c.context.obdDevSession;
      const retained = Object.freeze({ dtcSnapshot: Object.freeze({ codes: Object.freeze(["P0133"]) }) });
      state.lastSession = retained;
      c.context.obdSerialResultOwner.expectedLastSession = retained;
      const decoder = state.decoder;
      state.decoder = { decode(value, options) { const chunk = decoder.decode(value, options); if (chunk) sink?.(chunk); return chunk; } };
      const run = createReadOnlyReceiptRun(() => ({ port: state.port, reader: state.reader, writer: state.writer,
        settingsTicket: state.settingsObservation.owner.inspect(state.settingsObservation.ticket).ok ? state.settingsObservation.ticket : null,
        revision: c.context.obdSerialRevision, connected: state.readLoopActive && !c.context.obdSerialDisconnectOperation,
        unlocked: c.context.isCurrentObdSerialOperation(c.context.obdSerialRevision) }), api, profile,
      () => {
        const tick = ticks++;
        return (failure === "clock_start" && tick === failAt * 2) || (failure === "clock_end" && tick === failAt * 2 + 1) ? NaN : tick;
      }, async (command, append) => {
        sink = append;
        try { await c.context.sendElmDeveloperCommand(command, 80); return "complete"; }
        finally { sink = null; }
      });
      const result = await run.run();
      assert.equal(result.ok, failure === null, JSON.stringify({ failure, failAt, result }));
      assert.equal(result.completedCommandCount, failAt);
      assert.equal(state.lastSession, retained);
      assert.deepEqual(state.lastSession.dtcSnapshot.codes, ["P0133"]);
      const sentCount = failure === null ? 4 : failAt + (failure === "clock_start" ? 0 : 1);
      assert.deepEqual(wire.writes, [...initialization, ...commands.slice(0, sentCount)].map(command => command + "\r"));
      if (failure) assert.equal(result.summary, null);
      else { assert.equal(result.summary.receiptCount, 4); assert.equal(result.summary.realTransportProofAvailable, false); }
    } finally { await wire.close(); }
  }
}
{
  const state = context(), pending = deferred(), reached = deferred(), nextPending = deferred(), nextReached = deferred();
  const sent = []; let appendOld, ticks = 0;
  const run = createReadOnlyReceiptRun(() => state, api, profile, () => ticks++, async (command, append) => {
    sent.push(command);
    if (!appendOld) { appendOld = append; reached.resolve(); await pending.promise; }
    else if (sent.length === 2) { nextReached.resolve(); await nextPending.promise; }
    append("NO DATA\r>"); return "complete";
  });
  const first = run.run(); await reached.promise;
  assert.equal(run.cancel(), true);
  assert.equal((await run.run()).reason, "readout_busy");
  assert.equal(appendOld("late>"), false);
  pending.resolve();
  assert.equal((await first).reason, "readout_cancelled");
  assert.deepEqual(sent, ["03"]);
  assert.equal(run.cancel(), false);
  const next = run.run(); await nextReached.promise;
  assert.equal(appendOld("late>"), false);
  nextPending.resolve();
  const second = await next; assert.equal(second.ok, true);
  assert.equal(appendOld("late>"), false);
  assert.deepEqual(sent, ["03", ...commands]);
}
for (const failure of ["throw", "incomplete", "overflow", "invalid_chunk"]) {
  for (const failAt of [0, 1, 2, 3]) {
    const state = context(), sent = []; let ticks = 0, late;
    const run = createReadOnlyReceiptRun(() => state, api, profile, () => ticks++, async (command, append) => {
      const index = sent.length; sent.push(command); late = append;
      if (index === failAt) {
        if (failure === "throw") throw Error("private_reader_detail");
        if (failure === "overflow") { assert.equal(append("x".repeat(32769)), false); return "complete"; }
        if (failure === "invalid_chunk") { assert.equal(append(null), false); return "complete"; }
        append("NO DATA\r>"); return "timeout";
      }
      assert.equal(append("NO DATA\r>"), true); return "complete";
    });
    const result = await run.run();
    assert.equal(result.ok, false); assert.equal(result.summary, null);
    assert.equal(result.completedCommandCount, failAt);
    assert.deepEqual(sent, commands.slice(0, failAt + 1));
    assert.equal(late("late>"), false);
    assert.equal(JSON.stringify(result).includes("private_reader_detail"), false);
    assert.equal(Object.isFrozen(result), true);
  }
}
console.log("Receipt run: 13 real-function synthetic-wire cases preserve prior results and stop subsequent commands; cancellation waits for reader settlement before manual restart");
