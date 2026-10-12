// Synthetic examples from the existing UDS regression suite; no vehicle I/O.
const samples = [
  ['Snapshot', '04', '59 04 01 23 45 8A 02 01 F1 90 12 34', true],
  ['Snapshot', '18', '59 18 01 01 23 45 8A 02 01 F1 90 12 34', true],
  ['Snapshot', '03', '59 03 01 23 45 02 12 34 56 03', true],
  ['StoredData', '05', '59 05 02 12 34 56 24 01 47 11 A6', true],
  ['StoredData', '05-empty', '59 05 02', true],
  ['ExtendedData', '06', '59 06 01 23 45 8A 02 F1 90 12 34'],
  ['ExtendedData', '10', '59 10 01 23 45 8A 02 F1 90 12 34'],
  ['ExtendedData', '19', '59 19 01 01 23 45 8A 02 F1 90 12 34'],
  ['ExtendedDataByRecordNumber', '16', '59 16 02 01 23 45 8A F1 90 12 34'],
  ['FaultDetectionCounter', '14', '59 14 01 23 45 FE 12 34 56 02'],
  ['FaultDetectionCounter', '14-empty', '59 14'],
  ['Severity', '09', '59 09 FF 40 10 01 23 45 8A'],
  ['Severity', '08', '59 08 FF 40 10 01 23 45 8A 20 11 12 34 56 02'],
  ['WwhObdDtc', '42', '59 42 D0 FF E0 04 40 01 23 45 8A'],
  ['WwhObdPermanentDtc', '55', '59 55 D0 FF 04 01 23 45 8A'],
  ['WwhObdPermanentDtc', '55-empty', '59 55 D0 FF 04'],
  ['ReadinessGroup', '56', '59 56 D0 FF 04 02 01 23 45 8A'],
  ['ReadinessGroup', '56-empty', '59 56 D0 FF 04 02']
];

export const udsSamples = samples.map(([kind, variant, raw, freezeFrame]) => ({
  id: kind + '-' + variant,
  api: kind.startsWith('Wwh') ? 'decodeUds' + kind + 'Response' : 'decodeUdsDtc' + kind + 'Response',
  raw,
  slot: freezeFrame ? 'freezeFrameSnapshot' : 'dtcSnapshot',
  status: freezeFrame ? 'freezeFrameReadoutStatus' : 'dtcReadoutStatus',
  bridge: freezeFrame ? 'normalizeBridgeFreezeFrameSnapshot' : 'normalizeBridgeDtcSnapshot'
}));

export const udsAliasCases = udsSamples.flatMap(sample => [
  ['conflict', { sourceEcu: '7E8', source_ecu: '7E9' }, true],
  ['empty-alias', { sourceEcu: '', source_ecu: '7E8' }, true],
  ['invalid-alias', { sourceEcu: 7, source_ecu: '7' }, true],
  ['metadata-conflict', { metadata: { sourceEcu: '7E8', source_ecu: '7E9' } }, true],
  ['nested-conflict', { unused: [{ sourceEcu: '7E8', source_ecu: '7E9' }] }, true],
  ['normal', {}, false],
  ['same-aliases', { sourceEcu: '7E8' }, false],
  ['space-case', { sourceEcu: ' 7e8 ' }, false],
  ['null-alias', { sourceEcu: null }, false],
  ['other-aliases', { ecu: '7E9' }, false],
  ['separate-objects', { metadata: [{ sourceEcu: '7E8' }, { source_ecu: '7E9' }] }, false],
  ['no-ecu', { source_ecu: null }, false],
  ['short-response', { raw: '59' }, false]
].map(([name, extra, reject]) => ({
  ...sample, id: sample.id + '-' + name, reject,
  input: { raw: sample.raw, protocol: 'UDS', source_ecu: '7E8', ...extra }
})));
