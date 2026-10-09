// Actual application capture hook on a synthetic wire; no decoder replacement.
import assert from "node:assert/strict";
import { client, attachWire } from "./fixtures/serial-runtime-harness.js";
let cases = 0;
for (const size of [1, 7, 32768]) {
  for (const mode of ["complete", "timeout", "settings_missing", "settings_changed", "write_failed", "cancelled", "ordinary"]) {
    const c = client(), raw = mode === "timeout" ? "NO DATA\r" : " \r\nNO DATA\r> ";
    const wire = attachWire(c, size, { "03": raw });
    try {
      await c.context.initializeElmDeveloperAdapter();
      const state = c.context.obdDevSession, previous = state.lastSession;
      if (mode === "settings_missing") state.settingsObservation.owner.invalidate();
      const write = state.writer.write;
      let operation, owner;
      state.writer.write = async bytes => {
        operation = state.pendingCommandOperation;
        owner = operation.capture;
        assert.equal(!!owner, !["ordinary", "settings_missing"].includes(mode));
        if (mode === "settings_changed") state.settingsObservation.owner.invalidate();
        if (mode === "cancelled") c.context.obdAccessUnlocked = false;
        if (mode === "write_failed") throw Error("synthetic_write_failure");
        return write(bytes);
      };
      if (["timeout", "write_failed", "cancelled"].includes(mode)) {
        await assert.rejects(c.context.readElmDeveloperCommandRecord("03", 80),
          mode === "timeout" ? /elm_response_timeout:03/ : mode === "cancelled" ? /elm_operation_cancelled/ : /elm_transport_write_failed:03/);
      } else if (mode === "ordinary") {
        assert.equal(await c.context.sendElmDeveloperCommand("03", 80), "NO DATA");
      } else {
        const result = await c.context.readElmDeveloperCommandRecord("03", 80);
        assert.equal(result.response, "NO DATA");
        assert.equal(Object.isFrozen(result), true);
        if (mode !== "complete") assert.equal(result.record, null);
        else {
          assert.equal(result.record.transcript, raw);
          assert.equal(result.record.command, "03");
          assert.equal(result.record.profile, null);
          assert.equal(result.record.profileVerified, false);
          assert.equal(result.record.executionEnabled, false);
          assert.equal(result.record.realTransportProofAvailable, false);
          assert.equal(Object.isFrozen(result.record), true);
        }
      }
      assert.equal(operation.capture, null);
      if (owner) assert.equal(owner.take(operation).record, null, "No retained raw record after wrapper exit");
      assert.equal(state.pendingCommandOperation, null);
      assert.equal(state.lastSession, previous);
      assert.deepEqual(wire.writes, ["ATZ", "ATE0", "ATL0", "ATS0", "ATH1", "ATSP0",
        ...(mode === "write_failed" ? [] : ["03"])].map(command => command + "\r"));
      cases++;
    } finally { await wire.close(); }
  }
}
{
  const c = client(), wire = attachWire(c, 7, { "03": "NO DATA\r>", "07": "NO DATA\n>", "0A": "NO DATA\r\n>", "0101": "NO DATA\r>" });
  try {
    await c.context.initializeElmDeveloperAdapter();
    const records = [];
    for (const command of ["03", "07", "0A", "0101"]) {
      const result = await c.context.readElmDeveloperCommandRecord(command, 80);
      assert.equal(result.record.command, command);
      records.push(result.record);
    }
    assert.deepEqual(records.map(value => value.transcript), ["NO DATA\r>", "NO DATA\n>", "NO DATA\r\n>", "NO DATA\r>"]);
    const before = [...wire.writes];
    await assert.rejects(c.context.readElmDeveloperCommandRecord("04", 80), /許可していない/);
    assert.deepEqual(wire.writes, before);
    const adapter = await c.context.readElmDeveloperCommandRecord("ATI", 80);
    assert.equal(adapter.record, null, "Capture only applies to the four designated read commands");
    cases++;
  } finally { await wire.close(); }
}
{
  const c = client(), wire = attachWire(c, 7, { "03": "NO DATA\r>" });
  try {
    await c.context.initializeElmDeveloperAdapter();
    const state = c.context.obdDevSession, settings = state.settingsObservation;
    const write = state.writer.write;
    state.writer.write = bytes => {
      // An observation arriving after the read starts cannot prove its earlier conditions.
      assert.equal(settings.owner.recordProtocol(settings.ticket, "A6").ok, true);
      return write(bytes);
    };
    const result = await c.context.readElmDeveloperCommandRecord("03", 80);
    assert.equal(settings.owner.inspect(settings.ticket).summary.protocol11bitReported, true);
    assert.equal(result.record.settingsBeforeRead.protocol11bitReported, false);
    assert.equal(Object.isFrozen(result.record.settingsBeforeRead), true);
    assert.equal(result.record.settingsBeforeRead.initializationComplete, true);
    assert.equal(result.response, "NO DATA");
    assert.equal(wire.writes.at(-1), "03\r");
    cases++;
  } finally { await wire.close(); }
}
console.log(`Production capture hook: ${cases} synthetic paths passed; raw data consumed or discarded, ordinary API preserved`);
