const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

module.exports = async function validateTimeoutCleanupBrowser(browser, root, output) {
  const context = await browser.newContext({ serviceWorkers: 'block' });
  const errors = [];
  try {
    await context.addInitScript(() => {
      localStorage.setItem('vehicle-diagnosis-notice-accepted-v1', 'accepted');
      localStorage.setItem('vehicle-diagnosis-obd-ui-mode-v1', 'details');
      sessionStorage.setItem('vehicle-diagnosis-obd-access-v1', 'enabled');
      sessionStorage.setItem('vehicle-diagnosis-obd-dev-mode-v1', 'enabled');
      Object.defineProperty(navigator, 'serial', { value: undefined, configurable: true });
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
    for (const failClose of [false, true]) {
      const page = await context.newPage(); page.on('pageerror', error => errors.push(error.message));
      await page.goto('http://127.0.0.1');
      await page.getByText('登録済み整備データを読み込みました。', { exact: false }).waitFor();
      await page.getByRole('button', { name: '7. OBD2車両読取', exact: true }).click();
      await page.evaluate(failClose => {
        // Actual read/retention/cleanup/rendering, synthetic command results and resources only.
        const sent = [], released = [];
        const closeBarrier = new Promise(resolve => { window.releaseTimeoutClose = resolve; });
        window.timeoutPickerCalls = 0;
        Object.defineProperty(navigator, 'serial', { configurable: true, value: {
          requestPort: async () => { window.timeoutPickerCalls += 1; throw new DOMException('Synthetic cancellation', 'NotFoundError'); }
        } });
        Object.assign(obdDevSession, { readLoopActive: true, connectionState: 'ready',
          reader: { cancel: async () => { released.push('cancel'); }, releaseLock() { released.push('reader'); } },
          writer: { releaseLock() { released.push('writer'); } },
          port: { close: async () => { released.push('close'); await closeBarrier; if (failClose) throw new Error('synthetic_private_close_failure'); } } });
        obdSerialResultOwner = { revision: obdSerialRevision, expectedLastSession: obdDevSession.lastSession };
        sendElmDeveloperCommand = async command => {
          sent.push(command); if (command === '07') throw new Error('elm_response_timeout:07');
          return '7E8 05 43 01 33 00 00';
        };
        window.timeoutReadCompletion = runObdDeveloperRead('DTC読取', ['03', '07', '0A']).then(completed => {
          renderObdStageView('details');
          return { completed, sent, released, state: obdDevSession.connectionState,
          codes: obdDevSession.lastSession?.dtcSnapshot?.codes,
          cleanupFailed: obdSerialDisconnectOperation?.cleanupFailed === true };
        });
      }, failClose);
      await page.waitForFunction(() => obdSerialDisconnectOperation && obdDevSession.port === null && obdDevSession.lastSession?.dtcSnapshot?.codes.includes('P0133'));
      const pending = await page.evaluate(async () => {
        const snapshot = JSON.stringify(obdDevSession.lastSession);
        await connectObdDeveloperVci();
        renderObdStageView('results');
        return { blocked: getObdSessionExportBlockReason(), pickerCalls: window.timeoutPickerCalls,
          unchanged: snapshot === JSON.stringify(obdDevSession.lastSession) };
      });
      assert.match(pending.blocked, /完了または停止後/);
      assert.equal(pending.pickerCalls, 0); assert.equal(pending.unchanged, true);
      assert.equal(await page.locator('#obdStageResultsView [data-obd-session-export]').isDisabled(), true);
      const result = await page.evaluate(async () => { window.releaseTimeoutClose(); return await window.timeoutReadCompletion; });
      assert.equal(result.completed, false); assert.deepEqual(result.sent, ['03', '07']);
      assert.deepEqual(result.released, ['cancel', 'reader', 'writer', 'close']);
      assert.ok(result.codes.includes('P0133')); assert.equal(result.cleanupFailed, failClose);
      assert.equal(result.state, failClose ? 'disconnecting' : 'disconnected');
      const status = page.locator('#obdDevStatus');
      const message = await status.innerText();
      assert.match(message, /タイムアウト/);
      assert.match(message, /読取結果を保持しています/);
      assert.match(message, failClose ? /終了処理を確認できない/ : /接続を終了しました/);
      assert.ok(!message.includes('synthetic_private'));
      if (failClose) assert.ok(!message.includes('安全に切断しました'));
      for (const width of [390, 1280]) {
        await page.setViewportSize({ width, height: 900 }); await status.scrollIntoViewIfNeeded();
        assert.equal(await status.evaluate(el => el.scrollWidth <= el.clientWidth + 1), true);
        await status.screenshot({ path: path.join(output, `timeout-cleanup-${failClose ? 'unconfirmed' : 'confirmed'}-${width}.png`) });
      }
      const snapshot = await page.evaluate(() => JSON.stringify(obdDevSession.lastSession));
      const expectedExport = await page.evaluate(() => window.ObdReadOnly.buildBridgeSessionExportPayload(obdDevSession.lastSession));
      await page.evaluate(() => renderObdStageView('results'));
      const downloadPending = page.waitForEvent('download');
      await page.locator('#obdStageResultsView [data-obd-session-export]').click();
      const savedPath = path.join(output, `timeout-cleanup-${failClose ? 'unconfirmed' : 'confirmed'}.json`);
      await (await downloadPending).saveAs(savedPath);
      const saved = JSON.parse(fs.readFileSync(savedPath, 'utf8'));
      delete saved.exported_at; delete expectedExport.exported_at;
      assert.deepEqual(saved, expectedExport, 'Download must preserve the complete pre-save payload except export time');
      assert.ok(JSON.stringify(saved).includes('P0133'));
      assert.ok(!JSON.stringify(saved).includes('synthetic_private'));
      assert.equal(await page.evaluate(() => JSON.stringify(obdDevSession.lastSession)), snapshot);
      const retry = await page.evaluate(async () => {
        await connectObdDeveloperVci();
        return { calls: window.timeoutPickerCalls, snapshot: JSON.stringify(obdDevSession.lastSession),
          quarantined: Boolean(obdSerialDisconnectOperation), state: obdDevSession.connectionState };
      });
      assert.equal(retry.calls, failClose ? 0 : 1);
      assert.equal(retry.snapshot, snapshot); assert.equal(retry.quarantined, failClose);
      assert.equal(retry.state, failClose ? 'disconnecting' : 'disconnected');
      await page.close();
    }
    assert.deepEqual(errors, []);
    console.log('Timeout cleanup browser: pending save/reconnect blocked, settled JSON download preserves DTC, quarantine blocks picker, confirmed cleanup permits picker cancellation; messages and 390/1280px passed; synthetic transport only');
  } finally { await context.close(); }
};
