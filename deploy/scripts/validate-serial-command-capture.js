import assert from "node:assert/strict";
import { createSerialCommandCapture } from "./fixtures/serial-command-capture.js";
import { client, attachWire } from "./fixtures/serial-runtime-harness.js";

let cases = 0;
function setup() {
  let state = { port: {}, reader: {}, writer: {}, settingsTicket: {}, revision: 1, connected: true, unlocked: true };
  let time = 0, provider = () => state, timer = () => time++;
  const capture = createSerialCommandCapture({ readContext: () => provider(), readClock: () => timer() });
  const operation = {};
  assert.equal(capture.begin(operation, "03").ok, true);
  return { capture, operation, state, setProvider(value) { provider = value; }, setClock(value) { timer = value; } };
}
for (const phase of ["collecting", "finished"]) {
  for (const field of ["port", "reader", "writer", "settingsTicket", "revision", "connected", "unlocked"]) {
    const h = setup();
    assert.equal(h.capture.append(h.operation, "NO DATA\r>").ok, true);
    if (phase === "finished") assert.equal(h.capture.finish(h.operation, "complete").ok, true);
    h.state[field] = typeof h.state[field] === "object" ? {} : field === "revision" ? 2 : false;
    assert.equal(h.capture.take(h.operation).record, null);
    assert.equal(h.capture.append(h.operation, "late>").ok, false);
    assert.equal(h.capture.begin({}, "03").ok, !["connected", "unlocked"].includes(field));
    cases++;
  }
}
for (const fault of ["null", "throw", "accessor", "backward", "nan", "clock_throw", "invalidate", "reentry"]) {
  const h = setup();
  h.capture.append(h.operation, "NO DATA\r>");
  h.capture.finish(h.operation, "complete");
  if (fault === "null") h.setProvider(() => null);
  if (fault === "throw") h.setProvider(() => { throw Error("private"); });
  if (fault === "accessor") h.setProvider(() => Object.defineProperty({ ...h.state }, "port", { get() { assert.fail("getter must not run"); } }));
  if (fault === "backward") h.setClock(() => 0);
  if (fault === "nan") h.setClock(() => NaN);
  if (fault === "clock_throw") h.setClock(() => { throw Error("private"); });
  if (fault === "invalidate") h.setProvider(() => { h.capture.invalidate(); return h.state; });
  if (fault === "reentry") h.setProvider(() => {
    assert.equal(h.capture.begin({}, "03").reason, "capture_busy");
    assert.equal(h.capture.take(h.operation).reason, "capture_busy");
    return h.state;
  });
  const result = h.capture.take(h.operation);
  assert.equal(result.ok, fault === "reentry");
  if (!result.ok) assert.equal(result.record, null);
  assert.equal(h.capture.take(h.operation).ok, false);
  cases++;
}
for (const length of [11999, 12000, 12001]) {
  const h = setup();
  assert.equal(h.capture.append(h.operation, "x".repeat(length)).ok, length <= 12000);
  assert.equal(h.capture.finish(h.operation, "complete").ok, length <= 12000);
  const result = h.capture.take(h.operation);
  assert.equal(result.ok, length <= 12000);
  if (result.ok) assert.equal(result.record.transcript.length, length);
  cases++;
}
for (const completion of ["timeout", "cancelled", "error", undefined]) {
  const h = setup();
  h.capture.append(h.operation, "partial");
  assert.equal(h.capture.finish(h.operation, completion).ok, false);
  assert.equal(h.capture.take(h.operation).record, null);
  cases++;
}
{
  const h = setup(), stale = {};
  assert.equal(h.capture.take(h.operation).reason, "capture_unfinished");
  assert.equal(h.capture.append(stale, "old").ok, false);
  assert.equal(h.capture.finish(stale, "complete").ok, false);
  assert.equal(h.capture.begin({}, "07").reason, "capture_busy");
  assert.equal(h.capture.append(h.operation, " \r\nNO DATA\r> ").ok, true);
  assert.equal(h.capture.finish(h.operation, "complete").ok, true);
  assert.equal(h.capture.append(h.operation, "late").reason, "capture_ended");
  const result = h.capture.take(h.operation);
  assert.equal(result.record.transcript, " \r\nNO DATA\r> ");
  assert.equal(Object.isFrozen(result.record), true);
  assert.equal(result.record.profile, null);
  assert.equal(result.record.realTransportProofAvailable, false);
  assert.equal(h.capture.take(h.operation).ok, false);
  assert.equal(h.capture.begin({}, "04").ok, false);
  cases++;
}

// Wire only inside the test: exact production commandOperation is the capture key.
for (const size of [1, 7, 32768]) {
  for (const mode of ["complete", "timeout", "capture_invalidated"]) {
    const failure = mode === "timeout";
    const c = client(), text = failure ? "NO DATA\r" : " \r\nNO DATA\r> ";
    const wire = attachWire(c, size, { "03": text });
    try {
      await c.context.initializeElmDeveloperAdapter();
      const state = c.context.obdDevSession, previous = state.lastSession;
      let tick = 0, operation;
      const capture = createSerialCommandCapture({
        readContext: () => ({ port: state.port, reader: state.reader, writer: state.writer,
          settingsTicket: state.settingsObservation.owner.inspect(state.settingsObservation.ticket).ok ? state.settingsObservation.ticket : null,
          revision: c.context.obdSerialRevision, connected: state.readLoopActive && !c.context.obdSerialDisconnectOperation,
          unlocked: c.context.isCurrentObdSerialOperation(c.context.obdSerialRevision) }), readClock: () => tick++ });
      const write = state.writer.write, decoder = state.decoder;
      state.writer.write = bytes => {
        operation = state.pendingCommandOperation;
        assert.ok(operation);
        assert.equal(capture.begin(operation, "03").ok, true);
        return write(bytes);
      };
      state.decoder = { decode(value, options) {
        const chunk = decoder.decode(value, options);
        if (chunk) {
          if (mode === "capture_invalidated") capture.invalidate();
          assert.equal(capture.append(operation, chunk).ok, mode !== "capture_invalidated");
        }
        return chunk;
      } };
      if (failure) {
        await assert.rejects(c.context.sendElmDeveloperCommand("03", 80), /elm_response_timeout:03/);
        capture.invalidate();
        assert.equal(capture.take(operation).record, null);
      } else {
        assert.equal(await c.context.sendElmDeveloperCommand("03", 80), "NO DATA");
        assert.equal(capture.finish(operation, "complete").ok, mode !== "capture_invalidated");
        const captured = capture.take(operation);
        if (mode === "capture_invalidated") assert.equal(captured.record, null);
        else {
          assert.equal(captured.record.transcript, text);
          assert.ok(captured.record.completedAt >= captured.record.startedAt);
          assert.equal(captured.record.executionEnabled, false);
        }
      }
      assert.equal(state.lastSession, previous);
      assert.equal(state.pendingCommandOperation, null);
      assert.deepEqual(wire.writes, ["ATZ", "ATE0", "ATL0", "ATS0", "ATH1", "ATSP0", "03"].map(command => command + "\r"));
      cases++;
    } finally { await wire.close(); }
  }
}
console.log(`Single-command capture: ${cases} lifetime/clock/boundary and synthetic serial cases passed; application receive hook not installed`);
