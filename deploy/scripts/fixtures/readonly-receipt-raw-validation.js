// Trusted development runtime only. Observations never establish provenance or execution authority.
export function createReceiptRawValidation(api) {
  const descriptor = api && Object.getOwnPropertyDescriptor(api, "parseElmReadOnlyRawTranscript");
  if (!descriptor || !Object.hasOwn(descriptor, "value") || typeof descriptor.value !== "function") {
    throw new TypeError("invalid_receipt_parser_api");
  }
  const parse = descriptor.value.bind(api);
  const semanticDescriptor = Object.getOwnPropertyDescriptor(api, "evaluateSingleReadoutRawReceipts");
  if (semanticDescriptor && (!Object.hasOwn(semanticDescriptor, "value") || typeof semanticDescriptor.value !== "function")) {
    throw new TypeError("invalid_receipt_observer_api");
  }
  const observe = semanticDescriptor?.value.bind(api);
  return receipts => {
    const readouts = receipts.map(receipt => {
      const parsed = parse({ profile: receipt.profile, command: receipt.command,
        transcript: receipt.transcript, completion: receipt.completion });
      return Object.freeze({ command: receipt.command, completion: parsed.completion,
        promptObserved: parsed.promptObserved, frameCount: parsed.frames.length,
        // Keep only parser-owned codes, never payloads, raw text or source identities.
        errorCodes: Object.freeze([...new Set(parsed.errors.map(error => error.code))]),
        noDataReported: parsed.statuses.some(status => status.code === "no_data") });
    });
    const semanticObservation = observe ? observe({ receipts: receipts.map(({ command, profile, completion, transcript }) =>
      ({ command, profile, completion, transcript })) }) : null;
    return Object.freeze({ status: readouts.every(row => row.completion === "complete" && row.errorCodes.length === 0)
      ? "parsed" : "rejected", readouts: Object.freeze(readouts), semanticObservation });
  };
}
