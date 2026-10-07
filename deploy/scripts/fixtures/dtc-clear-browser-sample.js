// Development-only fixed simulated receipts. No transport or external input.
import { createDtcClearReadoutFixtureScope } from "./dtc-clear-readout-scope.js";

export function createDtcClearBrowserFixtureInput(validators, sample = "monitor") {
  if (!["monitor", "workflow", "workflow_unknown", "workflow_reread_failed"].includes(sample)) throw new TypeError("unknown_fixed_sample");
  const workflowSample = sample !== "monitor";
  const profile = "iso15765_11bit_normal_h1_caf1_d0_s1_e0";
  const intents = ["read_stored_dtc", "read_pending_dtc", "read_permanent_dtc", "read_readiness"];
  const commands = ["03", "07", "0A", "0101"];
  const connectionToken = {}, targetToken = {};
  const scope = createDtcClearReadoutFixtureScope({ provenance: "simulated", profile, connectionToken, targetToken,
    byIntent: intents.map(intent => ({ intent, sourceIds: ["7E8", "7E9"] })) });
  const context = { scopeToken: scope.scopeToken, connectionToken, targetToken };
  const stamp = second => `2026-10-06T00:00:${String(second).padStart(2, "0")}.000Z`;
  const readout = (start, changed) => ({ provenance: "simulated", attemptToken: {}, connectionToken,
    startedAt: stamp(start), completedAt: stamp(start + 5),
    receipts: intents.map((intent, index) => ({ ordinal: index + 1, intent, command: commands[index], profile,
      startedAt: stamp(start + index), completedAt: stamp(start + index + 1), completion: "complete",
      transcript: ["7E8", "7E9"].map(source => index === 3
        ? `${source} 06 41 01 ${workflowSample && source === "7E8" && !changed ? "01" : "00"} ${changed && source === "7E8" ? "17 01 01" : "07 01 00"} AA\r`
        : workflowSample && source === "7E8" && ((index === 0 && !changed) || (index === 1 && changed) || index === 2)
          ? `${source} 04 ${["43 01 01 33", "47 01 03 00", "4A 01 04 20"][index]} AA AA AA\r`
          : `${source} 02 ${["43", "47", "4A"][index]} 00 AA AA AA AA AA\r`).join("") + ">" })) });
  const clear = validators.createDtcClearFixtureReceiveWindow({ expectedSourceIds: ["7EC"], connectionToken });
  if (sample !== "workflow_unknown") clear.append(clear.attemptToken, connectionToken, { sourceId: "7EC", payload: [0x44] });
  const postReadout = readout(9, true);
  if (sample === "workflow_reread_failed") {
    postReadout.receipts[3].completion = "timeout";
    postReadout.receipts[3].transcript = "";
  }
  return { scope, context, beforeReadout: readout(1, false), clearStartedAt: stamp(7), clearCompletedAt: stamp(8),
    clearWindowSnapshot: clear.finish(clear.attemptToken, connectionToken, sample === "workflow_unknown" ? "timeout" : "complete").snapshot,
    postReadout };
}
