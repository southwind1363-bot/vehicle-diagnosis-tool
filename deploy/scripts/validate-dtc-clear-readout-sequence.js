import assert from "node:assert/strict";
import { createDtcClearReadoutFixtureScope as create } from "./fixtures/dtc-clear-readout-scope.js";
import { createDtcClearFixtureReceiveWindow as receiveWindow,
  createDtcClearBeforeDtcEvidenceFixture as beforeEvidence,
  createDtcClearPostDtcEvidenceFixture as postEvidence,
  createDtcClearDtcEvidencePairFixture as pairEvidence,
  evaluateDtcClearReadoutSequenceFixture as evaluate } from "./fixtures/dtc-clear-scoped-before-readout.js";

let checks = 0;
const check = (value, message) => { assert.ok(value, message); checks += 1; };
const intents = ["read_stored_dtc", "read_pending_dtc", "read_permanent_dtc", "read_readiness"];
const commands = ["03", "07", "0A", "0101"];
const profile = "iso15765_11bit_normal_h1_caf1_d0_s1_e0";
const stamp = (second) => `2026-09-06T00:00:${String(second).padStart(2, "0")}.000Z`;
function fixture() {
  const connectionToken = {}, targetToken = {};
  const scope = create({ provenance: "simulated", profile, connectionToken, targetToken,
    byIntent: intents.map((intent) => ({ intent, sourceIds: ["7E8"] })) });
  // Deliberately distinct: sequence matching must not claim clear connection ownership.
  const clearConnection = {};
  const clear = receiveWindow({ expectedSourceIds: ["7E9"], connectionToken: clearConnection });
  clear.append(clear.attemptToken, clearConnection, { sourceId: "7E9", payload: [0x44] });
  const readout = (start) => ({ provenance: "simulated", connectionToken, attemptToken: {}, startedAt: stamp(start),
    completedAt: stamp(start + 5), receipts: intents.map((intent, index) => ({ ordinal: index + 1, intent,
      command: commands[index], profile, startedAt: stamp(start + index), completedAt: stamp(start + index + 1),
      completion: "complete", transcript: index === 3 ? "7E8 06 41 01 80 07 E1 00 AA\r>"
        : `7E8 02 ${["43", "47", "4A"][index]} 00 AA AA AA AA AA\r>` })) });
  return { scope, context: { scopeToken: scope.scopeToken, connectionToken, targetToken },
    beforeReadout: readout(1), clearStartedAt: stamp(7), clearCompletedAt: stamp(8),
    clearWindowSnapshot: clear.finish(clear.attemptToken, clearConnection, "complete").snapshot, postReadout: readout(9) };
}
function run(input) {
  const original = JSON.stringify(input);
  const out = evaluate(input);
  check(JSON.stringify(input) === original, "Sequence input mutated");
  check(out.provenance === "simulated_only" && ["realTransportProofAvailable", "sameVehicleVerified", "clearBoundaryVerified",
    "readoutCoverageComplete", "comparisonAvailable", "clearSucceededInferred", "executionEnabled",
    "vehicleCommandEnabled", "wouldTransmit", "canExecute"].every((key) => out[key] === false), "Sequence overstated real evidence");
  const paired = pairEvidence(input);
  check(paired.ok === out.fixtureSequenceMatched, "Pair factory disagreed with sequence gate");
  if (paired.ok) {
    const summary = paired.handle.inspect(input.context).summary;
    check(summary.fixtureSequenceMatched && summary.beforeDtcEvidence.length === 3 && summary.postDtcEvidence.length === 3
      && summary.comparisonAvailable === false && summary.clearSucceededInferred === false && summary.wouldTransmit === false,
    "Pair summary omitted evidence or inferred success");
    paired.handle.dispose();
  } else check(paired.handle === null, "Failed sequence returned partial pair");
  return out;
}
const good = run(fixture());
check(good.state === "fixture_sequence_matched" && good.fixtureSequenceMatched, "Ordered distinct fixture failed");
check(Object.isFrozen(good) && !/payload|transcript|Token|readouts/.test(JSON.stringify(good)), "Sequence retained evidence internals");
const adjacent = fixture(); adjacent.clearStartedAt = adjacent.beforeReadout.completedAt;
adjacent.clearCompletedAt = adjacent.postReadout.startedAt;
check(run(adjacent).fixtureSequenceMatched, "Adjacent non-overlapping boundaries rejected");
for (const [mutate, reason] of [
  [(v) => { v.clearStartedAt = stamp(5); }, "fixture_sequence_order_invalid"],
  [(v) => { v.clearStartedAt = stamp(9); }, "fixture_sequence_order_invalid"],
  [(v) => { v.clearCompletedAt = stamp(10); }, "post_readout_order_invalid"],
  [(v) => { v.beforeReadout.receipts[1].startedAt = stamp(0); }, "before_readout_order_invalid"],
  [(v) => { v.beforeReadout.attemptToken = v.clearWindowSnapshot.attemptToken; }, "sequence_attempt_not_distinct"],
  [(v) => { v.postReadout.attemptToken = v.beforeReadout.attemptToken; }, "sequence_attempt_not_distinct"],
  [(v) => { v.postReadout.attemptToken = v.clearWindowSnapshot.attemptToken; }, "post_attempt_not_distinct"],
  [(v) => { v.beforeReadout.connectionToken = {}; }, "receipt_connection_reference_mismatch"],
  [(v) => { v.postReadout.connectionToken = {}; }, "receipt_connection_reference_mismatch"],
  [(v) => { v.context.targetToken = {}; }, "target_reference_mismatch"],
  [(v) => { v.context.scopeToken = {}; }, "scope_reference_mismatch"],
  [(v) => { v.scope.invalidate(v.context); }, "scope_invalidated"]
]) { const value = fixture(); mutate(value); const out = run(value);
  check(out.state === "rejected" && out.reason === reason && !out.fixtureSequenceMatched, "Invalid sequence boundary passed"); }
