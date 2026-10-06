import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { createDtcClearFixtureValidators } from "./fixtures/dtc-clear-scoped-readout-core.js";
import { createDtcClearBrowserFixtureInput } from "./fixtures/dtc-clear-browser-sample.js";
import { createReadOnlyReceiptOwner } from "./fixtures/readonly-receipt-owner.js";

export function runSingleReadoutCases(api) {
  const replacements = [null, "NO DATA\r>", "7E8 01 43 AA AA AA AA AA AA\r>",
    "7E8 04 43 02 01 01 AA AA AA\r>", "7E8 04 43 01 00 00 AA AA AA\r>",
    "7E8 06 43 02 01 01 01 01 AA\r>", "7E8 04 43 01 01 01 AA AA AA\r>",
    "7E8 02 43 00 AA AA AA AA AA\r7E8 02 43 00 AA AA AA AA AA\r>",
    "7E8 02 43 00 AA AA AA AA AA\r7E8 04 43 01 01 01 AA AA AA\r>",
    "7E8 03 7F 03 78 AA AA AA AA\r>", "7E8 02 43 00 AA AA AA AA AA\r7E9 03 7F 03 78 AA AA AA AA\r>",
    "7E8 02 43 00 AA AA AA AA AA", "7E8 02 43 00 AA AA AA AA AA\n>"];
  const cases = replacements.map(transcript => ({ index: 0, transcript }));
  for (const transcript of ["7E8 02 41 01 AA AA AA AA AA\r>",
    "7E8 07 41 01 00 07 01 00 00\r>",
    "7E8 06 41 01 00 07 01 00 AA\r7E8 06 41 01 00 17 01 00 AA\r>",
    "7E8 06 41 01 00 07 01 00 AA\r7E8 06 41 01 00 07 01 00 AA\r>"]) cases.push({ index: 3, transcript });
  return cases.map(({ index, transcript }) => {
    const input = createDtcClearBrowserFixtureInput(createDtcClearFixtureValidators(api));
    try {
      if (transcript !== null) {
        input.beforeReadout.receipts[index].transcript = transcript;
        input.postReadout.receipts[index].transcript = transcript;
      }
      const before = api.evaluateGenericObdDtcClearBeforeReadoutReceipts({ beforeReadout: input.beforeReadout });
      // Construct the post call with the exact runtime-issued plan and boundary contract.
      const post = createDtcClearFixtureValidators(api).evaluateDtcClearScopedPostReadoutFixture({
        scope: input.scope, context: input.context, clearWindowSnapshot: input.clearWindowSnapshot,
        clearCompletedAt: input.clearCompletedAt, postReadout: input.postReadout });
      const receipts = input.beforeReadout.receipts.map(({ command, profile, completion, transcript }) => ({ command, profile, completion, transcript }));
      const observation = api.evaluateSingleReadoutRawReceipts?.({ receipts }) || null;
      return { before, post, observation, receipts };
    } finally { input.scope.invalidate(input.context); }
  });
}

const runtime = vm.createContext({ window: {}, navigator: {} });
vm.runInContext(fs.readFileSync(new URL("../obd-readonly.js", import.meta.url), "utf8"), runtime);
const api = runtime.window.ObdReadOnly;
let checks = 0;
const check = (value, message) => { assert.ok(value, message); checks++; };
const normalized = value => JSON.parse(JSON.stringify(value));
const cases = runSingleReadoutCases(api);
for (const { before, observation, receipts } of cases) {
  const expected = before.readouts.map(({ ordinal, intent, command, observation, evidenceComplete, blockerIds }) =>
    ({ ordinal, intent, command, observation, evidenceComplete, blockerIds }));
  assert.deepEqual(normalized(observation.readouts), normalized(expected)); checks++;
  check(Object.isFrozen(observation) && observation.readouts.every(Object.isFrozen), "frozen observation");
  check(!JSON.stringify(observation).includes("7E8") && !Object.hasOwn(observation, "receipts"), "no raw/source exposure");
  for (const key of ["payloadSemanticsVerified", "realTransportProofAvailable", "sameVehicleVerified", "clearBoundaryVerified",
    "readoutCoverageComplete", "comparisonAvailable", "clearSucceededInferred", "executionEnabled", "vehicleCommandEnabled", "wouldTransmit", "canExecute"]) check(observation[key] === false, key);
  const owner = createReadOnlyReceiptOwner(api), ticket = owner.begin();
  receipts.forEach((receipt, index) => check(owner.append(ticket, { ...receipt, startedAt: index * 2, completedAt: index * 2 + 1 }).ok, "owner append"));
  const finished = owner.finish(ticket, "complete");
  assert.deepEqual(normalized(finished.summary.rawTranscriptValidation.semanticObservation), normalized(observation)); checks++;
  owner.invalidate(); check(!owner.inspect(ticket).ok, "owner invalidation");
}
check(cases[1].observation.readouts[0].observation === "missing_or_unproven", "NO DATA is not zero DTC");
for (const input of [{ receipts: [] }, { receipts: cases[0].receipts, extra: true },
  { receipts: cases[0].receipts.map((row, i) => i ? row : { ...row, command: "04" }) },
  { receipts: cases[0].receipts.map(row => ({ ...row, startedAt: 0 })) }]) {
  assert.throws(() => api.evaluateSingleReadoutRawReceipts(input), error => error.name === "TypeError"); checks++;
}
let access = 0;
const input = { receipts: [...cases[0].receipts] };
input.receipts[0] = Object.defineProperty({ ...input.receipts[0] }, "transcript", { get() { access++; return ""; } });
assert.throws(() => api.evaluateSingleReadoutRawReceipts(input));
check(access === 0, "accessor not invoked");
console.log(`Single-readout semantic observations: ${cases.length} cases / ${checks} checks passed`);
