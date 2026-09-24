import { createJ2534Mode01SelectionHandoff } from "./j2534-mode01-selection-handoff.js";

// Private metadata only. A pair ticket is NOT a single-PID execution ticket.
// Reuse identity/expiry checks, without granting a loader or public route.
export function createJ2534Mode01PairSelectionHandoff(dependencies) {
  const identity = createJ2534Mode01SelectionHandoff(dependencies);
  const tickets = new WeakMap();
  return Object.freeze({
    prepare(descriptor, request) {
      try {
        if (!request || typeof request !== "object" || Array.isArray(request)
          || Object.keys(request).length !== 2
          || !Object.hasOwn(request, "request_ecu") || !Object.hasOwn(request, "pids")) return null;
        const ecu = request.request_ecu, pids = request.pids;
        if (!Array.isArray(pids) || pids.length !== 2 || Object.keys(pids).length !== 2
          || !Object.hasOwn(pids, 0) || !Object.hasOwn(pids, 1)
          || pids[0] !== 5 || pids[1] !== 12) return null;
        // Only the private identity ticket uses PID05. It cannot escape this closure.
        const inner = identity.prepare(descriptor, { request_ecu: ecu, pid: 5 });
        if (!inner) return null;
        const ticket = Object.freeze({});
        tickets.set(ticket, inner);
        return ticket;
      } catch { return null; }
    },
    consume(ticket) {
      const inner = ticket && typeof ticket === "object" ? tickets.get(ticket) : null;
      if (!inner) return null;
      tickets.delete(ticket);
      const selection = identity.consume(inner);
      if (!selection) return null;
      const { pid, ...metadata } = selection;
      return Object.freeze({ ...metadata, pids: Object.freeze([5, 12]) });
    }
  });
}
