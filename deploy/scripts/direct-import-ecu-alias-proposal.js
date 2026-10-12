// Historical review patch against 3.13.678, applied in 3.13.679. Not used by production or regression tests.
export function applyDirectImportEcuAliasProposal(source) {
 const anchor='  function buildBridgeDiagnosticImport(parts = {}) {';
 if(source.split(anchor).length!==2)throw new Error('Direct import entry anchor');
 return source.replace(anchor,anchor+'\n    if (hasConflictingJsonEcuAliases(parts)) {\n      parts = { livePidResponse: { ok: false, blocked: true, would_transmit: false, errors: ["source_ecu_alias_conflict"], data: {} } };\n    }');
}
