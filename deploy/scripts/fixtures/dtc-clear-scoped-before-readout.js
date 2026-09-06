// Node-only test harness: never imported by the app, bridge, or vehicle workflow.
import fs from "node:fs";
import vm from "node:vm";
import { inspectDtcClearReadoutFixtureScope } from "./dtc-clear-readout-scope.js";

const runtime = vm.createContext({ window: {}, navigator: {} });
vm.runInContext(fs.readFileSync(new URL("../../obd-readonly.js", import.meta.url), "utf8"), runtime);
const evaluateBefore = runtime.window.ObdReadOnly.evaluateGenericObdDtcClearBeforeReadoutReceipts;
const evaluatePost = runtime.window.ObdReadOnly.evaluateGenericObdDtcClearPostReadoutReceipts;

// Construct clear fixtures in this VM so the immutable follow-up-plan identity is preserved.
export function createDtcClearFixtureReceiveWindow(input) {
  return runtime.window.ObdReadOnly.createGenericObdDtcClearReceiveWindow(input);
}

function record(value, keys) {
  if (value === null || typeof value !== "object" || Array.isArray(value)
    || ![null, Object.prototype].includes(Object.getPrototypeOf(value))) throw new TypeError("invalid_scoped_fixture_record");
  const actual = Reflect.ownKeys(value);
  if (actual.length !== keys.length || actual.some((key) => !keys.includes(key))) throw new TypeError("invalid_scoped_fixture_keys");
  return Object.fromEntries(keys.map((key) => {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !Object.hasOwn(descriptor, "value")) throw new TypeError("invalid_scoped_fixture_accessor");
    return [key, descriptor.value];
  }));
}

function freeze(value) {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}

function result(state, reason, readouts = []) {
  return freeze({ state, reason, provenance: "simulated_only", fixtureScopeMatched: state === "fixture_scope_matched",
    readouts, realTransportProofAvailable: false, sameVehicleVerified: false, clearBoundaryVerified: false,
    readoutCoverageComplete: false, comparisonAvailable: false, clearSucceededInferred: false,
    executionEnabled: false, vehicleCommandEnabled: false, wouldTransmit: false, canExecute: false });
}

export function evaluateDtcClearScopedBeforeReadoutFixture(input) {
  const value = record(input, ["scope", "context", "beforeReadout"]);
  const context = record(value.context, ["scopeToken", "connectionToken", "targetToken"]);
  const initial = inspectDtcClearReadoutFixtureScope(value.scope, context);
  if (!initial.ok) return result("rejected", initial.reason);
  const beforeReadout = record(value.beforeReadout,
    ["provenance", "attemptToken", "connectionToken", "startedAt", "completedAt", "receipts"]);
  if (beforeReadout.connectionToken !== context.connectionToken) return result("rejected", "receipt_connection_reference_mismatch");
  // Always evaluate strict raw receipts; never accept a caller's ready-made summary.
  const before = evaluateBefore({ beforeReadout });
  const current = inspectDtcClearReadoutFixtureScope(value.scope, context);
  if (!current.ok) return result("rejected", current.reason);
  if (before.state === "rejected") return result("rejected", "before_readout_order_invalid");
  return matchFixtureReadouts(before.readouts, current.snapshot);
}

function matchFixtureReadouts(rows, snapshot) {
  const readouts = rows.map((row, index) => {
    const expected = snapshot.byIntent[index];
    if (expected.intent !== row.intent) throw new TypeError("fixture_intent_mismatch");
    const positive = row.intent === "read_readiness"
      ? (row.observation === "source_positive_reported" ? row.observedSourceIds : [])
      : [...row.positiveEmptySourceIds, ...row.positiveNonemptySourceIds];
    const missingFixtureSourceIds = expected.sourceIds.filter((id) => !positive.includes(id));
    const positiveSourceIdsOutsideFixture = row.observedSourceIds.filter((id) => !expected.sourceIds.includes(id));
    const uncertain = ["indeterminate", "missing_or_unproven"].includes(row.observation);
    return {
      intent: row.intent, observation: row.observation,
      fixtureExpectedSourceIds: [...expected.sourceIds], missingFixtureSourceIds, positiveSourceIdsOutsideFixture,
      fixtureScopeMatched: !uncertain && missingFixtureSourceIds.length === 0 && positiveSourceIdsOutsideFixture.length === 0
    };
  });
  return result(readouts.every((row) => row.fixtureScopeMatched) ? "fixture_scope_matched" : "fixture_scope_incomplete",
    null, readouts);
}

