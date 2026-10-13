// Isolated remaining-NO-DATA proposal in a browser; never changes runtime assets.
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
      await route.fulfill({ contentType, body: path.basename(file) === 'script.js' ? fs.readFileSync(file, 'utf8').replace(/function isWebSerialExpectedEmptyResponse\(command, response\) \{[\s\S]*?\r?\n\}/, 'function isWebSerialExpectedEmptyResponse(command, response) { return false; }') : fs.readFileSync(file) });
    });
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('http://127.0.0.1/');
    await page.getByText('登録済み整備データを読み込みました。', { exact: false }).waitFor();
    await page.getByRole('button', { name: '7. OBD2車両読取', exact: true }).click();
    for (const empty of [false, true]) {
      if (empty) {
        await page.reload();
        await page.getByText('登録済み整備データを読み込みました。', { exact: false }).waitFor();
        await page.getByRole('button', { name: '7. OBD2車両読取', exact: true }).click();
      }
      const json = await page.evaluate(empty => {
        const responses = ['0202', '06', '0900'].map(command => ({ command, response: empty ? ({ '0202': '42 02 00 00 00', '06': '46 01 01 00 10 00 00 00 20', '0900': '49 00 14 00 00 00' }[command]) : 'NO DATA' }));
        const outcome = buildWebSerialReadoutOutcome(['0202', '06', '0900'], responses);
        const session = ObdReadOnly.buildDiagnosticScanSession({ web_serial_readout_summary: {
          schema_version: 'web_serial_readout_execution_v2', attempts: [{ label: 'FF・Mode06・ECU対応確認', ...outcome }]
        } });
        return JSON.stringify(ObdReadOnly.buildBridgeSessionExportPayload(session));
      }, empty);
      const [picker] = await Promise.all([
        page.waitForEvent('filechooser'),
        page.getByRole('button', { name: '保存した読取結果を開く', exact: true }).click()
      ]);
      await picker.setFiles({ name: 'synthetic-no-data.json', mimeType: 'application/json', buffer: Buffer.from(json) });
      await page.waitForFunction(empty => obdDevSession.lastSession?.webSerialReadoutSummary?.completedCount === (empty ? 1 : 0), empty);
      const label = await page.evaluate(() => formatWebSerialReadoutSummary(obdDevSession.lastSession.webSerialReadoutSummary));
      assert.match(label, empty ? /完了1.*未完了0/ : /完了0.*未完了1/);
      if (!empty) assert.match(label, /NO DATA 3/);
      assert.doesNotMatch(label, /正常空結果/);
      const restored = await page.evaluate(() => {
        const session = ObdReadOnly.buildDiagnosticScanSessionFromJson(JSON.stringify(ObdReadOnly.buildBridgeSessionExportPayload(obdDevSession.lastSession)));
        return formatWebSerialReadoutSummary(session.webSerialReadoutSummary);
      });
      assert.equal(restored, label);
    }
    assert.deepEqual(errors, []); assert.deepEqual(blocked, []);
    console.log('Remaining NO DATA proposal browser passed: isolated outcome, real JSON import, incomplete vs positive-response summary, save/restore, no external or vehicle requests.');
  } finally { await context.close(); await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
