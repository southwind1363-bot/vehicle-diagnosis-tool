const seed = { dtcReadoutStatus: 'reported', sourceEcu: '7E8', source_ecu: '7E8', dtcs: [{ code: 'P0300', status: 'stored', ecu: '7E8' }] };
const other = { dtcReadoutStatus: 'reported', sourceEcu: '7E9', source_ecu: '7E9', dtcs: [{ code: 'P0420', status: 'stored', ecu: '7E9' }] };
const bad = { ...seed, source_ecu: '7E9' };
export const dtcMergeAliasCases = [
  ['conflict', [bad], true],
  ['empty-alias', [{ ...seed, sourceEcu: '' }], true],
  ['invalid-alias', [{ ...seed, sourceEcu: 7, source_ecu: '7' }], true],
  ['metadata-conflict', [{ ...seed, metadata: { sourceEcu: '7E8', source_ecu: '7E9' } }], true],
  ['row-conflict', [{ ...seed, dtcs: [{ ...seed.dtcs[0], sourceEcu: '7E8', source_ecu: '7E9' }] }], true],
  ['data-conflict', [{ ...seed, data: { sourceEcu: '7E8', source_ecu: '7E9' } }], true],
  ['good-before-bad', [other, bad], true],
  ['bad-before-good', [bad, other], true],
  ['normal', [seed], false],
  ['two-ecus', [seed, other], false],
  ['duplicate', [seed, seed], false],
  ['empty-input', [], false],
  ['empty-snapshot', [{}], false],
  ['null-alias', [{ ...seed, sourceEcu: null }], false],
  ['space-case', [{ ...seed, sourceEcu: ' 7e8 ' }], false],
  ['other-aliases', [{ ...seed, ecu: '7E9' }], false],
  ['separate-objects', [{ ...seed, metadata: [{ sourceEcu: '7E8' }, { source_ecu: '7E9' }] }], false],
  ['already-blocked', [{ dtcReadoutStatus: 'blocked', errorCodes: ['source_ecu_alias_conflict'], dtcs: [] }, other], false]
].map(([id, input, reject]) => ({ id, input, reject, slot: 'dtcSnapshot', status: 'dtcReadoutStatus' }));
