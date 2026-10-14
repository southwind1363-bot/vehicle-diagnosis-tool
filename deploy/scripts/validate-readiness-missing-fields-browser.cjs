// Production missing-field regression through the real JSON picker.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
(async () => {
  const root = path.resolve(__dirname, '..');
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext({ serviceWorkers: 'block', viewport: { width: 390, height: 844 } });
  const errors = [], blocked = [];
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
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('http://127.0.0.1/');
    await page.getByText('登録済み整備データを読み込みました。', { exact: false }).waitFor();
    await page.getByRole('button', { name: '7. OBD2車両読取', exact: true }).click();

    const monitors = [
      { id: 'test_unknown_support', label: '対応可否の不明例' },
      { id: 'test_unknown_completion', label: '完了状況の不明例', supported: true },
      { id: 'test_complete', label: '対応可否欠落の例', complete: true },
      { id: 'test_incomplete', label: '未完了の対照例', supported: true, complete: false },
      { id: 'test_unsupported', label: '非対応の対照例', supported: false, complete: false }
    ];
    const expected = ['unknown','unknown','unknown','not_complete','not_supported'];
    const json = JSON.stringify({ readinessSnapshot: { sourceEcu: '7E8', monitors } });
    const [picker] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('button', { name: '保存した読取結果を開く', exact: true }).click()]);
    await picker.setFiles({ name: 'synthetic-readiness.json', mimeType: 'application/json', buffer: Buffer.from(json) });
    await page.waitForFunction(() => obdDevSession.lastSession?.readinessSnapshot?.monitors?.length === 5);
    const result = await page.evaluate(() => {
      const session = obdDevSession.lastSession;
      const restored = ObdReadOnly.buildDiagnosticScanSessionFromJson(JSON.stringify(ObdReadOnly.buildBridgeSessionExportPayload(session)));
      return { actual: session.readinessSnapshot.monitors, restored: restored.readinessSnapshot.monitors,
        lines: buildObdReadinessDisplayLines(session.readinessSnapshot), transmit: restored.wouldTransmit };
    });
    assert.deepEqual(result.actual.map(row => row.status), expected);
    assert.deepEqual(result.restored, result.actual);
    assert.equal(result.transmit, false);
    assert.ok(result.lines.some(line => line.includes('対応可否の不明例: 対応状態不明')));
    assert.ok(result.lines.some(line => line.includes('完了状況の不明例: 完了状態不明')));
    // Existing review UI already uses the nullable booleans; preserve that classification.
    const states = await page.evaluate(() => buildObdReadinessReviewGroups(obdDevSession.lastSession.readinessSnapshot)[0].rows.filter(row => row.label.includes('例')).map(row => row.status));
    assert.deepEqual(states, ['unknown','unknown','unknown','incomplete','unsupported']);
    for (const width of [390,1280]) {
      await page.setViewportSize({width,height:900});
      for (const theme of ['light','dark']) {
        await page.evaluate(theme => document.documentElement.dataset.theme = theme, theme);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      }
    }
    assert.deepEqual(errors, []); assert.deepEqual(blocked, []);
    console.log('Readiness missing-field production browser passed: real JSON picker, unknown/normal states, save/restore, existing UI classification, 390/1280 light/dark, no external or vehicle requests.');
  } finally { await context.close(); await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