for (const side of ["beforeReadout", "postReadout"]) {
  for (let index = 0; index < 4; index += 1) {
    for (const kind of ["missing", "outside", "timeout"]) {
      const value = fixture();
      const receipt = value[side].receipts[index];
      if (kind === "missing") receipt.transcript = "NO DATA\r>";
      if (kind === "outside") receipt.transcript = receipt.transcript.replace("7E8", "7EA");
      if (kind === "timeout") receipt.completion = "timeout";
      const out = run(value);
      check(out.state === "fixture_sequence_incomplete" && !out.fixtureSequenceMatched, "Incomplete side became matched sequence");
    }
  }
}
const clearIncomplete = fixture();
const clearConnection = {};
const clear = receiveWindow({ expectedSourceIds: ["7E9"], connectionToken: clearConnection });
clearIncomplete.clearWindowSnapshot = clear.finish(clear.attemptToken, clearConnection, "complete").snapshot;
check(run(clearIncomplete).reason === "clear_evaluation_incomplete", "Incomplete clear evaluation ignored");
for (const mutate of [
  (v) => { delete v.clearStartedAt; }, (v) => { v.clearStartedAt = "2026-09-06"; },
  (v) => { v.clearStartedAt = 0; }, (v) => { v.beforeScope = v.scope; },
  (v) => { v.clearConnectionVerified = true; }, (v) => { v.beforeReadout = { reported: true }; }
]) { const value = fixture(); mutate(value); assert.throws(() => evaluate(value), (error) => error.name === "TypeError"); checks += 1; }
let getters = 0;
const accessor = fixture(); Object.defineProperty(accessor, "clearStartedAt", { get() { getters += 1; return stamp(7); } });
assert.throws(() => evaluate(accessor), TypeError); checks += 1;
check(getters === 0, "Sequence accessor invoked");
for (const side of ["beforeReadout", "postReadout"]) {
  const value = fixture(); let invalidated = false;
  value[side].receipts = new Proxy(value[side].receipts, { getOwnPropertyDescriptor(target, key) {
    if (!invalidated) { invalidated = true; value.scope.invalidate(value.context); }
    return Reflect.getOwnPropertyDescriptor(target, key);
  } });
  check(evaluate(value).reason === "scope_invalidated", "Invalidation during sequence was ignored");
}
// Scope/ordering success must remain independent of DTC content and readiness changes.
const sequenceOnly = JSON.stringify(good);
const dtcTranscript = (service, code) => code === null
  ? `7E8 02 ${service} 00 AA AA AA AA AA\r>`
  : `7E8 04 ${service} 01 ${code} AA AA AA\r>`;