export function evaluateDtcClearScopedPostReadoutFixture(input) {
  const value = record(input, ["scope", "context", "clearWindowSnapshot", "clearCompletedAt", "postReadout"]);
  const context = record(value.context, ["scopeToken", "connectionToken", "targetToken"]);
  const initial = inspectDtcClearReadoutFixtureScope(value.scope, context);
  if (!initial.ok) return result("rejected", initial.reason);
  const postReadout = record(value.postReadout,
    ["provenance", "attemptToken", "connectionToken", "startedAt", "completedAt", "receipts"]);
  if (postReadout.connectionToken !== context.connectionToken) return result("rejected", "receipt_connection_reference_mismatch");
  const post = evaluatePost({ clearWindowSnapshot: value.clearWindowSnapshot, clearCompletedAt: value.clearCompletedAt, postReadout });
  const current = inspectDtcClearReadoutFixtureScope(value.scope, context);
  if (!current.ok) return result("rejected", current.reason);
  if (post.state === "rejected") return result("rejected",
    post.provenance.blockerIds.includes("post_attempt_not_distinct") ? "post_attempt_not_distinct" : "post_readout_order_invalid");
  const clearBlocker = ["clear_snapshot_evaluation_mismatch", "clear_window_not_terminal", "clear_evaluation_incomplete"]
    .find((id) => post.provenance.blockerIds.includes(id));
  if (clearBlocker) return result("fixture_scope_incomplete", clearBlocker);
  // A complete simulated Mode 04 evaluation does not establish real clear success or connection ownership.
  return matchFixtureReadouts(post.readouts, current.snapshot);
}

// Checks a caller-described simulated sequence, not an actual clear operation.
export function evaluateDtcClearReadoutSequenceFixture(input) {
  const value = record(input, ["scope", "context", "beforeReadout", "clearWindowSnapshot", "clearStartedAt", "clearCompletedAt", "postReadout"]);
  const context = record(value.context, ["scopeToken", "connectionToken", "targetToken"]);
  const readoutKeys = ["provenance", "attemptToken", "connectionToken", "startedAt", "completedAt", "receipts"];
  const beforeReadout = record(value.beforeReadout, readoutKeys);
  const postReadout = record(value.postReadout, readoutKeys);
  const sequenceResult = (state, reason) => {
    const { fixtureScopeMatched, readouts, ...boundary } = result(state, reason);
    return freeze({ ...boundary, fixtureSequenceMatched: state === "fixture_sequence_matched" });
  };
  const initial = inspectDtcClearReadoutFixtureScope(value.scope, context);
  if (!initial.ok) return sequenceResult("rejected", initial.reason);
  for (const time of [value.clearStartedAt, value.clearCompletedAt]) {
    if (typeof time !== "string" || !Number.isFinite(Date.parse(time)) || new Date(time).toISOString() !== time) {
      throw new TypeError("invalid_fixture_clear_timestamp");
    }
  }
  // Capture the reference without invoking an accessor; post evaluation validates the full snapshot.
  const clearAttempt = value.clearWindowSnapshot !== null && typeof value.clearWindowSnapshot === "object"
    ? Object.getOwnPropertyDescriptor(value.clearWindowSnapshot, "attemptToken") : null;
  if (!clearAttempt || !Object.hasOwn(clearAttempt, "value")) throw new TypeError("invalid_fixture_clear_attempt");
  const before = evaluateDtcClearScopedBeforeReadoutFixture({ scope: value.scope, context, beforeReadout });
  if (before.state === "rejected") return sequenceResult("rejected", before.reason);
  const post = evaluateDtcClearScopedPostReadoutFixture({ scope: value.scope, context,
    clearWindowSnapshot: value.clearWindowSnapshot, clearCompletedAt: value.clearCompletedAt, postReadout });
  if (post.state === "rejected") return sequenceResult("rejected", post.reason);
  const current = inspectDtcClearReadoutFixtureScope(value.scope, context);
  if (!current.ok) return sequenceResult("rejected", current.reason);
  if (new Set([beforeReadout.attemptToken, clearAttempt.value, postReadout.attemptToken]).size !== 3) {
    return sequenceResult("rejected", "sequence_attempt_not_distinct");
  }
  const boundaries = [beforeReadout.completedAt, value.clearStartedAt, value.clearCompletedAt, postReadout.startedAt].map(Date.parse);
  if (!boundaries.every((time, index) => index === 0 || time >= boundaries[index - 1])) {
    return sequenceResult("rejected", "fixture_sequence_order_invalid");
  }
  if (!before.fixtureScopeMatched) return sequenceResult("fixture_sequence_incomplete", "before_fixture_scope_incomplete");
  if (!post.fixtureScopeMatched) return sequenceResult("fixture_sequence_incomplete", post.reason || "post_fixture_scope_incomplete");
  return sequenceResult("fixture_sequence_matched", null);
}

