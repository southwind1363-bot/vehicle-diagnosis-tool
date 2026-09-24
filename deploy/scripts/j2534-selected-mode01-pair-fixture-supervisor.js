import path from "node:path";
import { createJ2534Mode01PairSessionSupervisor } from "./j2534-mode01-pair-session-supervisor.js";

// Generated child only; the trusted fixture builder supplies an independent pin.
// Registry selection can confirm it, never authorize a different driver/ECU.
export function createJ2534SelectedMode01PairFixtureSupervisor({ handoff, descriptor, pinned, spawnWorker, ...builders }) {
  const keys = ["path", "sha256", "size", "architecture", "request_ecu"];
  if (!handoff || typeof handoff.prepare !== "function" || typeof handoff.consume !== "function"
    || typeof spawnWorker !== "function" || !pinned || Array.isArray(pinned)
    || Object.keys(pinned).length !== keys.length || !keys.every(key => Object.hasOwn(pinned, key)))
    throw new TypeError("mode01_pair_fixture_selection_invalid");
  const pin = Object.freeze(Object.fromEntries(keys.map(key => [key, pinned[key]])));
  if (typeof pin.path !== "string" || !/^[A-Za-z]:\\/.test(pin.path) || pin.path.includes("\0")
    || path.win32.normalize(pin.path) !== pin.path || typeof pin.sha256 !== "string"
    || !/^[0-9A-F]{64}$/.test(pin.sha256) || !Number.isSafeInteger(pin.size) || pin.size < 1
    || !["x86", "x64"].includes(pin.architecture) || pin.request_ecu !== 0x7e0)
    throw new TypeError("mode01_pair_fixture_selection_invalid");
  const request = Object.freeze({ request_ecu: pin.request_ecu, pids: Object.freeze([5, 12]) });
  const prepare = handoff.prepare.bind(handoff), consume = handoff.consume.bind(handoff);
  let ticket;
  const run = createJ2534Mode01PairSessionSupervisor({ ...builders, requestEcu: pin.request_ecu,
    spawnWorker: () => {
      const selection = consume(ticket);
      if (!selection || selection.service !== 1 || !keys.every(key => selection[key] === pin[key])
        || !Array.isArray(selection.pids) || selection.pids.length !== 2
        || selection.pids[0] !== 5 || selection.pids[1] !== 12)
        throw new Error("mode01_pair_fixture_selection_unavailable");
      // Synchronous consume/revalidate immediately before the fixed child's spawn.
      return spawnWorker(Object.freeze(["--selected-generated-mode01-pair", pin.path, pin.sha256,
        String(pin.size), pin.architecture, String(pin.request_ecu), "5", "12"]));
    } });
  ticket = prepare(descriptor, request);
  return run;
}