for (let index = 0; index < 3; index += 1) {
  const service = ["43", "47", "4A"][index];
  for (const [beforeCode, afterCode] of [["01 33", null], [null, "01 33"], ["01 33", "C1 23"], ["01 33", "01 33"]]) {
    const value = fixture();
    value.beforeReadout.receipts[index].transcript = dtcTranscript(service, beforeCode);
    value.postReadout.receipts[index].transcript = dtcTranscript(service, afterCode);
    check(JSON.stringify(run(value)) === sequenceOnly, "DTC content changes became a comparison or success inference");
  }
}
for (const readiness of ["00 07 E1 00", "80 00 00 00", "01 07 E1 E1"]) {
  const value = fixture();
  value.postReadout.receipts[3].transcript = `7E8 06 41 01 ${readiness} AA\r>`;
  check(JSON.stringify(run(value)) === sequenceOnly, "Readiness bytes became a repair or completion inference");
}
for (const [from, to] of [[0, 1], [1, 2], [2, 0]]) {
  const value = fixture();
  value.beforeReadout.receipts[from].transcript = dtcTranscript(["43", "47", "4A"][from], "01 33");
  value.postReadout.receipts[to].transcript = dtcTranscript(["43", "47", "4A"][to], "01 33");
  check(JSON.stringify(run(value)) === sequenceOnly, "Cross-category movement became a clear-success inference");
}
// Two valid standalone handles do not prove that their attempts form one sequence.
function evidencePair(value) {
  const { scope, context, beforeReadout, postReadout, clearWindowSnapshot, clearCompletedAt } = value;
  const before = beforeEvidence({ scope, context, beforeReadout });
  const post = postEvidence({ scope, context, postReadout, clearWindowSnapshot, clearCompletedAt });
  check(before.ok && post.ok, "Standalone evidence unexpectedly rejected");
  return { before: before.handle, post: post.handle };
}
for (const mutate of [
  (v) => { v.postReadout.attemptToken = v.beforeReadout.attemptToken; },
  (v) => { v.beforeReadout.attemptToken = v.clearWindowSnapshot.attemptToken; },
  (v) => { v.clearStartedAt = stamp(5); }
]) {
  const value = fixture(); mutate(value);
  const pair = evidencePair(value);
  check(pair.before.inspect(value.context).ok && pair.post.inspect(value.context).ok, "Individual evidence unavailable");
  check(!run(value).fixtureSequenceMatched, "Individual evidence bypassed sequence boundary");
  pair.before.dispose(); pair.post.dispose();
}
// Equal JSON values can come from different scopes, targets and connections.
const first = fixture(), second = fixture();
const firstPair = evidencePair(first), secondPair = evidencePair(second);
const oldSummary = firstPair.before.inspect(first.context).summary;
check(JSON.stringify(oldSummary) === JSON.stringify(secondPair.post.inspect(second.context).summary),
  "Fixture must demonstrate that equal values carry no binding identity");
for (const handle of [firstPair.before, firstPair.post]) {
  check(handle.inspect(second.context).summary === null, "Foreign scope context acquired evidence");
}
for (const side of ["beforeReadout", "postReadout"]) {
  const value = fixture(); value[side] = second[side];
  check(!run(value).fixtureSequenceMatched, "Foreign readout connection accepted");
}
for (const substitute of [oldSummary, JSON.parse(JSON.stringify(oldSummary)), firstPair.before, firstPair.post]) {
  for (const side of ["beforeReadout", "postReadout"]) {
    const value = fixture(); value[side] = substitute;
    assert.throws(() => evaluate(value), (error) => error.name === "TypeError"); checks += 1;
  }
}
first.scope.invalidate(first.context);
check(firstPair.before.inspect(first.context).summary === null && firstPair.post.inspect(first.context).summary === null,
  "Invalidated pair remained accessible");
check(Object.isFrozen(oldSummary) && oldSummary.comparisonAvailable === false,
  "Historical frozen summary became current comparison authority");
check(secondPair.before.inspect(second.context).ok && secondPair.post.inspect(second.context).ok,
  "Invalidating one scope affected another");
secondPair.before.dispose();
check(secondPair.before.inspect(second.context).summary === null && secondPair.post.inspect(second.context).ok,
  "Standalone disposal unexpectedly coupled separate handles");