function copyEvidenceInput(value) {
  const before = record(value, ["provenance", "attemptToken", "connectionToken", "startedAt", "completedAt", "receipts"]);
  if (!Array.isArray(before.receipts)) throw new TypeError("invalid_evidence_receipts");
  const keys = Reflect.ownKeys(before.receipts);
  if (Object.getOwnPropertyDescriptor(before.receipts, "length").value !== 4
    || keys.some((key) => typeof key !== "string") || keys.join(",") !== "0,1,2,3,length") throw new TypeError("invalid_evidence_receipts");
  const receipts = [0, 1, 2, 3].map((index) => {
    const descriptor = Object.getOwnPropertyDescriptor(before.receipts, String(index));
    if (!descriptor || !Object.hasOwn(descriptor, "value")) throw new TypeError("invalid_evidence_receipt_accessor");
    const receipt = record(descriptor.value, ["ordinal", "intent", "command", "profile", "startedAt", "completedAt", "completion", "transcript"]);
    return Object.freeze(receipt);
  });
  // Freeze owned records only, never caller-owned attempt or connection references.
  return Object.freeze({ ...before, receipts: Object.freeze(receipts) });
}

function dtcEvidenceHandle(scope, dtcEvidence, paired = false) {
  let retained = freeze(dtcEvidence);
  return Object.freeze({
    inspect(context) {
      const current = inspectDtcClearReadoutFixtureScope(scope, context);
      if (!current.ok) return freeze({ ok: false, reason: current.reason, summary: null });
      if (retained === null) return freeze({ ok: false, reason: "evidence_disposed", summary: null });
      const { readouts, fixtureScopeMatched, ...boundary } = result(paired ? "fixture_dtc_evidence_pair" : "fixture_dtc_evidence", null);
      const evidence = paired ? { beforeDtcEvidence: retained.before, postDtcEvidence: retained.post, fixtureSequenceMatched: true }
        : { dtcEvidence: retained };
      return freeze({ ok: true, reason: null, summary: { ...boundary, ...evidence, readinessEvidenceAvailable: false } });
    },
    dispose() { retained = null; },
    ...(paired ? { inspectDifference(context) {
      const current = inspectDtcClearReadoutFixtureScope(scope, context);
      if (!current.ok) return freeze({ ok: false, reason: current.reason, summary: null });
      if (retained === null) return freeze({ ok: false, reason: "evidence_disposed", summary: null });
      const differences = retained.before.map((before, index) => {
        const after = retained.post[index];
        if (before.intent !== after.intent || before.sources.length !== after.sources.length) throw new Error("fixture_pair_shape_mismatch");
        return { intent: before.intent, sources: before.sources.map((source, sourceIndex) => {
          const postSource = after.sources[sourceIndex];
          if (source.sourceId !== postSource.sourceId) throw new Error("fixture_pair_source_mismatch");
          const beforeCodes = new Set(source.codes), afterCodes = new Set(postSource.codes);
          return { sourceId: source.sourceId,
            added: postSource.codes.filter((code) => !beforeCodes.has(code)),
            removed: source.codes.filter((code) => !afterCodes.has(code)),
            retained: source.codes.filter((code) => afterCodes.has(code)) };
        }) };
      });
      const { readouts, fixtureScopeMatched, ...boundary } = result("fixture_dtc_difference", null);
      return freeze({ ok: true, reason: null, summary: { ...boundary, differences, fixtureSequenceMatched: true,
        fixtureDifferenceAvailable: true, readinessEvidenceAvailable: false } });
    }, inspectReadinessIndicators(context) {
      const current = inspectDtcClearReadoutFixtureScope(scope, context);
      if (!current.ok) return freeze({ ok: false, reason: current.reason, summary: null });
      if (retained === null) return freeze({ ok: false, reason: "evidence_disposed", summary: null });
      const { readouts, fixtureScopeMatched, ...boundary } = result("fixture_readiness_indicators", null);
      return freeze({ ok: true, reason: null, summary: { ...boundary,
        beforeIndicators: retained.beforeIndicators, postIndicators: retained.postIndicators,
        fixtureReadinessIndicatorsAvailable: true, monitorEvidenceAvailable: false, readinessEvidenceAvailable: false } });
    } } : {})
  });
}

