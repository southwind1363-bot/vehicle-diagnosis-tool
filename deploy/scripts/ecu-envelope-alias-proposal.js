// Isolated proposal only. Never imported by the application.
export function applyEcuEnvelopeAliasProposal(source) {
  const anchor = '  function normalizeEcuResponseSummary(input = {}) {';
  const rowAnchor = '      const ecuResponseConflict = ecuResponseAddressEvidence.conflict === true;';
  if (source.split(anchor).length !== 2 || source.split(rowAnchor).length !== 2) throw Error('Unexpected ECU summary anchors');
  return source.replace(anchor, anchor + `
    const envelopeEcuAliasConflict = [input, input?.data].some((envelope) =>
      envelope && typeof envelope === "object" && !Array.isArray(envelope)
      && hasConflictingJsonEcuAliases({ sourceEcu: envelope.sourceEcu, source_ecu: envelope.source_ecu }));`)
    .replace(rowAnchor, '      const ecuResponseConflict = envelopeEcuAliasConflict || ecuResponseAddressEvidence.conflict === true;');
}
