// Fixed asynchronous sample acquisition. The context and bytes are artificial; no transport.
import { createSingleReadoutSample } from "./single-readout-sample.js";
import { createReadOnlyReceiptRun } from "./readonly-receipt-run.js";
import { formatSingleReadoutReceiptPreview } from "./single-readout-receipt-preview.js";

export function createSingleReadoutRunPreviewSession(api, scenario = "normal") {
  const sample = createSingleReadoutSample(["failure", "clock_failure", "disconnect", "settings_changed"].includes(scenario) ? "normal" : scenario);
  const context = { port: {}, reader: {}, writer: {}, settingsTicket: {}, revision: 1, connected: true, unlocked: true };
  let disposed = false, display = null, clockReads = 0;
  const runner = createReadOnlyReceiptRun(() => context, api, sample.profile, () => {
    clockReads++;
    // Fail before the second command; never substitute a timestamp or retry.
    return scenario === "clock_failure" && clockReads === 3 ? NaN : Math.floor(performance.now());
  }, async (command, append) => {
    const receipt = sample.receipts.find(item => item.command === command);
    if (scenario === "failure" && command === "07") {
      await Promise.resolve();
      if (disposed || !append(receipt.transcript.slice(0, 7))) return "cancelled";
      return "timeout";
    }
    for (let offset = 0; offset < receipt.transcript.length; offset += 7) {
      await Promise.resolve();
      // Change the artificial connection after a partial second response.
      // The receipt session must reject its next chunk and all derived output.
      if (command === "07" && offset === 7) {
        if (scenario === "disconnect") context.connected = false;
        if (scenario === "settings_changed") context.settingsTicket = {};
      }
      if (disposed || !append(receipt.transcript.slice(offset, offset + 7))) return "cancelled";
    }
    return "complete";
  });
  const ready = runner.run().then(result => { if (!disposed) display = formatSingleReadoutReceiptPreview(result); });
  return Object.freeze({
    ready,
    inspect() { return display || Object.freeze({ ok: false, reason: disposed ? "scope_invalidated" : "readout_pending", text: null }); },
    dispose() { disposed = true; display = null; context.connected = false; runner.cancel(); }
  });
}