export function createDtcClearBeforeDtcEvidenceFixture(input) {
  const value = record(input, ["scope", "context", "beforeReadout"]);
  const context = record(value.context, ["scopeToken", "connectionToken", "targetToken"]);
  const initial = inspectDtcClearReadoutFixtureScope(value.scope, context);
  if (!initial.ok) return freeze({ ok: false, reason: initial.reason, handle: null });
  const beforeReadout = copyEvidenceInput(value.beforeReadout);
  const evaluated = evaluateDtcClearScopedBeforeReadoutFixture({ scope: value.scope, context, beforeReadout });
  if (!evaluated.fixtureScopeMatched) return freeze({ ok: false, reason: evaluated.reason || "before_fixture_scope_incomplete", handle: null });
  return extractDtcEvidence(value.scope, context, beforeReadout);
}

export function createDtcClearPostDtcEvidenceFixture(input) {
  const value = record(input, ["scope", "context", "clearWindowSnapshot", "clearCompletedAt", "postReadout"]);
  const context = record(value.context, ["scopeToken", "connectionToken", "targetToken"]);
  const initial = inspectDtcClearReadoutFixtureScope(value.scope, context);
  if (!initial.ok) return freeze({ ok: false, reason: initial.reason, handle: null });
  const postReadout = copyEvidenceInput(value.postReadout);
  const evaluated = evaluateDtcClearScopedPostReadoutFixture({ scope: value.scope, context,
    clearWindowSnapshot: value.clearWindowSnapshot, clearCompletedAt: value.clearCompletedAt, postReadout });
  if (!evaluated.fixtureScopeMatched) return freeze({ ok: false, reason: evaluated.reason || "post_fixture_scope_incomplete", handle: null });
  return extractDtcEvidence(value.scope, context, postReadout);
}

function extractDtcEvidence(scope, context, readout) {
  const dtcEvidence = extractValidatedDtcRows(readout);
  const current = inspectDtcClearReadoutFixtureScope(scope, context);
  if (!current.ok) return freeze({ ok: false, reason: current.reason, handle: null });
  return Object.freeze({ ok: true, reason: null, handle: dtcEvidenceHandle(scope, dtcEvidence) });
}

function extractValidatedDtcRows(readout) {
  // Reparse only the owned, immutable input already validated by the production evaluator.
  // Count, zero-slot, duplicate and conflict policies remain in that evaluator, not reimplemented here.
  return readout.receipts.slice(0, 3).map((receipt) => {
    const parsed = runtime.window.ObdReadOnly.parseElmReadOnlyRawTranscript({ profile: receipt.profile,
      command: receipt.command, transcript: receipt.transcript, completion: receipt.completion });
    const sources = new Map();
    for (const frame of parsed.frames) {
      if (sources.has(frame.sourceId)) continue;
      const codes = [];
      for (let index = 2; index < frame.payload.length; index += 2) {
        // Scapy OBD_DTC: system 2 bits, first digit 2 bits, then three hex nibbles.
        const high = frame.payload[index], low = frame.payload[index + 1];
        codes.push(`${["P", "C", "B", "U"][high >> 6]}${(high >> 4) & 3}${(high & 15).toString(16)}${low.toString(16).padStart(2, "0")}`.toUpperCase());
      }
      sources.set(frame.sourceId, { sourceId: frame.sourceId, observation: codes.length ? "positive_nonempty" : "positive_empty", codes: codes.sort() });
    }
    return { intent: receipt.intent, sources: [...sources.values()].sort((a, b) => a.sourceId.localeCompare(b.sourceId)) };
  });
}

