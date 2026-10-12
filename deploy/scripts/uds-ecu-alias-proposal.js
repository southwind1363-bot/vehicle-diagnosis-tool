import { udsSamples } from './uds-ecu-alias-cases.js';

// Historical 3.13.681 review patch, applied in 3.13.682. Not imported by runtime or tests.
export function applyUdsEcuAliasProposal(source) {
  for (const sample of new Map(udsSamples.map(item => [item.api, item])).values()) {
    const anchor = '  function ' + sample.api + '(input = {}) {';
    if (source.split(anchor).length !== 2) throw new Error('Unexpected API anchor: ' + sample.api);
    source = source.replace(anchor, anchor + '\n    if (hasConflictingJsonEcuAliases(input)) {\n'
      + '      return ' + sample.bridge + '({ ok: false, blocked: true, would_transmit: false, errors: ["source_ecu_alias_conflict"], data: {} });\n    }');
  }
  return source;
}
