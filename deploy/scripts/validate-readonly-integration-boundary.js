// Executable counterexample to rebuilding receipts from normalized display text.
// Production serial functions run only on the existing in-memory wire.
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { client, attachWire } from "./fixtures/serial-runtime-harness.js";
import { createReadOnlyReceiptRun } from "./fixtures/readonly-receipt-run.js";

const runtime = vm.createContext({ window: {} });
vm.runInContext(fs.readFileSync(new URL("../obd-readonly.js", import.meta.url), "utf8"), runtime);
const commands = ["03", "07", "0A", "0101"];
const profile = "iso15765_11bit_normal_h1_caf1_d0_s0_e0";
const lines = ["7E8024300AAAAAAAAAA", "7E8024700AAAAAAAAAA", "7E8024A00AAAAAAAAAA", "7E806410100070100AA"];
const initialization = ["ATZ", "ATE0", "ATL0", "ATS0", "ATH1", "ATSP0"];
const observed = [];
for (const separator of ["\r", "\n"]) {
  const c = client();
  const replies = lines.map(line => line + separator + ">");
  const wire = attachWire(c, 7, Object.fromEntries(commands.map((command, i) => [command, replies[i]])));
  try {
    await c.context.initializeElmDeveloperAdapter();
    const state = c.context.obdDevSession;
    const retained = Object.freeze({ marker: "existing-diagnostic-session" });
    state.lastSession = retained;
    c.context.obdSerialResultOwner.expectedLastSession = retained;
    const settings = state.settingsObservation.owner.inspect(state.settingsObservation.ticket);
    assert.equal(settings.ok, true);
    assert.equal(settings.summary.profile, null);
    assert.equal(settings.summary.profileVerified, false);
    // A current generation does not establish the parser's declared profile.
    const context = () => ({ port: state.port, reader: state.reader, writer: state.writer,
      settingsTicket: state.settingsObservation.ticket, revision: c.context.obdSerialRevision,
      connected: true, unlocked: true });
    let sink = null, ticks = 0;
    const decoder = state.decoder, raw = [], normalized = [];
    state.decoder = { decode(value, options) {
      const chunk = decoder.decode(value, options);
      if (chunk) sink?.(chunk);
      return chunk;
    } };
    const run = createReadOnlyReceiptRun(context, runtime.window.ObdReadOnly, profile, () => ticks++,
      async (command, append) => {
        let transcript = "";
        sink = chunk => { transcript += chunk; assert.equal(append(chunk), true); };
        try {
          normalized.push(await c.context.sendElmDeveloperCommand(command, 80));
          raw.push(transcript);
          return "complete";
        } finally { sink = null; }
      });
    const result = await run.run();
    assert.equal(result.ok, true, `Acquisition completion is separate from raw grammar acceptance: ${result.reason}`);
    assert.deepEqual(raw, replies);
    assert.deepEqual(normalized, lines);
    assert.equal(result.summary.rawTranscriptValidation.status, separator === "\r" ? "parsed" : "rejected");
    assert.equal(result.summary.profileEvidence, "caller_declared_only");
    assert.equal(result.summary.realTransportProofAvailable, false);
    assert.equal(result.summary.executionEnabled, false);
    assert.equal(state.lastSession, retained);
    assert.deepEqual(wire.writes, [...initialization, ...commands].map(command => command + "\r"));
    for (const command of ["ATCAF1", "ATD0", "ATCEA", "04"]) {
      assert.equal(c.context.isAllowedObdDeveloperCommand(command), false);
    }
    observed.push({ raw, normalized, status: result.summary.rawTranscriptValidation.status });
  } finally { await wire.close(); }
}
assert.notDeepEqual(observed[0].raw, observed[1].raw);
assert.deepEqual(observed[0].normalized, observed[1].normalized);
assert.notEqual(observed[0].status, observed[1].status);
// Restoring CR and a prompt would invent the accepted form for BOTH inputs.
assert.deepEqual(observed[1].normalized.map(line => line + "\r>"), observed[0].raw);
console.log("Read-only integration boundary: CR/LF raw evidence differs despite identical production display text; settings profile remains unverified; synthetic wire only");