// Require immutable data, not merely a frozen outer shell. Never freeze caller data.
function assertImmutableClearSnapshot(snapshot) {
  const seen = new WeakSet();
  const pending = [{ value: snapshot, root: true }];
  let visited = 0, properties = 0;
  while (pending.length) {
    const { value, root } = pending.pop();
    if (value === null || ["string", "number", "boolean", "undefined"].includes(typeof value)) continue;
    if (typeof value !== "object" || !Object.isFrozen(value)) throw new TypeError("mutable_pair_clear_snapshot");
    if (++visited > 4096) throw new TypeError("pair_clear_snapshot_budget_exceeded");
    if (seen.has(value)) continue;
    seen.add(value);
    const keys = Reflect.ownKeys(value);
    properties += keys.length;
    if (properties > 4096) throw new TypeError("pair_clear_snapshot_budget_exceeded");
    for (const key of keys) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (typeof key !== "string" || !descriptor || !Object.hasOwn(descriptor, "value")) throw new TypeError("invalid_pair_clear_descriptor");
      // Identity only: token contents are neither read nor frozen.
      if (!(root && key === "attemptToken")) pending.push({ value: descriptor.value, root: false });
    }
  }
}

export function createDtcClearDtcEvidencePairFixture(input) {
  const value = record(input, ["scope", "context", "beforeReadout", "clearWindowSnapshot", "clearStartedAt", "clearCompletedAt", "postReadout"]);
  const context = record(value.context, ["scopeToken", "connectionToken", "targetToken"]);
  const initial = inspectDtcClearReadoutFixtureScope(value.scope, context);
  if (!initial.ok) return freeze({ ok: false, reason: initial.reason, handle: null });
  // Fixed production snapshots preserve the same-VM follow-up-plan identity.
  assertImmutableClearSnapshot(value.clearWindowSnapshot);
  const beforeReadout = copyEvidenceInput(value.beforeReadout);
  const postReadout = copyEvidenceInput(value.postReadout);
  const evaluated = evaluateDtcClearReadoutSequenceFixture({ ...value, context, beforeReadout, postReadout });
  if (!evaluated.fixtureSequenceMatched) return freeze({ ok: false, reason: evaluated.reason || "fixture_sequence_incomplete", handle: null });
  const evidence = { before: extractValidatedDtcRows(beforeReadout), post: extractValidatedDtcRows(postReadout),
    beforeIndicators: extractValidatedReadinessIndicators(beforeReadout), postIndicators: extractValidatedReadinessIndicators(postReadout) };
  const current = inspectDtcClearReadoutFixtureScope(value.scope, context);
  if (!current.ok) return freeze({ ok: false, reason: current.reason, handle: null });
  return Object.freeze({ ok: true, reason: null, handle: dtcEvidenceHandle(value.scope, evidence, true) });
}

function extractValidatedReadinessIndicators(readout) {
  // Same owned receipt that passed sequence semantics; no permissive general decoder.
  const receipt = readout.receipts[3];
  const parsed = runtime.window.ObdReadOnly.parseElmReadOnlyRawTranscript({ profile: receipt.profile,
    command: receipt.command, transcript: receipt.transcript, completion: receipt.completion });
  const sources = new Map();
  for (const frame of parsed.frames) {
    if (sources.has(frame.sourceId)) continue;
    // python-OBD status decoder: A7 is MIL, A6..A0 is reported DTC count.
    sources.set(frame.sourceId, { sourceId: frame.sourceId, milCommandedOn: (frame.payload[2] & 0x80) !== 0,
      reportedDtcCount: frame.payload[2] & 0x7F });
  }
  return [...sources.values()].sort((a, b) => a.sourceId.localeCompare(b.sourceId));
}
