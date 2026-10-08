// Fixed malformed summaries for Node/Chromium parity; no transport or execution.
import { createSingleReadoutSample } from './single-readout-sample.js';
import { createReceiptRawValidation } from './readonly-receipt-raw-validation.js';
import { formatSingleReadoutReceiptPreview } from './single-readout-receipt-preview.js';

export function runReadoutPresentationIntegrityCases(api) {
  const sample = createSingleReadoutSample('normal');
  const base = { ok: true, summary: { status: 'finished', rawTranscriptValidation: createReceiptRawValidation(api)(sample.receipts.map(row => ({ ...row, profile: sample.profile, completion: 'complete' }))) } };
  const mutations = [
    value => { value.summary = null; },
    value => { value.summary.rawTranscriptValidation = null; },
    value => { value.summary.rawTranscriptValidation.readouts.pop(); },
    value => { value.summary.rawTranscriptValidation.readouts.reverse(); },
    value => { value.summary.rawTranscriptValidation.semanticObservation.readouts.reverse(); },
    value => { value.summary.rawTranscriptValidation.readouts.reverse(); value.summary.rawTranscriptValidation.semanticObservation.readouts.reverse(); },
    value => { delete value.summary.rawTranscriptValidation.readouts[1]; },
    value => { delete value.summary.rawTranscriptValidation.semanticObservation.readouts[2]; },
    value => { value.summary.rawTranscriptValidation.semanticObservation.readouts[0].intent = "read_pending_dtc"; },
    value => { value.summary.rawTranscriptValidation.semanticObservation.readouts[0].ordinal = 2; },
    value => { value.summary.rawTranscriptValidation.semanticObservation.readouts[0].blockerIds = null; },
    value => { value.summary.rawTranscriptValidation.semanticObservation.readouts[0].observation = {}; },
    value => { value.summary.rawTranscriptValidation.readouts[0].errorCodes = "missing_prompt"; },
    value => { value.summary.rawTranscriptValidation.readouts[0].noDataReported = "false"; },
    value => { value.summary.rawTranscriptValidation.readouts[0].negativeResponseObserved = null; },
    value => { value.summary.rawTranscriptValidation.readouts[0].errorCodes = [undefined]; }
  ];
  const inputs = mutations.map(mutate => { const value = JSON.parse(JSON.stringify(base)); mutate(value); return value; });
  inputs.push(null, undefined, { ok: true }, { ok: true, summary: {} });
  return inputs.map(input => {
    const before = JSON.stringify(input);
    const result = formatSingleReadoutReceiptPreview(input);
    return { result, frozen: Object.isFrozen(result), unchanged: JSON.stringify(input) === before };
  });
}
