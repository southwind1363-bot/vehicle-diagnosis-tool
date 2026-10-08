// Development-only mutual exclusion. Callbacks and profiles are artificial inputs.
// Settled promises never prove physical transport termination or settings readiness.
import { createReadOnlyReceiptRun } from "./readonly-receipt-run.js";
import { createReadOnlySettingsPreparationRun } from "./readonly-settings-preparation-run.js";

export function createReadOnlyDevelopmentSession({ readContext, api, profile, readClock, readCommand,
  invalidateReceipts, beginSettingsGeneration, readResponse }) {
  const readout = createReadOnlyReceiptRun(readContext, api, profile, readClock, readCommand);
  const settings = createReadOnlySettingsPreparationRun(readContext, invalidateReceipts, beginSettingsGeneration, readResponse);
  let active = null;
  const reject = reason => Object.freeze({ ok: false, reason, summary: null,
    provenance: "simulated_only", executionEnabled: false, vehicleCommandEnabled: false, wouldTransmit: false });
  const run = async (kind, owner) => {
    if (active) return reject("development_operation_busy");
    const record = { kind, owner, cancelled: false };
    active = record;
    try { return await owner.run(); }
    catch { return reject("development_operation_failed"); }
    finally { if (active === record) active = null; }
  };
  return Object.freeze({
    read() { return run("readout", readout); },
    prepareSettings() { return run("settings", settings); },
    cancel() {
      if (!active) return false;
      const record = active;
      const cancelled = record.owner.cancel();
      if (cancelled && active === record) record.cancelled = true;
      return cancelled;
    },
    inspect() {
      return Object.freeze({ status: !active ? "idle" : active.cancelled ? "cancelling" : "running",
        operation: active?.kind || null, provenance: "simulated_only",
        executionEnabled: false, vehicleCommandEnabled: false, wouldTransmit: false });
    }
  });
}
