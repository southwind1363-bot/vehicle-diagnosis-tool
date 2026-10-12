// Isolated proposal only; never imported by the application.
export function applyEcuRowAliasProposal(source) {
  const anchor = '      const ecuResponseConflict = envelopeEcuAliasConflict || ecuResponseAddressEvidence.conflict === true;';
  if (source.split(anchor).length !== 2) throw Error('Unexpected ECU row anchor');
  return source.replace(anchor, `      const ecuResponseConflict = envelopeEcuAliasConflict
        || hasConflictingJsonEcuAliases({ sourceEcu: row?.sourceEcu, source_ecu: row?.source_ecu })
        || ecuResponseAddressEvidence.conflict === true;`);
}