secondPair.post.dispose();
const pairedInput = fixture(), pairedOriginal = JSON.stringify(pairedInput);
const pairedHandle = pairEvidence(pairedInput).handle;
const pairedSummary = pairedHandle.inspect(pairedInput.context).summary;
check(JSON.stringify(pairedInput) === pairedOriginal && !Object.isFrozen(pairedInput.beforeReadout.attemptToken), "Pair mutated caller input");
check(!/payload|transcript|Token/.test(JSON.stringify(pairedSummary)) && Object.isFrozen(pairedSummary.beforeDtcEvidence[0].sources[0].codes), "Pair leaked raw or mutable data");
for (const key of ["realTransportProofAvailable", "sameVehicleVerified", "clearBoundaryVerified", "readoutCoverageComplete",
  "comparisonAvailable", "clearSucceededInferred", "executionEnabled", "vehicleCommandEnabled", "wouldTransmit", "canExecute", "readinessEvidenceAvailable"]) {
  check(pairedSummary[key] === false, "Pair became real vehicle authority");
}
pairedInput.beforeReadout.receipts[0].transcript = "NO DATA\r>";
pairedInput.postReadout.receipts[0].transcript = "NO DATA\r>";
check(JSON.stringify(pairedHandle.inspect(pairedInput.context).summary) === JSON.stringify(pairedSummary), "Caller mutation changed pair");
for (const key of ["scopeToken", "connectionToken", "targetToken"]) {
  check(pairedHandle.inspect({ ...pairedInput.context, [key]: {} }).summary === null, "Foreign context acquired pair");
}
pairedHandle.dispose(); pairedHandle.dispose();
check(pairedHandle.inspect(pairedInput.context).reason === "evidence_disposed", "Disposed pair revived");
const invalidatedPair = fixture(), invalidatedHandle = pairEvidence(invalidatedPair).handle;
invalidatedPair.scope.invalidate(invalidatedPair.context);
check(invalidatedHandle.inspect(invalidatedPair.context).summary === null, "Invalidated pair remained accessible");
for (const side of ["beforeReadout", "postReadout"]) {
  const value = fixture(); let calls = 0;
  Object.defineProperty(value[side].receipts[0], "transcript", { get() { calls += 1; return ""; } });
  assert.throws(() => pairEvidence(value), TypeError); checks += 1;
  check(calls === 0, "Pair invoked receipt getter");
  const reentrant = fixture();
  reentrant[side].receipts[1] = new Proxy(reentrant[side].receipts[1], {
    ownKeys(target) { reentrant.scope.invalidate(reentrant.context); return Reflect.ownKeys(target); }
  });
  check(pairEvidence(reentrant).handle === null, "Pair ignored invalidation while copying");
}
const fixed = fixture();
fixed.postReadout.receipts[0] = new Proxy(fixed.postReadout.receipts[0], {
  ownKeys(target) { fixed.beforeReadout.receipts[0].transcript = "NO DATA\r>"; return Reflect.ownKeys(target); }
});
check(pairEvidence(fixed).handle.inspect(fixed.context).summary.beforeDtcEvidence[0].sources[0].observation === "positive_empty",
  "Pair reread previously copied before receipt");
for (const nested of [false, true]) {
  const value = fixture();
  value.clearWindowSnapshot = nested
    ? Object.freeze({ ...value.clearWindowSnapshot, execution: { ...value.clearWindowSnapshot.execution } })
    : { ...value.clearWindowSnapshot };
  assert.throws(() => pairEvidence(value), /mutable_pair_clear_snapshot/); checks += 1;
}
let clearGetterCalls = 0;
const clearAccessor = fixture();
clearAccessor.clearWindowSnapshot = Object.freeze({ ...clearAccessor.clearWindowSnapshot,
  get completion() { clearGetterCalls += 1; return "complete"; } });
