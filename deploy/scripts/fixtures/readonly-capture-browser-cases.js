import { createReadOnlyReceiptCapture } from "./readonly-receipt-capture.js";

export function runCaptureBrowserCases(api) {
  const capture = createReadOnlyReceiptCapture(api);
  const profile = "iso15765_11bit_normal_h1_caf1_d0_s1_e0";
  const receipts = ["7E8 02 43 00 AA AA AA AA AA\r>", "7E8 02 47 00 AA AA AA AA AA\r>",
    "7E8 02 4A 00 AA AA AA AA AA\r>", "7E8 06 41 01 00 07 01 00 AA\r\n>"];
  const operations = [], summaries = [];
  const record = result => { operations.push({ ok: result.ok, reason: result.reason }); return result; };
  let previousCommand = null, previousAttempt = null;
  for (const size of [1, 7, 32768]) {
    const attempt = capture.begin();
    if (previousAttempt) record(capture.finish(previousAttempt, "complete"));
    record(capture.startCommand({ ...attempt }, "03", profile, 0));
    ["03", "07", "0A", "0101"].forEach((command, index) => {
      const started = record(capture.startCommand(attempt, command, profile, index * 2));
      if (previousCommand) record(capture.append(previousCommand, "stale\r>"));
      record(capture.append({ ...started.ticket }, "forged\r>"));
      for (let offset = 0; offset < receipts[index].length; offset += size) {
        record(capture.append(started.ticket, receipts[index].slice(offset, offset + size)));
      }
      record(capture.endCommand(started.ticket, index * 2 + 1, "complete"));
      previousCommand = started.ticket;
    });
    record(capture.finish(attempt, "complete"));
    summaries.push(capture.inspect(attempt));
    previousAttempt = attempt;
  }
  capture.invalidate();
  const invalidated = capture.inspect(previousAttempt);
  const overflowAttempt = capture.begin();
  const overflowCommand = capture.startCommand(overflowAttempt, "03", profile, 0).ticket;
  record(capture.append(overflowCommand, "x".repeat(32768)));
  const overflow = record(capture.append(overflowCommand, "x"));
  const rejected = capture.inspect(overflowAttempt);
  capture.invalidate();
  const delayed = record(capture.append(overflowCommand, "\r>"));
  return { operations, summaries, invalidated, overflow, rejected, delayed };
}
