// Real browser download and reimport with synthetic transport cleanup states.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
(async () => {
  const root = path.resolve(__dirname, '..');
  const browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome', headless: true });
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

    const fixture = { dtcSnapshot: { dtcs: [{ code: 'P0133', status: 'stored' }, { code: 'P0420', status: 'stored' }], dtcReadoutStatus: 'reported' } };
    async function importFile(payload) {
      const [picker] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('button', { name: '保存した読取結果を開く', exact: true }).click()]);
      await picker.setFiles({ name: 'synthetic-rescue.json', mimeType: 'application/json', buffer: Buffer.from(payload) });
      await page.waitForFunction(() => obdDevSession.lastSession?.dtcSnapshot?.codes?.includes('P0420'));
    }
    await importFile(JSON.stringify(fixture));
    await page.getByRole('button', { name: '3. 結果', exact: true }).click();
    const original = await page.evaluate(() => JSON.stringify(obdDevSession.lastSession));
    let downloads = 0;
    page.on('download', () => downloads++);
    // Synthetic cleanup states only; navigator.serial/bluetooth stay unavailable.
    for (const blocker of ['unsettled', 'pendingWriteOperation', 'pendingCommandOperation', 'port', 'reader', 'writer']) {
      await page.evaluate(blocker => {
        Object.assign(obdDevSession, { connectionState: 'disconnecting', port: null, reader: null, writer: null,
          pendingWriteOperation: null, pendingCommandOperation: null, readInProgress: false, initializing: false, coreScanInProgress: false });
        obdSerialDisconnectOperation = { cleanupFailed: true, cleanupSettled: blocker !== 'unsettled' };
        if (blocker !== 'unsettled') obdDevSession[blocker] = {};
        renderObdSessionExportControls();
      }, blocker);
      assert.equal(await page.locator('[data-obd-session-export]:visible').first().isDisabled(), true, blocker);
      assert.equal(await page.evaluate(() => downloadObdSessionJson()), false, blocker);
      assert.equal(await page.evaluate(() => JSON.stringify(obdDevSession.lastSession)), original);
    }
    assert.equal(downloads, 0, 'Unsettled transport must not trigger downloads');
    await page.evaluate(() => {
      Object.assign(obdDevSession, { port: null, reader: null, writer: null, pendingWriteOperation: null, pendingCommandOperation: null });
      obdSerialDisconnectOperation = { cleanupFailed: true, cleanupSettled: true };
      renderObdSessionExportControls();
    });
    const save = page.locator('[data-obd-session-export]:visible').first();
    assert.equal(await save.isEnabled(), true);
    // Browser API fault injection, not an actual disk/storage failure.
    for (const failure of ['object_url', 'anchor_click']) {
      await page.evaluate(failure => {
        const create = URL.createObjectURL.bind(URL), revoke = URL.revokeObjectURL.bind(URL);
        const click = HTMLAnchorElement.prototype.click;
        window.rescueFault = { created: [], revoked: [], restore() {
          URL.createObjectURL = create; URL.revokeObjectURL = revoke; HTMLAnchorElement.prototype.click = click;
        } };
        URL.createObjectURL = blob => {
          if (failure === 'object_url') throw Error('synthetic_object_url_failure');
          const url = create(blob); rescueFault.created.push(url); return url;
        };
        URL.revokeObjectURL = url => { rescueFault.revoked.push(url); return revoke(url); };
        HTMLAnchorElement.prototype.click = function () {
          if (failure === 'anchor_click' && this.download.startsWith('diagnostic-session-')) throw Error('synthetic_anchor_failure');
          return click.call(this);
        };
      }, failure);
      await save.click();
      await page.waitForFunction(() => Array.from(document.querySelectorAll('[data-obd-session-export-status]'))
        .some(node => node.textContent.includes('JSON保存を開始できませんでした')));
      await page.waitForFunction(() => rescueFault.created.length === rescueFault.revoked.length);
      const failed = await page.evaluate(() => ({ snapshot: JSON.stringify(obdDevSession.lastSession),
        state: obdDevSession.connectionState, failed: obdSerialDisconnectOperation.cleanupFailed,
        created: rescueFault.created, revoked: rescueFault.revoked,
        links: document.querySelectorAll('a[download^="diagnostic-session-"]').length }));
      assert.equal(failed.snapshot, original); assert.equal(failed.state, 'disconnecting'); assert.equal(failed.failed, true);
      assert.deepEqual(failed.revoked, failed.created); assert.equal(failed.created.length, failure === 'anchor_click' ? 1 : 0);
      assert.equal(failed.links, 0); assert.equal(downloads, 0); assert.equal(await save.isEnabled(), true);
      await page.evaluate(() => { rescueFault.restore(); delete window.rescueFault; });
    }
    const [download] = await Promise.all([page.waitForEvent('download'), save.click()]);
    assert.match(download.suggestedFilename(), /^diagnostic-session-.*\.json$/);
    assert.equal(await download.failure(), null);
    const stream = await download.createReadStream(), chunks = [];
    for await (const chunk of stream) chunks.push(chunk);
    const savedText = Buffer.concat(chunks).toString('utf8');
    JSON.parse(savedText);
    const result = await page.evaluate(() => ({
      snapshot: JSON.stringify(obdDevSession.lastSession),
      state: obdDevSession.connectionState, failed: obdSerialDisconnectOperation.cleanupFailed,
      statuses: Array.from(document.querySelectorAll('[data-obd-session-export-status]'), node => node.textContent)
    }));
    assert.equal(result.snapshot, original);
    assert.equal(result.state, 'disconnecting'); assert.equal(result.failed, true);
    assert.ok(result.statuses.some(value => value.includes('終了未確認') && value.includes('再接続はできません')));
    assert.equal(downloads, 1);
    assert.ok(!savedText.includes('cleanupFailed') && !savedText.includes('pendingWriteOperation'));
    // Reopen a clean page and use the actual file picker to import downloaded bytes.
    await page.reload();
    await page.getByText('登録済み整備データを読み込みました。', { exact: false }).waitFor();
    await page.getByRole('button', { name: '7. OBD2車両読取', exact: true }).click();
    await importFile(savedText);
    const restored = await page.evaluate(() => ({codes: obdDevSession.lastSession.dtcSnapshot.codes,
      transmit: obdDevSession.lastSession.wouldTransmit, enabled: obdDevSession.lastSession.vehicleCommandEnabled}));
    assert.deepEqual(restored.codes, ['P0133','P0420']);
    assert.equal(restored.transmit, false); assert.equal(restored.enabled, false);
    assert.deepEqual(errors, []); assert.deepEqual(blocked, []);
    console.log('Cleanup rescue browser passed: six blocked states, two save-start faults with URL/link cleanup and retry, real button/download, original record and quarantine preserved, downloaded JSON reimport, no external or vehicle requests.');
  } finally { await context.close(); await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
