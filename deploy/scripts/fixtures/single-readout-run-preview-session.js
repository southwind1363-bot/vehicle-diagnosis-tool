// Fixed asynchronous sample acquisition. The context and bytes are artificial; no transport.
import { createSingleReadoutSample } from "./single-readout-sample.js";
import { createReadOnlyReceiptRun } from "./readonly-receipt-run.js";
import { formatSingleReadoutReceiptPreview } from "./single-readout-receipt-preview.js";

export function createSingleReadoutRunPreviewSession(api, scenario = "normal") {
  const sample = createSingleReadoutSample(scenario);
  const context = { port: {}, reader: {}, writer: {}, settingsTicket: {}, revision: 1, connected: true, unlocked: true };
  let disposed = false, display = null;
  const runner = createReadOnlyReceiptRun(() => context, api, sample.profile, () => Math.floor(performance.now()), async (command, append) => {
    const receipt = sample.receipts.find(item => item.command === command);
    for (let offset = 0; offset < receipt.transcript.length; offset += 7) {
      await Promise.resolve();
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
