const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

module.exports = async function validateSettingsObservationBrowser(browser, root, output) {
  const context = await browser.newContext({ serviceWorkers: 'block' });
  const errors = [];
  try {
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
      assert.equal(url.origin, 'http://127.0.0.1'); assert.equal(request.method(), 'GET');
      const file = path.resolve(root, '.' + decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname));
      const relative = path.relative(root, file);
      if (relative.startsWith('..') || path.isAbsolute(relative) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return route.fulfill({ status: 404, body: '' });
      const contentType = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml' }[path.extname(file)] || 'application/octet-stream';
      await route.fulfill({ contentType, body: fs.readFileSync(file) });
    });
    const page = await context.newPage(); page.on('pageerror', error => errors.push(error.message));
    await page.goto('http://127.0.0.1');
    await page.getByText('登録済み整備データを読み込みました。', { exact: false }).waitFor();
    await page.getByRole('button', { name: '7. OBD2車両読取', exact: true }).click();
    await page.evaluate(() => renderObdStageView('details'));
    const panel = page.locator('#obdSettingsObservationDetails');
    assert.equal(await panel.isVisible(), false);
    // Populate only the existing private owner with synthetic observations; no transport calls.
    await page.evaluate(() => {
      Object.assign(obdDevSession, { port: {}, reader: {}, writer: {}, readLoopActive: true, connectionState: 'ready' });
      const settings = obdDevSession.settingsObservation;
      settings.ticket = settings.owner.begin().ticket;
      for (const command of ['ATZ', 'ATE0', 'ATL0', 'ATS0', 'ATH1', 'ATSP0']) settings.owner.recordInitialization(settings.ticket, command, command === 'ATZ' ? 'ELM327 fixture' : 'OK');
      renderObdSettingsObservation();
    });
    assert.equal(await panel.isVisible(), true);
    await panel.locator('summary').focus(); await page.keyboard.press('Enter');
    assert.match(await panel.innerText(), /通信番号は未観測/);
    await page.evaluate(() => {
      const settings = obdDevSession.settingsObservation;
      settings.owner.recordProtocol(settings.ticket, 'A6'); renderObdSettingsObservation();
    });
    for (const width of [390, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      assert.match(await panel.innerText(), /通信番号: A6/);
      assert.match(await panel.innerText(), /CAN自動整形・DLC表示・アドレス方式が未確認/);
      await panel.scrollIntoViewIfNeeded();
      assert.equal(await panel.evaluate(el => el.scrollWidth <= el.clientWidth + 1), true);
      await panel.screenshot({ path: path.join(output, `settings-observation-${width}.png`) });
    }
    await page.evaluate(() => renderObdStageView('results'));
    assert.equal(await panel.isVisible(), false, 'Developer observations do not appear in normal results');
    await page.evaluate(() => { renderObdStageView('details'); resetWebSerialConnectionAttemptMetadata(); });
    assert.equal(await panel.isVisible(), false);
    assert.equal(await page.locator('#obdSettingsObservationStatus').textContent(), '');
    assert.deepEqual(errors, []);
    console.log('Settings observation browser: 390/1280px, keyboard, reset and result separation passed; synthetic observations only');
  } finally { await context.close(); }
};
