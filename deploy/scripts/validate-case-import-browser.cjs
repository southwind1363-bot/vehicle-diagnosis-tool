const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

(async () => {
  const root = path.resolve(__dirname, '..');
  const output = fs.mkdtempSync(path.join(os.tmpdir(), 'case-import-browser-'));
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext({ serviceWorkers: 'block', viewport: { width: 390, height: 844 } });
  const errors = [], blocked = [];
  try {
    await context.addInitScript(() => {
      localStorage.setItem('vehicle-diagnosis-notice-accepted-v1', 'accepted');
      Object.defineProperty(navigator, 'serial', { value: undefined, configurable: true });
      Object.defineProperty(navigator, 'bluetooth', { value: undefined, configurable: true });
    });
    await context.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (url.origin !== 'http://127.0.0.1' || route.request().method() !== 'GET') {
        blocked.push(url.href); return route.abort();
      }
      const file = path.resolve(root, '.' + (url.pathname === '/' ? '/index.html' : decodeURIComponent(url.pathname)));
      const relative = path.relative(root, file);
      if (relative.startsWith('..') || path.isAbsolute(relative) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return route.fulfill({ status: 404, body: '' });
      const contentType = { '.js': 'text/javascript', '.json': 'application/json', '.html': 'text/html', '.css': 'text/css', '.svg': 'image/svg+xml' }[path.extname(file)] || 'text/plain';
      await route.fulfill({ contentType, body: fs.readFileSync(file) });
    });
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.goto('http://127.0.0.1/');
    await page.getByText('登録済み整備データを読み込みました。', { exact: false }).waitFor();
    await page.getByRole('button', { name: '5. データ管理', exact: true }).click();
    const input = page.locator('#importJsonInput');
    const status = page.locator('#caseImportStatus');
    await input.setInputFiles({ name: 'invalid.json', mimeType: 'application/json', buffer: Buffer.from('PRIVATE_INPUT is not JSON') });
    await page.waitForFunction(() => document.querySelector('#caseStatus').textContent.includes('JSONインポート失敗'));
    assert.ok(await status.isVisible(), 'Import failure is hidden outside the active data-management panel');
    assert.match(await status.innerText(), /JSONインポート失敗/);
    assert.doesNotMatch(await status.innerText(), /PRIVATE|Unexpected|SyntaxError/);
    assert.match(await status.innerText(), /ファイルの形式・内容.*保存済み一覧/);
    await status.scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(output, 'case-import-invalid-private-mobile.png') });
    const record = { id: 'browser-case', model: '模擬車両', symptom: '試験専用', obdCode: 'P0300' };
    await input.setInputFiles({ name: 'cases.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ records: [record] })) });
    await page.waitForFunction(() => savedCases.some(item => item.id === 'browser-case'));
    assert.match(await status.innerText(), /追加 1件/);
    const stored = await page.evaluate(() => localStorage.getItem('vehicle-diagnosis-cases-v1'));
    const exportStatus = page.locator('#caseExportStatus');
    const savedBeforeFailure = await page.evaluate(() => JSON.stringify(savedCases));
    await page.evaluate(() => {
      window.originalCaseExportURL = URL.createObjectURL;
      URL.createObjectURL = () => { throw new Error('private download failure'); };
    });
    try {
      await page.getByRole('button', { name: 'JSONバックアップ', exact: true }).click();
      assert.ok(await exportStatus.isVisible());
      assert.match(await exportStatus.innerText(), /保存を開始できませんでした.*変更していません/);
      assert.doesNotMatch(await exportStatus.innerText(), /private download failure/);
      assert.equal(await page.evaluate(() => JSON.stringify(savedCases)), savedBeforeFailure);
      assert.equal(await page.evaluate(() => localStorage.getItem('vehicle-diagnosis-cases-v1')), stored);
      await exportStatus.scrollIntoViewIfNeeded();
      await page.screenshot({ path: path.join(output, 'case-export-failure-mobile.png') });
    } finally {
      await page.evaluate(() => { URL.createObjectURL = window.originalCaseExportURL; delete window.originalCaseExportURL; });
    }
    const downloadEvent = page.waitForEvent('download');
    await page.getByRole('button', { name: 'JSONバックアップ', exact: true }).click();
    const download = await downloadEvent;
    const backup = path.join(output, 'synthetic-backup.json');
    await download.saveAs(backup);
    assert.match(await exportStatus.innerText(), /整備事例1件.*開始しました.*保存完了はブラウザー/);
    assert.equal(await page.locator('a[download]').count(), 0, 'Temporary download link leaked');
    assert.deepEqual(JSON.parse(fs.readFileSync(backup, 'utf8')).records, JSON.parse(stored));
    await page.reload();
    await page.getByRole('button', { name: '5. データ管理', exact: true }).click();
    await input.setInputFiles(backup);
    await page.waitForFunction(() => document.querySelector('#caseStatus').textContent.includes('重複スキップ 1件'));
    assert.match(await status.innerText(), /重複スキップ 1件/);
    assert.equal(await page.evaluate(() => localStorage.getItem('vehicle-diagnosis-cases-v1')), stored);
    // Deliver a controllably delayed file error through the real change listener.
    await page.evaluate(() => {
      window.FileReader = class {
        constructor() { window.caseTestReader = this; }
        readAsText() {}
      };
    });
    await input.setInputFiles({ name: 'unreadable.json', mimeType: 'application/json', buffer: Buffer.from('{}') });
    await page.evaluate(() => window.caseTestReader.onerror());
    assert.match(await status.innerText(), /ファイルを読み取れませんでした/);
    assert.equal(await input.inputValue(), '');
    assert.equal(await page.evaluate(() => localStorage.getItem('vehicle-diagnosis-cases-v1')), stored);
    await input.setInputFiles({ name: 'old.json', mimeType: 'application/json', buffer: Buffer.from('{}') });
    await page.evaluate(() => { window.oldCaseTestReader = window.caseTestReader; });
    await input.setInputFiles({ name: 'latest.json', mimeType: 'application/json', buffer: Buffer.from('{}') });
    await page.evaluate(() => {
      window.oldCaseTestReader.result = JSON.stringify([{ id: 'obsolete', model: 'old' }]);
      window.oldCaseTestReader.onload(); window.oldCaseTestReader.onerror();
    });
    assert.match(await status.innerText(), /読み込んでいます/);
    assert.equal(await page.evaluate(() => localStorage.getItem('vehicle-diagnosis-cases-v1')), stored);
    await page.getByRole('button', { name: '6. 実運用前チェック', exact: true }).click();
    let confirmations = 0;
    page.on('dialog', async dialog => { confirmations += 1; await dialog.accept(); });
    await page.getByRole('button', { name: 'アプリ保存データ全削除', exact: true }).click();
    assert.equal(confirmations, 2);
    await page.evaluate(() => {
      window.caseTestReader.result = JSON.stringify([{ id: 'obsolete', model: 'old' }]);
      window.caseTestReader.onload(); window.caseTestReader.onabort();
    });
    assert.equal(await page.evaluate(() => localStorage.getItem('vehicle-diagnosis-cases-v1')), null);
    await page.getByRole('button', { name: '5. データ管理', exact: true }).click();
    assert.match(await status.innerText(), /中断しました/);
    for (const width of [390, 1280]) {
      await page.setViewportSize({ width, height: 844 });
      for (const dark of [false, true]) {
        await page.evaluate(dark => document.body.classList.toggle('dark', dark), dark);
        assert.ok(await status.isVisible());
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'Horizontal overflow');
        await status.scrollIntoViewIfNeeded();
        await page.screenshot({ path: path.join(output, `case-import-${width}-${dark ? 'dark' : 'light'}.png`) });
      }
    }
    if (process.argv.includes('--bulk')) {
      // Reload releases the synthetic FileReader used above. Only this isolated
      // profile has been cleared; no personal browser storage is accessible.
      await page.reload();
      await page.getByRole('button', { name: '5. データ管理', exact: true }).click();
      const records = Array.from({ length: 1000 }, (_, i) => ({ id: `bulk-${i}`, model: `模擬車両-${i}`, symptom: `試験-${i}` }));
      await page.evaluate(() => {
        window.originalCaseDuplicateKey = duplicateKey;
        window.caseDuplicateKeyCalls = 0;
        duplicateKey = item => { window.caseDuplicateKeyCalls++; return window.originalCaseDuplicateKey(item); };
      });
      const started = Date.now();
      await input.setInputFiles({ name: 'bulk.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ records: [...records, ...records.slice(0, 100)] })) });
      await page.waitForFunction(() => savedCases.length === 1000);
      assert.match(await status.innerText(), /追加 1000件 \/ 重複スキップ 100件 \/ 不正行スキップ 0件/);
      assert.equal(await page.evaluate(() => window.caseDuplicateKeyCalls), 1100);
      const elapsedMs = Date.now() - started;
      const pending = page.waitForEvent('download');
      await page.getByRole('button', { name: 'JSONバックアップ', exact: true }).click();
      const file = path.join(output, 'bulk-backup.json');
      await (await pending).saveAs(file);
      const snapshot = await page.evaluate(() => localStorage.getItem('vehicle-diagnosis-cases-v1'));
      assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8')).records, JSON.parse(snapshot));
      await input.setInputFiles(file);
      await page.waitForFunction(() => document.querySelector('#caseImportStatus').textContent.includes('重複スキップ 1000件'));
      assert.equal(await page.evaluate(() => localStorage.getItem('vehicle-diagnosis-cases-v1')), snapshot);
      await status.scrollIntoViewIfNeeded();
      await page.screenshot({ path: path.join(output, 'bulk-backup-roundtrip.png') });
      console.log(JSON.stringify({ bulk: true, inputRecords: 1100, retainedRecords: 1000, initialKeyCalls: 1100, elapsedMs }));
    }
    if (process.argv.includes('--unsafe-id')) {
      await page.reload();
      await page.getByRole('button', { name: '5. データ管理', exact: true }).click();
      // Inert HTML only: verify imported identifiers cannot become markup.
      const specialId = 'case"><span data-case-injection>inert marker</span><span data-id="&特殊';
      const records = [{ id: specialId, model: '模擬特殊ID', symptom: '表示試験' }, { id: 'keep-case', model: '残す模擬車両', symptom: '保持試験' }];
      await input.setInputFiles({ name: 'special-id.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ records })) });
      await page.waitForFunction(id => savedCases.some(item => item.id === id), specialId);
      await page.getByRole('button', { name: '4. 事例検索', exact: true }).click();
      assert.equal(await page.locator('[data-case-injection]').count(), 0, 'Imported ID became HTML');
      const card = page.locator('#caseList .case-card').filter({ hasText: '模擬特殊ID' });
      const remove = card.getByRole('button', { name: '削除', exact: true });
      assert.equal(await remove.getAttribute('data-delete-case'), specialId);
      assert.ok((await card.innerText()).includes(specialId));
      await card.screenshot({ path: path.join(output, 'special-id-case.png') });
      await remove.click();
      assert.equal(await page.evaluate(id => savedCases.some(item => item.id === id), specialId), false);
      assert.equal(await page.evaluate(() => savedCases.some(item => item.id === 'keep-case')), true);
      assert.equal(JSON.parse(await page.evaluate(() => localStorage.getItem('vehicle-diagnosis-cases-v1'))).some(item => item.id === specialId), false);
      console.log('Special case ID: literal display, exact delete target and other record retention passed');
    }
    assert.deepEqual(errors, []); assert.deepEqual(blocked, []);
    console.log(JSON.stringify({ passed: true, flow: 'invalid file -> retry -> backup -> reload -> reimport -> read failure -> reselection -> confirmed clear -> stale callbacks ignored', output }));
  } finally { await context.close(); await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
