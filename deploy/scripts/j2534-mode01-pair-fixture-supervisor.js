import { createBoundedFixtureWorker } from "./bounded-fixture-worker.js";
import { createJ2534Mode01ResultConverter } from "./j2534-mode01-result-converter.js";

// Internal generated-fixture parent only. Not registered-driver/public input.
// All evidence is withheld unless BOTH fixed PIDs and the child exit validate.
export function createJ2534Mode01PairFixtureSupervisor({ spawnWorker, requestEcu, decodeLivePidResponse }) {
  if (typeof spawnWorker !== "function" || !Number.isInteger(requestEcu)
    || requestEcu < 0x7e0 || requestEcu > 0x7e7) throw new TypeError("mode01_pair_configuration_invalid");
  const convert = createJ2534Mode01ResultConverter(decodeLivePidResponse);
  const request = Object.freeze({ request_ecu: requestEcu, pids: Object.freeze([5, 12]) });
  const worker = createBoundedFixtureWorker({ spawnWorker: () => spawnWorker(request),
    parseOutput: stdout => ({ stdout }), outputLimit: 16384, rejectStderr: true });
  let consumed = false;
  const unavailable = reason => ({ status: "unavailable", reason, fixture_only: true,
    vehicle_communication: false, results: null });
  return async function run({ signal } = {}) {
    if (consumed) return unavailable("fixture_already_consumed");
    consumed = true;
    if (signal?.aborted) return unavailable("fixture_cancelled");
    const completion = await worker({ timeout: 15000, signal });
    let results = null;
    try {
      const envelope = JSON.parse(completion.parsed_result?.stdout);
      if (Object.keys(envelope).length !== 2 || envelope.fixture_only !== true
        || !Array.isArray(envelope.observations) || envelope.observations.length !== 2) throw new Error();
      // Preserve the actual bounded completion flags. Each legacy converter
      // independently checks normal exit, cleanup and its fixed ECU/PID.
      const decoded = envelope.observations.map((observation, index) => convert.fromSupervisedCompletion(
        { ...completion, parsed_result: { stdout: JSON.stringify(observation) } },
        { request_ecu: requestEcu, pid: request.pids[index] }));
      if (decoded.some(item => item.status !== "decoded")) throw new Error();
      // Both PIDs must cite the same PID00 receipt, not just compatible bitmaps.
      if (JSON.stringify(decoded[0].evidence.supported_read) !== JSON.stringify(decoded[1].evidence.supported_read)) throw new Error();
      results = decoded;
    } catch { /* No partial result escapes. */ }
    return { ...unavailable("fixture_result_unavailable"), status: results ? "completed" : "unavailable",
      reason: results ? null : "fixture_result_unavailable", results, completion };
  };
}
