import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

if (!process.argv.includes('--child')) {
  for (const TZ of ['Asia/Tokyo', 'America/Los_Angeles']) {
    process.stdout.write(execFileSync(process.execPath, [fileURLToPath(import.meta.url), '--child'], {
      env: { ...process.env, TZ }, encoding: 'utf8'
    }));
  }
} else {
  const source = fs.readFileSync(new URL('../script.js', import.meta.url), 'utf8');
  const names = ['setDefaultCaseDate', 'collectCaseForm'];
  if (source.includes('function getLocalCaseDate(')) names.push('getLocalCaseDate');
  const code = names.map(name => source.match(new RegExp(`function ${name}\\([^)]*\\) \\{[\\s\\S]*?\\r?\\n\\}`))?.[0] || assert.fail(name)).join('\n');
  for (const hour of [0, 23]) {
    const fixed = new Date(2026, 0, 1, hour, 30);
    assert.equal(fixed.getTimezoneOffset(), process.env.TZ === 'Asia/Tokyo' ? -540 : 480);
    const input = { value: '' };
    const context = vm.createContext({
      Date: class extends Date { constructor(...args) { super(...(args.length ? args : [fixed.getTime()])); } },
      document: { querySelector: () => input },
      setNextCaseId() {}, resetCaseDraftExitGuard() {}, createCaseId: () => 'synthetic-id',
      valueOf: () => '', normalizeCode: value => value
    });
    vm.runInContext(code, context);
    context.setDefaultCaseDate();
    assert.equal(input.value, '2026-01-01', `${process.env.TZ} hour ${hour}: form default uses UTC day`);
    input.value = '2025-12-25';
    context.setDefaultCaseDate();
    assert.equal(input.value, '2025-12-25', 'User date was overwritten');
    const record = context.collectCaseForm();
    assert.equal(record.registrationDate, '2026-01-01', 'Empty date fallback uses UTC day');
    assert.equal(record.createdAt, fixed.toISOString(), 'Audit timestamp stopped using UTC');
  }
  console.log(`Case local date: ${process.env.TZ} midnight/year boundary, manual date and UTC timestamp passed`);
}
