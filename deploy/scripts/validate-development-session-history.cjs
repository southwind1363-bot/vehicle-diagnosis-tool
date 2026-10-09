// Actual browser history, observing both cached documents and fresh reloads.
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

module.exports = async (chromium, output) => {
  const { createDevelopmentSessionPreview } = await import('./preview-development-session.js');
  const html = createDevelopmentSessionPreview(), evidence = [];
  const server = http.createServer((request, response) => {
    if (request.url === '/session') response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }).end(html);
    else if (request.url === '/away') response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }).end('<!doctype html><title>Local history target</title><p>Local history target</p>');
    else response.writeHead(404).end();
  });
  try {
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
    const origin = `http://127.0.0.1:${server.address().port}`;
    for (const cacheEnabled of [false, true]) {
      const browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || 'chromium', headless: true,
        ...(cacheEnabled ? { ignoreDefaultArgs: ['--disable-back-forward-cache'] } : {}) });
      try {
        const context = await browser.newContext({ serviceWorkers: 'block' });
        await context.addInitScript(() => {
          window.historyProbe = { documentId: crypto.randomUUID(), shown: [], hold: false, pending: [] };
          // Hold only the fixed sample's response timer, never fake navigation/lifecycle events.
          const schedule = window.setTimeout.bind(window);
          window.setTimeout = (callback, delay, ...args) => {
            if (window.historyProbe.hold && delay === 120) {
              const id = schedule(() => {}, 60000); clearTimeout(id);
              window.historyProbe.pending.push(() => callback(...args)); return id;
            }
            return schedule(callback, delay, ...args);
          };
          window.addEventListener('pageshow', event => window.historyProbe.shown.push(event.persisted));
        });
        const page = await context.newPage(), errors = [], external = [];
        page.on('pageerror', error => errors.push(error.message));
        page.on('request', request => { if (!request.url().startsWith(origin + '/')) external.push(request.url()); });
        for (const width of [390, 1280]) {
          await page.setViewportSize({ width, height: 900 });
          for (const phase of ['complete', 'pending']) {
            for (const operation of ['prepare', 'read']) {
              await page.goto(origin + '/session');
              await page.selectOption('#sample', 'no_data');
              if (phase === 'pending') {
                const waiting = await page.evaluate(operation => {
                  window.historyProbe.hold = true;
                  document.getElementById(operation).click();
                  return { count: window.historyProbe.pending.length, progress: document.getElementById('progress').textContent };
                }, operation);
                assert.equal(waiting.count, 1);
                assert.match(waiting.progress, /^1\/4：/);
              } else {
                await page.locator('#' + operation).click();
                await page.waitForFunction(() => document.getElementById('status').textContent === '模擬操作が終了しました' || document.getElementById('status').textContent.startsWith('模擬記録の取得が終了しました。'));
                assert.notEqual(await page.locator('#output').textContent(), '');
                await page.locator('#show-result').click();
                assert.equal(await page.evaluate(() => document.activeElement.id), 'output');
              }
              const before = await page.evaluate(() => window.historyProbe.documentId);
              await page.goto(origin + '/away');
              await page.goBack({ waitUntil: 'commit' });
              await page.waitForFunction(() => window.historyProbe?.shown.length > 0);
              const probe = await page.evaluate(() => ({ documentId: window.historyProbe.documentId, shown: window.historyProbe.shown, pendingCount: window.historyProbe.pending.length }));
              assert.equal(probe.pendingCount, cacheEnabled && phase === 'pending' ? 1 : 0);
              await page.evaluate(() => { window.historyProbe.hold = false; });
              assert.equal(probe.shown.at(-1), cacheEnabled);
              assert.equal(probe.documentId === before, cacheEnabled);
              assert.equal(await page.locator('#output').textContent(), '');
              assert.equal(await page.locator('#progress').textContent(), '');
              assert(await page.locator('#show-result').isDisabled());
              assert(await page.locator('#back-controls').isHidden());
              assert(await page.locator('#back-controls').isDisabled());
              const restoredFocus = await page.evaluate(() => document.activeElement.id);
              await page.locator('#show-result').dispatchEvent('click');
              await page.locator('#back-controls').dispatchEvent('click');
              assert.equal(await page.evaluate(() => document.activeElement.id), restoredFocus, 'Old result navigation cannot steal restored focus');
              if (cacheEnabled) {
                assert(await page.locator('#read').isDisabled());
                assert.equal(await page.locator('#sample').inputValue(), 'no_data');
                assert.equal(await page.evaluate(() => document.activeElement.id), 'restart');
                await page.keyboard.press('Enter');
                assert.equal(await page.evaluate(() => document.activeElement.id), 'prepare');
              } else {
                assert(await page.locator('#read').isEnabled());
                assert.equal(await page.locator('#sample').inputValue(), 'no_data');
              }
              assert.equal(await page.locator('#output').textContent(), '', 'History restore/restart must not acquire automatically');
              assert(await page.locator('#show-result').isDisabled());
              assert(await page.locator('#back-controls').isHidden());
              if (phase === 'pending') await page.selectOption('#sample', 'codes_present');
              await page.locator('#read').click();
              await page.waitForFunction(() => document.getElementById('status').textContent === '模擬操作が終了しました' || document.getElementById('status').textContent.startsWith('模擬記録の取得が終了しました。'));
              assert.match(await page.locator('#output').innerText(), phase === 'pending' ? /故障コードを含む応答/ : /NO DATA報告あり/, 'Current selection must match acquired data');
              const fresh = await page.locator('#output').textContent();
              assert(await page.locator('#show-result').isEnabled());
              await page.locator('#show-result').focus(); await page.keyboard.press('Enter');
              assert.equal(await page.evaluate(() => document.activeElement.id), 'output');
              await page.evaluate(async () => {
                for (const release of window.historyProbe.pending.splice(0)) release();
                // Drain the promise chain; a native timer runs after its microtasks.
                await new Promise(resolve => setTimeout(resolve, 0));
              });
              assert.equal(await page.locator('#output').textContent(), fresh, 'Old pending responses must not replace the fresh result');
              assert.equal(await page.evaluate(() => document.activeElement.id), 'output', 'Late callbacks cannot move focus away from the fresh result');
              assert(await page.locator('#back-controls').isVisible());
              await page.locator('#back-controls').focus(); await page.keyboard.press('Enter');
              assert.equal(await page.evaluate(() => document.activeElement.id), 'scenario');
              assert.equal(await page.locator('#output').textContent(), fresh, 'Returning to controls preserves the new result');
              assert.equal(await page.locator('#progress').textContent(), '');
              assert.equal(await page.locator('#status').innerText(), phase === 'pending'
                ? '模擬記録の取得が終了しました。4項目で正応答を観測しましたが、故障なし・修理完了の判定ではありません。'
                : '模擬記録の取得が終了しました。正応答未確認・判定保留・分類不明の項目があります。本文で各項目の内容を確認してください。');
              evidence.push({ browserVersion: browser.version(), width, phase, operation, cacheEnabled, pendingBeforeRelease: probe.pendingCount,
                persisted: probe.shown.at(-1), sameDocument: probe.documentId === before });
            }
          }
        }
        assert.deepEqual(errors, []); assert.deepEqual(external, []);
      } finally { await browser.close(); }
    }
    fs.writeFileSync(path.join(output, 'development-session-history.json'), JSON.stringify(evidence, null, 2) + '\n');
    console.log('Development session actual history:', JSON.stringify(evidence));
    console.log('Development session history: 16 actual navigation/return/manual-restart paths passed; pending synthetic response callbacks controlled by test');
  } finally { await new Promise(resolve => server.close(resolve)); }
};
