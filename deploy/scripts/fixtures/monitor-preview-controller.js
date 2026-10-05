// Development-only lifecycle for trusted simulated session factories. No evidence validation or vehicle authority.
export function createSimulatedReviewController(createSession, waitForPresentation = () => Promise.resolve()) {
  if (typeof createSession !== "function") throw new TypeError("invalid_preview_factory");
  if (typeof waitForPresentation !== "function") throw new TypeError("invalid_preview_scheduler");
  let ticket = null, owned = null;
  const state = (status, text = null) => Object.freeze({ status, text,
    provenance: "simulated_only", executionEnabled: false, vehicleCommandEnabled: false,
    wouldTransmit: false, canExecute: false });
  let current = state("empty");
  const release = () => { owned?.dispose(); owned = null; };
  const listeners = new Set();
  let notifying = false;
  const publish = next => {
    current = next;
    if (notifying) return;
    notifying = true;
    try {
      let delivered;
      do {
        delivered = current;
        for (const listener of [...listeners]) {
          if (current !== delivered) break;
          if (!listeners.has(listener)) continue;
          try { listener(delivered); }
          catch {
            listeners.delete(listener);
            ticket = null;
            release();
            current = state("unavailable");
          }
        }
      } while (current !== delivered);
    } finally { notifying = false; }
  };
  return Object.freeze({
    inspect() { return current; },
    // Synchronous observers only. Read the initial snapshot with inspect().
    subscribe(listener) {
      if (typeof listener !== "function") throw new TypeError("invalid_preview_listener");
      // Separate subscriptions remain independent even for the same callback.
      const subscription = value => listener(value);
      listeners.add(subscription);
      return () => listeners.delete(subscription);
    },
    invalidate() {
      if (current.status === "invalidated") return current;
      ticket = null;
      release();
      publish(state("invalidated"));
      return current;
    },
    async read() {
      if (notifying || current.status === "reading") return false;
      release();
      const attempt = {};
      ticket = attempt;
      publish(state("reading"));
      if (ticket !== attempt) return false;
      try {
        owned = createSession();
        // The scheduler's return value is never interpreted as evidence or display data.
        await waitForPresentation();
        if (ticket !== attempt) return false;
        const inspected = owned.inspect();
        if (!inspected.ok) throw new Error("preview_unavailable");
        publish(state("ready", inspected.text));
        return ticket === attempt;
      } catch {
        if (ticket !== attempt) return false;
        release();
        publish(state("unavailable"));
        return false;
      }
    }
  });
}
