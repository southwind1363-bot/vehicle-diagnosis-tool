const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
(async () => {
    const root = path.resolve(__dirname, '..');
  const output = fs.mkdtempSync(path.join(os.tmpdir(), 'readiness-review-'));
  const browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome', headless: true });
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
    const ecuInfoSnapshot = model.normalizeBridgeEcuInfoSnapshot({ ok: true, blocked: false, would_transmit: false, data: { ecu_snapshots: [
      { source_ecu: '7E8', ecu_info_readout_status: 'reported', items: [{ id: 'calibration_id', value: 'CAL-A' }, { id: 'vin', info_type: '02', value: 'JH4KA8260MC000001' }] },
      { source_ecu: '7E9', ecu_info_readout_status: 'reported', items: [{ id: 'calibration_id', value: 'CAL-B' }] },
      { source_ecu: '7EA', ecu_info_readout_status: 'blocked', items: [] }
    ] } });
    const supportedPidMatrix = model.buildSupportedPidMatrix({ supportedPidEcuSnapshots: [
      { sourceEcu: '7E8', supportedPidReadoutStatus: 'reported', supportedPids: ['0C'] },
      { sourceEcu: '7E9', supportedPidReadoutStatus: 'reported', supportedPids: ['05'] },
      { sourceEcu: '7EA', supportedPidReadoutStatus: 'blocked', supportedPids: [] }
    ] });
    model.configureMonitorDefinitions(JSON.parse(fs.readFileSync(path.join(root, 'data/obd-monitor-definitions.json'), 'utf8')));
    model.configureReadinessMonitors(JSON.parse(fs.readFileSync(path.join(root, 'data/obd-readiness-monitors-2026.json'), 'utf8')));
    const onboardMonitorSnapshot = model.normalizeOnboardMonitorSnapshot({ onboard_monitor_readout_status: 'reported', tests: [
      { source_ecu: '7E8', test_id: '01', component_id: '02', value: 1, min: 0, max: 2 },
      { source_ecu: '7E9', test_id: '01', component_id: '02', value: 3, min: 0, max: 2 },
      { source_ecu: '7E8', test_id: '03', component_id: '04', value: 4 }
    ] });
    const fixture = model.buildScanSessionFromObdText('>0101\n7E8 06 41 01 80 07 65 20\n7E9 06 41 01 00 07 65 00\n>0202\n7E8 05 42 02 00 01 71\n>020C\n7E8 05 42 0C 00 00 00\n7E9 05 42 0C 00 1A F8\n>0205\n7E8 04 42 05 01 7B\n', { onboardMonitorSnapshot, ecuInfoSnapshot, supportedPidMatrix });
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
      const search = ff.getByLabel('記録項目を検索', { exact: true });
      for (const [query, count] of [['0c', 2], ['０Ｃ　７Ｅ８', 1], ['engine_speed 7e9', 1], ['rpm 7e8', 1], ['05', 1], ['冷却水温', 1], ['missing', 0], ['<script>', 0], ['　 ', 3]]) {
        await search.fill(query);
        assert((await ff.locator('[data-freeze-review-count]').innerText()).includes(count + ' / 3'), 'FF search: ' + query);
      }
      await search.fill('0c');
      await ff.getByLabel('記録元ECU', { exact: true }).selectOption('7E8');
      await ff.getByLabel('FF番号', { exact: true }).selectOption('1');
      assert.match(await ff.locator('[data-freeze-review-count]').innerText(), /0 \/ 3/);
      await ff.getByLabel('FF番号', { exact: true }).selectOption('0');
      assert.match(await ff.locator('[data-freeze-review-count]').innerText(), /1 \/ 3/);
      assert.match(await ff.innerText(), /PID 0C \/ 7E8 \/ FF #0/);
      await ff.getByRole('button', { name: '記録の絞り込みを解除', exact: true }).click();
      assert.equal(await search.inputValue(), '');
      assert(await search.evaluate(el => document.activeElement === el));
      assert.equal(await page.evaluate(() => JSON.stringify(obdDevSession.lastSession)), original);
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
    for (const [title, id, query] of [['ECU情報', 'obdSessionDetailEcuInfo', '7e8 cal-a'], ['対応PID', 'obdSessionDetailSupportedPid', '7e8 0c']]) {
      await page.getByRole('button', { name: '基本読取結果へ戻る', exact: true }).click();
      await page.getByRole('button', { name: `${title}の詳細を開く`, exact: true }).click();
      const reference = page.locator('#' + id);
      for (const width of [390, 1280]) {
        await page.setViewportSize({ width, height: 844 });
        await reference.getByLabel(`${title}のECU・項目を検索`).fill(query);
        assert.equal(await reference.locator('[data-reference-search-row]:visible').count(), 1);
        assert.match(await reference.innerText(), /読取拒否/);
        await reference.getByLabel(`${title}のECU・項目を検索`).fill('JH4KA8260MC000001');
        assert.equal(await reference.locator('[data-reference-search-row]:visible').count(), 0);
        assert.equal((await reference.innerText()).includes('JH4KA8260MC000001'), false);
        assert.match(await reference.locator('[data-reference-search-count]').innerText(), /未対応・正常を意味しません/);
        await reference.getByRole('button', { name: `${title}の検索を解除`, exact: true }).click();
        assert.ok(await reference.locator('[data-reference-search-row]:visible').count() >= 2);
        for (const dark of [false, true]) {
          await page.evaluate(dark => document.body.classList.toggle('dark', dark), dark);
          await reference.evaluate(node => window.scrollTo({ top: window.scrollY + node.getBoundingClientRect().top - 230, behavior: 'instant' }));
          assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
          await page.screenshot({ animations: 'disabled', path: path.join(output, `${id}-${width}-${dark ? 'dark' : 'light'}.png`) });
        }
      }
    }
    assert.equal(await page.evaluate(() => JSON.stringify(obdDevSession.lastSession)), original);
    console.log('ECU/PID search passed: masked display-only indexing, ECU/query intersection, metadata retained, reset, mobile/desktop themes, unchanged session.');
    const failed = model.buildDiagnosticScanSession({
      readinessSnapshot: { source_ecu: '7EA', readiness_readout_status: 'blocked', error_codes: ['transport:timeout'], monitors: [] },
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
    await page.getByRole('button', { name: '基本読取結果へ戻る', exact: true }).click();
    await page.getByRole('button', { name: 'レディネスの詳細を開く', exact: true }).click();
    const failedReadiness = page.locator('#obdSessionDetailReadiness');
    const disposition = failedReadiness.locator('[data-readiness-disposition]');
    await disposition.waitFor({ state: 'visible' });
    assert.match(await disposition.innerText(), /7EA: 読取拒否/);
    assert.match(await disposition.innerText(), /通信タイムアウト/);
    const failureSearch = failedReadiness.locator('[data-readiness-search]');
    if (await failureSearch.isVisible()) {
      await failureSearch.fill('no-matching-monitor');
      await failedReadiness.locator('[data-readiness-filter]').selectOption('complete');
      assert.match(await disposition.innerText(), /7EA: 読取拒否/);
      assert.match(await disposition.innerText(), /通信タイムアウト/);
      assert.equal(await failedReadiness.locator('[data-readiness-state]:visible').count(), 0);
    }
    for (const width of [390, 1280]) {
      await page.setViewportSize({ width, height: 844 });
      for (const dark of [false, true]) {
        await page.evaluate(dark => document.body.classList.toggle('dark', dark), dark);
        await failedReadiness.evaluate(node => window.scrollTo({ top: window.scrollY + node.getBoundingClientRect().top - 230, behavior: 'instant' }));
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
        await page.screenshot({ animations: 'disabled', path: path.join(output, `readiness-failure-${width}-${dark ? 'dark' : 'light'}.png`) });
      }
    }
    console.log('Readiness failure passed: JSON import, rejected ECU and timeout retained during filtering, no complete evidence fabricated, mobile/desktop themes.');
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

    await page.getByRole('button', { name: '基本読取結果へ戻る', exact: true }).click();
    const temperature = model.buildDecodedObdScanSession({ live_pid_response: { raw: '41 67 03 28 7D', source_ecu: '7E8' }, freeze_frame_response: { raw: '42 68 02 3F 00 28 41 42 7D FF', source_ecu: '7E9' } });
    const tempPicker = page.waitForEvent('filechooser');
    page.once('dialog', dialog => dialog.accept());
    await page.getByRole('button', { name: '読取結果ファイルを開く', exact: true }).click();
    await (await tempPicker).setFiles({ name: 'temperature-raw.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(model.buildBridgeSessionExportPayload(temperature))) });
    await page.waitForFunction(() => obdDevSession.lastSession?.livePidSnapshot?.monitorValues?.[0]?.pid === '67');
    const tempBefore = await page.evaluate(() => JSON.stringify(obdDevSession.lastSession));
    await page.getByRole('button', { name: '基本読取結果へ戻る', exact: true }).click();
    for (const width of [390, 1280]) {
      await page.setViewportSize({ width, height: 844 });
      for (const [button, selector, snippets] of [
        ['ライブデータの詳細を開く', '#obdMonitorGrid', ['RAW 03 28 7D', '冷却水温1: 0 °C', '冷却水温2: 85 °C', '7E8']],
        ['フリーズフレームの詳細を開く', '#obdSessionDetailFreezeFrame', ['RAW 3F 00 28 41 42 7D FF', '吸気温 B1 S1: -40 °C', '吸気温 B2 S3: 215 °C', '7E9', 'FF #2']]
      ]) {
        await page.getByRole('button', { name: button, exact: true }).click();
        const detail = page.locator(selector);
        await detail.waitFor({ state: 'visible' });
        for (const text of snippets) assert.ok((await detail.innerText()).includes(text), text);
        assert.ok(!(await detail.innerText()).includes(snippets[0] + ' °C'), 'RAW bytes must not be labeled as a temperature');
        for (const dark of [false, true]) {
          await page.evaluate(dark => document.body.classList.toggle('dark', dark), dark);
          assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
          await detail.screenshot({ path: path.join(output, 'temperature-' + selector.slice(1) + '-' + width + '-' + dark + '.png') });
        }
        await page.getByRole('button', { name: '基本読取結果へ戻る', exact: true }).click();
      }
    }
    assert.equal(await page.evaluate(() => JSON.stringify(obdDevSession.lastSession)), tempBefore);
    const exportData = await page.evaluate(() => JSON.stringify(window.ObdReadOnly.buildBridgeSessionExportPayload(obdDevSession.lastSession)));
    const tempRestored = model.buildDiagnosticScanSessionFromJson(exportData);
    assert.equal(tempRestored.livePidSnapshot.monitorValues.length, 1);
    assert.equal(tempRestored.freezeFrameSnapshot.monitorValues.length, 1);
    assert.equal(tempRestored.livePidSnapshot.monitorValues[0].decoded, false);
    assert.equal(tempRestored.freezeFrameSnapshot.monitorValues[0].value, '3F 00 28 41 42 7D FF');
    assert.deepEqual(errors, []); assert.deepEqual(blocked, []);
    console.log('Temperature view: actual RAW JSON import, live/FF navigation, 390/1280 themes, original session and RAW export preserved.');

    const egrRaw = model.decodeLivePidResponse({ raw: '41 69 3F 80 41 0D 28 00 80', source_ecu: '7E8' }).monitorValues[0];
    const egrValues = [egrRaw, { id: 'commanded_egr_pid69', pid: '69', value: 0, source_ecu: '7E8' }, { id: 'egr_error_pid69', pid: '69', value: 12.5, source_ecu: '7E8' }];
    const egrSession = model.buildDiagnosticScanSession({ livePidSnapshot: model.normalizeBridgeLivePidSnapshot({ values: egrValues }), freezeFrameSnapshot: model.normalizeFreezeFrameSnapshot({ values: egrValues.map(row => ({ ...row, freeze_frame_number: 2 })) }) });
    const egrPicker = page.waitForEvent('filechooser');
    page.once('dialog', dialog => dialog.accept());
    await page.getByRole('button', { name: '読取結果ファイルを開く', exact: true }).click();
    await (await egrPicker).setFiles({ name: 'pid69-raw-and-legacy.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(model.buildBridgeSessionExportPayload(egrSession))) });
    await page.waitForFunction(() => obdDevSession.lastSession?.livePidSnapshot?.monitorValues?.[0]?.id === 'egr_system_pid69_raw');
    const egrBefore = await page.evaluate(() => JSON.stringify(obdDevSession.lastSession));
    await page.getByRole('button', { name: '基本読取結果へ戻る', exact: true }).click();
    for (const width of [390, 1280]) {
      await page.setViewportSize({ width, height: 844 });
      for (const [button, selector] of [['ライブデータの詳細を開く', '#obdMonitorGrid'], ['フリーズフレームの詳細を開く', '#obdSessionDetailFreezeFrame']]) {
        await page.getByRole('button', { name: button, exact: true }).click();
        const detail=page.locator(selector); await detail.waitFor({state:'visible'});
        const text=await detail.innerText();
        for(const expected of ['EGRシステム応答 PID69', '3F 80 41 0D 28 00 80', '0 %', '12.5 %', '旧PID69数値', '7E8']) assert.ok(text.includes(expected), expected);
        assert.equal((text.match(/旧PID69数値/g)||[]).length,2);
        assert.ok(!text.includes('24.706'));
        for(const dark of [false,true]) {
          await page.evaluate(dark=>document.body.classList.toggle('dark',dark),dark);
          assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);
          await detail.screenshot({path:path.join(output,'pid69-'+selector.slice(1)+'-'+width+'-'+dark+'.png')});
        }
        await page.getByRole('button',{name:'基本読取結果へ戻る',exact:true}).click();
      }
    }
    assert.equal(await page.evaluate(()=>JSON.stringify(obdDevSession.lastSession)),egrBefore);
    const egrArchive=await page.evaluate(()=>JSON.stringify(window.ObdReadOnly.buildBridgeSessionExportPayload(obdDevSession.lastSession)));
    const egrRestored=model.buildDiagnosticScanSessionFromJson(egrArchive);
    assert.equal(egrRestored.livePidSnapshot.monitorValues.length,3);
    assert.equal(egrRestored.livePidSnapshot.monitorValues[0].decoded,false);
    assert.equal(egrRestored.livePidSnapshot.monitorValues.find(row=>row.id==='egr_error_pid69').value,12.5);
    assert.deepEqual(errors,[]);assert.deepEqual(blocked,[]);
    console.log('PID69 browser: full RAW, legacy zero and numeric review notes, live/FF, unchanged archives, mobile/desktop themes.');
    for (const [pid, rawId, legacyId, label, value] of [
      ['6A', 'intake_air_flow_pid6a_raw', 'commanded_diesel_intake_air_flow', '吸気流量制御応答 PID6A', 0],
      ['6C', 'throttle_control_pid6c_raw', 'commanded_throttle_control', 'スロットル制御応答 PID6C', 12.5]
    ]) {
    const egrRaw = model.decodeLivePidResponse({ raw: `41 ${pid} 0F 80 41 0D 28`, source_ecu: '7E8' }).monitorValues[0];
    const egrValues = [egrRaw, { id: legacyId, pid, value, source_ecu: '7E8' }];
    const egrSession = model.buildDiagnosticScanSession({ livePidSnapshot: model.normalizeBridgeLivePidSnapshot({ values: egrValues }), freezeFrameSnapshot: model.normalizeFreezeFrameSnapshot({ values: egrValues.map(row => ({ ...row, freeze_frame_number: 2 })) }) });
    const egrPicker = page.waitForEvent('filechooser');
    page.once('dialog', dialog => dialog.accept());
    await page.getByRole('button', { name: '読取結果ファイルを開く', exact: true }).click();
    await (await egrPicker).setFiles({ name: 'intake-raw-and-legacy.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(model.buildBridgeSessionExportPayload(egrSession))) });
    await page.waitForFunction(id => obdDevSession.lastSession?.livePidSnapshot?.monitorValues?.[0]?.id === id, rawId);
    const egrBefore = await page.evaluate(() => JSON.stringify(obdDevSession.lastSession));
    await page.getByRole('button', { name: '基本読取結果へ戻る', exact: true }).click();
    for (const width of [390, 1280]) {
      await page.setViewportSize({ width, height: 844 });
      for (const [button, selector] of [['ライブデータの詳細を開く', '#obdMonitorGrid'], ['フリーズフレームの詳細を開く', '#obdSessionDetailFreezeFrame']]) {
        await page.getByRole('button', { name: button, exact: true }).click();
        const detail=page.locator(selector); await detail.waitFor({state:'visible'});
        const text=await detail.innerText();
        for(const expected of [label, '0F 80 41 0D 28', value + ' %', '旧PID' + pid + '数値', '7E8']) assert.ok(text.includes(expected), expected);
        assert.equal((text.match(new RegExp('旧PID' + pid + '数値','g'))||[]).length,1);
        assert.ok(!text.includes('0F 80 41 0D 28 %'));
        if(selector.includes('FreezeFrame')) assert.ok(text.includes('FF #2'));
        assert.ok(!text.includes('5.882'));
        for(const dark of [false,true]) {
          await page.evaluate(dark=>document.body.classList.toggle('dark',dark),dark);
          assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);
          await detail.screenshot({path:path.join(output,'pid'+pid+'-'+selector.slice(1)+'-'+width+'-'+dark+'.png')});
        }
        await page.getByRole('button',{name:'基本読取結果へ戻る',exact:true}).click();
      }
    }
    assert.equal(await page.evaluate(()=>JSON.stringify(obdDevSession.lastSession)),egrBefore);
    const egrArchive=await page.evaluate(()=>JSON.stringify(window.ObdReadOnly.buildBridgeSessionExportPayload(obdDevSession.lastSession)));
    const egrRestored=model.buildDiagnosticScanSessionFromJson(egrArchive);
    assert.equal(egrRestored.livePidSnapshot.monitorValues.length,2);
    assert.equal(egrRestored.livePidSnapshot.monitorValues[0].decoded,false);
    assert.equal(egrRestored.livePidSnapshot.monitorValues.find(row=>row.id===legacyId).value,value);
    assert.deepEqual(errors,[]);assert.deepEqual(blocked,[]);
    console.log('PID'+pid+' browser: full RAW, legacy note, unchanged archives and responsive views passed.');
    }
    const compoundPayloads = [['6B', '0F 41 0D 28 42'], ['6D', '3F 41 0D 28 42 0D 02 28 41 42 00'], ['6E', '0F 41 0D 28 42 0D 02 28 00'], ['6F', '03 41 42'], ['70', '3F 41 0D 28 42 0D 02 28 00 00'], ['71', '3F 41 0D 28 42 00'], ['72', '0F 41 0D 28 42'], ['73', '03 41 0D 28 42'], ['74', '03 41 0D 28 42'], ['75', '0F 41 0D 28 42 00 00'], ['77', '0F 41 0D 28 42'], ['78', '0F 41 0D 28 42 0D 02 28 00'], ['79', '0F 42 0D 02 28 41 0D 28 00'], ['7A', '07 41 0D 28 42 00 00'], ['7C', '0F 41 0D 28 42 0D 02 28 00'], ['7F', '07 41 0D 28 42 0D 02 28 00 00 41 42 00'], ['83', '0F 41 0D 28 42 0D 02 28 00'], ['86', '03 41 0D 28 42'], ['87', '03 41 0D 28 42'], ['89', '1F 41 0D 28 42 0D 02 28 ' + Array(33).fill('00').join(' ')], ['8F', '0F 41 0D 28 42 00 00']];
    const legacyText = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/text-pid-legacy-3.13.651.json'), 'utf8'));
    const legacyPayloads = legacyText.live_pid_snapshot.monitor_values.map(row => [row.pid, row.value]);
    for (const [kind, payloads] of [['raw', compoundPayloads], ['status', [["65","03 41"],["66","03 41 0D 28 42"],["7B","03 41 0D 28 42 0D 02"],["7D","03"],["7E","03"],["85","03 41 0D 28 42 0D 02 28 03 41"],["88","03 41 0D 28 42 0D 02 28 03 41 0D 28 42"],["8B","03 41 0D 28 42 0D 02"],["91","03 41 0D 28 42"]]], ['legacy', legacyPayloads]]) {
      const compound = kind === 'legacy' ? model.buildDiagnosticScanSessionFromJson(JSON.stringify(legacyText)) : model.buildDecodedObdScanSession({
        live_pid_response: { raw: payloads.map(([pid, raw]) => '41 ' + pid + ' ' + raw).join(' '), source_ecu: '7E8' },
        freeze_frame_response: { raw: payloads.map(([pid, raw]) => '42 ' + pid + ' 02 ' + raw).join(' '), source_ecu: '7E8' }
      });
      const compoundPicker = page.waitForEvent('filechooser');
      page.once('dialog', dialog => dialog.accept());
      await page.getByRole('button', { name: '読取結果ファイルを開く', exact: true }).click();
      await (await compoundPicker).setFiles({ name: 'compound-' + kind + '.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(model.buildBridgeSessionExportPayload(compound))) });
      await page.waitForFunction(pid => obdDevSession.lastSession?.livePidSnapshot?.monitorValues?.[0]?.pid === pid, payloads[0][0]);
      const compoundBefore = await page.evaluate(() => JSON.stringify(obdDevSession.lastSession));
      await page.getByRole('button', { name: '基本読取結果へ戻る', exact: true }).click();
      for (const width of [390, 1280]) {
        await page.setViewportSize({ width, height: 844 });
        for (const [button, selector] of [['ライブデータの詳細を開く', '#obdMonitorGrid'], ['フリーズフレームの詳細を開く', '#obdSessionDetailFreezeFrame']]) {
          await page.getByRole('button', { name: button, exact: true }).click();
          const detail = page.locator(selector); await detail.waitFor({ state: 'visible' });
          const text = await detail.innerText();
          for (const [, raw] of payloads) {
            assert.ok(text.includes((kind !== 'legacy' ? 'RAW ' : '') + raw), raw);
            assert.ok(!text.includes(raw + ' °C') && !text.includes(raw + ' kPa') && !text.includes(raw + ' %') && !text.includes(raw + ' rpm') && !text.includes(raw + ' s') && !text.includes(raw + ' ppm'), 'RAW must not display a physical unit');
          }
          if (kind !== 'legacy') assert.ok(text.includes('未換算'));
          if (selector.includes('FreezeFrame')) {
            assert.ok(text.includes((kind === 'legacy' ? '変換済み' : '未変換') + payloads.length), 'classification summary');
          }
          assert.ok(!text.includes('車速'));
          assert.ok(text.includes('7E8'));
          if (selector.includes('FreezeFrame')) assert.ok(text.includes('FF #2'));
          for (const dark of [false, true]) {
            await page.evaluate(dark => document.body.classList.toggle('dark', dark), dark);
            assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
            await detail.screenshot({ path: path.join(output, 'compound-' + kind + '-' + selector.slice(1) + '-' + width + '-' + dark + '.png') });
          }
          await page.getByRole('button', { name: '基本読取結果へ戻る', exact: true }).click();
        }
      }
      assert.equal(await page.evaluate(() => JSON.stringify(obdDevSession.lastSession)), compoundBefore);
      const compoundArchive = await page.evaluate(() => JSON.stringify(window.ObdReadOnly.buildBridgeSessionExportPayload(obdDevSession.lastSession)));
      const compoundRestored = model.buildDiagnosticScanSessionFromJson(compoundArchive);
      for (const snapshot of [compoundRestored.livePidSnapshot, compoundRestored.freezeFrameSnapshot]) {
        assert.equal(snapshot.monitorValues.length, payloads.length);
        for (const [pid, raw] of payloads) assert.ok(snapshot.monitorValues.some(row => row.pid === pid && row.value === raw && row.decoded === (kind === 'legacy')));
      }
      assert.deepEqual(errors, []); assert.deepEqual(blocked, []);
      console.log('Compound ' + kind + ' browser: ' + payloads.length + ' PIDs, complete live/FF bytes, RAW or preserved legacy classification, no invented speed, responsive themes and archives passed.');
    }
    console.log(`Readiness review browser passed: actual JSON-file import, ECU/state search, reset, navigation, 390/1280 light/dark, unchanged session, zero external/vehicle requests. Artifacts: ${output}`);
  } catch (error) {
    if (page) { await page.screenshot({ path: path.join(output, 'failure.png') }); console.error('Screenshot:', path.join(output, 'failure.png'), 'Page errors:', errors); console.error('Freeze card:', await page.locator('#obdSessionDetailFreezeFrame').allTextContents()); }
    throw error;
  } finally { await context.close(); await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
