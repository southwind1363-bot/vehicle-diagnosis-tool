import { createBoundedFixtureWorker } from "./bounded-fixture-worker.js";
import { createJ2534Mode01SessionBuilder } from "./j2534-mode01-session-builder.js";
import path from "node:path";

// Fixed generated fixtures only. The pin comes from the trusted fixture builder,
// independently of registry metadata. Nothing here grants vendor-driver access.
export function createJ2534SelectedMode01FixtureSupervisor({ handoff, descriptor, pinned, spawnWorker,
  decodeLivePidResponse, buildDiagnosticScanSession }) {
  const keys = ["path", "sha256", "size", "architecture", "request_ecu", "pid"];
  if (!handoff || typeof handoff.prepare !== "function" || typeof handoff.consume !== "function"
    || typeof spawnWorker !== "function" || !pinned || Array.isArray(pinned)
    || Object.keys(pinned).length !== keys.length || !keys.every(k => Object.hasOwn(pinned, k)))
    throw new TypeError("mode01_fixture_selection_invalid");
  const pin = Object.freeze(Object.fromEntries(keys.map(k => [k, pinned[k]])));
  if (typeof pin.path !== "string" || !/^[A-Za-z]:\\/.test(pin.path) || pin.path.includes("\0")
    || path.win32.normalize(pin.path) !== pin.path || typeof pin.sha256 !== "string"
    || !/^[0-9A-F]{64}$/.test(pin.sha256) || !Number.isSafeInteger(pin.size) || pin.size < 1
    || !["x86", "x64"].includes(pin.architecture)) throw new TypeError("mode01_fixture_selection_invalid");
  const expected = Object.freeze({ request_ecu: pin.request_ecu, pid: pin.pid });
  const prepare = handoff.prepare.bind(handoff), consume = handoff.consume.bind(handoff);
  let ticket;
  const run = createJ2534Mode01FixtureSupervisor({ expected, decodeLivePidResponse, buildDiagnosticScanSession,
    spawnWorker: () => {
      const selection = consume(ticket);
      if (!selection || selection.service !== 1 || !keys.every(k => selection[k] === pin[k]))
        throw new Error("mode01_fixture_selection_unavailable");
      // No async gap between final revalidation and the fixed child's spawn.
      return spawnWorker(Object.freeze(["--generated-mode01", pin.path, pin.sha256, String(pin.size),
        pin.architecture, String(pin.request_ecu), String(pin.pid)]));
    } });
  ticket = prepare(descriptor, expected);
  return run;
}

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
