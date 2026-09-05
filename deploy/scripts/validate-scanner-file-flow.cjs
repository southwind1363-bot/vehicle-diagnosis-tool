const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

(async () => {
  const root = path.resolve(__dirname, '..');
  const output = fs.mkdtempSync(path.join(os.tmpdir(), 'obd-file-flow-'));
  const restart = process.argv.includes('--restart');
  const denseLive = process.argv.includes('--dense-live');
  const live = denseLive || process.argv.includes('--live');
  const serverStopOnly = process.argv.includes('--server-stop-only');
  const offline = restart || process.argv.includes('--offline');
  const profile = path.join(output, 'browser-profile');
  const channel = process.env.PLAYWRIGHT_CHANNEL || 'chrome';
  const persistentOptions = { channel, headless: true, downloadsPath: path.join(output, 'downloads') };
  const contextOptions = { viewport: { width: 1280, height: 900 }, serviceWorkers: offline ? 'allow' : 'block', acceptDownloads: true };
  let browser, context, server;
  let origin = 'http://127.0.0.1';
  const asset = pathname => {
    const file = path.resolve(root, '.' + decodeURIComponent(pathname === '/' ? '/index.html' : pathname));
    const relative = path.relative(root, file);
    if (relative.startsWith('..') || path.isAbsolute(relative) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return null;
    const type = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml' }[path.extname(file)] || 'application/octet-stream';
    return { file, type };
  };
  const errors = [], blocked = [];
  const pendingRequests = new Map();
  try {
    if (offline) {
      server = http.createServer((request, response) => {
        try {
          const entry = request.method === 'GET' ? asset(new URL(request.url, origin).pathname) : null;
          if (!entry) { response.writeHead(404).end(); return; }
          response.writeHead(200, { 'Content-Type': entry.type });
          response.end(fs.readFileSync(entry.file));
        } catch (_) { response.writeHead(400).end(); }
      });
      await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
      origin += ':' + server.address().port;
    }
    if (restart) context = await chromium.launchPersistentContext(profile, { ...contextOptions, ...persistentOptions });
    else {
      browser = await chromium.launch({ channel, headless: true });
      context = await browser.newContext(contextOptions);
    }
    const configureContext = async () => {
      context.on('request', request => pendingRequests.set(request, request.url()));
      context.on('requestfinished', request => pendingRequests.delete(request));
      context.on('requestfailed', request => pendingRequests.delete(request));
      // Fresh, pre-unlocked fixture only; no user profile, password, or vehicle access.
      await context.addInitScript(() => {
        localStorage.setItem('vehicle-diagnosis-notice-accepted-v1', 'accepted');
        sessionStorage.setItem('vehicle-diagnosis-obd-access-v1', 'enabled');
        Object.defineProperty(navigator, 'serial', { value: undefined });
        Object.defineProperty(navigator, 'bluetooth', { value: undefined });
      });
      await context.route(offline ? url => url.origin !== origin : '**/*', async route => {
        const url = new URL(route.request().url());
        if (url.origin !== origin || route.request().method() !== 'GET') {
          blocked.push(route.request().url());
          return route.abort();
        }
        if (offline) return route.continue();
        const entry = asset(url.pathname);
        if (!entry) return route.fulfill({ status: 404, body: '' });
        await route.fulfill({ contentType: entry.type, body: fs.readFileSync(entry.file) });
      });
    };
    await configureContext();
    let page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    page.setDefaultTimeout(20000);
    await page.goto(origin + '/');
    await page.getByText('登録済み整備データを読み込みました。', { exact: false }).waitFor();
    await page.getByRole('button', { name: '7. OBD2車両読取', exact: true }).click();
    await page.locator('#obdHomeView [data-obd-ui-mode="details"]').click();
    const reference = page.locator('#obdDevelopmentReference');
    assert.equal(await reference.evaluate(node => node.open), false);
    await reference.locator(':scope > summary').click();
    const referenceTopics = reference.locator(':scope > details');
    assert.equal(await referenceTopics.count(), 6);
    for (let i = 0; i < 6; i += 1) {
      const topic = referenceTopics.nth(i);
      await topic.locator(':scope > summary').click();
      assert.equal(await reference.locator('details[open]').count(), 1);
      const content = await topic.evaluate(node => [...node.children].slice(1).map(child => child.textContent.trim()));
      assert.ok(content.length && content.every(text => text.length > 0), 'Application must populate each reference target');
    }
    await reference.screenshot({ path: path.join(output, 'development-reference.png') });
    await page.locator('#obdUiModeSwitch [data-obd-ui-mode="simple"]').click();
    assert.equal(await reference.isVisible(), false, 'Development reference must not leak into normal diagnosis');
    const openFile = async (button, file) => {
      const picker = page.waitForEvent('filechooser');
      await button.click();
      await (await picker).setFiles(file);
      await page.waitForFunction(() => document.getElementById('obdImportFileInput').value === '');
    };
    await openFile(page.getByRole('button', { name: '保存した読取結果を開く', exact: true }), path.join(__dirname, 'fixtures/native-elm327-scan-archive.json'));
    await page.locator('#obdDetectedCodes').getByText('P0300', { exact: false }).first().waitFor();
    assert.match(await page.locator('#obdDetectedCodes').innerText(), /P0420/);
    await page.getByRole('button', { name: '基本読取結果へ戻る', exact: true }).click();
    const pendingDownload = page.waitForEvent('download');
    await page.locator('#obdStageResultsView [data-obd-session-export]').click();
    const download = await pendingDownload;
    const exported = path.join(output, 'roundtrip.json');
    await download.saveAs(exported);
    const json = JSON.parse(fs.readFileSync(exported, 'utf8'));
    assert.ok(JSON.stringify(json).includes('P0300') && JSON.stringify(json).includes('P0420'));
    if (offline) {
      const manifest = JSON.parse(fs.readFileSync(path.join(root, 'offline-assets.json'), 'utf8'));
      await page.waitForFunction(async manifest => {
        if (!navigator.serviceWorker.controller) return false;
        const name = 'vehicle-diagnosis-tool-' + manifest.version;
        if (!(await caches.has(name))) return false;
        const cache = await caches.open(name);
        const keys = new Set((await cache.keys()).map(request => request.url));
        return ['/', '/index.html', '/offline-assets.json', ...manifest.assets].every(url => keys.has(new URL(url, location.href).href));
      }, manifest, { timeout: 60000 });
      if (!serverStopOnly) await context.setOffline(true);
      await new Promise(resolve => server.close(resolve));
      server = null;
      console.log(`Offline phase: cache ready, network emulation ${serverStopOnly ? 'unchanged' : 'disabled'}, fixture server stopped`);
    }
    // Start from an empty document so stale result nodes cannot mask failed import.
    if (restart) {
      await context.close();
      assert.equal(page.isClosed(), true);
      context = await chromium.launchPersistentContext(profile, { ...contextOptions, ...persistentOptions });
      if (!serverStopOnly) await context.setOffline(true);
      await configureContext();
      page = await context.newPage();
      page.on('pageerror', error => errors.push(error.message));
      page.setDefaultTimeout(20000);
      console.log('Restart phase: persistent browser closed and relaunched, fixture server remains stopped');
    }
    const startupTime = Date.now();
    const reloaded = restart ? await page.goto(origin + '/') : await page.reload();
    await page.getByText('登録済み整備データを読み込みました。', { exact: false }).waitFor({ timeout: 45000 });
    console.log(`Reload data ready: ${Date.now() - startupTime} ms`);
    if (offline) {
      assert.equal(reloaded.fromServiceWorker(), true, 'Reload must be served by the offline worker');
      const networkAvailable = await page.evaluate(async () => {
        try { await fetch('/uncached-offline-probe', { signal: AbortSignal.timeout(2000) }); return true; }
        catch (_) { return false; }
      });
      assert.equal(networkAvailable, false, 'Uncached network input must be unavailable');
    }
    await page.getByRole('button', { name: '7. OBD2車両読取', exact: true }).click();
    await page.getByRole('button', { name: '読取結果を開く', exact: true }).click();
    assert.equal(await page.locator('#obdResultsEmptyState').isVisible(), true);
    assert.equal(await page.locator('#obdDetectedCodes').innerText(), '');
    await openFile(page.getByRole('button', { name: '読取結果ファイルを開く', exact: true }), exported);
    await page.locator('#obdDetectedCodes').getByText('P0300', { exact: false }).first().waitFor();
    const before = await page.locator('#obdDetectedCodes').innerText();
    assert.match(before, /P0420/);
    await page.getByRole('button', { name: '基本読取結果へ戻る', exact: true }).click();
    for (const width of [1280, 390]) {
      await page.setViewportSize({ width, height: 900 });
      const resultNav = page.locator('.obd-results-nav');
      await page.getByRole('button', { name: 'ライブデータの詳細を開く', exact: true }).click();
      assert.equal(await page.locator('#obdMonitorStatus').isVisible(), true);
      assert.equal(await page.locator('#obdMonitorGrid').locator(':scope > *').count(), 0, 'DTC-only archive must not invent live values');
      await resultNav.getByRole('button', { name: '追加データ', exact: true }).click();
      const detailButtons = page.locator('#obdReadoutDetailMenu [data-obd-detail-target]');
      for (let index = 1; index < await detailButtons.count(); index += 1) {
        const button = detailButtons.nth(index);
        const target = await button.getAttribute('data-obd-detail-target');
        await button.click();
        assert.equal(await button.getAttribute('aria-pressed'), 'true');
        const selection = await page.locator('#obdDevSessionDetails').evaluate((node, target) => {
          const visible = [...node.children].filter(child => child.getBoundingClientRect().height > 0).map(child => child.id);
          return { exists: [...node.children].some(child => child.id === target), visible };
        }, target);
        assert.deepEqual(selection.visible, selection.exists ? [target] : [], 'Only selected additional data may be visible');
        assert.equal(await page.locator('#obdReadoutDetailEmpty').isVisible(), !selection.exists);
      }
      await page.screenshot({ path: path.join(output, `additional-data-${width}.png`) });
      await resultNav.getByRole('button', { name: 'DTC一覧', exact: true }).click();
      assert.equal(await page.locator('#obdDetectedCodes').innerText(), before, 'Detail navigation must retain the DTC result');
      await page.locator('#obdDtcSearch').fill('P0420');
      assert.equal(await page.locator('#obdDetectedCodes').getByText('P0300', { exact: false }).first().isVisible(), false);
      await resultNav.getByRole('button', { name: 'ライブ値', exact: true }).click();
      await resultNav.getByRole('button', { name: 'DTC一覧', exact: true }).click();
      assert.equal(await page.locator('#obdDtcSearch').inputValue(), 'P0420');
      assert.equal(await page.locator('#obdDetectedCodes').getByText('P0300', { exact: false }).first().isVisible(), false);
      assert.equal(await page.locator('#obdDetectedCodes').getByText('P0420', { exact: false }).first().isVisible(), true);
      await page.getByRole('button', { name: 'DTC検索を解除', exact: true }).click();
      assert.equal(await page.locator('#obdDetectedCodes').innerText(), before);
      await page.getByRole('button', { name: '前の診断画面へ戻る', exact: true }).click();
      assert.equal(await page.locator('#obdSimpleResultSummary').isVisible(), true);
    }
    await openFile(page.getByRole('button', { name: '読取結果ファイルを開く', exact: true }), { name: 'broken.json', mimeType: 'application/json', buffer: Buffer.from('{') });
    await page.locator('#obdImportStatus').filter({ hasText: 'JSONの構文を読み取れません' }).waitFor();
    assert.equal(await page.locator('#obdImportStatus').isVisible(), true);
    assert.equal(await page.locator('#obdDetectedCodes').innerText(), before);
    await page.screenshot({ path: path.join(output, 'invalid-file-retained.png'), fullPage: false });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator('#obdImportStatus').scrollIntoViewIfNeeded();
    assert.equal(await page.locator('#obdImportStatus').isVisible(), true);
    await page.screenshot({ path: path.join(output, 'invalid-file-mobile.png'), fullPage: false });
    await page.getByRole('button', { name: '前の診断画面へ戻る', exact: true }).click();
    assert.equal(await page.locator('#obdSimpleResultSummary').isVisible(), true);
    assert.deepEqual(errors, []);
    if (live) {
    // Synthetic values using the existing combined-readout import contract.
    const measured = {
      pid_values: [{ pid: '0C', value: 1000, unit: 'rpm' }, { pid: '05', value: 85, unit: 'C' }],
      live_pid_samples: [
        { captured_at: '2026-07-17T00:00:00Z', monitor_values: [{ pid: '0C', value: 800, unit: 'rpm' }] },
        { captured_at: '2026-07-17T00:00:05Z', monitor_values: [{ pid: '0C', value: 1000, unit: 'rpm' }] }
      ]
    };
    if (denseLive) measured.live_pid_samples = Array.from({ length: 60 }, (_, index) => ({
      captured_at: new Date(Date.parse('2026-07-17T00:00:00Z') + index * 1000).toISOString(),
      monitor_values: [{ pid: '0C', value: Math.round(800 + index * 200 / 59), unit: 'rpm' }]
    }));
    const expectedPoints = measured.live_pid_samples.length;
    const core = vm.createContext({ window: {} });
    vm.runInContext(fs.readFileSync(path.join(root, 'obd-readonly.js'), 'utf8'), core);
    const model = core.window.ObdReadOnly;
    const measuredSession = model.buildDiagnosticScanSessionFromJson(JSON.stringify(measured));
    assert.equal(measuredSession.livePidTimeline.sampleCount, expectedPoints);
    assert.equal(measuredSession.livePidSnapshot.monitorValues.length, 2);
    const measuredExport = model.buildBridgeSessionExportPayload(measuredSession);
    const openReplacement = async file => {
      const replacementDialog = page.waitForEvent('dialog');
      const replacing = openFile(page.getByRole('button', { name: '読取結果ファイルを開く', exact: true }), file);
      const confirmation = await replacementDialog;
      assert.equal(confirmation.type(), 'confirm');
      assert.match(confirmation.message(), /^現在の読取結果を新しい入力で置き換えますか？/);
      await confirmation.accept();
      await replacing;
    };
    await openReplacement({ name: 'synthetic-live.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(measuredExport)) });
    const showTimeline = async () => {
      await page.locator('.obd-results-nav').getByRole('button', { name: '追加データ', exact: true }).click();
      await page.locator('#obdReadoutDetailMenu').getByRole('button', { name: 'ライブ推移', exact: true }).click();
      const chart = page.locator('#obdSessionDetailLiveTimeline');
      assert.equal(await chart.isVisible(), true);
      assert.equal(await chart.locator('.obd-timeline-chart-bar').count(), expectedPoints);
      assert.match(await chart.innerText(), /最小 800 rpm.*最大 1000 rpm.*最新 1000 rpm/);
      assert.equal(await chart.locator('.obd-timeline-chart-bar').evaluateAll(nodes => nodes.every(node => node.getBoundingClientRect().height > 0)), true);
      const slider = chart.locator('input[type="range"]');
      const chosen = chart.locator('.obd-timeline-selected-value');
      assert.equal(await slider.inputValue(), String(expectedPoints - 1));
      assert.match(await chosen.innerText(), /1000 rpm/);
      await slider.press('Home');
      assert.equal(await slider.inputValue(), '0');
      assert.match(await chosen.innerText(), /1 \/ .*:00\.000.*800 rpm/);
      assert.equal(await chart.locator('.obd-timeline-chart-bar.is-selected').count(), 1);
      assert.equal(await chart.locator('.obd-timeline-chart-bar').first().evaluate(node => node.classList.contains('is-selected')), true);
      await slider.press('ArrowRight');
      assert.equal(await slider.inputValue(), '1');
      assert.equal(await slider.getAttribute('aria-valuetext'), await chosen.innerText());
      await slider.press('End');
      assert.equal(await slider.inputValue(), String(expectedPoints - 1));
      assert.match(await chosen.innerText(), /1000 rpm/);
      assert.equal(await chart.locator('.obd-timeline-chart-bar').last().evaluate(node => node.classList.contains('is-selected')), true);
      assert.equal(await slider.evaluate(node => node.getBoundingClientRect().height >= 48 && node.scrollWidth <= node.clientWidth + 1), true);
      const records = chart.locator('.obd-timeline-records');
      const toggle = records.locator('summary');
      assert.equal(await records.locator('ol').isVisible(), false);
      await toggle.click();
      const rows = records.locator('li');
      assert.equal(await rows.count(), expectedPoints);
      assert.match(await rows.first().innerText(), /:00\.000.*800 rpm/s);
      assert.match(await rows.last().innerText(), /1000 rpm/);
      const viewport = page.viewportSize();
      for (const width of [320, 768]) {
        await page.setViewportSize({ width, height: 900 });
        for (const dark of [false, true]) {
          await page.evaluate(value => document.body.classList.toggle('dark', value), dark);
          await slider.click();
          const index = Number(await slider.inputValue());
          const fragments = (await rows.nth(index).innerText()).split('\n');
          const selectedText = await chosen.innerText();
          assert.ok(fragments.every(fragment => selectedText.includes(fragment)), 'Pointer selection must match the recorded time and value');
          assert.equal(await chosen.evaluate(node => node.scrollWidth <= node.clientWidth + 1), true);
          await chart.screenshot({ path: path.join(output, `timeline-position-${width}-${dark ? 'dark' : 'light'}.png`) });
        }
      }
      await page.evaluate(() => document.body.classList.remove('dark'));
      await page.setViewportSize(viewport);
      assert.equal(await records.evaluate(node => node.scrollWidth <= node.clientWidth + 1), true);
      assert.equal(await chart.evaluate(node => node.scrollWidth <= node.clientWidth + 1), true);
      await toggle.press('Enter');
      assert.equal(await records.locator('ol').isVisible(), false);
      await toggle.press('Enter');
      assert.equal(await records.locator('ol').isVisible(), true);
      if (denseLive) {
        await records.locator('ol').focus();
        await records.locator('ol').press('End');
        await page.waitForFunction(() => document.querySelector('.obd-timeline-records ol').scrollTop > 0);
        await records.locator('ol').press('Home');
      }
      const playback = chart.locator('.obd-timeline-playback');
      await slider.press('End');
      await playback.click();
      assert.equal(await slider.inputValue(), '0', 'Replay from end must restart');
      await page.waitForFunction(() => Number(document.querySelector('#obdSessionDetailLiveTimeline input[type="range"]').value) > 0, null, { timeout: 8000 });
      if ((await playback.getAttribute('aria-label')).endsWith('記録を一時停止')) await playback.click();
      const pausedPosition = await slider.inputValue();
      await page.waitForTimeout(150);
      assert.equal(await slider.inputValue(), pausedPosition);
      await playback.click();
      await page.locator('.obd-results-nav').getByRole('button', { name: 'ライブ値', exact: true }).click();
      assert.match(await playback.getAttribute('aria-label'), /記録を再生$/);
      const departedPosition = await slider.inputValue();
      await page.waitForTimeout(150);
      assert.equal(await slider.inputValue(), departedPosition);
      await page.locator('.obd-results-nav').getByRole('button', { name: '追加データ', exact: true }).click();
      await page.locator('#obdReadoutDetailMenu').getByRole('button', { name: 'ライブ推移', exact: true }).click();
      await playback.click();
      await page.locator('#obdReadoutDetails').evaluate(node => { node.open = false; });
      await page.waitForFunction(() => document.querySelector('.obd-timeline-playback').getAttribute('aria-label').endsWith('記録を再生'));
      await page.locator('#obdReadoutDetails').evaluate(node => { node.open = true; });
      assert.match(await playback.getAttribute('aria-label'), /記録を再生$/);
    };
    await page.locator('.obd-results-nav').getByRole('button', { name: 'ライブ値', exact: true }).click();
    assert.match(await page.locator('#obdMonitorGrid').innerText(), /1000/);
    const compact = page.locator('#obdMonitorCompact');
    const readings = page.locator('#obdMonitorGrid > article');
    const originalReadings = await readings.allTextContents();
    assert.equal(await compact.isChecked(), false);
    for (const width of [320, 390, 768, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      for (const dark of [false, true]) {
        await page.evaluate(value => document.body.classList.toggle('dark', value), dark);
        await compact.check();
        assert.deepEqual(await readings.allTextContents(), originalReadings, 'List view must preserve values, ECU labels and notes');
        assert.equal(await readings.evaluateAll(nodes => nodes.every(node => getComputedStyle(node).borderRadius === '0px' && node.scrollWidth <= node.clientWidth + 1)), true);
        assert.equal(await readings.locator('.obd-monitor-note:visible').count(), 2);
        const selectionLayout = await page.locator('#obdMonitorFilter input[type="checkbox"], #obdMonitorGrid input[type="checkbox"]').evaluateAll(nodes => nodes.every(node => {
          const box = node.getBoundingClientRect();
          return box.width >= 16 && box.width <= 24 && box.height >= 16 && box.height <= 24 && node.closest('label').getBoundingClientRect().height >= 48;
        }));
        assert.equal(selectionLayout, true, 'Checkbox dimensions must not inherit full-width text-field styles');
        assert.equal(await readings.locator('.obd-monitor-pick > strong').evaluateAll(nodes => nodes.every(node => node.getBoundingClientRect().width >= 60)), true, 'Item names must not collapse into a vertical column');
        await page.locator('#obdMonitorGrid').screenshot({ path: path.join(output, `live-list-${width}-${dark ? 'dark' : 'light'}.png`) });
        await compact.press('Space');
        assert.equal(await compact.isChecked(), false);
        assert.deepEqual(await readings.allTextContents(), originalReadings);
      }
    }
    await page.evaluate(() => document.body.classList.remove('dark'));
    await page.setViewportSize({ width: 390, height: 900 });
    await compact.check();
    const selectedOnly = page.locator('#obdMonitorSelectedOnly');
    const picks = readings.locator('[data-monitor-select]');
    assert.equal(await selectedOnly.isDisabled(), true);
    await picks.nth(0).check();
    await picks.nth(1).check();
    await selectedOnly.check();
    assert.equal(await page.locator('#obdMonitorSelectionCount').innerText(), '選択 2項目');
    assert.equal(await page.locator('#obdMonitorCount').innerText(), '2項目');
    await page.locator('#obdMonitorSearch').fill('rpm');
    assert.equal(await page.locator('#obdMonitorGrid > :visible').count(), 1);
    await showTimeline();
    await page.locator('.obd-results-nav').getByRole('button', { name: 'ライブ値', exact: true }).click();
    assert.equal(await compact.isChecked(), true, 'Returning must retain list view');
    assert.equal(await selectedOnly.isChecked(), true, 'Returning must retain selected-only view');
    assert.equal(await picks.nth(1).isChecked(), true);
    assert.equal(await page.locator('#obdMonitorSearch').inputValue(), 'rpm');
    assert.equal(await page.locator('#obdMonitorGrid > :visible').count(), 1);
    await page.locator('#obdMonitorSearchClear').click();
    assert.equal(await page.locator('#obdMonitorGrid > :visible').count(), 2);
    await picks.nth(1).focus();
    await picks.nth(1).press('Space');
    assert.equal(await page.locator('#obdMonitorGrid > :visible').count(), 1);
    assert.equal(await picks.nth(0).evaluate(node => document.activeElement === node), true, 'Deselecting a hidden row must focus another visible selection');
    await page.keyboard.press('Space');
    assert.equal(await selectedOnly.isChecked(), false, 'Last deselection must restore all values');
    assert.equal(await page.locator('#obdMonitorGrid > :visible').count(), 2);
    await picks.nth(0).check();
    await selectedOnly.check();
    await page.locator('#obdMonitorFilter').screenshot({ path: path.join(output, 'live-selection-toolbar.png') });
    await page.locator('.obd-results-nav').getByRole('button', { name: '追加データ', exact: true }).click();
    await page.locator('#obdReadoutDetailMenu').getByRole('button', { name: 'ライブ推移', exact: true }).click();
    await page.screenshot({ path: path.join(output, 'live-timeline-mobile.png') });
    await page.getByRole('button', { name: '基本読取結果へ戻る', exact: true }).click();
    const liveDownload = page.waitForEvent('download');
    await page.locator('#obdStageResultsView [data-obd-session-export]').click();
    const liveExport = path.join(output, 'live-roundtrip.json');
    await (await liveDownload).saveAs(liveExport);
    await openReplacement(liveExport);
    assert.equal(await selectedOnly.isChecked(), false, 'New readout must reset old selection');
    assert.equal(await picks.count(), 2, 'Saving a selected subset must still retain every acquired value');
    assert.equal(await picks.nth(0).isChecked(), false);
    await showTimeline();
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.screenshot({ path: path.join(output, 'live-timeline-desktop.png') });
    const multiEcu = {
      pid_values: ['7E8', '7E9'].map((source_ecu, i) => ({ pid: '0C', value: 1000 + i * 1000, unit: 'rpm', source_ecu })),
      live_pid_samples: [0, 1].map(step => ({
        captured_at: `2026-07-17T00:00:0${step * 5}Z`,
        monitor_values: ['7E8', '7E9'].map((source_ecu, i) => ({ pid: '0C', value: 800 + step * 200 + i * 1000, unit: 'rpm', source_ecu }))
      }))
    };
    const multiSession = model.buildDiagnosticScanSessionFromJson(JSON.stringify(multiEcu));
    assert.equal(multiSession.livePidSnapshot.monitorValues.length, 2);
    await page.getByRole('button', { name: '基本読取結果へ戻る', exact: true }).click();
    await openReplacement({ name: 'synthetic-multi-ecu.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(model.buildBridgeSessionExportPayload(multiSession))) });
    const verifyEcuRows = async () => {
      await page.locator('.obd-results-nav').getByRole('button', { name: 'ライブ値', exact: true }).click();
      for (const [ecu, value] of [['7E8', '1000 rpm'], ['7E9', '2000 rpm']]) {
        const card = readings.filter({ has: page.locator('.obd-monitor-category', { hasText: `ECU ${ecu}` }) });
        assert.equal(await card.count(), 1);
        assert.equal(await card.locator('.obd-monitor-reading').innerText(), value);
        assert.equal(await card.locator('[data-monitor-select]').isChecked(), false);
      }
      await page.getByRole('checkbox', { name: 'エンジン回転数 / ECU 7E9を選択', exact: true }).check();
      await selectedOnly.check();
      assert.equal(await page.locator('#obdMonitorGrid > :visible').count(), 1);
      assert.match(await page.locator('#obdMonitorGrid > :visible').innerText(), /ECU 7E9/);
      assert.match(await page.locator('#obdMonitorGrid > :visible').innerText(), /2000 rpm/);
      await page.locator('.obd-results-nav').getByRole('button', { name: '追加データ', exact: true }).click();
      await page.locator('#obdReadoutDetailMenu').getByRole('button', { name: 'ライブ推移', exact: true }).click();
      const charts = page.locator('#obdSessionDetailLiveTimeline .obd-timeline-chart-row');
      assert.equal(await charts.count(), 2);
      const first = charts.filter({ has: page.locator('.obd-timeline-chart-label', { hasText: '[7E8]' }) });
      const second = charts.filter({ has: page.locator('.obd-timeline-chart-label', { hasText: '[7E9]' }) });
      assert.match(await first.locator('.obd-timeline-selected-value').innerText(), /1000 rpm/);
      assert.match(await second.locator('.obd-timeline-selected-value').innerText(), /2000 rpm/);
      await first.locator('input[type="range"]').press('Home');
      assert.match(await first.locator('.obd-timeline-selected-value').innerText(), /800 rpm/);
      assert.match(await second.locator('.obd-timeline-selected-value').innerText(), /2000 rpm/);
      await second.locator('input[type="range"]').press('Home');
      assert.match(await second.locator('.obd-timeline-selected-value').innerText(), /1800 rpm/);
      assert.match(await first.locator('.obd-timeline-selected-value').innerText(), /800 rpm/);
    };
    await page.setViewportSize({ width: 390, height: 900 });
    await verifyEcuRows();
    await page.locator('#obdSessionDetailLiveTimeline').screenshot({ path: path.join(output, 'multi-ecu-timeline.png') });
    await page.getByRole('button', { name: '基本読取結果へ戻る', exact: true }).click();
    const multiDownload = page.waitForEvent('download');
    await page.locator('#obdStageResultsView [data-obd-session-export]').click();
    const multiFile = path.join(output, 'multi-ecu-roundtrip.json');
    await (await multiDownload).saveAs(multiFile);
    await openReplacement(multiFile);
    await verifyEcuRows();
    }
    assert.deepEqual(errors, []);
    assert.deepEqual(blocked, [], 'Unexpected external or non-read-only network request');
    console.log(`Scanner file flow (${channel}, ${restart ? 'offline browser restart' : offline ? 'offline' : 'isolated'}): import, export, reimport, detail navigation, search retention, ${live ? 'live timeline and multi-ECU roundtrip, ' : ''}invalid-file retention and back passed / Artifacts: ${output}`);
  } catch (error) {
    const failedPage = context?.pages().at(-1);
    if (failedPage && !failedPage.isClosed()) {
      console.error('Browser errors:', errors);
      console.error('Pending requests:', [...pendingRequests.values()].slice(0, 12));
      console.error((await failedPage.locator('body').innerText()).slice(0, 2500));
      await failedPage.screenshot({ path: path.join(output, 'failure.png') });
      console.error('Failure screenshot:', path.join(output, 'failure.png'));
    }
    throw error;
  } finally {
    await context?.close();
    await browser?.close();
    if (server) await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
