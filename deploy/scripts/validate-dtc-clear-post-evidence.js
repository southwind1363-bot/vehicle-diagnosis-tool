import assert from "node:assert/strict";
import { createDtcClearReadoutFixtureScope } from "./fixtures/dtc-clear-readout-scope.js";
import { createDtcClearFixtureReceiveWindow, createDtcClearPostDtcEvidenceFixture as create } from "./fixtures/dtc-clear-scoped-before-readout.js";
let checks = 0;
const check = (value) => { assert.ok(value); checks += 1; };
const intents = ["read_stored_dtc", "read_pending_dtc", "read_permanent_dtc", "read_readiness"];
const services = ["43", "47", "4A"];
function fixture(completion = "complete") {
  const profile = "iso15765_11bit_normal_h1_caf1_d0_s1_e0", connectionToken = {}, targetToken = {};
  const scope = createDtcClearReadoutFixtureScope({ provenance: "simulated", profile, connectionToken, targetToken,
    byIntent: intents.map((intent) => ({ intent, sourceIds: ["7E8"] })) });
  const window = createDtcClearFixtureReceiveWindow({ expectedSourceIds: ["7EA"], connectionToken });
  window.append(window.attemptToken, connectionToken, { sourceId: "7EA", payload: [0x44] });
  return { scope, context: { scopeToken: scope.scopeToken, connectionToken, targetToken },
    clearWindowSnapshot: window.finish(window.attemptToken, connectionToken, completion).snapshot,
    clearCompletedAt: "2026-09-06T00:00:00.000Z",
    postReadout: { provenance: "simulated", attemptToken: {}, connectionToken,
      startedAt: "2026-09-06T00:00:01.000Z", completedAt: "2026-09-06T00:00:07.000Z",
      receipts: intents.map((intent, index) => ({ ordinal: index + 1, intent, command: ["03", "07", "0A", "0101"][index], profile,
        startedAt: `2026-09-06T00:00:0${index + 2}.000Z`, completedAt: `2026-09-06T00:00:0${index + 3}.000Z`, completion: "complete",
        transcript: index === 3 ? "7E8 06 41 01 80 07 E1 00 AA\r>" : `7E8 04 ${services[index]} 01 01 33 AA AA AA\r>` })) } };
}
const input = fixture(), original = JSON.stringify(input.postReadout), output = create(input);
const summary = output.handle.inspect(input.context).summary;
check(output.ok && summary.dtcEvidence.every((row) => row.sources[0].codes.join() === "P0133"));
check(JSON.stringify(input.postReadout) === original && !Object.isFrozen(input.postReadout.attemptToken));
check(!/transcript|payload|Token|7EA/.test(JSON.stringify(summary)) && Object.isFrozen(summary.dtcEvidence[0].sources[0].codes));
for (const key of ["comparisonAvailable", "readoutCoverageComplete", "clearBoundaryVerified", "clearSucceededInferred",
  "sameVehicleVerified", "realTransportProofAvailable", "executionEnabled", "vehicleCommandEnabled", "wouldTransmit", "canExecute", "readinessEvidenceAvailable"]) check(summary[key] === false);
input.postReadout.receipts[0].transcript = "NO DATA\r>";
check(JSON.stringify(output.handle.inspect(input.context).summary) === JSON.stringify(summary));
for (let index = 0; index < 4; index += 1) {
  for (const kind of ["missing", "timeout", "outside", "conflict"]) {
    const value = fixture(), receipt = value.postReadout.receipts[index];
    if (kind === "missing") receipt.transcript = "NO DATA\r>";
    if (kind === "timeout") receipt.completion = "timeout";
    if (kind === "outside") receipt.transcript = receipt.transcript.replace("7E8", "7E9");
    if (kind === "conflict") receipt.transcript = receipt.transcript.replace(">", index === 3
      ? "7E8 06 41 01 00 07 E1 00 AA\r>" : `7E8 02 ${services[index]} 00 AA AA AA AA AA\r>`);
    check(create(value).handle === null);
  }
}
for (const completion of ["timeout", "disconnected", "error"]) check(create(fixture(completion)).handle === null);
for (const mutate of [
  (v) => { v.postReadout.attemptToken = v.clearWindowSnapshot.attemptToken; },
  (v) => { v.clearCompletedAt = "2026-09-06T00:00:08.000Z"; },
  (v) => { v.postReadout.connectionToken = {}; },
  (v) => { v.scope.invalidate(v.context); }
]) { const value = fixture(); mutate(value); check(create(value).handle === null); }
for (const key of ["scopeToken", "connectionToken", "targetToken"]) check(output.handle.inspect({ ...input.context, [key]: {} }).summary === null);
input.scope.invalidate(input.context); check(output.handle.inspect(input.context).summary === null);
const disposed = fixture(), handle = create(disposed).handle;
handle.dispose(); handle.dispose(); check(handle.inspect(disposed.context).reason === "evidence_disposed");
let calls = 0;
const getter = fixture(); Object.defineProperty(getter.postReadout.receipts[0], "transcript", { get() { calls += 1; return ""; } });
assert.throws(() => create(getter), TypeError); checks += 1; check(calls === 0);
const sparse = fixture(); sparse.postReadout.receipts.length = 100;
assert.throws(() => create(sparse), TypeError); checks += 1;
const reentrant = fixture();
reentrant.postReadout.receipts[1] = new Proxy(reentrant.postReadout.receipts[1], {
  ownKeys(target) { reentrant.scope.invalidate(reentrant.context); return Reflect.ownKeys(target); }
});
check(create(reentrant).handle === null);
for (let index = 0; index < 3; index += 1) {
  const empty = fixture(); empty.postReadout.receipts[index].transcript = `7E8 02 ${services[index]} 00 AA AA AA AA AA\r>`;
  check(create(empty).handle.inspect(empty.context).summary.dtcEvidence[index].sources[0].observation === "positive_empty");
}
console.log(`DTC clear post evidence checks: ${checks} / Errors: 0`);
