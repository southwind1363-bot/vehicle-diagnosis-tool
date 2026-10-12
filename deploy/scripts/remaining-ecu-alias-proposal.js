// Historical review patch against 3.13.679, applied in 3.13.680. Not imported by production or regression tests.
export function applyRemainingEcuAliasProposal(source){
 const blocked='{ ok: false, blocked: true, would_transmit: false, errors: ["source_ecu_alias_conflict"], data: {} }';
 for(const name of ['buildBridgeSessionSummary','buildBridgeSessionExportPayload']){const anchor='  function '+name+'(parts = {}) {';if(source.split(anchor).length!==2)throw new Error(name);source=source.replace(anchor,anchor+'\n    if (hasConflictingJsonEcuAliases(parts)) {\n      parts = { livePidResponse: '+blocked+' };\n    }');}
 const anchor='  function decodeLivePidResponse(input = {}) {';if(source.split(anchor).length!==2)throw new Error('decode entry');return source.replace(anchor,anchor+'\n    if (hasConflictingJsonEcuAliases(input)) {\n      return normalizeBridgeLivePidSnapshot('+blocked+');\n    }');
}
