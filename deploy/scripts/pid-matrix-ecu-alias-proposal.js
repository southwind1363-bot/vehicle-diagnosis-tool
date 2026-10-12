import { pidMatrixKinds } from './pid-matrix-ecu-alias-cases.js';

// Historical 3.13.683 review patch, applied in 3.13.684. Not imported by runtime or tests.
export function applyPidMatrixEcuAliasProposal(source) {
  for (const item of pidMatrixKinds) {
    const anchor = '  function ' + item.api + '(input = {}) {';
    if (source.split(anchor).length !== 2) throw new Error('Unexpected anchor: ' + item.api);
    source = source.replace(anchor, anchor + '\n    if (hasConflictingJsonEcuAliases(input)) {\n'
      + '      return ' + item.bridge + '({ ok: false, blocked: true, would_transmit: false, errors: ["source_ecu_alias_conflict"], data: {} });\n    }');
  }
  return source;
}
