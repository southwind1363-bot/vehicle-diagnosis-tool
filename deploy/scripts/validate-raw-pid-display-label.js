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
  ["6B","egr_temp",5,"EGR温度 PID 6B（応答全体）"],
  ["6D","fuel_pressure_control",11,"燃圧制御 PID 6D（応答全体）"],
  ["6E","injection_pressure_control",9,"噴射圧制御 PID 6E（応答全体）"],
  ["6F","turbo_inlet_pressure",3,"ターボ入口圧 PID 6F（応答全体）"],
  ["70","boost_pressure_control",10,"過給圧制御 PID 70（応答全体）"],
  ["71","vgt_control",6,"可変ターボ制御 PID 71（応答全体）"],
  ["72","wastegate_control",5,"ウェイストゲート制御 PID 72（応答全体）"],
  ["73","exhaust_pressure",5,"排気圧 PID 73（応答全体）"],
  ["74","turbo_speed",5,"ターボ回転数 PID 74（応答全体）"],
  ["75","turbo_temp",7,"ターボ温度 PID 75（応答全体）"],
  ["77","charge_air_cooler_temp",5,"チャージエアクーラー温度 PID 77（応答全体）"],
  ["78","egt_bank1",9,"排気温度 バンク1 PID 78（応答全体）"],
  ["79","egt_bank2",9,"排気温度 バンク2 PID 79（応答全体）"],
  ["7A","dpf_differential_pressure",7,"DPF差圧 PID 7A（応答全体）"],
  ["7C","dpf_temp",9,"DPF温度 PID 7C（応答全体）"],
  ["83","nox_sensor",9,"NOxセンサー PID 83（応答全体）"],
  ["86","particulate_matter_sensor",5,"PMセンサー PID 86（応答全体）"],
  ['66','maf_sensor_status',5,'A/B'], ['7B','dpf_status',7,'バンク2'],
  ['7F','engine_runtime_aux',13,'複合データ'], ['87','intake_manifold_absolute_pressure_a',5,'A/B'],
  ['89','engine_runtime_aecd',41,'#11〜15'], ['8F','pm_sensor_bank1',7,'バンク1/2'],
  ['91','wwh_obd_vehicle_info',5,'ECU情報'],
  ['A1','nox_sensor_corrected',9,'応答 PID A1（複合データ）'],
  ['A4','transmission_actual_gear',4,'応答 PID A4（複合データ）'],
  ['A5','commanded_diesel_exhaust_fluid',4,'応答 PID A5（複合データ）']
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
