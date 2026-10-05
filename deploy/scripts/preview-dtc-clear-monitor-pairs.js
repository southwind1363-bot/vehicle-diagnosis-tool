// Development-only preview. All receipts below are generated fixtures, never vehicle input.
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createDtcClearReadoutFixtureScope } from "./fixtures/dtc-clear-readout-scope.js";
import { createDtcClearFixtureReceiveWindow, createDtcClearDtcEvidencePairFixture } from "./fixtures/dtc-clear-scoped-before-readout.js";

export function createMonitorPairPreviewSession() {
  const intents = ["read_stored_dtc", "read_pending_dtc", "read_permanent_dtc", "read_readiness"];
  const commands = ["03", "07", "0A", "0101"], services = [0x43, 0x47, 0x4A];
  const profile = "iso15765_11bit_normal_h1_caf1_d0_s1_e0";
  const ids = ["7E8", "7E9", "7EA", "7EB"];
  const connectionToken = {}, targetToken = {};
  const scope = createDtcClearReadoutFixtureScope({ provenance: "simulated", profile, connectionToken, targetToken,
    byIntent: intents.map(intent => ({ intent, sourceIds: ids })) });
  const context = { scopeToken: scope.scopeToken, connectionToken, targetToken };
  const stamp = second => `2026-10-05T00:00:${String(second).padStart(2, "0")}.000Z`;
  const frame = (source, payload) => `${source} ${[payload.length, ...payload, ...Array(7 - payload.length).fill(0xAA)]
    .map(byte => byte.toString(16).padStart(2, "0").toUpperCase()).join(" ")}\r`;
  // 7E8: changed state; 7E9: changed ignition basis; 7EA: indeterminate; 7EB: unchanged.
  const before = [[0x07, 1, 0], [0x07, 1, 0], [0x07, 1, 0], [0x07, 1, 0]];
  const after = [[0x17, 1, 1], [0x0F, 1, 0], [0x87, 1, 0], [0x07, 1, 0]];
  const readout = (start, states) => ({ provenance: "simulated", connectionToken, attemptToken: {},
    startedAt: stamp(start), completedAt: stamp(start + 5),
    receipts: intents.map((intent, index) => ({ ordinal: index + 1, intent, command: commands[index], profile,
      startedAt: stamp(start + index), completedAt: stamp(start + index + 1), completion: "complete",
      transcript: ids.map((id, sourceIndex) => frame(id, index === 3
        ? [0x41, 1, 0, ...states[sourceIndex]] : [services[index], 0])).join("") + ">" })) });
  let handle;
  const dispose = () => { handle?.dispose(); scope.invalidate(context); };
  try {
    const clear = createDtcClearFixtureReceiveWindow({ expectedSourceIds: ["7EC"], connectionToken });
    clear.append(clear.attemptToken, connectionToken, { sourceId: "7EC", payload: [0x44] });
    const created = createDtcClearDtcEvidencePairFixture({ scope, context,
      beforeReadout: readout(1, before), clearStartedAt: stamp(7), clearCompletedAt: stamp(8),
      clearWindowSnapshot: clear.finish(clear.attemptToken, connectionToken, "complete").snapshot,
      postReadout: readout(9, after) });
    handle = created.handle;
    if (!created.ok || !handle) throw new Error("fixture_preview_unavailable");
    return Object.freeze({
      inspect() {
        const inspected = handle.inspectMonitorStatePairText(context);
        if (!inspected.ok) return Object.freeze({ ok: false, text: null });
        return Object.freeze({ ok: true, text: "固定サンプル: 7E8=状態変化 / 7E9=点火方式変更 / 7EA=状態不明 / 7EB=状態不変\n" + inspected.text });
      },
      dispose
    });
  } catch (error) {
    dispose();
    throw error;
  }
}

export function createMonitorPairPreview() {
  const session = createMonitorPairPreviewSession();
  try {
    const inspected = session.inspect();
    if (!inspected.ok) throw new Error("fixture_preview_unavailable");
    return inspected.text;
  } finally { session.dispose(); }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.length !== 2) {
    console.error("このプレビューは固定の模擬データ専用です。引数や実車記録は指定できません。");
    process.exitCode = 2;
  } else {
    try { console.log(createMonitorPairPreview()); }
    catch { console.error("模擬プレビューを生成できませんでした。実車処理は行っていません。"); process.exitCode = 1; }
  }
}