assert.throws(() => pairEvidence(clearAccessor), /invalid_pair_clear_descriptor/); checks += 1;
check(clearGetterCalls === 0, "Pair invoked clear snapshot getter");
for (let index = 0; index < 3; index += 1) {
  const value = fixture(), service = ["43", "47", "4A"][index];
  value.beforeReadout.receipts[index].transcript = dtcTranscript(service, "01 33");
  value.postReadout.receipts[index].transcript = dtcTranscript(service, "C1 23");
  const handle = pairEvidence(value).handle, summary = handle.inspect(value.context).summary;
  check(summary.beforeDtcEvidence[index].sources[0].codes.join() === "P0133"
    && summary.postDtcEvidence[index].sources[0].codes.join() === "U0123", "Pair swapped or merged before/post content");
  handle.dispose();
}
// Differences are available only from the pair's retained data, never caller summaries.
for (let index = 0; index < 3; index += 1) {
  for (const [beforeCode, afterCode, added, removed, retained] of [
    [null, null, [], [], []], [null, "01 33", ["P0133"], [], []],
    ["01 33", null, [], ["P0133"], []], ["01 33", "01 33", [], [], ["P0133"]],
    ["01 33", "C1 23", ["U0123"], ["P0133"], []]
  ]) {
    const value = fixture(), service = ["43", "47", "4A"][index];
    value.beforeReadout.receipts[index].transcript = dtcTranscript(service, beforeCode);
    value.postReadout.receipts[index].transcript = dtcTranscript(service, afterCode);
    const handle = pairEvidence(value).handle, out = handle.inspectDifference(value.context);
    check(out.ok && out.summary.fixtureDifferenceAvailable, "Pair difference unavailable");
    assert.deepEqual(out.summary.differences[index].sources[0], { sourceId: "7E8", added, removed, retained }); checks += 1;
    check(out.summary.differences.every((row, i) => i === index || row.sources.every((s) => !s.added.length && !s.removed.length && !s.retained.length)),
      "Difference crossed DTC categories");
    check(["realTransportProofAvailable", "sameVehicleVerified", "clearBoundaryVerified", "readoutCoverageComplete", "comparisonAvailable",
      "clearSucceededInferred", "executionEnabled", "vehicleCommandEnabled", "wouldTransmit", "canExecute", "readinessEvidenceAvailable"]
      .every((key) => out.summary[key] === false), "Difference became real success or permission");
    check(Object.isFrozen(out.summary.differences[index].sources[0].added) && !/transcript|payload|Token/.test(JSON.stringify(out)),
      "Difference leaked raw or mutable data");
    value.beforeReadout.receipts[index].transcript = "NO DATA\r>";
    check(JSON.stringify(handle.inspectDifference(value.context)) === JSON.stringify(out), "Difference reread caller input");
    handle.dispose(); check(handle.inspectDifference(value.context).summary === null, "Disposed difference remained accessible");
  }
}
const moved = fixture();
moved.beforeReadout.receipts[0].transcript = dtcTranscript("43", "01 33");
moved.postReadout.receipts[1].transcript = dtcTranscript("47", "01 33");
const movedHandle = pairEvidence(moved).handle, movedDiff = movedHandle.inspectDifference(moved.context).summary;
check(movedDiff.differences[0].sources[0].removed.join() === "P0133"
  && movedDiff.differences[1].sources[0].added.join() === "P0133", "Status movement collapsed into resolution");
for (const key of ["scopeToken", "connectionToken", "targetToken"]) {
  check(movedHandle.inspectDifference({ ...moved.context, [key]: {} }).summary === null, "Foreign context acquired difference");
}
assert.throws(() => movedHandle.inspectDifference(movedDiff), TypeError); checks += 1;
moved.scope.invalidate(moved.context);
check(movedHandle.inspectDifference(moved.context).summary === null, "Invalidated scope yielded difference");
const single = fixture(), singleHandles = evidencePair(single);
check(!Object.hasOwn(singleHandles.before, "inspectDifference") && !Object.hasOwn(singleHandles.post, "inspectDifference"), "Standalone evidence exposed difference");
singleHandles.before.dispose(); singleHandles.post.dispose();
const multiple = fixture();
const multipleScope = create({ provenance: "simulated", profile, connectionToken: multiple.context.connectionToken,
  targetToken: multiple.context.targetToken, byIntent: intents.map((intent) => ({ intent, sourceIds: ["7E9", "7E8"] })) });
multiple.scope = multipleScope; multiple.context.scopeToken = multipleScope.scopeToken;
for (const side of ["beforeReadout", "postReadout"]) {
  for (const receipt of multiple[side].receipts) receipt.transcript = receipt.transcript.replace(">", receipt.transcript.replaceAll("7E8", "7E9"));
}
multiple.beforeReadout.receipts[0].transcript = dtcTranscript("43", "01 33").replace(">", dtcTranscript("43", null).replaceAll("7E8", "7E9"));
multiple.postReadout.receipts[0].transcript = dtcTranscript("43", null).replace(">", dtcTranscript("43", "01 33").replaceAll("7E8", "7E9"));
const multipleHandle = pairEvidence(multiple).handle;
assert.deepEqual(multipleHandle.inspectDifference(multiple.context).summary.differences[0].sources, [
  { sourceId: "7E8", added: [], removed: ["P0133"], retained: [] },
  { sourceId: "7E9", added: ["P0133"], removed: [], retained: [] }
]); checks += 1;
multipleHandle.dispose();
const overlap = fixture();
overlap.beforeReadout.receipts[0].transcript = "7E8 06 43 02 C1 23 01 33 AA\r>";
overlap.postReadout.receipts[0].transcript = "7E8 06 43 02 81 23 01 33 AA\r>";
const overlapHandle = pairEvidence(overlap).handle;
assert.deepEqual(overlapHandle.inspectDifference(overlap.context).summary.differences[0].sources[0],
  { sourceId: "7E8", added: ["B0123"], removed: ["U0123"], retained: ["P0133"] }); checks += 1;
overlapHandle.dispose();
console.log(`DTC clear readout sequence checks: ${checks} / Errors: 0`);
