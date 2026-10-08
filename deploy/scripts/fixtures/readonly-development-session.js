// Development-only mutual exclusion. Callbacks and profiles are artificial inputs.
// Settled promises never prove physical transport termination or settings readiness.
import { createReadOnlyReceiptRun } from "./readonly-receipt-run.js";
import { createReadOnlySettingsPreparationRun } from "./readonly-settings-preparation-run.js";

export function createReadOnlyDevelopmentSession({ readContext, api, profile, readClock, readCommand,
  invalidateReceipts, beginSettingsGeneration, readResponse }) {
  const readout = createReadOnlyReceiptRun(readContext, api, profile, readClock, readCommand);
  const settings = createReadOnlySettingsPreparationRun(readContext, invalidateReceipts, beginSettingsGeneration, readResponse);
  let active = null, disposed = false;
  const reject = reason => Object.freeze({ ok: false, reason, summary: null,
    provenance: "simulated_only", executionEnabled: false, vehicleCommandEnabled: false, wouldTransmit: false });
  const run = async (kind, owner) => {
    if (disposed) return reject("development_session_disposed");
    if (active) return reject("development_operation_busy");
    const record = { kind, owner, cancelled: false };
    active = record;
    try {
      const result = await owner.run();
      return disposed ? reject("development_session_disposed") : result;
    }
    catch { return reject("development_operation_failed"); }
    finally { if (active === record) active = null; }
  };
  const cancelActive = () => {
    if (!active) return false;
    const record = active;
    const cancelled = record.owner.cancel();
    if (cancelled && active === record) record.cancelled = true;
    return cancelled;
  };
  return Object.freeze({
    read() { return run("readout", readout); },
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
