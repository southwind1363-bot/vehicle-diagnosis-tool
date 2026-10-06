// Test-only raw boundary wiring. Production receipt capture is not installed.
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { client, attachWire } from "./fixtures/serial-runtime-harness.js";
import { createReadOnlyReceiptSession } from "./fixtures/readonly-receipt-session.js";
const runtime = vm.createContext({ window: {} });
vm.runInContext(fs.readFileSync(new URL("../obd-readonly.js", import.meta.url), "utf8"), runtime);
const api = runtime.window.ObdReadOnly;
const commands = ["03", "07", "0A", "0101"];
const initialization = ["ATZ", "ATE0", "ATL0", "ATS0", "ATH1", "ATSP0"];
const base = ["7E8 02 43 00 AA AA AA AA AA\r>", "7E8 02 47 00 AA AA AA AA AA\r>",
  "7E8 02 4A 00 AA AA AA AA AA\r>", "7E8 06 41 01 00 07 01 00 AA\r\n>"];
let checks = 0;
const check = (value, message) => { assert.ok(value, message); checks++; };
async function setup(size, profile, replies, interrupt = false) {
  const c = client(), wire = attachWire(c, size, Object.fromEntries(commands.map((command, i) => [command, replies[i]])));
  await c.context.initializeElmDeveloperAdapter();
  const state = c.context.obdDevSession;
  const receipts = createReadOnlyReceiptSession(() => ({ port: state.port, reader: state.reader, writer: state.writer,
    settingsTicket: state.settingsObservation.owner.inspect(state.settingsObservation.ticket).ok ? state.settingsObservation.ticket : null,
    revision: c.context.obdSerialRevision, connected: state.readLoopActive && !c.context.obdSerialDisconnectOperation,
    unlocked: c.context.isCurrentObdSerialOperation(c.context.obdSerialRevision) }), api, profile);
  const attempt = receipts.begin().ticket;
  let active, interrupted = false;
  const decoder = state.decoder;
  state.decoder = { decode(value, options) {
    const chunk = decoder.decode(value, options);
    if (interrupt && !interrupted) {
      interrupted = true;
      if (interrupt === "reader" || interrupt === "writer") state[interrupt] = {};
      else if (interrupt === "revision") c.context.obdSerialRevision++;
      else if (interrupt === "lock") c.context.obdAccessUnlocked = false;
      else void c.context.disconnectObdDeveloperVci({ reason: "device_disconnected" });
    }
    if (chunk) receipts.append(attempt, active, chunk);
    return chunk;
  } };
  return { c, wire, receipts, attempt, async read(index) {
    // Declared test timing, not measured hardware time.
    active = receipts.startCommand(attempt, commands[index], index * 2).ticket;
    try {
      const response = await c.context.sendElmDeveloperCommand(commands[index], 80);
      const ended = receipts.endCommand(attempt, active, index * 2 + 1, "complete");
      return { response, ended, commandTicket: active };
    } catch (error) {
      receipts.invalidate();
      return { error: error.message, commandTicket: active };
    }
  } };
}
for (const spaces of ["s1", "s0"]) {
  const profile = `iso15765_11bit_normal_h1_caf1_d0_${spaces}_e0`;
  for (const size of [1, 7, 32768]) {
    const replies = spaces === "s0" ? base.map(value => value.replaceAll(" ", "")) : base;
    const h = await setup(size, profile, replies);
    try {
      for (let i = 0; i < 4; i++) {
        const read = await h.read(i);
        check(read.ended?.ok && !read.error, "same connection accepts completed command");
        check(read.response === replies[i].slice(0, -1).replace(/\r\n?/g, "\n").trim(), "display normalization stays separate from raw capture");
        check(!h.receipts.append(h.attempt, read.commandTicket, "late").ok, "ended command rejects late data");
      }
      const result = h.receipts.finish(h.attempt, "complete");
      check(result.ok && result.summary.rawTranscriptValidation.status === "parsed", "four real receive paths join raw evaluation");
      check(!result.summary.realTransportProofAvailable && !result.summary.wouldTransmit, "synthetic bytes confer no real-world authority");
      assert.deepEqual(h.wire.writes, [...initialization, ...commands].map(command => command + "\r")); checks++;
      await h.c.context.disconnectObdDeveloperVci({ reason: "device_disconnected" });
      check(h.receipts.inspect(h.attempt).summary === null, "real disconnect function makes completed receipt unavailable");
    } finally { h.receipts.invalidate(); await h.wire.close(); }
  }
}
const profile = "iso15765_11bit_normal_h1_caf1_d0_s1_e0";
for (const reply of ["NO DATA\r>", base[0].replaceAll(" ", ""), base[0].replace("\r", "\n")]) {
  const h = await setup(1, profile, [reply, ...base.slice(1)]);
  try {
    for (let i = 0; i < 4; i++) check((await h.read(i)).ended.ok, "receive completion remains separate from grammar");
    const summary = h.receipts.finish(h.attempt, "complete").summary;
    check(summary.rawTranscriptValidation.status === (reply.startsWith("NO DATA") ? "parsed" : "rejected"), "unsupported grammar is not normalized into evidence");
    check(!summary.payloadSemanticsVerified, "partial/no-data receipt never gains blanket authority");
  } finally { h.receipts.invalidate(); await h.wire.close(); }
}
for (const [reply, interrupt] of [[base[0].replace(">", ""), false], ["x".repeat(12001), false],
  ...["disconnect", "reader", "writer", "revision", "lock"].map(reason => [base[0], reason])]) {
  const h = await setup(7, profile, [reply, ...base.slice(1)], interrupt);
  try {
    const result = await h.read(0);
    check(!!result.error && !result.ended, "timeout/oversize/disconnect cannot complete receipt");
    check(h.receipts.inspect(h.attempt).summary === null, "failed transport discards capture in test wiring");
    check(!h.receipts.append(h.attempt, result.commandTicket, ">").ok, "late prompt cannot repair failure");
    assert.deepEqual(h.wire.writes, [...initialization, "03"].map(command => command + "\r")); checks++;
  } finally { h.receipts.invalidate(); await h.wire.close(); }
}
for (const phase of ["collecting", "finished"]) {
  for (const event of ["reinitialize", "pagehide", "reset", "owner_invalidate", "protocol_requery"]) {
    const h = await setup(7, profile, base);
    try {
      const state = h.c.context.obdDevSession;
      const before = { port: state.port, reader: state.reader, writer: state.writer, revision: h.c.context.obdSerialRevision };
      if (phase === "finished") {
        for (let i = 0; i < 4; i++) check((await h.read(i)).ended.ok, "read before settings transition");
        check(h.receipts.finish(h.attempt, "complete").ok, "finish before settings transition");
      }
      if (event === "reinitialize") await h.c.context.initializeElmDeveloperAdapter();
      if (event === "pagehide") h.c.pagehide();
      if (event === "reset") h.c.context.resetWebSerialConnectionAttemptMetadata();
      if (event === "owner_invalidate") state.settingsObservation.owner.invalidate();
      if (event === "protocol_requery") {
        await h.c.context.captureObdDeveloperProtocolAfterStoredDtc();
        await h.c.context.captureObdDeveloperProtocolAfterStoredDtc();
      }
      check(before.port === state.port && before.reader === state.reader && before.writer === state.writer
        && before.revision === h.c.context.obdSerialRevision, "settings transition keeps transport identities unchanged");
      check(h.receipts.inspect(h.attempt).summary === null, `${phase}/${event}: old receipt no longer usable`);
      check(!h.receipts.startCommand(h.attempt, "03", 0).ok, "old receipt cannot restart after settings transition");
      if (event === "reinitialize") {
        check(h.receipts.begin().ok, "new settings generation permits a new declared-profile model attempt");
        check(state.settingsObservation.owner.inspect(state.settingsObservation.ticket).summary.profile === null,
          "generation binding does not prove communication settings");
      } else check(!h.receipts.begin().ok, "missing or invalid settings observation blocks model begin");
    } finally { h.receipts.invalidate(); await h.wire.close(); }
  }
}
console.log(`Receipt runtime handoff: ${checks} checks passed; synthetic ports, declared profiles/timing, test-only capture hook`);
