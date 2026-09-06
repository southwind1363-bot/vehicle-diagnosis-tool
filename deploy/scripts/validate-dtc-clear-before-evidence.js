import assert from "node:assert/strict";
import { createDtcClearReadoutFixtureScope as scopeFactory } from "./fixtures/dtc-clear-readout-scope.js";
import { createDtcClearBeforeDtcEvidenceFixture as create } from "./fixtures/dtc-clear-scoped-before-readout.js";
let checks = 0;
const check = (value, message) => { assert.ok(value, message); checks += 1; };
const intents = ["read_stored_dtc", "read_pending_dtc", "read_permanent_dtc", "read_readiness"];
const commands = ["03", "07", "0A", "0101"], services = ["43", "47", "4A"];
const profile = "iso15765_11bit_normal_h1_caf1_d0_s1_e0";
function fixture(ids = ["7E8"]) {
  const connectionToken = {}, targetToken = {};
  const scope = scopeFactory({ provenance: "simulated", profile, connectionToken, targetToken,
    byIntent: intents.map((intent) => ({ intent, sourceIds: ids })) });
  return { scope, context: { scopeToken: scope.scopeToken, connectionToken, targetToken },
    beforeReadout: { provenance: "simulated", attemptToken: {}, connectionToken,
      startedAt: "2026-09-06T00:00:01.000Z", completedAt: "2026-09-06T00:00:07.000Z",
      receipts: intents.map((intent, index) => ({ ordinal: index + 1, intent, command: commands[index], profile,
        startedAt: `2026-09-06T00:00:0${index + 2}.000Z`, completedAt: `2026-09-06T00:00:0${index + 3}.000Z`, completion: "complete",
        transcript: ids.map((id) => index === 3 ? `${id} 06 41 01 80 07 E1 00 AA\r`
          : `${id} 02 ${services[index]} 00 AA AA AA AA AA\r`).join("") + ">" })) } };
}
const value = fixture();
const original = JSON.stringify(value.beforeReadout);
const created = create(value), summary = created.handle.inspect(value.context).summary;
check(created.ok && summary.dtcEvidence.length === 3 && summary.dtcEvidence.every((row) => row.sources[0].codes.length === 0
  && row.sources[0].observation === "positive_empty"), "Positive empty evidence missing");
check(summary.provenance === "simulated_only" && summary.readinessEvidenceAvailable === false
  && ["comparisonAvailable", "readoutCoverageComplete", "clearBoundaryVerified", "clearSucceededInferred", "realTransportProofAvailable",
    "sameVehicleVerified", "executionEnabled", "vehicleCommandEnabled", "wouldTransmit", "canExecute"].every((key) => summary[key] === false), "Evidence became real operation proof");
