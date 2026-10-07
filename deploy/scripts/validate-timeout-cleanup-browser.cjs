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
    for (const failClose of [false, true]) {
      const page = await context.newPage(); page.on('pageerror', error => errors.push(error.message));
      await page.goto('http://127.0.0.1');
      await page.getByText('登録済み整備データを読み込みました。', { exact: false }).waitFor();
      await page.getByRole('button', { name: '7. OBD2車両読取', exact: true }).click();
      const result = await page.evaluate(async failClose => {
        // Actual read/retention/cleanup/rendering, synthetic command results and resources only.
        const sent = [], released = [];
        Object.assign(obdDevSession, { readLoopActive: true, connectionState: 'ready',
          reader: { cancel: async () => { released.push('cancel'); }, releaseLock() { released.push('reader'); } },
          writer: { releaseLock() { released.push('writer'); } },
          port: { close: async () => { released.push('close'); if (failClose) throw new Error('synthetic_private_close_failure'); } } });
        obdSerialResultOwner = { revision: obdSerialRevision, expectedLastSession: obdDevSession.lastSession };
        sendElmDeveloperCommand = async command => {
          sent.push(command); if (command === '07') throw new Error('elm_response_timeout:07');
          return '7E8 05 43 01 33 00 00';
        };
        const completed = await runObdDeveloperRead('DTC読取', ['03', '07', '0A']);
        renderObdStageView('details');
        return { completed, sent, released, state: obdDevSession.connectionState,
          codes: obdDevSession.lastSession?.dtcSnapshot?.codes,
          cleanupFailed: obdSerialDisconnectOperation?.cleanupFailed === true };
      }, failClose);
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
      await page.close();
    }
    assert.deepEqual(errors, []);
    console.log('Timeout cleanup browser: confirmed/unconfirmed messages, partial DTC retention, no follow-up command and 390/1280px passed; synthetic transport only');
  } finally { await context.close(); }
};
