const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

// Real bridge response with synthetic registry failure; no reg.exe or hardware.
module.exports = async function validateScannerRegistryFailure(browser, root, output) {
  const { createLocalBridgeApp } = await import(pathToFileURL(path.join(root, 'local-bridge-readonly.js')));
  let queries = 0;
  const server = createLocalBridgeApp({ pairingToken: 'synthetic-registry-failure-key', discoverJ2534: true,
    j2534RegistryPlatform: 'win32', j2534RegistryQuery() {
      queries++;
      throw new Error('synthetic-private-registry-detail');
    } });
  const context = await browser.newContext({ viewport: { width: 390, height: 900 }, serviceWorkers: 'block' });
  const origin = 'http://127.0.0.1';
  const intents = [], errors = [], blocked = [];
  try {
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
    await context.addInitScript(() => {
      localStorage.setItem('vehicle-diagnosis-notice-accepted-v1', 'accepted');
      localStorage.setItem('vehicle-diagnosis-obd-ui-mode-v1', 'details');
      sessionStorage.setItem('vehicle-diagnosis-obd-access-v1', 'enabled');
      sessionStorage.setItem('vehicle-diagnosis-obd-dev-mode-v1', 'enabled');
      Object.defineProperty(navigator, 'serial', { value: undefined });
      Object.defineProperty(navigator, 'bluetooth', { value: undefined });
    });
    await context.route('**/*', async route => {
      const request = route.request(), url = new URL(request.url());
      if (request.method() === 'POST' && url.hostname === '127.0.0.1'
        && ['/local-bridge/v1/request', '/v1/bridge'].includes(url.pathname)) {
        const body = JSON.parse(request.postData());
        intents.push(body.intent);
        if (body.intent !== 'bridge_status') { blocked.push(body.intent); return route.abort(); }
        const response = await fetch(`http://127.0.0.1:${server.address().port}/v1/bridge`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: request.postData(), signal: AbortSignal.timeout(5000)
        });
        return route.fulfill({ status: response.status, contentType: 'application/json', body: await response.text() });
      }
      if (url.origin !== origin || request.method() !== 'GET') { blocked.push(request.url()); return route.abort(); }
      const file = path.resolve(root, '.' + decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname));
      const relative = path.relative(root, file);
      if (relative.startsWith('..') || path.isAbsolute(relative) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
        return route.fulfill({ status: 404, body: '' });
      }
      const contentType = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' }[path.extname(file)] || 'application/octet-stream';
      return route.fulfill({ contentType, body: fs.readFileSync(file) });
    });
    const page = await context.newPage();
    page.setDefaultTimeout(20000);
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(origin);
    await page.getByText('登録済み整備データを読み込みました。', { exact: false }).waitFor();
    await page.getByRole('button', { name: '7. OBD2車両読取', exact: true }).click();
    // Access unlocking above is a fixture; use the real connection-check button.
    await page.evaluate(() => renderObdStageView('details'));
    await page.locator('#obdDevBridgeStatusButton').click();
    await page.waitForFunction(() => !obdBridgeOperation && document.getElementById('obdDevStatus').textContent.includes('登録状態を確認できませんでした'));
    const status = page.locator('#obdDevStatus');
    const message = await status.innerText();
    assert.match(message, /登録状態を確認できませんでした/);
    assert.match(message, /未登録と確定したものではありません/);
    assert.ok(!message.includes('synthetic-private-registry-detail'));
    assert.equal(await page.evaluate(() => obdDevSession.lastSession), null);
    assert.deepEqual(intents, ['bridge_status'], 'Failure must not advance to adapter identity or readings');
    assert.equal(queries, 2, 'Each fixed root is inspected once, without a registry retry');
    await status.scrollIntoViewIfNeeded();
    await status.screenshot({ path: path.join(output, 'registry-query-failure-390.png') });

    // A failed connection check must not replace a previously imported readout.
    const originalFile = path.join(__dirname, 'fixtures/native-elm327-scan-archive.json');
    const originalBytes = fs.readFileSync(originalFile);
    await page.evaluate(() => { setObdUiMode('simple'); renderObdStageView('home'); });
    const [picker] = await Promise.all([page.waitForEvent('filechooser'), page.locator('#obdHomeOpenSessionButton').click()]);
    await picker.setFiles(originalFile);
    await page.locator('#obdDetectedCodes').getByText('P0300', { exact: false }).first().waitFor();
    assert.match(await page.locator('#obdDetectedCodes').innerText(), /P0420/);
    const retained = await page.evaluate(() => ({ session: obdDevSession.lastSession,
      input: document.getElementById('obdScannerText').value }));
    assert.ok(retained.session);
    const saveReadout = async name => {
      await page.evaluate(() => renderObdStageView('results'));
      const pending = page.waitForEvent('download');
      await page.locator('#obdStageResultsView [data-obd-session-export]').click();
      const saved = path.join(output, name);
      await (await pending).saveAs(saved);
      const payload = JSON.parse(fs.readFileSync(saved, 'utf8'));
      assert.equal(typeof payload.exported_at, 'string');
      delete payload.exported_at; // Only the export timestamp may change.
      return payload;
    };
    const beforeExport = await saveReadout('registry-before-failure.json');
    await page.evaluate(() => { setObdUiMode('details'); renderObdStageView('details'); });
    await page.locator('#obdDevBridgeStatusButton').click();
    await page.waitForFunction(() => !obdBridgeOperation && document.getElementById('obdDevStatus').textContent.includes('登録状態を確認できませんでした'));
    assert.equal(await status.isVisible(), true, 'Connection failure must remain visible with a retained readout');
    await status.scrollIntoViewIfNeeded();
    await status.screenshot({ path: path.join(output, 'registry-failure-visible-with-readout-390.png') });
    assert.match(await status.innerText(), /登録状態を確認できませんでした/);
    assert.deepEqual(await page.evaluate(() => ({ session: obdDevSession.lastSession,
      input: document.getElementById('obdScannerText').value })), retained);
    assert.deepEqual(await saveReadout('registry-after-failure.json'), beforeExport);
    await page.locator('#obdStageResultsView [data-obd-session-export-status]').scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(output, 'registry-failure-retained-readout-390.png') });
    assert.deepEqual(fs.readFileSync(originalFile), originalBytes);
    assert.deepEqual(intents, ['bridge_status', 'bridge_status']);
    assert.equal(queries, 2, 'Explicit status checks must not trigger automatic registry retries');
    assert.deepEqual(errors, []);
    assert.deepEqual(blocked, []);
    console.log('Registry failure UI: real blocked response, Japanese notice, no readout or identity request');
    console.log('Registry failure retention: imported session/input/original preserved; exported payload unchanged except timestamp');
  } finally {
    await context.close();
    await new Promise(resolve => server.close(resolve));
  }
};
