import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { createReadOnlyReceiptRun } from "./fixtures/readonly-receipt-run.js";
import { client, attachWire } from "./fixtures/serial-runtime-harness.js";
import { formatSingleReadoutReceiptPreview } from "./fixtures/single-readout-receipt-preview.js";
import { createSingleReadoutPreviewSession } from "./fixtures/single-readout-preview-session.js";
import { createSingleReadoutRunPreviewSession } from "./fixtures/single-readout-run-preview-session.js";
import { createSingleReadoutSample } from "./fixtures/single-readout-sample.js";
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
      const display = formatSingleReadoutReceiptPreview(result);
      if (failure) { assert.equal(display.ok, false); assert.equal(display.text, null); }
      else { assert.equal(display.ok, true); assert.match(display.text, /NO DATA報告あり。故障コード0件とは判断できません/); }
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

// Lose connection ownership at every command, both during delivery and after
// the final chunk while the trusted reader is still pending. Neither a complete
// transcript nor a later successful reader return may revive the old attempt.
for (const field of ["port", "reader", "writer", "settingsTicket", "revision", "connected", "unlocked"]) {
  for (const failAt of [0, 1, 2, 3]) {
    for (const phase of ["chunk", "settlement"]) {
      const state = context(), sent = [], pending = deferred(), reached = deferred();
      let ticks = 0, parses = 0, late;
      const run = createReadOnlyReceiptRun(() => state, { ...api, parseElmReadOnlyRawTranscript(input) {
        parses++; return api.parseElmReadOnlyRawTranscript(input);
      } }, profile, () => ticks++, async (command, append) => {
        const index = sent.length; sent.push(command); late = append;
        if (index !== failAt) { assert.equal(append("NO DATA\r>"), true); return "complete"; }
        assert.equal(append(phase === "chunk" ? "NO " : "NO DATA\r>"), true);
        reached.resolve(); await pending.promise;
        if (phase === "chunk") assert.equal(append("DATA\r>"), false);
        return "complete";
      });
      const resultPromise = run.run(); await reached.promise;
      state[field] = field === "revision" ? 2 : ["connected", "unlocked"].includes(field) ? false : {};
      pending.resolve();
      const result = await resultPromise;
      assert.equal(result.ok, false);
      assert.equal(result.reason, "receipt_context_changed", `${field}/${failAt}/${phase}`);
      assert.equal(result.completedCommandCount, failAt);
      assert.equal(result.summary, null);
      assert.equal(parses, 0);
      assert.equal(formatSingleReadoutReceiptPreview(result).text, null);
      assert.deepEqual(sent, commands.slice(0, failAt + 1));
      assert.equal(late("late>"), false);
    }
  }
}
console.log("Receipt run: 56 connection/settings lifetime interruptions stop subsequent commands without publishing partial results");

for (const scenario of ["normal", "compact", "no_data", "conflict", "missing_prompt"]) {
  const state = context(); let tick = 0;
  const selectedProfile = scenario === "compact" ? profile.replace("s1", "s0") : profile;
  const run = createReadOnlyReceiptRun(() => state, api, selectedProfile, () => tick++, async (command, append) => {
    const index = commands.indexOf(command);
    let raw = index === 3 ? "7E8 06 41 01 00 07 01 00 AA\r>"
      : `7E8 02 ${["43", "47", "4A"][index]} 00 AA AA AA AA AA\r>`;
    if (scenario === "compact") raw = raw.replaceAll(" ", "");
    if (scenario === "no_data") raw = "NO DATA\r>";
    if (scenario === "conflict" && index === 0) raw = raw.replace(">", "7E8 04 43 01 01 01 AA AA AA\r>");
    if (scenario === "missing_prompt" && index === 3) raw = raw.replace(">", "");
    for (let offset = 0; offset < raw.length; offset += 7) assert.equal(append(raw.slice(offset, offset + 7)), true);
    return "complete";
  });
  const result = await run.run();
  assert.equal(result.ok, true, "Reader completion remains separate from grammar and semantic observations");
  const display = formatSingleReadoutReceiptPreview(result);
  const previous = createSingleReadoutPreviewSession(api, scenario);
  try { assert.deepEqual(display, previous.inspect()); } finally { previous.dispose(); }
  const acquired = createSingleReadoutRunPreviewSession(api, scenario);
  assert.equal(acquired.inspect().ok, false);
  await acquired.ready;
  assert.deepEqual(acquired.inspect(), display);
  acquired.dispose(); assert.equal(acquired.inspect().text, null);
  const cancelled = createSingleReadoutRunPreviewSession(api, scenario);
  cancelled.dispose(); await cancelled.ready;
  assert.equal(cancelled.inspect().ok, false); assert.equal(cancelled.inspect().text, null);
  assert.equal(display.ok, true);
  assert.match(display.text, /消去前後の比較ではありません/);
  assert.equal(result.summary.comparisonAvailable, false);
  assert.equal(result.summary.clearSucceededInferred, false);
  if (scenario === "conflict") assert.match(display.text, /保存DTC: 判定保留/);
  if (scenario === "missing_prompt") assert.match(display.text, /応答形式: 確認できません/);
  if (scenario === "no_data") assert.doesNotMatch(display.text, /報告元からコード0件の応答/);
}
console.log("Receipt run display: five acquisition results match the existing single-readout preview; no-data, conflicts and missing prompt stay distinct");
for (const [scenario, reason] of [["failure", "receipt_incomplete"], ["clock_failure", "receipt_clock_unavailable"], ["disconnect", "receipt_context_changed"], ["settings_changed", "receipt_context_changed"]]) {
  let parses = 0;
  const session = createSingleReadoutRunPreviewSession({ ...api, parseElmReadOnlyRawTranscript(input) {
    parses++; return api.parseElmReadOnlyRawTranscript(input);
  } }, scenario);
  await session.ready;
  assert.deepEqual(session.inspect(), { ok: false, reason, text: null });
  assert.equal(parses, 0, "Failed partial acquisition must not publish a complete receipt evaluation");
  session.dispose(); assert.equal(session.inspect().reason, "scope_invalidated");
  const cancelled = createSingleReadoutRunPreviewSession(api, scenario);
  cancelled.dispose(); await cancelled.ready;
  assert.equal(cancelled.inspect().text, null);
}