check(JSON.stringify(value.beforeReadout) === original && !Object.isFrozen(value.beforeReadout.attemptToken), "Input mutated or frozen");
check(!/transcript|payload|Token/.test(JSON.stringify(summary)) && Object.isFrozen(summary.dtcEvidence[0].sources[0].codes), "Raw data or mutable codes leaked");
for (let index = 0; index < 3; index += 1) {
  for (const [bytes, expected] of [["01 33", "P0133"], ["41 23", "C0123"], ["81 23", "B0123"], ["C1 23", "U0123"], ["FF FF", "U3FFF"]]) {
    const input = fixture(); input.beforeReadout.receipts[index].transcript = `7E8 04 ${services[index]} 01 ${bytes} AA AA AA\r>`;
    const output = create(input).handle.inspect(input.context).summary;
    check(output.dtcEvidence[index].sources[0].codes.join(",") === expected, "Code bit layout mismatch");
  }
}
const multi = fixture(["7E9", "7E8"]);
multi.beforeReadout.receipts[0].transcript = "7E9 04 43 01 01 33 AA AA AA\r7E8 04 43 01 01 33 AA AA AA\r7E8 04 43 01 01 33 AA AA AA\r>";
const multiCreated = create(multi);
const multiSummary = multiCreated.handle.inspect(multi.context).summary;
check(multiSummary.dtcEvidence[0].sources.map((row) => `${row.sourceId}:${row.codes}`).join(",") === "7E8:P0133,7E9:P0133", "ECU identity collapsed or identical duplicates retained");
multi.beforeReadout.receipts[0].transcript = "NO DATA\r>";
check(JSON.stringify(multiCreated.handle.inspect(multi.context).summary) === JSON.stringify(multiSummary), "Caller mutation changed evidence");
for (const transcript of ["NO DATA\r>", "7E8 03 43 00 00 AA AA AA AA\r>", "7E8 04 43 01 00 00 AA AA AA\r>",
  "7E8 06 43 02 01 33 01 33 AA\r>", "7E8 04 43 02 01 33 AA AA AA\r>",
  "7E8 04 43 01 01 33 AA AA AA\r7E8 04 43 01 C1 23 AA AA AA\r>",
  "7E8 02 43 00 AA AA AA AA AA\r7E9 04 43 02 01 33 AA AA AA\r>"]) {
  const input = fixture(); input.beforeReadout.receipts[0].transcript = transcript;
  const output = create(input); check(!output.ok && output.handle === null, "Uncertain receipt yielded evidence");
}
for (const key of ["scopeToken", "connectionToken", "targetToken"]) {
  const output = created.handle.inspect({ ...value.context, [key]: {} });
  check(!output.ok && output.summary === null, "Mismatched context acquired evidence");
}
value.scope.invalidate(value.context);
check(created.handle.inspect(value.context).summary === null, "Invalidated scope retained accessible evidence");
const disposedInput = fixture(), disposed = create(disposedInput);
disposed.handle.dispose(); disposed.handle.dispose();
check(disposed.handle.inspect(disposedInput.context).reason === "evidence_disposed", "Disposed evidence revived");
let getterCalls = 0;
const getter = fixture();
Object.defineProperty(getter.beforeReadout.receipts[0], "transcript", { get() { getterCalls += 1; return "NO DATA\r>"; } });
assert.throws(() => create(getter), TypeError); checks += 1;
check(getterCalls === 0, "Receipt getter invoked");
const sparse = fixture(); delete sparse.beforeReadout.receipts[0];
assert.throws(() => create(sparse), TypeError); checks += 1;
const mutation = fixture();
const originalReceipt = mutation.beforeReadout.receipts[0];
mutation.beforeReadout.receipts[1] = new Proxy(mutation.beforeReadout.receipts[1], {
  ownKeys(target) { originalReceipt.transcript = "NO DATA\r>"; return Reflect.ownKeys(target); }
});
const mutationResult = create(mutation);
check(mutationResult.ok && mutationResult.handle.inspect(mutation.context).summary.dtcEvidence[0].sources[0].observation === "positive_empty",
  "Previously copied receipt was reread after caller mutation");
const longSparse = fixture(); longSparse.beforeReadout.receipts.length = 100;
assert.throws(() => create(longSparse), TypeError); checks += 1;
function transcript(payload) {
  const line = (bytes) => `7E8 ${[...bytes, ...Array(8 - bytes.length).fill(0xAA)].map((byte) => byte.toString(16).toUpperCase().padStart(2, "0")).join(" ")}\r`;
  if (payload.length <= 7) return line([payload.length, ...payload]) + ">";
  let text = line([0x10 | (payload.length >> 8), payload.length & 255, ...payload.slice(0, 6)]);
  for (let offset = 6, sequence = 1; offset < payload.length; offset += 7, sequence = (sequence + 1) & 15) {
    text += line([0x20 | sequence, ...payload.slice(offset, offset + 7)]);
  }
  return text + ">";
}
for (let index = 0; index < 3; index += 1) {
  for (const count of [2, 3, 255]) {
    const input = fixture();
    input.beforeReadout.receipts[index].transcript = transcript([parseInt(services[index], 16), count,
      ...Array.from({ length: count }, (_, code) => [1, code]).flat()]);
    const codes = create(input).handle.inspect(input.context).summary.dtcEvidence[index].sources[0].codes;
    check(codes.length === count && codes[0] === "P0100" && new Set(codes).size === count, "Count boundary or multiframe extraction failed");
  }
}
for (const index of [0, 1, 2, 3]) {
  const input = fixture(); input.beforeReadout.receipts[index].completion = "timeout";
  check(create(input).handle === null, "Incomplete four-receipt attempt yielded evidence");
}
console.log(`DTC clear before evidence checks: ${checks} / Errors: 0`);
