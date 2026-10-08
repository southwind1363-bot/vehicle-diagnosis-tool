// Development-only lifecycle for trusted simulated session factories. No evidence validation or vehicle authority.
export function createSimulatedReviewController(createSession, waitForPresentation = () => Promise.resolve()) {
  if (typeof createSession !== "function") throw new TypeError("invalid_preview_factory");
  if (typeof waitForPresentation !== "function") throw new TypeError("invalid_preview_scheduler");
  let ticket = null, owned = null;
  const state = (status, text = null, reason = null) => Object.freeze({ status, text,
    failureReason: status === "unavailable" && ["receipt_incomplete", "receipt_clock_unavailable", "receipt_context_changed"].includes(reason) ? reason : null,
    provenance: "simulated_only", executionEnabled: false, vehicleCommandEnabled: false,
    wouldTransmit: false, canExecute: false });
  let current = state("empty");
  let releasing = false;
  const release = () => {
    const session = owned;
    owned = null;
    if (!session) return true;
    releasing = true;
    try { session.dispose(); return true; }
    catch { return false; }
    finally { releasing = false; }
  };
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
      if (releasing) return current;
      if (current.status === "invalidated") return current;
      ticket = null;
      const released = release();
      publish(state(released ? "invalidated" : "unavailable"));
      return current;
    },
    async read() {
      if (notifying || releasing || current.status === "reading") return false;
      if (!release()) {
        ticket = null;
        publish(state("unavailable"));
        return false;
      }
      const attempt = {};
      ticket = attempt;
      publish(state("reading"));
      if (ticket !== attempt) return false;
      try {
        const session = createSession();
        if (ticket !== attempt) { session.dispose(); return false; }
        owned = session;
        // The scheduler's return value is never interpreted as evidence or display data.
        await waitForPresentation();
        if (ticket !== attempt) return false;
        const inspected = owned.inspect();
        if (!inspected.ok) {
          const unavailable = state("unavailable", null, inspected.reason);
          if (ticket !== attempt) return false;
          const released = release();
          publish(released ? unavailable : state("unavailable"));
          return false;
        }
        const ready = state("ready", inspected.text);
        // Session callbacks may invalidate or replace this attempt synchronously.
        // Never publish the old result after returning from those callbacks.
        if (ticket !== attempt) return false;
        publish(ready);
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