for (const scenario of ["codes_present", "mixed_sources"]) {
  const sample = createSingleReadoutSample(scenario);
  const observed = api.evaluateSingleReadoutRawReceipts({ receipts: sample.receipts.map(row => ({
    ...row, profile: sample.profile, completion: "complete"
  })) });
  assert.deepEqual(Array.from(observed.readouts, row => row.observation), scenario === "codes_present"
    ? ["source_positive_nonempty_observed", "source_positive_nonempty_observed", "source_positive_nonempty_observed", "source_positive_reported"]
    : ["source_positive_nonempty_observed", "source_positive_empty_observed", "missing_or_unproven", "source_positive_reported"]);
  assert.equal(observed.readoutCoverageComplete, false);
  assert.equal(observed.executionEnabled, false);
  const acquired = createSingleReadoutRunPreviewSession(api, scenario);
  const previous = createSingleReadoutPreviewSession(api, scenario);
  try {
    await acquired.ready;
    assert.deepEqual(acquired.inspect(), previous.inspect());
    const text = acquired.inspect().text;
    assert.match(text, /保存DTC: 故障コードを含む応答/);
    if (scenario === "codes_present") {
      assert.match(text, /保留DTC: 故障コードを含む応答/);
      assert.match(text, /恒久DTC: 故障コードを含む応答/);
      assert.doesNotMatch(text, /報告元からコード0件の応答/);
    } else {
      assert.match(text, /保留DTC: 報告元からコード0件の応答（車両全体の0件は未確認）/);
      assert.match(text, /恒久DTC: 正応答を確認できません/);
      assert.match(text, /NO DATA報告あり。故障コード0件とは判断できません/);
    }
  } finally { acquired.dispose(); previous.dispose(); }
  assert.equal(acquired.inspect().text, null);
}
console.log("Single-readout acquisition: nonempty and mixed-source samples preserve per-readout observations and unknown coverage");

{
  const sample = createSingleReadoutSample("mixed_conflict");
  const receipts = sample.receipts.map(row => ({ ...row, profile: sample.profile, completion: "complete" }));
  // A valid 7E8 response must not conceal contradictory payloads from 7E9.
  // Reverse frame arrival order as well: neither first nor last response wins.
  for (const reversed of [false, true]) {
    const rows = receipts.map(row => ({ ...row, transcript: reversed
      ? row.transcript.slice(0, -1).split("\r").filter(Boolean).reverse().join("\r") + "\r>"
      : row.transcript }));
    const result = api.evaluateSingleReadoutRawReceipts({ receipts: rows });
    assert.deepEqual(Array.from(result.readouts, row => row.observation),
      ["indeterminate", "source_positive_empty_observed", "missing_or_unproven", "indeterminate"]);
    assert(result.readouts[0].blockerIds.includes("dtc_payload_conflict"));
    assert(result.readouts[3].blockerIds.includes("readiness_payload_conflict"));
    assert.equal(result.readoutCoverageComplete, false);
    assert.equal(result.executionEnabled, false);
  }
  const acquired = createSingleReadoutRunPreviewSession(api, "mixed_conflict");
  const previous = createSingleReadoutPreviewSession(api, "mixed_conflict");
  try {
    await acquired.ready;
    assert.deepEqual(acquired.inspect(), previous.inspect());
    const text = acquired.inspect().text;
    assert.match(text, /保存DTC: 判定保留/);
    assert.match(text, /readiness: 判定保留/);
    assert.match(text, /保留DTC: 報告元からコード0件の応答/);
    assert.match(text, /恒久DTC: 正応答を確認できません/);
    assert.doesNotMatch(text, /保存DTC: 報告元からコード0件|readiness応答あり/);
  } finally { acquired.dispose(); previous.dispose(); }
}
console.log("Mixed-source conflicts: DTC/readiness remain indeterminate in both arrival orders despite another valid ECU");

{
  const sample = createSingleReadoutSample("normal");
  let tick = 0;
  const stable = context();
  const stableRun = createReadOnlyReceiptRun(() => stable, api, sample.profile, () => tick++, async (command, append) => {
    append(sample.receipts.find(row => row.command === command).transcript); return "complete";
  });
  const result = JSON.parse(JSON.stringify(await stableRun.run()));
  const raw = result.summary.rawTranscriptValidation;
  raw.readouts[0].errorCodes = ["missing_prompt", "missing_prompt", "private_unknown_error", "<script>private</script>"];
  raw.semanticObservation.readouts[0].blockerIds.push("private_unknown_blocker");
  const before = JSON.stringify(result);
  const text = formatSingleReadoutReceiptPreview(result).text;
  assert.equal(text.split("確認点: 応答の終端記号を確認できません。").length - 1, 1);
  assert.equal(text.split("確認点: 応答形式に未確認の問題があります。").length - 1, 1);
  assert.doesNotMatch(text, /private|<script>/);
  assert.equal(JSON.stringify(result), before);
}
