import { createJ2534Mode01SelectionHandoff } from "./j2534-mode01-selection-handoff.js";

const fixed = (value, expected) => Array.isArray(value) && value.length === expected.length
  && Object.keys(value).length === expected.length
  && expected.every((item, index) => Object.hasOwn(value, index) && value[index] === item);

// Separate opaque sweep tickets. Inner identity tickets never escape this closure.
// This non-executing metadata layer does not authorize a driver or public route.
export function createJ2534SweepSelectionHandoff(dependencies) {
  const identity = createJ2534Mode01SelectionHandoff(dependencies);
  const tickets = new WeakMap();
  return Object.freeze({
    prepare(descriptor, request) {
      try {
        const keys = ["request_ecu", "services", "pids"];
        if (!request || typeof request !== "object" || Array.isArray(request)
          || Object.keys(request).length !== keys.length || !keys.every(k => Object.hasOwn(request, k))) return null;
        const ecu = request.request_ecu;
        if (!fixed(request.services, [3, 7, 10]) || !fixed(request.pids, [0, 5, 12])) return null;
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
      const { service, pid, ...metadata } = selection;
      return Object.freeze({ ...metadata, services: Object.freeze([3, 7, 10]), pids: Object.freeze([0, 5, 12]) });
    }
  });
}
