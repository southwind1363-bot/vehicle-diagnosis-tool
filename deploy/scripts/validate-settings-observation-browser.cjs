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
      await page.emulateMedia({ colorScheme: width === 390 ? "light" : "dark" });
      assert.match(await panel.innerText(), /通信番号: A6/);
      assert.match(await panel.innerText(), /CAN自動整形・DLC表示・アドレス方式が未確認/);
      await panel.scrollIntoViewIfNeeded();
      assert.equal(await panel.evaluate(el => el.scrollWidth <= el.clientWidth + 1), true);
      await panel.screenshot({ path: path.join(output, `settings-observation-${width}.png`) });
    }
    const rawPanel = page.locator('#obdCoreRawReadoutDetails');
    await page.evaluate(() => renderObdDeveloperGate());
    assert.equal(await rawPanel.isVisible(), true);
    await rawPanel.locator('summary').focus(); await page.keyboard.press('Enter');
    assert.match(await rawPanel.innerText(), /未取得/);
    await page.evaluate(() => {
      obdDevSession.coreRawReadoutCapture = createWebSerialReadoutCapture(['03', '07', '0A', '0101']);
      const owner = obdDevSession.coreRawReadoutCapture;
      for (const command of ['03', '07', '0A', '0101']) owner.append({ command, transcript: 'PRIVATE_RAW_SENTINEL>',
        startedAt: 1, completedAt: 1, profile: null, profileVerified: false, realTransportProofAvailable: false, executionEnabled: false });
      owner.finish(); renderObdDeveloperGate();
    });
    for (const width of [390, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      await page.emulateMedia({ colorScheme: width === 390 ? "light" : "dark" });
      assert.match(await rawPanel.innerText(), /4件を取得済み/);
      assert.match(await rawPanel.innerText(), /解析は未接続/);
      assert.match(await rawPanel.innerText(), /改行・終端または文字の形式/);
      assert.doesNotMatch(await page.locator('body').innerText(), /PRIVATE_RAW_SENTINEL/);
      assert.equal(await page.evaluate(() => obdDevSession.coreRawReadoutCapture.inspect().count), 4);
      await rawPanel.scrollIntoViewIfNeeded();
      assert.equal(await rawPanel.evaluate(el => el.scrollWidth <= el.clientWidth + 1), true);
      await rawPanel.screenshot({ path: path.join(output, `raw-readout-status-${width}.png`) });
    }
    for (const [transcript, expected] of [
      ['7E8024300AAAAAAAAAA\r>', /通信設定の証明ではありません/],
      ['7E8 02 43 00 AA AA AA AA AA\r>', /空白無効の応答記録に対して空白区切り/],
      ['NO DATA\r>', /文字形を確認できない応答/]
    ]) {
      await page.evaluate(text => {
        const owner = createWebSerialReadoutCapture(['03', '07', '0A', '0101']);
        obdDevSession.coreRawReadoutCapture = owner;
        for (const command of ['03', '07', '0A', '0101']) owner.append({ command, transcript: text,
          settingsBeforeRead: { initializationComplete: true, echoOffAcknowledged: true, spacesOffAcknowledged: true, protocol11bitReported: true },
          startedAt: 1, completedAt: 1, profile: null, profileVerified: false, realTransportProofAvailable: false, executionEnabled: false });
        owner.finish(); renderObdDeveloperGate();
      }, transcript);
      assert.match(await rawPanel.innerText(), expected);
      assert.equal(await page.evaluate(() => obdDevSession.coreRawReadoutCapture.inspect().formatReview.parserAllowed), false);
    }
    await page.evaluate(() => {
      const owner = createWebSerialReadoutCapture(['03', '07', '0A', '0101']);
      obdDevSession.coreRawReadoutCapture = owner;
      for (const command of ['03', '07', '0A', '0101']) owner.append({ command, transcript: '7E8024300AAAAAAAAAA\r>',
        settingsBeforeRead: { initializationComplete: true, echoOffAcknowledged: true, spacesOffAcknowledged: true, protocol11bitReported: command !== '03' },
        startedAt: 1, completedAt: 1, profile: null, profileVerified: false, realTransportProofAvailable: false, executionEnabled: false });
      owner.finish(); renderObdDeveloperGate();
    });
    assert.doesNotMatch(await rawPanel.innerText(), /読取開始時の対応する通信番号が未確認/, "Per-item explanation replaces the duplicate protocol warning");
    assert.match(await rawPanel.innerText(), /保存DTC：対応する通信番号が未確認/);
    assert.match(await rawPanel.innerText(), /保留DTC・永久DTC・レディネス：初期化・エコー無効・空白無効・通信番号の応答記録あり/);
    assert.equal((await rawPanel.innerText()).match(/応答記録あり/g).length, 1);
    assert.equal(await page.locator('#obdCoreRawReadoutStatus').evaluate(el => getComputedStyle(el).whiteSpace), 'pre-line');
    assert.match(await rawPanel.innerText(), /模擬設定の成功で未確認項目を補うことはできません/);
    for (const width of [390, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      await page.emulateMedia({ colorScheme: width === 390 ? "light" : "dark" });
      assert.equal(await rawPanel.evaluate(el => el.scrollWidth <= el.clientWidth + 1), true);
      await rawPanel.screenshot({ path: path.join(output, 'readout-conditions-' + width + '.png') });
    }
    assert.equal(await page.evaluate(() => obdDevSession.coreRawReadoutCapture.inspect().formatReview.protocolObservedBeforeReadCount), 3);
    await page.evaluate(() => {
      const settings = obdDevSession.settingsObservation;
      settings.owner.invalidate(); renderObdDeveloperGate();
    });
    assert.match(await rawPanel.innerText(), /通信設定の記録が未取得または失効/);
    assert.doesNotMatch(await rawPanel.innerText(), /取得前条件:/);
    assert.equal(await page.evaluate(() => obdDevSession.coreRawReadoutCapture.inspect().count), 0);
    await page.evaluate(() => renderObdStageView('results'));
    assert.equal(await rawPanel.isVisible(), false);
    assert.equal(await panel.isVisible(), false, 'Developer observations do not appear in normal results');
    await page.evaluate(() => { renderObdStageView('details'); resetWebSerialConnectionAttemptMetadata(); });
    assert.equal(await panel.isVisible(), false);
    assert.equal(await page.locator('#obdSettingsObservationStatus').textContent(), '');
    assert.deepEqual(errors, []);
    console.log('Settings observation browser: 390/1280px, keyboard, reset and result separation passed; synthetic observations only');
  } finally { await context.close(); }
};
