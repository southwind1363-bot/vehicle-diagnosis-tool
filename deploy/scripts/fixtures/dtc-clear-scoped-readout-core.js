// Development-only validators. The caller supplies one trusted runtime; this factory does not authenticate it.
import { inspectDtcClearReadoutFixtureScope } from "./dtc-clear-readout-scope.js";

export function createDtcClearFixtureValidators(api) {
  if (api === null || typeof api !== "object") throw new TypeError("invalid_fixture_runtime_api");
  const take = name => {
    const descriptor = Object.getOwnPropertyDescriptor(api, name);
    if (!descriptor || !Object.hasOwn(descriptor, "value") || typeof descriptor.value !== "function") {
      throw new TypeError("invalid_fixture_runtime_api");
    }
    return descriptor.value;
  };
  const evaluateBefore = take("evaluateGenericObdDtcClearBeforeReadoutReceipts");
  const evaluatePost = take("evaluateGenericObdDtcClearPostReadoutReceipts");
  const createReceiveWindow = take("createGenericObdDtcClearReceiveWindow").bind(api);
  const parseReadOnlyTranscript = take("parseElmReadOnlyRawTranscript").bind(api);

  // Construct clear fixtures in the supplied runtime to preserve follow-up-plan identity.
  function createDtcClearFixtureReceiveWindow(input) {
    return createReceiveWindow(input);
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

  function evaluateDtcClearScopedBeforeReadoutFixture(input) {
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

  function evaluateDtcClearScopedPostReadoutFixture(input) {
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
  function evaluateDtcClearReadoutSequenceFixture(input) {
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

  function pairMonitorStates(beforeReports, postReports, group) {
    const postBySource = new Map(postReports.map(report => [report.sourceId, report]));
    if (beforeReports.length !== postBySource.size) throw new Error("fixture_pair_source_mismatch");
    return beforeReports.map(before => {
      const post = postBySource.get(before.sourceId);
      if (!post) throw new Error("fixture_pair_source_mismatch");
      const beforeById = new Map(before.monitors.map(row => [row.monitorId, row]));
      const postById = new Map(post.monitors.map(row => [row.monitorId, row]));
      const ids = [...new Set([...beforeById.keys(), ...postById.keys()])];
      return { sourceId: before.sourceId, group,
        beforeIgnitionTypeReported: before.ignitionTypeReported, postIgnitionTypeReported: post.ignitionTypeReported,
        monitors: ids.map(monitorId => {
          const first = beforeById.get(monitorId), last = postById.get(monitorId);
          const reason = before.ignitionTypeReported !== post.ignitionTypeReported ? "ignition_type_changed"
            : !first || !last ? "monitor_not_shared"
              : first.state === "indeterminate" || last.state === "indeterminate" ? "state_indeterminate" : null;
          return { monitorId, beforeState: first?.state ?? null, postState: last?.state ?? null,
            pairingState: reason ? "withheld" : "paired", reason,
            stateChanged: reason ? null : first.state !== last.state };
        }) };
    });
  }

  function dtcEvidenceHandle(scope, dtcEvidence, paired = false) {
    let retained = freeze(dtcEvidence);
    const inspectMonitorStatePairs = context => {
      const current = inspectDtcClearReadoutFixtureScope(scope, context);
      if (!current.ok) return freeze({ ok: false, reason: current.reason, summary: null });
      if (retained === null) return freeze({ ok: false, reason: "evidence_disposed", summary: null });
      const { readouts, fixtureScopeMatched, ...boundary } = result("fixture_monitor_state_pairs", null);
      const sources = [...pairMonitorStates(retained.beforeBaseMonitors, retained.postBaseMonitors, "base"),
        ...pairMonitorStates(retained.beforeNoncontinuous, retained.postNoncontinuous, "noncontinuous")];
      return freeze({ ok: true, reason: null, summary: { ...boundary, sources,
        fixtureMonitorStatePairsAvailable: true, readinessEvidenceAvailable: false } });
    };
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
      }, inspectBaseMonitorReports(context) {
        const current = inspectDtcClearReadoutFixtureScope(scope, context);
        if (!current.ok) return freeze({ ok: false, reason: current.reason, summary: null });
        if (retained === null) return freeze({ ok: false, reason: "evidence_disposed", summary: null });
        const { readouts, fixtureScopeMatched, ...boundary } = result("fixture_base_monitor_reports", null);
        return freeze({ ok: true, reason: null, summary: { ...boundary,
          beforeReports: retained.beforeBaseMonitors, postReports: retained.postBaseMonitors,
          fixtureBaseMonitorReportsAvailable: true, noncontinuousMonitorsInterpreted: false, readinessEvidenceAvailable: false } });
      }, inspectMonitorStatePairs(context) {
        return inspectMonitorStatePairs(context);
      }, inspectMonitorStatePairText(context) {
        const inspected = inspectMonitorStatePairs(context);
        if (!inspected.ok) return freeze({ ok: false, reason: inspected.reason, text: null });
        const states = { complete: "完了", incomplete: "未完了", not_supported: "非対応", indeterminate: "状態不明" };
        const reasons = { ignition_type_changed: "点火方式の報告が異なる", monitor_not_shared: "片側に監視項目の報告がない",
          state_indeterminate: "前後いずれかの状態が不明" };
        const ignition = { spark: "火花点火", compression: "圧縮着火" };
        const label = state => state === null ? "報告なし" : Object.hasOwn(states, state) ? states[state] : "状態不明";
        const lines = ["模擬の前後記録（実車の読取結果ではありません）",
          "出力時点の模擬記録です。保存・転記した文章を比較権限や実行許可には使用できません。",
          "状態の相違は消去成功・故障解消の証明ではありません。実車適合は未確認です。",
          "実行・車両送信は無効です。実車の整備判断には対象車両の整備書確認が必要です。"];
        for (const source of inspected.summary.sources) {
          lines.push(`[${source.sourceId}] ${source.group === "base" ? "基本monitor" : "非連続monitor"} / 点火方式（報告）: ${ignition[source.beforeIgnitionTypeReported]} → ${ignition[source.postIgnitionTypeReported]}`);
          for (const row of source.monitors) {
            const disposition = row.pairingState === "withheld"
              ? `対応付け保留: ${Object.hasOwn(reasons, row.reason) ? reasons[row.reason] : "理由未確認"}`
              : row.stateChanged ? "報告状態が変化" : "報告状態は同じ";
            lines.push(`  ${row.monitorId}: 前 ${label(row.beforeState)} → 後 ${label(row.postState)} / ${disposition}`);
          }
        }
        return freeze({ ok: true, reason: null, text: lines.join("\n") });
      }, inspectNoncontinuousMonitorReports(context) {
        const current = inspectDtcClearReadoutFixtureScope(scope, context);
        if (!current.ok) return freeze({ ok: false, reason: current.reason, summary: null });
        if (retained === null) return freeze({ ok: false, reason: "evidence_disposed", summary: null });
        const { readouts, fixtureScopeMatched, ...boundary } = result("fixture_noncontinuous_monitor_reports", null);
        return freeze({ ok: true, reason: null, summary: { ...boundary,
          beforeReports: retained.beforeNoncontinuous, postReports: retained.postNoncontinuous,
          fixtureNoncontinuousMonitorReportsAvailable: true, readinessEvidenceAvailable: false } });
      } } : {})
    });
  }

  function createDtcClearBeforeDtcEvidenceFixture(input) {
    const value = record(input, ["scope", "context", "beforeReadout"]);
    const context = record(value.context, ["scopeToken", "connectionToken", "targetToken"]);
    const initial = inspectDtcClearReadoutFixtureScope(value.scope, context);
    if (!initial.ok) return freeze({ ok: false, reason: initial.reason, handle: null });
    const beforeReadout = copyEvidenceInput(value.beforeReadout);
    const evaluated = evaluateDtcClearScopedBeforeReadoutFixture({ scope: value.scope, context, beforeReadout });
    if (!evaluated.fixtureScopeMatched) return freeze({ ok: false, reason: evaluated.reason || "before_fixture_scope_incomplete", handle: null });
    return extractDtcEvidence(value.scope, context, beforeReadout);
  }

  function createDtcClearPostDtcEvidenceFixture(input) {
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
      const parsed = parseReadOnlyTranscript({ profile: receipt.profile,
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

  function createDtcClearDtcEvidencePairFixture(input) {
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
    const beforeFrames = parseValidatedReadinessFrames(beforeReadout), postFrames = parseValidatedReadinessFrames(postReadout);
    const evidence = { before: extractValidatedDtcRows(beforeReadout), post: extractValidatedDtcRows(postReadout),
      beforeIndicators: extractValidatedReadinessIndicators(beforeFrames), postIndicators: extractValidatedReadinessIndicators(postFrames),
      beforeBaseMonitors: extractValidatedBaseMonitors(beforeFrames), postBaseMonitors: extractValidatedBaseMonitors(postFrames),
      beforeNoncontinuous: extractValidatedNoncontinuousMonitors(beforeFrames), postNoncontinuous: extractValidatedNoncontinuousMonitors(postFrames) };
    const current = inspectDtcClearReadoutFixtureScope(value.scope, context);
    if (!current.ok) return freeze({ ok: false, reason: current.reason, handle: null });
    return Object.freeze({ ok: true, reason: null, handle: dtcEvidenceHandle(value.scope, evidence, true) });
  }

  function parseValidatedReadinessFrames(readout) {
    // Same owned receipt that passed sequence semantics; no permissive general decoder.
    const receipt = readout.receipts[3];
    return parseReadOnlyTranscript({ profile: receipt.profile,
      command: receipt.command, transcript: receipt.transcript, completion: receipt.completion }).frames;
  }

  function extractValidatedReadinessIndicators(frames) {
    const sources = new Map();
    for (const frame of frames) {
      if (sources.has(frame.sourceId)) continue;
      // python-OBD status decoder: A7 is MIL, A6..A0 is reported DTC count.
      sources.set(frame.sourceId, { sourceId: frame.sourceId, milCommandedOn: (frame.payload[2] & 0x80) !== 0,
        reportedDtcCount: frame.payload[2] & 0x7F });
    }
    return [...sources.values()].sort((a, b) => a.sourceId.localeCompare(b.sourceId));
  }

  function extractValidatedBaseMonitors(frames) {
    const sources = new Map();
    for (const frame of frames) {
      if (sources.has(frame.sourceId)) continue;
      const b = frame.payload[3], reservedBitSet = (b & 0x80) !== 0;
      // PID 01 B0..2 support and B4..6 incomplete. Unsupported never means complete.
      const monitors = ["misfire", "fuel_system", "comprehensive_components"].map((monitorId, index) => {
        const supportedReported = (b & (1 << index)) !== 0;
        const incompleteReported = (b & (1 << (index + 4))) !== 0;
        const state = reservedBitSet || (!supportedReported && incompleteReported) ? "indeterminate"
          : !supportedReported ? "not_supported" : incompleteReported ? "incomplete" : "complete";
        return { monitorId, supportedReported, incompleteReported, state };
      });
      sources.set(frame.sourceId, { sourceId: frame.sourceId, ignitionTypeReported: (b & 8) ? "compression" : "spark",
        reservedBitSet, monitors });
    }
    return [...sources.values()].sort((a, b) => a.sourceId.localeCompare(b.sourceId));
  }

  function extractValidatedNoncontinuousMonitors(frames) {
    const sources = new Map();
    for (const frame of frames) {
      if (sources.has(frame.sourceId)) continue;
      const b = frame.payload[3], c = frame.payload[4], d = frame.payload[5];
      const compression = (b & 8) !== 0, reservedBitSet = (b & 0x80) !== 0;
      // PID 01 mapping only; no PID 41 or manufacturer-specific interpretation.
      const names = compression
        ? ["nmhc_catalyst", "nox_scr", null, "boost_pressure", null, "exhaust_gas_sensor", "pm_filter", "egr_vvt"]
        : ["catalyst", "heated_catalyst", "evaporative_system", "secondary_air", null, "oxygen_sensor", "oxygen_sensor_heater", "egr_vvt"];
      const unmappedBitsReported = names.some((name, index) => name === null && ((c | d) & (1 << index)) !== 0);
      const monitors = names.flatMap((monitorId, index) => {
        if (monitorId === null) return [];
        const supportedReported = (c & (1 << index)) !== 0, incompleteReported = (d & (1 << index)) !== 0;
        const state = reservedBitSet || unmappedBitsReported || (!supportedReported && incompleteReported) ? "indeterminate"
          : !supportedReported ? "not_supported" : incompleteReported ? "incomplete" : "complete";
        return [{ monitorId, supportedReported, incompleteReported, state }];
      });
      sources.set(frame.sourceId, { sourceId: frame.sourceId, ignitionTypeReported: compression ? "compression" : "spark",
        reservedBitSet, unmappedBitsReported, monitors });
    }
    return [...sources.values()].sort((a, b) => a.sourceId.localeCompare(b.sourceId));
  }

  return Object.freeze({ createDtcClearFixtureReceiveWindow, evaluateDtcClearScopedBeforeReadoutFixture, evaluateDtcClearScopedPostReadoutFixture, evaluateDtcClearReadoutSequenceFixture, createDtcClearBeforeDtcEvidenceFixture, createDtcClearPostDtcEvidenceFixture, createDtcClearDtcEvidencePairFixture });
}
