import path from "node:path";
import { createJ2534SweepSessionSupervisor } from "./j2534-sweep-session-supervisor.js";

// Selection may only confirm independent generated build pins, never replace them.
export function createJ2534SelectedSweepFixtureSupervisor({ handoff, descriptor, pinned, spawnWorker, ...builders }) {
  const keys = ["path", "sha256", "size", "architecture", "request_ecu"];
  if (!handoff || typeof handoff.prepare !== "function" || typeof handoff.consume !== "function"
    || typeof spawnWorker !== "function" || !pinned || Array.isArray(pinned)
    || Object.keys(pinned).length !== keys.length || !keys.every(key => Object.hasOwn(pinned, key)))
    throw new TypeError("sweep_fixture_selection_invalid");
  const pin = Object.freeze(Object.fromEntries(keys.map(key => [key, pinned[key]])));
  if (typeof pin.path !== "string" || !/^[A-Za-z]:\\/.test(pin.path) || pin.path.includes("\0")
    || path.win32.normalize(pin.path) !== pin.path || typeof pin.sha256 !== "string"
    || !/^[0-9A-F]{64}$/.test(pin.sha256) || !Number.isSafeInteger(pin.size) || pin.size < 1
    || !["x86", "x64"].includes(pin.architecture) || pin.request_ecu !== 0x7e0)
    throw new TypeError("sweep_fixture_selection_invalid");
  const request = Object.freeze({ request_ecu: pin.request_ecu,
    services: Object.freeze([3, 7, 10]), pids: Object.freeze([0, 5, 12]) });
  const prepare = handoff.prepare.bind(handoff), consume = handoff.consume.bind(handoff);
  let ticket;
  const run = createJ2534SweepSessionSupervisor({ ...builders, requestEcu: pin.request_ecu,
    spawnWorker: () => {
      const selection = consume(ticket);
      if (!selection || !keys.every(key => selection[key] === pin[key])
        || !Array.isArray(selection.services) || selection.services.length !== 3
        || !request.services.every((v, i) => selection.services[i] === v)
        || !Array.isArray(selection.pids) || selection.pids.length !== 3
        || !request.pids.every((v, i) => selection.pids[i] === v))
        throw new Error("sweep_fixture_selection_unavailable");
      return spawnWorker(Object.freeze(["--generated-diagnostic-sweep"]));
    } });
  ticket = prepare(descriptor, request);
  return run;
}
