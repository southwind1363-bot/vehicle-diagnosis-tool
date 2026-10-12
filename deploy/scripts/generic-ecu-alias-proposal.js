import { genericKinds } from './generic-ecu-alias-cases.js';

// Isolated review only; never imported by the application.
export function applyGenericEcuAliasProposal(source) {
  for (const item of genericKinds) {
    const anchor = '  function ' + item.api + '(input = {}) {';
    if (source.split(anchor).length !== 2) throw new Error('Unexpected anchor: ' + item.api);
    source = source.replace(anchor, anchor + '\n    if (hasConflictingJsonEcuAliases(input)) {\n'
      + '      return ' + item.bridge + '({ ok: false, blocked: true, would_transmit: false, errors: ["source_ecu_alias_conflict"], data: {} });\n    }');
  }
  return source;
}
