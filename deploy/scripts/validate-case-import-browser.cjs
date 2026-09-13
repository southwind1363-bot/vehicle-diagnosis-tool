const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

(async () => {
  const root = path.resolve(__dirname, '..');
  // Share the existing CI screenshot artifact glob without collecting backups.
  const output = fs.mkdtempSync(path.join(os.tmpdir(), 'obd-file-flow-cases-'));
  const channel = process.env.PLAYWRIGHT_CHANNEL || 'chrome';
  const legacyImportControls = process.argv.includes('--legacy-import-controls');
  assert.ok(!legacyImportControls || !process.argv.includes('--file-timeout'), 'Legacy controls do not include the cancel button required by --file-timeout');
  const browser = await chromium.launch({ channel, headless: true });
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
      let body = fs.readFileSync(file);
      if (legacyImportControls && path.basename(file) === 'index.html') {
        const html = body.toString('utf8');
        body = html.replace(/<button id="cancelCaseImportButton"[^>]*>[^<]*<\/button>/, '');
        assert.notEqual(body, html, 'Legacy HTML fixture must remove only the newly added cancel control');
      }
      await route.fulfill({ contentType, body });
    });
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.goto('http://127.0.0.1/');
    await page.getByText('登録済み整備データを読み込みました。', { exact: false }).waitFor();
    if (legacyImportControls) {
      assert.equal(await page.locator('#cancelCaseImportButton').count(), 0);
      console.log('Legacy HTML without optional import-cancel control initialized; running the existing import/export flow');
    }
    await page.getByRole('button', { name: '5. データ管理', exact: true }).click();
    const input = page.locator('#importJsonInput');
    const status = page.locator('#caseImportStatus');
    if (process.argv.includes('--field-boundaries')) {
      const records = [
        { id: 'boundary-a', maker: 'A|B', model: 'C', symptom: '試験専用' },
        { id: 'boundary-b', maker: 'A', model: 'B|C', symptom: '試験専用' }
      ];
      await input.setInputFiles({ name: 'boundaries.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(records)) });
      await page.waitForFunction(() => document.querySelector('#caseImportStatus').textContent.includes('JSONインポート完了'));
      assert.match(await status.innerText(), /追加 2件/);
      await page.reload();
      await page.getByText('登録済み整備データを読み込みました。', { exact: false }).waitFor();
      assert.deepEqual(await page.evaluate(() => savedCases.map(({ id, maker, model }) => ({ id, maker, model }))),
        records.map(({ id, maker, model }) => ({ id, maker, model })));
      await page.getByRole('button', { name: '4. 事例検索', exact: true }).click();
      assert.equal(await page.locator('#caseList .case-card').count(), 2);
      assert.match(await page.locator('#caseList').innerText(), /boundary-a/);
      assert.match(await page.locator('#caseList').innerText(), /boundary-b/);
      await page.screenshot({ path: path.join(output, 'case-boundaries-list.png') });
      await page.getByRole('button', { name: '5. データ管理', exact: true }).click();
      const downloadEvent = page.waitForEvent('download');
      await page.getByRole('button', { name: 'JSONバックアップ', exact: true }).click();
      const download = await downloadEvent;
      const backup = path.join(output, 'synthetic-boundaries.json');
      await download.saveAs(backup);
      const exported = JSON.parse(fs.readFileSync(backup, 'utf8'));
      assert.deepEqual(exported.records.map(({ id, maker, model }) => ({ id, maker, model })),
        records.map(({ id, maker, model }) => ({ id, maker, model })));
      await input.setInputFiles(backup);
      await page.waitForFunction(() => document.querySelector('#caseImportStatus').textContent.includes('重複スキップ 2件'));
      assert.equal(await page.evaluate(() => savedCases.length), 2);
      await status.scrollIntoViewIfNeeded();
      await page.screenshot({ path: path.join(output, 'case-boundaries-restored.png') });
      assert.deepEqual(errors, []); assert.deepEqual(blocked, []);
      console.log(JSON.stringify({ passed: true, flow: 'field boundaries -> actual file import -> reload -> downloaded backup -> duplicate reimport', output }));
      return;
    }
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
    if (process.argv.includes('--file-timeout')) {
      await page.evaluate(() => {
        window.caseReadFixture = { original: window.FileReader, reads: 0, aborts: 0, started: performance.now() };
        window.FileReader = class {
          constructor() { window.caseReadFixture.reader = this; }
          readAsText() { window.caseReadFixture.reads++; }
          abort() { window.caseReadFixture.aborts++; this.onabort?.(); }
        };
      });
      try {
        const cancelImport = page.getByRole('button', { name: 'JSON読込を中断', exact: true });
        assert.equal(await cancelImport.isDisabled(), true);
        await input.setInputFiles({ name: 'stalled.json', mimeType: 'application/json', buffer: Buffer.from('synthetic cancelled input') });
        assert.equal(await cancelImport.isEnabled(), true);
        await cancelImport.click();
        assert.equal(await cancelImport.isDisabled(), true);
        assert.equal(await input.inputValue(), '');
        assert.match(await status.innerText(), /中断しました/);
        assert.equal(await page.evaluate(() => caseDraftExitGuardAttached), false);
        const cancelled = await page.evaluate(() => {
          const fixture = window.caseReadFixture;
          fixture.reader.result = JSON.stringify([{ id: 'cancelled-late', model: 'cancelled-late' }]);
          fixture.reader.onload();
          return { aborts: fixture.aborts, stored: localStorage.getItem('vehicle-diagnosis-cases-v1') };
        });
        assert.equal(cancelled.aborts, 1);
        assert.equal(cancelled.stored, stored);
        await cancelImport.scrollIntoViewIfNeeded();
        await page.screenshot({ path: path.join(output, 'case-import-cancel-390.png') });
        await page.evaluate(() => Object.assign(window.caseReadFixture, { reads: 0, aborts: 0, started: performance.now() }));
        await input.setInputFiles({ name: 'stalled.json', mimeType: 'application/json', buffer: Buffer.from('synthetic stalled input') });
        assert.equal(await page.evaluate(() => hasUnsavedCaseDraft()), false);
        const pendingExit = page.waitForEvent('dialog');
        await page.close({ runBeforeUnload: true });
        const pendingConfirmation = await pendingExit;
        assert.equal(pendingConfirmation.type(), 'beforeunload');
        await pendingConfirmation.dismiss();
        assert.equal(page.isClosed(), false);
        assert.equal(await page.evaluate(() => Boolean(caseImportOperation)), true);
        await page.waitForFunction(() => caseImportOperation === null, null, { timeout: 45000 });
        assert.equal(await page.evaluate(() => caseDraftExitGuardAttached), false);
        assert.equal(await cancelImport.isDisabled(), true);
        assert.match(await status.innerText(), /ファイルを読み取れませんでした.*保存済み事例は変更していません/);
        assert.equal(await input.inputValue(), '');
        const result = await page.evaluate(() => {
          const fixture = window.caseReadFixture;
          fixture.reader.result = JSON.stringify([{ id: 'late', model: 'late' }]);
          fixture.reader.onload();
          return { reads: fixture.reads, aborts: fixture.aborts, elapsed: performance.now() - fixture.started,
            stored: localStorage.getItem('vehicle-diagnosis-cases-v1'), lateApplied: savedCases.some(item => item.id === 'late') };
        });
        assert.equal(result.reads, 1); assert.equal(result.aborts, 1); assert.ok(result.elapsed >= 29000);
        assert.equal(result.stored, stored); assert.equal(result.lateApplied, false);
        await status.scrollIntoViewIfNeeded();
        await page.screenshot({ path: path.join(output, 'case-import-timeout-390.png') });
      } finally {
        await page.evaluate(() => { window.FileReader = window.caseReadFixture.original; delete window.caseReadFixture; });
      }
      await input.setInputFiles({ name: 'cases.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ records: [record] })) });
      await page.waitForFunction(() => document.querySelector('#caseImportStatus').textContent.includes('重複スキップ 1件'));
      assert.equal(await page.evaluate(() => localStorage.getItem('vehicle-diagnosis-cases-v1')), stored);
      console.log('Case file timeout: real 30-second wait, one abort, stale load ignored, stored cases retained and manual reimport passed');
    }
    await page.getByRole('button', { name: '3. 整備事例登録', exact: true }).click();
    await page.locator('#caseModel').fill('未保存の模擬車両');
    await page.locator('#caseMemo').fill('人工番号 000-0000-0000');
    assert.match(await page.locator('#caseQualityIssues').innerText(), /個人情報やナンバーらしき文字列/);
    assert.equal(await page.evaluate(() => localStorage.getItem('vehicle-diagnosis-cases-v1')), stored);
    await page.locator('#caseQualityIssues').screenshot({ path: path.join(output, 'case-privacy-warning.png') });
    await page.locator('#caseMemo').fill('クリア取消で残す模擬メモ');
    assert.doesNotMatch(await page.locator('#caseQualityIssues').innerText(), /個人情報やナンバーらしき文字列/);
    await page.locator('#caseConfidence').selectOption('中');
    const formBeforeClear = await page.locator('#caseForm input, #caseForm textarea, #caseForm select').evaluateAll(nodes => nodes.map(node => [node.id, node.value]));
    const exitDialog = page.waitForEvent('dialog');
    await page.close({ runBeforeUnload: true });
    const exitConfirmation = await exitDialog;
    assert.equal(exitConfirmation.type(), 'beforeunload');
    await exitConfirmation.dismiss();
    assert.equal(page.isClosed(), false);
    assert.deepEqual(await page.locator('#caseForm input, #caseForm textarea, #caseForm select').evaluateAll(nodes => nodes.map(node => [node.id, node.value])), formBeforeClear);
    await page.evaluate(() => saveCase()); // Required fields missing: no write/reset.
    assert.equal(await page.evaluate(() => hasUnsavedCaseDraft()), true);
    assert.equal(await page.evaluate(() => localStorage.getItem('vehicle-diagnosis-cases-v1')), stored);
    const clearPrompts = [];
    for (const accepted of [false, true]) {
      page.once('dialog', async dialog => {
        clearPrompts.push(dialog.message());
        if (accepted) await dialog.accept(); else await dialog.dismiss();
      });
      await page.getByRole('button', { name: '事例入力をクリア', exact: true }).click();
      assert.match(clearPrompts.at(-1), /未保存の入力は元に戻せません.*保存済みの事例は削除しません/);
      assert.match(await page.locator('#caseStatus').innerText(), accepted ? /クリアしました/ : /キャンセル.*保持/);
      assert.equal(await page.evaluate(() => hasUnsavedCaseDraft()), !accepted);
      if (!accepted) {
        assert.deepEqual(await page.locator('#caseForm input, #caseForm textarea, #caseForm select').evaluateAll(nodes => nodes.map(node => [node.id, node.value])), formBeforeClear);
      } else {
        assert.equal(await page.locator('#caseModel').inputValue(), '');
        assert.equal(await page.locator('#caseMemo').inputValue(), '');
        assert.equal(await page.locator('#caseConfidence').inputValue(), '低');
        assert.notEqual(await page.locator('#caseDate').inputValue(), '');
        assert.notEqual(await page.locator('#caseId').inputValue(), '');
      }
      assert.equal(await page.evaluate(() => localStorage.getItem('vehicle-diagnosis-cases-v1')), stored);
      await page.locator('#caseStatus').scrollIntoViewIfNeeded();
      await page.screenshot({ path: path.join(output, `case-reset-${accepted ? 'confirmed' : 'cancelled'}-mobile.png`) });
    }
    assert.equal(clearPrompts.length, 2);
    console.log('Case input reset: native confirm cancellation retains all inputs; accepted reset keeps stored cases and initializes defaults');
    await page.getByRole('button', { name: '5. データ管理', exact: true }).click();
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
    await input.setInputFiles(backup);
    await page.waitForFunction(() => document.querySelector('#caseImportStatus').textContent.includes('重複スキップ 1件'));
    assert.equal(await exportStatus.textContent(), '', 'Reimport must clear the previous export notification');
    assert.equal(await page.evaluate(() => localStorage.getItem('vehicle-diagnosis-cases-v1')), stored);
    await page.screenshot({ path: path.join(output, 'case-export-status-cleared-390.png') });
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
    if (process.argv.includes('--delete-identity')) {
      // Synthetic legacy storage, including IDs the importer does not coalesce.
      await page.evaluate(() => localStorage.setItem('vehicle-diagnosis-cases-v1', JSON.stringify([
        { id: 17, model: '数値ID対象' }, { id: '17', model: '文字列ID保持' },
        { id: 'same', model: '同一ID対象' }, { id: 'same', model: '同一ID保持' }
      ])));
      await page.reload();
      await page.getByRole('button', { name: '4. 事例検索', exact: true }).click();
      for (const model of ['数値ID対象', '同一ID対象']) {
        await page.locator('#caseList .case-card').filter({ hasText: model }).getByRole('button', { name: '削除', exact: true }).click();
      }
      assert.deepEqual(await page.evaluate(() => savedCases.map(item => item.model)), ['文字列ID保持', '同一ID保持']);
      await page.reload();
      await page.getByRole('button', { name: '4. 事例検索', exact: true }).click();
      assert.deepEqual(await page.evaluate(() => savedCases.map(item => item.model)), ['文字列ID保持', '同一ID保持']);
      await page.locator('#caseList').screenshot({ path: path.join(output, 'exact-delete-retained.png') });
      console.log('Exact case deletion: numeric/string and duplicate IDs retain other records across reload');
    }
    if (process.argv.includes('--csv')) {
      await page.evaluate(() => localStorage.setItem('vehicle-diagnosis-cases-v1', JSON.stringify([{ id: 'csv-test', model: '模擬CSV車両', year: 0, mileage: 0, memo: '引用符"と,改行\nの検査', measurements: '-12', work: '=1+1', finalCause: '  ＝1+1' }])));
      await page.reload();
      await page.getByRole('button', { name: '5. データ管理', exact: true }).click();
      const storedBefore = await page.evaluate(() => localStorage.getItem('vehicle-diagnosis-cases-v1'));
      await page.evaluate(() => { window.originalCsvUrl = URL.createObjectURL; URL.createObjectURL = () => { throw new Error('private CSV detail'); }; });
      await page.getByRole('button', { name: 'CSVエクスポート', exact: true }).click();
      const exportStatus = page.locator('#caseExportStatus');
      assert.match(await exportStatus.innerText(), /CSV.*開始できません/);
      assert.equal((await exportStatus.innerText()).includes('private CSV detail'), false);
      await page.evaluate(() => { URL.createObjectURL = window.originalCsvUrl; });
      const pendingCsv = page.waitForEvent('download');
      await page.getByRole('button', { name: 'CSVエクスポート', exact: true }).click();
      const csvPath = path.join(output, 'case-export.csv');
      await (await pendingCsv).saveAs(csvPath);
      assert.equal(fs.readFileSync(csvPath, 'utf8'), await page.evaluate(() => '\uFEFF' + buildCasesCsv(savedCases)));
      const csvText = fs.readFileSync(csvPath, 'utf8');
      for (const field of ['"\t-12"', '"\t=1+1"', '"\t  ＝1+1"']) assert.ok(csvText.includes(field), 'Downloaded CSV lost its Excel text prefix');
      const originalValues = await page.evaluate(() => buildCasesBackup().records[0]);
      assert.equal(originalValues.year, '0');
      assert.equal(originalValues.mileage, '0');
      assert.equal(originalValues.measurements, '-12');
      assert.equal(originalValues.work, '=1+1');
      assert.equal(originalValues.finalCause, '  ＝1+1');
      assert.match(await page.locator('#caseCsvSafetyNote').innerText(), /タブ.*JSONバックアップ/);
      await page.locator('#caseCsvSafetyNote').screenshot({ path: path.join(output, 'csv-safety-note.png') });
      assert.equal(await page.evaluate(() => localStorage.getItem('vehicle-diagnosis-cases-v1')), storedBefore);
      assert.match(await exportStatus.innerText(), /1件.*CSV.*開始しました.*保存完了はブラウザー/);
      await exportStatus.screenshot({ path: path.join(output, 'csv-export-status.png') });
      const originalJsonDownload = page.waitForEvent('download');
      await page.getByRole('button', { name: 'JSONバックアップ', exact: true }).click();
      const originalJsonPath = path.join(output, 'csv-original-backup.json');
      await (await originalJsonDownload).saveAs(originalJsonPath);
      assert.deepEqual(JSON.parse(fs.readFileSync(originalJsonPath, 'utf8')).records[0], originalValues, 'JSON download must preserve original formula-like values without CSV prefixes');
      assert.equal(await page.evaluate(() => localStorage.getItem('vehicle-diagnosis-cases-v1')), storedBefore);
      console.log('CSV export: injected failure, retry, exact BOM/content and storage retention passed');
      // Exercise FileReader and persistence, not just pre-seeded storage/export builders.
      const zeroInput = [{ id: 'file-zero', model: '数値ゼロ取込試験', year: 0, mileage: 0, measurements: 0,
        work: '測定結果を確認\n再点検は未実施', memo: '<img src=x onerror=alert(1)>', sources: '試験用記録' },
        { id: 'file-empty', model: '空欄取込試験', year: '', mileage: null, measurements: '' }];
      await input.setInputFiles({ name: 'numeric-zero.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(zeroInput)) });
      await page.waitForFunction(() => savedCases.some(item => item.id === 'file-zero'));
      const zeroStored = await page.evaluate(() => localStorage.getItem('vehicle-diagnosis-cases-v1'));
      for (const [id, expected] of [['file-zero', '0'], ['file-empty', '']]) {
        const saved = JSON.parse(zeroStored).find(item => item.id === id);
        for (const field of ['year', 'mileage', 'measurements']) assert.equal(saved[field], expected);
      }
      const zeroDownload = page.waitForEvent('download');
      await page.getByRole('button', { name: 'JSONバックアップ', exact: true }).click();
      const zeroPath = path.join(output, 'numeric-zero-backup.json');
      await (await zeroDownload).saveAs(zeroPath);
      assert.deepEqual(JSON.parse(fs.readFileSync(zeroPath, 'utf8')).records, JSON.parse(zeroStored));
      await page.reload();
      await page.getByRole('button', { name: '5. データ管理', exact: true }).click();
      await input.setInputFiles(zeroPath);
      await page.waitForFunction(() => document.querySelector('#caseImportStatus').textContent.includes('重複スキップ 3件'));
      assert.equal(await page.evaluate(() => localStorage.getItem('vehicle-diagnosis-cases-v1')), zeroStored);
      await page.getByRole('button', { name: '4. 事例検索', exact: true }).click();
      await page.locator('#caseSearch').fill('file-zero');
      assert.equal(await page.locator('#caseList .case-card').count(), 1);
      const savedDetails = page.locator('#caseList .case-saved-details');
      await savedDetails.locator('summary').click();
      for (const label of ['年式', '走行距離', '測定値']) assert.ok((await savedDetails.innerText()).includes(`${label}: 0`));
      assert.ok((await savedDetails.innerText()).includes(zeroInput[0].work));
      assert.ok((await savedDetails.innerText()).includes(zeroInput[0].memo));
      assert.equal(await savedDetails.locator('img').count(), 0);
      assert.equal(await page.evaluate(() => localStorage.getItem('vehicle-diagnosis-cases-v1')), zeroStored);
      await page.setViewportSize({ width: 390, height: 844 });
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      await page.locator('#caseList').screenshot({ path: path.join(output, 'numeric-zero-restored.png') });
      console.log('Numeric zero: real JSON file import, persisted fields, backup download, reload and duplicate reimport retain zero separately from missing values');
    }
    // Search must accept the UI's own multi-keyword example after restoration.
    await page.evaluate(() => localStorage.setItem('vehicle-diagnosis-cases-v1', JSON.stringify([
      { id: 'CASE-101', model: 'プリウス', symptom: 'アイドル不調', obdCode: 'P0171', work: '吸気ダクト交換', measurements: '燃料補正 +18%', engine: '2ZR-FXE', year: '2018', mileage: '85000', technician: '試験整備士' },
      { id: 'CASE-102', model: 'フィット', symptom: 'アイドル不調', obdCode: 'P0300' }
    ])));
    await page.reload();
    await page.getByRole('button', { name: '4. 事例検索', exact: true }).click();
    const searchStored = await page.evaluate(() => localStorage.getItem('vehicle-diagnosis-cases-v1'));
    const search = page.locator('#caseSearch');
    for (const query of ['プリウス P0171 アイドル', ' p0171　プリウス ', 'case-101', 'ダクト', '燃料補正 +18%', '2zr-fxe 2018', '85000 試験整備士', 'Ｐ０１７１ ﾌﾟﾘｳｽ', '２ＺＲ－ＦＸＥ　＋１８％']) {
      await search.fill(query);
      assert.equal(await page.locator('#caseList .case-card').count(), 1);
      assert.match(await page.locator('#caseList').innerText(), /CASE-101/);
    }
    await search.fill('プリウス P0300');
    assert.match(await page.locator('#caseList').innerText(), /検索条件に一致する事例はありません/);
    for (const width of [390, 1280]) {
      await page.setViewportSize({ width, height: 844 });
      await search.scrollIntoViewIfNeeded();
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      await page.screenshot({ path: path.join(output, `case-search-empty-${width}.png`) });
    }
    await search.fill('');
    assert.equal(await page.locator('#caseList .case-card').count(), 2);
    assert.equal(await page.evaluate(() => localStorage.getItem('vehicle-diagnosis-cases-v1')), searchStored);
    console.log('Case search: multi-keyword, full-width whitespace, ID, work, no match and reset passed');
    if (process.argv.includes('--data-timeout')) {
      assert.equal(await page.locator('#staticDataWarning').isVisible(), false);
      await page.addInitScript(() => {
        const original = window.fetch;
        window.staticStallCalls = 0;
        window.fetch = (input, options) => {
          if (String(input) !== 'data/obd-codes.json') return original(input, options);
          window.staticStallCalls++;
          return new Promise((_, reject) => {
            const stop = () => reject(new DOMException('Synthetic stalled static data', 'AbortError'));
            if (options?.signal?.aborted) stop();
            else options?.signal?.addEventListener('abort', stop, { once: true });
          });
        };
      });
      await page.reload();
      await page.waitForFunction(() => document.querySelector('#dataStatus').textContent.includes('内蔵サンプルデータで動作中'), null, { timeout: 40000 });
      assert.equal(await page.evaluate(() => window.staticStallCalls), 1);
      assert.notEqual(await page.locator('#obdCapabilityBadge').innerText(), '対応状況を確認中');
      assert.equal(await page.evaluate(() => obdAccessUnlocked), false);
      assert.equal(await page.evaluate(() => localStorage.getItem('vehicle-diagnosis-cases-v1')), searchStored);
      await page.getByRole('button', { name: '7. OBD2車両読取', exact: true }).click();
      assert.equal(await page.locator('#dataStatus').isVisible(), false);
      for (const tab of ['7. OBD2車両読取', '5. データ管理', '4. 事例検索']) {
        await page.getByRole('button', { name: tab, exact: true }).click();
        assert.equal(await page.locator('#staticDataWarning').isVisible(), true);
      }
      await page.setViewportSize({ width: 390, height: 844 });
      await page.locator('#staticDataWarning').scrollIntoViewIfNeeded();
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      await page.screenshot({ path: path.join(output, 'static-data-timeout-locked.png') });
      console.log('Static data stall: real 30-second deadline, fallback, one attempt, retained lock and saved cases passed');
    }
    // A second real page shares storage but not the first page's in-memory list.
    await page.getByRole('button', { name: '1. 診断補助', exact: true }).click();
    await page.locator('#obdCode').fill('P0171');
    await page.evaluate(() => renderSimilarCases());
    assert.equal(await page.locator('#similarCases .case-card').count(), 1);
    const otherPage = await context.newPage();
    try {
      await otherPage.goto('http://127.0.0.1/');
      await otherPage.getByText('登録済み整備データを読み込みました。', { exact: false }).waitFor();
      await otherPage.getByRole('button', { name: '5. データ管理', exact: true }).click();
      await otherPage.locator('#importJsonInput').setInputFiles({ name: 'other-tab.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify([{ id: 'other-tab-case', model: '別タブ模擬車両' }])) });
      await otherPage.waitForFunction(() => savedCases.some(item => item.id === 'other-tab-case'));
      const latestBytes = await otherPage.evaluate(() => localStorage.getItem('vehicle-diagnosis-cases-v1'));
      await page.getByRole('button', { name: '3. 整備事例登録', exact: true }).click();
      await page.locator('#caseMemo').fill('未保存の模擬メモ');
      await page.getByRole('button', { name: '5. データ管理', exact: true }).click();
      const candidate = { name: 'stale-tab.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify([{ id: 'retry-after-conflict', model: '復帰模擬車両' }])) };
      for (const format of ['Json', 'Csv']) {
        assert.equal(await page.evaluate(format => window['exportCases' + format](), format), false);
        assert.match(await page.locator('#caseExportStatus').innerText(), /古い一覧.*保存事例を再読込/);
        assert.equal(await page.evaluate(() => localStorage.getItem('vehicle-diagnosis-cases-v1')), latestBytes);
      }
      await page.locator('#caseExportStatus').screenshot({ path: path.join(output, 'stale-export-warning.png') });
      await input.setInputFiles(candidate);
      await page.waitForFunction(() => Boolean(caseStorageReadError));
      for (const button of ['JSONバックアップ', 'CSVエクスポート']) {
        await page.getByRole('button', { name: button, exact: true }).click();
        assert.match(await page.locator('#caseExportStatus').innerText(), /開始しませんでした.*保存事例を再読込/);
        assert.equal(await page.evaluate(() => localStorage.getItem('vehicle-diagnosis-cases-v1')), latestBytes);
      }
      await page.locator('#caseExportStatus').screenshot({ path: path.join(output, 'blocked-export-status.png') });
      assert.equal(await page.evaluate(() => localStorage.getItem('vehicle-diagnosis-cases-v1')), latestBytes);
      assert.equal(await page.evaluate(() => savedCases.some(item => item.id === 'other-tab-case')), false);
      assert.match(await status.innerText(), /別タブ.*上書きを停止/);
      assert.equal(await page.locator('#similarCases .case-card').count(), 0);
      assert.match(await page.locator('#similarCases').textContent(), /未読込.*未確認/);
      assert.equal(await page.locator('#caseMemo').inputValue(), '未保存の模擬メモ');
      await page.setViewportSize({ width: 390, height: 844 });
      await page.locator('#caseStorageWarning').scrollIntoViewIfNeeded();
      assert.equal(await page.locator('#caseStorageWarning').isVisible(), true);
      await page.screenshot({ path: path.join(output, 'case-storage-conflict-mobile.png') });
      await page.getByRole('button', { name: '保存事例を再読込', exact: true }).click();
      assert.equal(await page.locator('#caseExportStatus').textContent(), '', 'Successful recovery must clear the stale export warning');
      assert.equal(await page.locator('#caseStorageWarning').isVisible(), false);
      assert.equal(await page.locator('#similarCases .case-card').count(), 1);
      assert.equal(await page.locator('#caseMemo').inputValue(), '未保存の模擬メモ');
      await input.setInputFiles(candidate);
      // Freshly reloaded state can be backed up without losing the other tab's record.
      await page.waitForFunction(() => savedCases.some(item => item.id === 'retry-after-conflict'));
      assert.equal(await page.evaluate(() => savedCases.some(item => item.id === 'other-tab-case')), true);
      const freshDownload = page.waitForEvent('download');
      await page.evaluate(() => exportCasesJson());
      const freshPath = path.join(output, 'fresh-after-conflict.json');
      await (await freshDownload).saveAs(freshPath);
      assert.equal(JSON.parse(fs.readFileSync(freshPath, 'utf8')).records.some(item => item.id === 'other-tab-case'), true);
      page.once('dialog', dialog => {
        assert.equal(dialog.type(), 'beforeunload');
        // The existing synthetic-confirmation handler accepts this abandonment.
      });
      await page.reload();
      assert.equal(await page.evaluate(() => savedCases.some(item => item.id === 'other-tab-case') && savedCases.some(item => item.id === 'retry-after-conflict')), true);
      console.log('Two-tab storage: stale write blocked, latest bytes and form retained, manual reload and import recovery passed');
      console.log('Similar cases: prior cards removed on detected conflict, restored after successful reload');
    } finally { await otherPage.close(); }
    await page.getByRole('button', { name: '3. 整備事例登録', exact: true }).click();
    for (const [id, value] of Object.entries({ caseCreator: '試験専用', caseMaker: 'TEST', caseModel: 'draft-exit-test',
      caseYear: '2020', caseMileage: '100', caseSymptom: '模擬症状', caseConfirmed: '模擬確認',
      caseCause: '模擬原因', caseWork: '模擬作業', caseSources: '合成テスト', caseMemo: '保存失敗で保持する模擬メモ' })) {
      await page.locator('#' + id).fill(value);
    }
    const beforeDraftSave = await page.evaluate(() => localStorage.getItem('vehicle-diagnosis-cases-v1'));
    await page.evaluate(() => {
      window.originalDraftSetItem = Storage.prototype.setItem;
      Storage.prototype.setItem = function(key, value) {
        if (key === 'vehicle-diagnosis-cases-v1') throw new DOMException('Synthetic quota failure', 'QuotaExceededError');
        return window.originalDraftSetItem.call(this, key, value);
      };
    });
    try {
      await page.getByRole('button', { name: '事例を保存', exact: true }).click();
      assert.equal(await page.evaluate(() => hasUnsavedCaseDraft()), true);
      assert.equal(await page.locator('#caseMemo').inputValue(), '保存失敗で保持する模擬メモ');
      assert.equal(await page.evaluate(() => localStorage.getItem('vehicle-diagnosis-cases-v1')), beforeDraftSave);
    } finally {
      await page.evaluate(() => { Storage.prototype.setItem = window.originalDraftSetItem; delete window.originalDraftSetItem; });
    }
    await page.getByRole('button', { name: '事例を保存', exact: true }).click();
    assert.equal(await page.evaluate(() => hasUnsavedCaseDraft()), false);
    assert.equal(await page.evaluate(() => savedCases.some(item => item.model === 'draft-exit-test')), true);
    console.log('Draft exit: native close cancellation retains inputs; failed save retains warning; successful manual save clears it');
    assert.deepEqual(errors, []); assert.deepEqual(blocked, []);
    console.log(JSON.stringify({ passed: true, flow: 'invalid file -> retry -> backup -> reload -> reimport -> read failure -> reselection -> confirmed clear -> stale callbacks ignored', output }));
  } finally { await context.close(); await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
