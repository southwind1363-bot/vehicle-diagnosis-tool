import { createBoundedFixtureWorker } from "./bounded-fixture-worker.js";
import { createJ2534Mode01SessionBuilder } from "./j2534-mode01-session-builder.js";

// Development fixture composition only. The trusted caller validates and fixes
// the generated executable/path before supplying spawnWorker. Not a driver launcher.
export function createJ2534Mode01FixtureSupervisor({ spawnWorker, expected, decodeLivePidResponse, buildDiagnosticScanSession }) {
  if (typeof spawnWorker !== "function" || !expected || Object.keys(expected).length !== 2
    || !Object.hasOwn(expected, "request_ecu") || !Object.hasOwn(expected, "pid")
    || !Number.isInteger(expected.request_ecu) || expected.request_ecu < 0x7e0 || expected.request_ecu > 0x7e7
    || ![5, 12].includes(expected.pid)) throw new TypeError("mode01_fixture_configuration_invalid");
  const request = Object.freeze({ request_ecu: expected.request_ecu, pid: expected.pid });
  const build = createJ2534Mode01SessionBuilder({ decodeLivePidResponse, buildDiagnosticScanSession });
  const worker = createBoundedFixtureWorker({ spawnWorker: () => spawnWorker(request),
    parseOutput: stdout => ({ stdout }), outputLimit: 8192, rejectStderr: true });
  let consumed = false;
  const unavailable = reason => ({ status: "unavailable", reason, fixture_only: true, vehicle_communication: false, session: null });
  return async function run({ signal } = {}) {
    if (consumed) return unavailable("fixture_already_consumed");
    consumed = true; // Includes cancellation and spawn failure; never retry this instance.
    if (signal?.aborted) return unavailable("fixture_cancelled");
    const completion = await worker({ timeout: 15000, signal });
    const result = build.fromSupervisedCompletion(completion, request);
    return { status: result ? "completed" : "unavailable", fixture_only: true, vehicle_communication: false,
      session: result?.session ?? null, completion };
  };
}
