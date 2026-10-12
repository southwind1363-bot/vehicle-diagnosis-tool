// Isolated review only; not imported by the application.
export function applyDtcMergeEcuAliasProposal(source) {
  const anchor = '  function mergeDtcSnapshots(...snapshots) {';
  if (source.split(anchor).length !== 2) throw new Error('Unexpected merge anchor');
  return source.replace(anchor, anchor + '\n    if (hasConflictingJsonEcuAliases(snapshots)) {\n'
    + '      return normalizeBridgeDtcSnapshot({ ok: false, blocked: true, would_transmit: false, errors: ["source_ecu_alias_conflict"], data: {} });\n    }');
}
