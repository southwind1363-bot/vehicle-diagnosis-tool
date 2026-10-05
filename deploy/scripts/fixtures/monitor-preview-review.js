// Node-only presentation lifecycle. Input is always the fixed simulated fixture.
import { createMonitorPairPreviewSession } from "../preview-dtc-clear-monitor-pairs.js";

export function createMonitorPreviewReview(waitForPresentation = () => Promise.resolve()) {
  if (typeof waitForPresentation !== "function") throw new TypeError("invalid_preview_scheduler");
  let ticket = null, owned = null;
  const state = (status, text = null) => Object.freeze({ status, text,
    provenance: "simulated_only", executionEnabled: false, vehicleCommandEnabled: false,
    wouldTransmit: false, canExecute: false });
  let current = state("empty");
  const release = () => { owned?.dispose(); owned = null; };
  return Object.freeze({
    inspect() { return current; },
    invalidate() {
      ticket = null;
      release();
      current = state("invalidated");
      return current;
    },
    async read() {
      if (current.status === "reading") return false;
      release();
      const attempt = {};
      ticket = attempt;
      current = state("reading");
      try {
        owned = createMonitorPairPreviewSession();
        // The scheduler's return value is never interpreted as evidence or display data.
        await waitForPresentation();
        if (ticket !== attempt) return false;
        const inspected = owned.inspect();
        if (!inspected.ok) throw new Error("preview_unavailable");
        current = state("ready", inspected.text);
        return true;
      } catch {
        if (ticket !== attempt) return false;
        release();
        current = state("unavailable");
        return false;
      }
    }
  });
}
