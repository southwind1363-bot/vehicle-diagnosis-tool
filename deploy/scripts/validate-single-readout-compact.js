import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { runSingleReadoutCases } from "./validate-single-readout-semantics.js";
import { createReadOnlyReceiptOwner } from "./fixtures/readonly-receipt-owner.js";
import { createReadOnlyReceiptCapture } from "./fixtures/readonly-receipt-capture.js";
import { createDtcClearBrowserFixtureInput } from "./fixtures/dtc-clear-browser-sample.js";
import { createDtcClearFixtureValidators } from "./fixtures/dtc-clear-scoped-readout-core.js";

const s0 = "iso15765_11bit_normal_h1_caf1_d0_s0_e0";
const s1 = "iso15765_11bit_normal_h1_caf1_d0_s1_e0";
const json = value => JSON.parse(JSON.stringify(value));
export function runCompactReadoutCases(api) {
  return runSingleReadoutCases(api).map(row => {
    const receipts = row.receipts.map(receipt => ({ ...receipt, profile: s0,
      transcript: receipt.transcript.replace(/^[0-9A-F]{3}(?: [0-9A-F]{2}){8}(?=\r|\n|$)/gm, line => line.replaceAll(" ", "")) }));
    const observation = api.evaluateSingleReadoutRawReceipts({ receipts });
    assert.deepEqual(json(observation), json(row.observation));
    const owner = createReadOnlyReceiptOwner(api, s0), ticket = owner.begin();
    const capture = createReadOnlyReceiptCapture(api, s0), attempt = capture.begin();
    receipts.forEach((receipt, i) => {
      assert(owner.append(ticket, { ...receipt, startedAt: i * 2, completedAt: i * 2 + 1 }).ok);
      const command = capture.startCommand(attempt, receipt.command, s0, i * 2);
      assert(command.ok);
      for (const chunk of receipt.transcript) assert(capture.append(command.ticket, chunk).ok);
      assert(capture.endCommand(command.ticket, i * 2 + 1, "complete").ok);
    });
    for (const result of [owner.finish(ticket, "complete"), capture.finish(attempt, "complete")]) {
      assert(result.ok);
      assert.deepEqual(json(result.summary.rawTranscriptValidation.semanticObservation), json(observation));
      assert.equal(result.summary.profileEvidence, "caller_declared_only");
      assert.equal(result.summary.canExecute, false);
    }
    owner.invalidate(); capture.invalidate();
    assert.equal(owner.inspect(ticket).summary, null);
    assert.equal(capture.inspect(attempt).summary, null);
    return { receipts, observation };
  });
}

const runtime = vm.createContext({ window: {}, navigator: {} });
vm.runInContext(fs.readFileSync(new URL("../obd-readonly.js", import.meta.url), "utf8"), runtime);
const api = runtime.window.ObdReadOnly, cases = runCompactReadoutCases(api);
for (let position = 0; position < 4; position++) {
  const receipts = cases[0].receipts.map((row, index) => ({ ...row, profile: index === position ? s1 : s0 }));
  assert.throws(() => api.evaluateSingleReadoutRawReceipts({ receipts }), error => error.name === "TypeError");
  const owner = createReadOnlyReceiptOwner(api, s0), ticket = owner.begin();
  const capture = createReadOnlyReceiptCapture(api, s0), attempt = capture.begin();
  for (let index = 0; index <= position; index++) {
    const row = receipts[index];
    const appended = owner.append(ticket, { ...row, startedAt: index * 2, completedAt: index * 2 + 1 });
    const started = capture.startCommand(attempt, row.command, row.profile, index * 2);
    assert.equal(appended.ok, index < position);
    assert.equal(started.ok, index < position);
    if (started.ok) {
      capture.append(started.ticket, row.transcript);
      capture.endCommand(started.ticket, index * 2 + 1, "complete");
    }
  }
  assert.equal(owner.inspect(ticket).ok, true); // Rejection is retained as a non-ready summary.
  assert.equal(owner.inspect(ticket).summary.status, "rejected");
  assert.equal(capture.inspect(attempt).summary, null);
  assert(!owner.finish(ticket, "complete").ok && !capture.finish(attempt, "complete").ok);
}
for (const profile of [null, "", "unknown", {}, new String(s0)]) {
  assert.throws(() => createReadOnlyReceiptOwner(api, profile), error => error.name === "TypeError");
  assert.throws(() => createReadOnlyReceiptCapture(api, profile), error => error.name === "TypeError");
  assert.throws(() => api.evaluateSingleReadoutRawReceipts({ receipts: cases[0].receipts.map(row => ({ ...row, profile })) }), error => error.name === "TypeError");
}
// Clear-related before/post APIs keep the previous S1-only boundary.
const validators = createDtcClearFixtureValidators(api), input = createDtcClearBrowserFixtureInput(validators);
try {
  for (const readout of [input.beforeReadout, input.postReadout]) readout.receipts.forEach((row, i) => Object.assign(row,
    { profile: s0, transcript: cases[0].receipts[i].transcript }));
  assert.throws(() => api.evaluateGenericObdDtcClearBeforeReadoutReceipts({ beforeReadout: input.beforeReadout }), error => error.name === "TypeError");
  assert.throws(() => validators.evaluateDtcClearScopedPostReadoutFixture({ scope: input.scope, context: input.context,
    clearWindowSnapshot: input.clearWindowSnapshot, clearCompletedAt: input.clearCompletedAt, postReadout: input.postReadout }), error => error.name === "TypeError");
} finally { input.scope.invalidate(input.context); }
console.log(`Compact single-readout: ${cases.length} S1/S0 semantic and owner/capture cases, 4 mixed-profile positions, unknown profiles and clear isolation passed`);
