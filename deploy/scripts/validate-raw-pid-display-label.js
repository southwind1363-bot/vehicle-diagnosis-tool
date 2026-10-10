import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source = fs.readFileSync(new URL('../script.js', import.meta.url), 'utf8');
const code = source.match(/function getObdMonitorDisplayLabel\([^)]*\) \{[\s\S]*?\r?\n\}/)?.[0];
assert.ok(code);
const c = vm.createContext({}); vm.runInContext(code, c);
let checks = 0;
const check = (value, message) => { assert.ok(value, message); checks++; };
for (const [pid, id, length, scopeText] of [
  ['66','maf_sensor_status',5,'A/B'], ['7B','dpf_status',7,'バンク2'],
  ['7F','engine_runtime_aux',13,'複合データ'], ['87','intake_manifold_absolute_pressure_a',5,'A/B'],
  ['89','engine_runtime_aecd',41,'#11〜15'], ['8F','pm_sensor_bank1',7,'バンク1/2'],
  ['91','wwh_obd_vehicle_info',5,'ECU情報']
]) {
  const row = Object.freeze({ id, pid, label: '記録時の名称', value: Array(length).fill('28').join(' '), decoded: false, service: '01', scope: 'standard-generic' });
  const original = JSON.stringify(row);
  check(c.getObdMonitorDisplayLabel(row).includes(scopeText), `${pid}: scope omitted`);
  check(JSON.stringify(row) === original, `${pid}: saved row mutated`);
  check(c.getObdMonitorDisplayLabel({ ...row, pid: pid.toLowerCase(), service: '02', value: '  ' + row.value.replaceAll(' ', '\t') + '  ' }).includes(scopeText), `${pid}: mode02/lowercase/whitespace`);
  check(c.getObdMonitorDisplayLabel({ ...row, decoded: undefined, undecodedRaw: true }).includes(scopeText), `${pid}: explicit RAW flag`);
  for (const change of [
    { decoded: true }, { decoded: undefined }, { value: 0 }, { value: 12.5 },
    { value: '状態を確認' }, { value: row.value + ' 00' },
    { value: row.value.split(' ').slice(1).join(' ') }, { value: row.value.replace('28','GG') },
    { value: row.value.replace('28','0x28') }, { value: [40] }, { value: null },
    { id: 'other_id' }, { pid: '0D' }, { service: '22' }, { scope: 'manufacturer-specific' }
  ]) check(c.getObdMonitorDisplayLabel({ ...row, ...change }) === row.label, `${pid}: mislabeled legacy/invalid/foreign data ${JSON.stringify(change)}`);
}
check(c.getObdMonitorDisplayLabel({ id: 'old_id' }) === 'old_id', 'ID fallback');
check(c.getObdMonitorDisplayLabel({}) === '項目', 'empty fallback');
console.log(`RAW scope labels: ${checks} checks passed; full-length RAW only, legacy labels and saved rows preserved`);

const reviewCode = source.match(/function formatObdLegacyControlReviewNote\([^)]*\) \{[\s\S]*?\r?\n\}/)?.[0];
assert.ok(reviewCode); vm.runInContext(reviewCode, c);
const legacy = JSON.parse(fs.readFileSync(new URL('./fixtures/text-pid-legacy-3.13.651.json', import.meta.url), 'utf8'));
const reviewStart = checks;
for (const snapshot of [legacy.live_pid_snapshot, legacy.freeze_frame_snapshot]) {
  for (const item of snapshot.monitor_values) {
    const row = Object.freeze(item), before = JSON.stringify(row);
    check(c.formatObdLegacyControlReviewNote(row).includes('16進形式の文字列'), row.pid + ': golden legacy caution');
    check(JSON.stringify(row) === before, row.pid + ': legacy mutation');
    check(c.formatObdLegacyControlReviewNote({ ...row, pid: row.pid.toLowerCase(), value: '  ab\t01  ' }).includes('16進形式'), row.pid + ': case/whitespace');
    check(c.formatObdLegacyControlReviewNote({ ...row, value: '00' }).includes('16進形式'), row.pid + ': no unsupported length inference');
    for (const change of [
      { decoded: false }, { decoded: undefined }, { undecodedRaw: true }, { valueType: 'raw_hex' },
      { valueType: 'number' }, { value: 0 }, { value: '0' }, { value: 'Regeneration active' },
      { value: '' }, { value: 'GG' }, { value: '0x28' }, { value: '28,' }, { value: null },
      { pid: '0D' }, { id: 'unknown' }, { service: '22' }, { scope: 'manufacturer-specific' }
    ]) check(c.formatObdLegacyControlReviewNote({ ...row, ...change }) === '', row.pid + ': false caution ' + JSON.stringify(change));
  }
}
check(c.formatObdLegacyControlReviewNote({}) === '', 'empty record');
check(c.formatObdLegacyControlReviewNote({ id: 'commanded_egr_pid69', value: 3, decoded: true }).includes('旧PID69数値'), 'numeric legacy caution retained');
console.log('Hex text review notes: ' + (checks - reviewStart) + ' checks passed; golden legacy records unchanged, RAW/semantic text excluded');
