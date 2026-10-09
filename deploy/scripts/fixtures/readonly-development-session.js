// Development-only mutual exclusion. Callbacks and profiles are artificial inputs.
// Settled promises never prove physical transport termination or settings readiness.
import { createReadOnlyReceiptRun } from "./readonly-receipt-run.js";
import { createReadOnlySettingsPreparationRun } from "./readonly-settings-preparation-run.js";

export function createReadOnlyDevelopmentSession({ readContext, api, profile, readClock, readCommand,
  invalidateReceipts, beginSettingsGeneration, readResponse }) {
  if (typeof readContext !== "function") throw new TypeError("invalid_receipt_context_provider");
  let active = null, disposed = false, preparedContext = null;
  const fields = ["port", "reader", "writer", "settingsTicket", "revision", "connected", "unlocked"];
  const snapshotContext = () => {
    try {
      const input = readContext(), copy = {};
      if (!input || typeof input !== "object" || Array.isArray(input)) return null;
      for (const key of fields) {
        const descriptor = Object.getOwnPropertyDescriptor(input, key);
        if (!descriptor || !Object.hasOwn(descriptor, "value")) return null;
        copy[key] = descriptor.value;
      }
      return copy;
    } catch { return null; }
  };
  // Keep the last context actually inspected by the lower owner. Settings may
  // legitimately rotate their ticket during preparation, so do not pin the initial one.
  const observeContext = () => {
    const record = active, context = snapshotContext();
    if (record?.requiredContext && !sameContext(record.requiredContext, context)) return null;
    if (record && active === record) record.context = context;
    return context;
  };
  const sameContext = (expected, latest) => expected && latest && fields.every(key => expected[key] === latest[key]);
  const readout = createReadOnlyReceiptRun(observeContext, api, profile, readClock, readCommand);
  const settings = createReadOnlySettingsPreparationRun(observeContext, invalidateReceipts, beginSettingsGeneration, readResponse);
  const reject = reason => Object.freeze({ ok: false, reason, summary: null,
    provenance: "simulated_only", executionEnabled: false, vehicleCommandEnabled: false, wouldTransmit: false });
  const run = async (kind, owner, requirePreparation = false) => {
    if (disposed) return reject("development_session_disposed");
    if (active) return reject("development_operation_busy");
    const requiredContext = requirePreparation ? preparedContext : null;
    preparedContext = null;
    if (requirePreparation && !requiredContext) return reject("settings_preparation_required");
    const record = { kind, owner, cancelled: false, requiredContext };
    active = record;
    try {
      if (requiredContext) {
        const latest = snapshotContext();
        if (disposed) return reject("development_session_disposed");
        if (record.cancelled) return reject("readout_cancelled");
        if (!sameContext(requiredContext, latest)) return reject("preparation_context_changed");
      }
      const result = await owner.run();
      if (disposed) return reject("development_session_disposed");
      if (!result.ok) return result;
      const expected = record.context, latest = snapshotContext();
      if (disposed) return reject("development_session_disposed");
      if (record.cancelled) return reject(kind === "readout" ? "readout_cancelled" : "settings_preparation_cancelled");
      if (!sameContext(expected, latest)) {
        return reject(kind === "readout" ? "receipt_context_changed" : "preparation_context_changed");
      }
      // This is a one-use simulated handoff, never a verified adapter profile.
      if (kind === "settings") preparedContext = latest;
      return result;
    }
    catch { return reject("development_operation_failed"); }
    finally { if (active === record) active = null; }
  };
  const cancelActive = () => {
    preparedContext = null;
    if (!active) return false;
    const record = active;
    const cancelled = record.owner.cancel();
    // The shared promise can still be pending after the lower run has settled.
    if (active === record) { record.cancelled = true; return true; }
    return cancelled;
  };
  return Object.freeze({
    read() { return run("readout", readout); },
    // Explicit fresh acquisition only; no automatic prepare/read/retry sequence.
    readPrepared() { return run("readout", readout, true); },
    prepareSettings() { return run("settings", settings); },
    cancel() { return !disposed && cancelActive(); },
    dispose() {
      if (disposed) return;
      disposed = true;
      cancelActive();
    },
    inspect() {
      return Object.freeze({ status: disposed ? "disposed" : !active ? "idle" : active.cancelled ? "cancelling" : "running",
        // Pending reflects this owner's promise, not a physical transport state.
        pending: active !== null,
        operation: active?.kind || null, provenance: "simulated_only",
        executionEnabled: false, vehicleCommandEnabled: false, wouldTransmit: false });
    }
  });
}
