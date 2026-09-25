import { createBoundedFixtureWorker } from "./bounded-fixture-worker.js";
import { createJ2534Mode01ResultConverter } from "./j2534-mode01-result-converter.js";
import { createJ2534DtcResultConverter } from "./j2534-dtc-result-converter.js";

const exact = (value, keys) => value && typeof value === "object" && !Array.isArray(value)
  && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));

// Development fixture parent only; no public route or registered driver launch.
export function createJ2534SweepFixtureSupervisor({ spawnWorker, requestEcu, decodeLivePidResponse, decodeDtcResponse }) {
  if (typeof spawnWorker !== "function" || !Number.isInteger(requestEcu)
    || requestEcu < 0x7e0 || requestEcu > 0x7e7) throw new TypeError("sweep_configuration_invalid");
  const live = createJ2534Mode01ResultConverter(decodeLivePidResponse);
  const dtc = createJ2534DtcResultConverter(decodeDtcResponse);
  const services = Object.freeze([3, 7, 10]);
  const request = Object.freeze({ request_ecu: requestEcu, services, pids: Object.freeze([0, 5, 12]) });
  const worker = createBoundedFixtureWorker({ spawnWorker: () => spawnWorker(request),
    parseOutput: stdout => ({ stdout }), outputLimit: 262144, rejectStderr: true });
  const unavailable = reason => ({ status: "unavailable", reason, fixture_only: true,
    vehicle_communication: false, results: null });
  let consumed = false;
  return async function run({ signal } = {}) {
    if (consumed) return unavailable("fixture_already_consumed");
    consumed = true;
    if (signal?.aborted) return unavailable("fixture_cancelled");
    const completion = await worker({ timeout: 15000, signal });
    let results = null;
    try {
      // Child text alone must never be converted into successful worker exit.
      if (completion.execution_status !== "worker_completed" || completion.worker_started !== true
        || completion.worker_exited !== true || completion.termination_requested !== false
        || completion.termination_signal_sent !== false || !Array.isArray(completion.errors)
        || completion.errors.length || !exact(completion.parsed_result, ["stdout"])) throw new Error();
      const input = JSON.parse(completion.parsed_result.stdout);
      if (!exact(input, ["fixture_only", "cleanup_confirmed", "request_ecu", "dtc_reads", "observations"])
        || input.fixture_only !== true || input.cleanup_confirmed !== true || input.request_ecu !== requestEcu
        || !Array.isArray(input.dtc_reads) || input.dtc_reads.length !== 3
        || !Array.isArray(input.observations) || input.observations.length !== 2) throw new Error();
      const dtcs = input.dtc_reads.map((item, index) => {
        if (!exact(item, ["service", "read_result"]) || item.service !== services[index]) throw new Error();
        return dtc(JSON.stringify({ schema_version: "j2534-dtc-read-v1", worker_status: "worker_completed",
          cleanup_confirmed: true, request_ecu: requestEcu, service: item.service, read_result: item.read_result }));
      });
      const values = input.observations.map((item, index) => live.fromSupervisedCompletion(
        { ...completion, parsed_result: { stdout: JSON.stringify(item) } },
        { request_ecu: requestEcu, pid: [5, 12][index] }));
      if ([...dtcs, ...values].some(item => item.status !== "decoded")) throw new Error();
      if (JSON.stringify(values[0].evidence.supported_read) !== JSON.stringify(values[1].evidence.supported_read)) throw new Error();
      results = { dtc: dtcs, live: values };
    } catch { /* All five results or none; no partial diagnostic publication. */ }
    return { ...unavailable("fixture_result_unavailable"), status: results ? "completed" : "unavailable",
      reason: results ? null : "fixture_result_unavailable", results, completion };
  };
}
