import { coreReadoutKinds } from './core-readout-ecu-alias-cases.js';

export const genericKinds = coreReadoutKinds.filter(item => item.kind !== 'SupportedPid').map(item => ({
  ...item, api: 'normalize' + item.kind + 'Snapshot', bridge: 'normalizeBridge' + item.kind + 'Snapshot'
}));

export const genericAliasCases = genericKinds.flatMap(kind => [
  ['conflict', { ...kind.data, sourceEcu: '7E8', source_ecu: '7E9' }, true],
  ['empty-alias', { ...kind.data, sourceEcu: '', source_ecu: '7E8' }, true],
  ['invalid-alias', { ...kind.data, sourceEcu: 7, source_ecu: '7' }, true],
  ['metadata-conflict', { ...kind.data, metadata: { sourceEcu: '7E8', source_ecu: '7E9' } }, true],
  ['nested-conflict', { ...kind.data, unused: [{ sourceEcu: '7E8', source_ecu: '7E9' }] }, true],
  ['envelope-conflict', { sourceEcu: '7E8', source_ecu: '7E9', data: kind.data }, true],
  ['data-conflict', { data: { ...kind.data, sourceEcu: '7E8', source_ecu: '7E9' } }, true],
  ['normal', { ...kind.data }, false],
  ['one-alias', { ...kind.data, sourceEcu: '7E8' }, false],
  ['same-aliases', { ...kind.data, sourceEcu: '7E8', source_ecu: '7E8' }, false],
  ['space-case', { ...kind.data, sourceEcu: ' 7e8 ', source_ecu: '7E8' }, false],
  ['null-alias', { ...kind.data, sourceEcu: null, source_ecu: '7E8' }, false],
  ['other-aliases', { ...kind.data, sourceEcu: '7E8', ecu: '7E9' }, false],
  ['parent-child', { sourceEcu: '7E8', data: { ...kind.data, source_ecu: '7E9' } }, false],
  ['separate-objects', { ...kind.data, metadata: [{ sourceEcu: '7E8' }, { source_ecu: '7E9' }] }, false],
  ['empty-input', {}, false]
].map(([name, input, reject]) => ({ ...kind, id: kind.kind + '-' + name, input, reject })));
