const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

(async () => {
  const root = path.resolve(__dirname, '..');
  const output = fs.mkdtempSync(path.join(os.tmpdir(), 'obd-file-flow-'));
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block', acceptDownloads: true });
  const errors = [], blocked = [];
  try {
    // Fresh, pre-unlocked fixture only; no user profile, password, or vehicle access.
    await context.addInitScript(() => {
      localStorage.setItem('vehicle-diagnosis-notice-accepted-v1', 'accepted');
      sessionStorage.setItem('vehicle-diagnosis-obd-access-v1', 'enabled');
      Object.defineProperty(navigator, 'serial', { value: undefined });
      Object.defineProperty(navigator, 'bluetooth', { value: undefined });
    });
    await context.route('**/*', async route => {
      const url = new URL(route.request().url());
      const file = path.resolve(root, '.' + decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname));
      const relative = path.relative(root, file);
      if (url.origin !== 'http://127.0.0.1' || route.request().method() !== 'GET' || relative.startsWith('..') || path.isAbsolute(relative)) {
        blocked.push(route.request().url());
        return route.abort();
      }
      if (!fs.existsSync(file) || !fs.statSync(file).isFile()) return route.fulfill({ status: 404, body: '' });
      const type = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml' }[path.extname(file)] || 'application/octet-stream';
      await route.fulfill({ contentType: type, body: fs.readFileSync(file) });
    });
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    page.setDefaultTimeout(20000);
    await page.goto('http://127.0.0.1/');
    await page.getByText('登録済み整備データを読み込みました。', { exact: false }).waitFor();
    await page.getByRole('button', { name: '7. OBD2車両読取', exact: true }).click();
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
    // Reload first so stale result nodes cannot make a failed reimport pass.
    await page.reload();
    await page.getByText('登録済み整備データを読み込みました。', { exact: false }).waitFor();
    await page.getByRole('button', { name: '7. OBD2車両読取', exact: true }).click();
    await page.getByRole('button', { name: '読取結果を開く', exact: true }).click();
    assert.equal(await page.locator('#obdResultsEmptyState').isVisible(), true);
    assert.equal(await page.locator('#obdDetectedCodes').innerText(), '');
    await openFile(page.getByRole('button', { name: '読取結果ファイルを開く', exact: true }), exported);
    await page.locator('#obdDetectedCodes').getByText('P0300', { exact: false }).first().waitFor();
    const before = await page.locator('#obdDetectedCodes').innerText();
    assert.match(before, /P0420/);
    await page.getByRole('button', { name: '基本読取結果へ戻る', exact: true }).click();
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
    assert.deepEqual(blocked, [], 'Unexpected external or non-read-only network request');
    console.log(`Scanner file flow: import, export, reimport, invalid-file retention and back passed / Artifacts: ${output}`);
  } finally {
    await context.close();
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
