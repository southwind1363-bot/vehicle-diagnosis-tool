import { coreReadoutKinds } from './core-readout-ecu-alias-cases.js';

export const pidMatrixKinds = coreReadoutKinds.filter(item => item.kind === 'SupportedPid').map(item => ({
  ...item, api: 'buildSupportedPidMatrix', bridge: 'normalizeBridge' + item.kind + 'Snapshot'
}));

export const pidMatrixCases = pidMatrixKinds.flatMap(kind => [
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

for (const kind of pidMatrixKinds) {
  for (const [name, input, reject] of [
    ['array-normal', ['01', '0C'], false],
    ['array-conflict', [{pid:'01', sourceEcu:'7E8', source_ecu:'7E9'}], true],
    ['mixed-rows-conflict', {supported_pids:[{pid:'01',sourceEcu:'7E8'},{pid:'0C',sourceEcu:'7E8',source_ecu:'7E9'}]}, true],
    ['rows-normal', {supported_pids:[{pid:'01',sourceEcu:'7E8'},{pid:'0C',sourceEcu:'7E9'}]}, false],
    ['empty-array', [], false]
  ]) pidMatrixCases.push({...kind,id:kind.kind+'-'+name,input,reject});
}
