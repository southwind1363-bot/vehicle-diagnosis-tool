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
          window.historyProbe = { documentId: crypto.randomUUID(), shown: [] };
          window.addEventListener('pageshow', event => window.historyProbe.shown.push(event.persisted));
        });
        const page = await context.newPage(), errors = [], external = [];
        page.on('pageerror', error => errors.push(error.message));
        page.on('request', request => { if (!request.url().startsWith(origin + '/')) external.push(request.url()); });
        for (const width of [390, 1280]) {
          await page.setViewportSize({ width, height: 900 });
          for (const operation of ['prepare', 'read']) {
            await page.goto(origin + '/session');
            await page.selectOption('#sample', 'no_data');
            await page.locator('#' + operation).click();
            await page.waitForFunction(() => document.getElementById('status').textContent === '模擬操作が終了しました');
            assert.notEqual(await page.locator('#output').textContent(), '');
            const before = await page.evaluate(() => window.historyProbe.documentId);
            await page.goto(origin + '/away');
            await page.goBack({ waitUntil: 'commit' });
            await page.waitForFunction(() => window.historyProbe?.shown.length > 0);
            const probe = await page.evaluate(() => window.historyProbe);
            assert.equal(probe.shown.at(-1), cacheEnabled);
            assert.equal(probe.documentId === before, cacheEnabled);
            assert.equal(await page.locator('#output').textContent(), '');
            assert.equal(await page.locator('#progress').textContent(), '');
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
            await page.locator('#read').click();
            await page.waitForFunction(() => document.getElementById('status').textContent === '模擬操作が終了しました');
            assert.match(await page.locator('#output').innerText(), /NO DATA報告あり/, 'Restored selection must match acquired data');
            evidence.push({ browserVersion: browser.version(), width, operation, cacheEnabled,
              persisted: probe.shown.at(-1), sameDocument: probe.documentId === before });
          }
        }
        assert.deepEqual(errors, []); assert.deepEqual(external, []);
      } finally { await browser.close(); }
    }
    fs.writeFileSync(path.join(output, 'development-session-history.json'), JSON.stringify(evidence, null, 2) + '\n');
    console.log('Development session actual history:', JSON.stringify(evidence));
    console.log('Development session history: 8 actual navigation/return/manual-restart paths passed; synthetic data only');
  } finally { await new Promise(resolve => server.close(resolve)); }
};
