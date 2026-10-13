// Historical proposal applied in 3.13.690; never imported by the application.
export function applyEcuIdentityAliasProposal(source) {
  const anchor = '        || hasConflictingJsonEcuAliases({ sourceEcu: row?.sourceEcu, source_ecu: row?.source_ecu })';
  if (source.split(anchor).length !== 2) throw Error('Unexpected ECU identity alias anchor');
  return source.replace(anchor, anchor + '\n'
    + '        || [["ecuId", "ecu_id"], ["moduleId", "module_id"], ["controllerId", "controller_id"]]\n'
    + '          .some(([camel, snake]) => hasConflictingJsonEcuAliases({ sourceEcu: row?.[camel], source_ecu: row?.[snake] }))');
}
