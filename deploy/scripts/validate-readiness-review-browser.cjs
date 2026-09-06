const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
(async () => {
    const root = path.resolve(__dirname, '..');
  const output = fs.mkdtempSync(path.join(os.tmpdir(), 'readiness-review-'));
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext({ serviceWorkers: 'block', viewport: { width: 390, height: 844 } });
  const errors = [], blocked = [];
  let page;
  try {
    await context.addInitScript(() => {
      localStorage.setItem('vehicle-diagnosis-notice-accepted-v1', 'accepted');
      sessionStorage.setItem('vehicle-diagnosis-obd-access-v1', 'enabled');
      Object.defineProperty(navigator, 'serial', { value: undefined, configurable: true });
      Object.defineProperty(navigator, 'bluetooth', { value: undefined, configurable: true });
    });
    await context.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (url.origin !== 'http://127.0.0.1' || route.request().method() !== 'GET') { blocked.push(url.href); return route.abort(); }
      const file = path.resolve(root, '.' + (url.pathname === '/' ? '/index.html' : decodeURIComponent(url.pathname)));
      const relative = path.relative(root, file);
      if (relative.startsWith('..') || path.isAbsolute(relative) || !fs.existsSync(file)) return route.fulfill({ status: 404, body: '' });
      const contentType = { '.js': 'text/javascript', '.json': 'application/json', '.html': 'text/html', '.css': 'text/css', '.svg': 'image/svg+xml' }[path.extname(file)] || 'text/plain';
      await route.fulfill({ contentType, body: fs.readFileSync(file) });
    });
    page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('http://127.0.0.1/');
    await page.getByText('登録済み整備データを読み込みました。', { exact: false }).waitFor();
    await page.getByRole('button', { name: '7. OBD2車両読取', exact: true }).click();
    const picker = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: '保存した読取結果を開く', exact: true }).click();
    const core = vm.createContext({ window: {} });
    vm.runInContext(fs.readFileSync(path.join(root, 'obd-readonly.js'), 'utf8'), core);
    const model = core.window.ObdReadOnly;
    model.configureMonitorDefinitions(JSON.parse(fs.readFileSync(path.join(root, 'data/obd-monitor-definitions.json'), 'utf8')));
    model.configureReadinessMonitors(JSON.parse(fs.readFileSync(path.join(root, 'data/obd-readiness-monitors-2026.json'), 'utf8')));
    const onboardMonitorSnapshot = model.normalizeOnboardMonitorSnapshot({ onboard_monitor_readout_status: 'reported', tests: [
      { source_ecu: '7E8', test_id: '01', component_id: '02', value: 1, min: 0, max: 2 },
      { source_ecu: '7E9', test_id: '01', component_id: '02', value: 3, min: 0, max: 2 },
      { source_ecu: '7E8', test_id: '03', component_id: '04', value: 4 }
    ] });
    const fixture = model.buildScanSessionFromObdText('>0101\n7E8 06 41 01 80 07 65 20\n7E9 06 41 01 00 07 65 00\n>0202\n7E8 05 42 02 00 01 71\n>020C\n7E8 05 42 0C 00 00 00\n7E9 05 42 0C 00 1A F8\n>0205\n7E8 04 42 05 01 7B\n', { onboardMonitorSnapshot });
    assert.equal(fixture.freezeFrameSnapshot.monitorValues.length, 3);
    assert.equal(fixture.readinessSnapshot.readinessEcuSnapshots.length, 2);
    await (await picker).setFiles({ name: 'synthetic-readiness-review.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(model.buildBridgeSessionExportPayload(fixture))) });
    await page.waitForFunction(() => obdDevSession.lastSession?.readinessSnapshot?.readinessEcuSnapshots?.length === 2);
    await page.locator('#obdSessionDetailReadiness').waitFor({ state: 'attached' });
    await page.getByRole('button', { name: 'レディネス確認', exact: true }).click();
    const card = page.locator('#obdSessionDetailReadiness');
    await card.waitFor({ state: 'visible' });
    const original = await page.evaluate(() => JSON.stringify(obdDevSession.lastSession));
    assert.equal(await page.evaluate(() => obdDevSession.lastSession.freezeFrameSnapshot.monitorValues.length), 3, 'Imported freeze-frame values lost');
    assert.match(await card.innerText(), /7E8/); assert.match(await card.innerText(), /7E9/);
    for (const state of ['incomplete', 'missing', 'unknown']) {
      await card.getByLabel('表示する状態').selectOption(state);
      assert.ok((await card.locator('[data-readiness-state]:visible').evaluateAll(rows => rows.map(row => row.dataset.readinessState))).every(actual => actual === state));
    }
    await card.getByRole('button', { name: '絞り込みを解除', exact: true }).click();
    const guide = card.locator('[data-readiness-state="incomplete"] .obd-readiness-guide').first();
    await guide.locator('summary').click();
    assert.match(await guide.innerText(), /整備書確認必須/);
    assert.match(await guide.innerText(), /参考情報の出典/);
    assert.match(await guide.innerText(), /一般参考情報/);
    await guide.evaluate(node => window.scrollTo({ top: window.scrollY + node.getBoundingClientRect().top - 230, behavior: 'instant' }));
    await page.screenshot({ path: path.join(output, 'readiness-guidance-mobile.png') });
    assert.equal(await card.locator('[data-readiness-totals]').count(), 2);
    for (const width of [390, 1280]) {
      await page.setViewportSize({ width, height: 844 });
      await card.getByLabel('表示する状態').selectOption('attention');
      const attention = card.locator('[data-readiness-state]:visible');
      assert.ok(await attention.count() > 0, 'Fixture must expose attention states');
      assert.ok((await attention.evaluateAll(rows => rows.map(row => row.dataset.readinessState))).every(state => ['missing', 'unknown', 'incomplete'].includes(state)));
      await card.getByLabel('監視項目・ECUで検索').fill('7e9');
      const filtered = card.locator('[data-readiness-state]:visible');
      for (const text of await filtered.allTextContents()) assert.match(text, /7E9/);
      await card.getByLabel('監視項目・ECUで検索').fill('存在しない監視項目');
      assert.equal(await filtered.count(), 0);
      await card.locator('[data-readiness-empty]').waitFor({ state: 'visible' });
      await card.getByRole('button', { name: '絞り込みを解除', exact: true }).click();
      assert.ok(await filtered.count() > 0);
      assert.equal(await card.getByLabel('表示する状態').inputValue(), 'all');
      for (const dark of [false, true]) {
        await page.evaluate(dark => document.body.classList.toggle('dark', dark), dark);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true, 'Horizontal page overflow');
        await card.screenshot({ path: path.join(output, `readiness-${width}-${dark ? 'dark' : 'light'}.png`) });
        await card.evaluate(node => window.scrollTo({ top: window.scrollY + node.getBoundingClientRect().top - 230, behavior: 'instant' }));
        await page.screenshot({ path: path.join(output, `readiness-controls-${width}-${dark ? 'dark' : 'light'}.png`) });
      }
    }
    assert.equal(await page.evaluate(() => JSON.stringify(obdDevSession.lastSession)), original, 'Review controls changed saved diagnostic data');
    await page.getByRole('button', { name: '基本読取結果へ戻る', exact: true }).click();
    await page.getByRole('button', { name: 'レディネスの詳細を開く', exact: true }).click();
    await card.waitFor({ state: 'visible' });
    assert.deepEqual(errors, []); assert.deepEqual(blocked, []);
    await page.getByRole('button', { name: '基本読取結果へ戻る', exact: true }).click();
    await page.getByRole('button', { name: 'フリーズフレームの詳細を開く', exact: true }).click();
    const ff = page.locator('#obdSessionDetailFreezeFrame');
    for (const width of [390, 1280]) {
      await page.setViewportSize({ width, height: 844 });
      await ff.getByLabel('記録元ECU', { exact: true }).selectOption('7E8');
      await ff.getByLabel('FF番号', { exact: true }).selectOption('0');
      assert.match(await ff.locator('[data-freeze-review-count]').innerText(), /1 \/ 3/);
      assert.match(await ff.locator('li:visible').allTextContents().then(rows => rows.join('\n')), /0 rpm/);
      await ff.getByLabel('FF番号', { exact: true }).selectOption('1');
      assert.match(await ff.locator('[data-freeze-review-count]').innerText(), /1 \/ 3/);
      await ff.getByLabel('記録項目を検索', { exact: true }).fill('存在しない項目');
      assert.match(await ff.locator('[data-freeze-review-count]').innerText(), /条件に一致/);
      assert.match(await ff.innerText(), /起点DTC:.*P0171/);
      await ff.getByRole('button', { name: '記録の絞り込みを解除', exact: true }).click();
      assert.match(await ff.locator('[data-freeze-review-count]').innerText(), /3 \/ 3/);
      for (const dark of [false, true]) {
        await page.evaluate(dark => document.body.classList.toggle('dark', dark), dark);
        await ff.evaluate(node => window.scrollTo({ top: window.scrollY + node.getBoundingClientRect().top - 230, behavior: 'instant' }));
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
        await page.screenshot({ animations: 'disabled', path: path.join(output, `freeze-review-${width}-${dark ? 'dark' : 'light'}.png`) });
      }
    }
    assert.equal(await page.evaluate(() => JSON.stringify(obdDevSession.lastSession)), original);
    assert.deepEqual(errors, []); assert.deepEqual(blocked, []);
    console.log('Freeze-frame browser passed: ECU/frame intersection, zero value, no match, persistent trigger, reset, 390/1280 light/dark, unchanged session.');
    await page.getByRole('button', { name: '基本読取結果へ戻る', exact: true }).click();
    await page.getByRole('button', { name: 'Mode06の詳細を開く', exact: true }).click();
    const mode = page.locator('#obdSessionDetailMode06');
    for (const width of [390, 1280]) {
      await page.setViewportSize({ width, height: 844 });
      await mode.getByLabel('Mode06の記録判定', { exact: true }).selectOption('attention');
      assert.equal(await mode.locator('[data-mode06-review-row]:visible').count(), 2);
      await mode.getByLabel('Mode06のECU・TID・CIDを検索').fill('7e9 tid 01 cid 02');
      assert.equal(await mode.locator('[data-mode06-review-row]:visible').count(), 1);
      assert.match(await mode.locator('[data-mode06-review-row]:visible').innerText(), /不合格/);
      await mode.getByLabel('Mode06のECU・TID・CIDを検索').fill('存在しない検査');
      assert.match(await mode.locator('[data-mode06-review-count]').innerText(), /正常を意味しません/);
      assert.match(await mode.innerText(), /TID\/CIDの意味と単位/);
      await mode.getByRole('button', { name: 'Mode06の絞り込みを解除', exact: true }).click();
      assert.equal(await mode.locator('[data-mode06-review-row]:visible').count(), 3);
      for (const dark of [false, true]) {
        await page.evaluate(dark => document.body.classList.toggle('dark', dark), dark);
        await mode.evaluate(node => window.scrollTo({ top: window.scrollY + node.getBoundingClientRect().top - 230, behavior: 'instant' }));
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
        await page.screenshot({ animations: 'disabled', path: path.join(output, `mode06-${width}-${dark ? 'dark' : 'light'}.png`) });
      }
    }
    assert.equal(await page.evaluate(() => JSON.stringify(obdDevSession.lastSession)), original);
    assert.deepEqual(errors, []); assert.deepEqual(blocked, []);
    console.log('Mode06 browser passed: search/status intersection, no match, warning retained, reset, 390/1280 light/dark, unchanged session.');
    const failed = model.buildDiagnosticScanSession({
      freezeFrameSnapshot: { source_ecu: '7E8', freeze_frame_readout_status: 'blocked', error_codes: ['adapter_timeout'] },
      onboardMonitorSnapshot: { source_ecu: '7E9', onboard_monitor_readout_status: 'unparsed', error_codes: ['transport:timeout'] }
    });
    await page.getByRole('button', { name: '基本読取結果へ戻る', exact: true }).click();
    const replacementPicker = page.waitForEvent('filechooser', { timeout: 5000 });
    replacementPicker.catch(() => {});
    page.once('dialog', dialog => dialog.accept());
    await page.getByRole('button', { name: '読取結果ファイルを開く', exact: true }).click();
    await (await replacementPicker).setFiles({ name: 'synthetic-empty-readout.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(model.buildBridgeSessionExportPayload(failed))) });
    await page.waitForFunction(() => obdDevSession.lastSession?.freezeFrameSnapshot?.freezeFrameReadoutStatus === 'blocked');
    const failedBefore = await page.evaluate(() => JSON.stringify(obdDevSession.lastSession));
    await page.setViewportSize({ width: 390, height: 844 });
    for (const [button, id, state, reason, counter] of [
      ['フリーズフレームの詳細を開く', 'obdSessionDetailFreezeFrame', '読取拒否', 'アダプター応答タイムアウト', '[data-freeze-review-count]'],
      ['Mode06の詳細を開く', 'obdSessionDetailMode06', '応答未解析', '通信タイムアウト', '[data-mode06-review-count]']
    ]) {
      await page.getByRole('button', { name: '基本読取結果へ戻る', exact: true }).click();
      await page.getByRole('button', { name: button, exact: true }).click();
      const detail = page.locator('#' + id);
      await detail.waitFor({ state: 'visible' });
      assert.ok((await detail.innerText()).includes(state));
      assert.ok((await detail.innerText()).includes(reason));
      assert.match(await detail.locator(counter).innerText(), /0 \/ 0/);
      assert.equal(await detail.locator('.obd-readiness-controls').isVisible(), false);
      await detail.evaluate(node => window.scrollTo({ top: window.scrollY + node.getBoundingClientRect().top - 230, behavior: 'instant' }));
      await page.screenshot({ animations: 'disabled', path: path.join(output, `empty-${id}.png`) });
    }
    assert.equal(await page.evaluate(() => JSON.stringify(obdDevSession.lastSession)), failedBefore);
    assert.deepEqual(errors, []); assert.deepEqual(blocked, []);
    console.log('Empty-result browser passed: imported rejected FF and unparsed Mode06, detail navigation, recorded errors, no fabricated values, unchanged session.');
    console.log(`Readiness review browser passed: actual JSON-file import, ECU/state search, reset, navigation, 390/1280 light/dark, unchanged session, zero external/vehicle requests. Artifacts: ${output}`);
  } catch (error) {
    if (page) { await page.screenshot({ path: path.join(output, 'failure.png') }); console.error('Screenshot:', path.join(output, 'failure.png'), 'Page errors:', errors); console.error('Freeze card:', await page.locator('#obdSessionDetailFreezeFrame').allTextContents()); }
    throw error;
  } finally { await context.close(); await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
