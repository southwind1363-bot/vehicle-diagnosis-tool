// Fixed development samples only. No clear event, external receipt, storage or transport.
import { createReadOnlyReceiptCapture } from "./readonly-receipt-capture.js";
import { createSingleReadoutSample } from "./single-readout-sample.js";
import { formatSingleReadoutReceiptPreview } from "./single-readout-receipt-preview.js";

export function createSingleReadoutPreviewSession(api, scenario = "normal") {
  const { profile, receipts } = createSingleReadoutSample(scenario);
  const owner = createReadOnlyReceiptCapture(api, profile);
  const ticket = owner.begin();
  try {
    receipts.forEach(({ command, transcript }, index) => {
      const started = owner.startCommand(ticket, command, profile, index * 2);
      if (!started.ok) throw new Error("single_readout_sample_unavailable");
      // Artificial chunks and times for the fixed sample; no serial reception is implied.
      for (let offset = 0; offset < transcript.length; offset += 7) {
        if (!owner.append(started.ticket, transcript.slice(offset, offset + 7)).ok) throw new Error("single_readout_sample_unavailable");
      }
      if (!owner.endCommand(started.ticket, index * 2 + 1, "complete").ok) throw new Error("single_readout_sample_unavailable");
    });
    if (!owner.finish(ticket, "complete").ok) throw new Error("single_readout_sample_unavailable");
    return Object.freeze({
      inspect() {
        return formatSingleReadoutReceiptPreview(owner.inspect(ticket));
      },
      dispose() { owner.invalidate(); }
    });
  } catch (error) { owner.invalidate(); throw error; }
}
