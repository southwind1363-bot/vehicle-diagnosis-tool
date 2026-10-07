// Real local navigation, with Chromium's back/forward cache enabled and disabled.
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

module.exports = async (chromium, output) => {
  const { createDtcClearWalkthroughHtml } = await import('./preview-dtc-clear-walkthrough.js');
  const html = createDtcClearWalkthroughHtml();
  const server = http.createServer((request, response) => {
    if (request.url === '/walkthrough') response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }).end(html);
    else if (request.url === '/away') response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }).end('<!doctype html><title>Local navigation target</title><p>Local navigation target</p>');
    else response.writeHead(404).end();
  });
  const evidence = [];
  try {
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
    const origin = `http://127.0.0.1:${server.address().port}`;
    for (const cacheEnabled of [false, true]) {
      const browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || 'chromium', headless: true,
        ...(cacheEnabled ? { ignoreDefaultArgs: ['--disable-back-forward-cache'] } : {}) });
      try {
        const context = await browser.newContext({ serviceWorkers: 'block' });
        // Observation only: do not dispatch lifecycle events or route/intercept requests.
        await context.addInitScript(() => {
          window.historyProbe = { documentId: crypto.randomUUID(), shown: [] };
          window.addEventListener('pageshow', event => window.historyProbe.shown.push(event.persisted));
        });
        const page = await context.newPage();
        const errors = [], external = [];
        page.on('pageerror', error => errors.push(error.message));
        page.on('request', request => { if (!request.url().startsWith(origin + '/')) external.push(request.url()); });
        for (const width of [390, 1280]) {
          await page.setViewportSize({ width, height: 900 });
          for (const scenario of ['normal', 'result_unknown']) {
            await page.goto(origin + '/walkthrough');
            await page.selectOption('#scenario', scenario);
            for (const step of ['prepare', 'confirm', 'reviewBlockedDispatch', 'compareFixedRecords']) await page.locator('#' + step).click();
            const before = await page.evaluate(() => window.historyProbe.documentId);
            await page.goto(origin + '/away');
            await page.goBack({ waitUntil: 'commit' });
            await page.waitForFunction(() => window.historyProbe?.shown.length > 0);
            const probe = await page.evaluate(() => window.historyProbe);
            const persisted = probe.shown.at(-1);
            assert.equal(persisted, cacheEnabled, 'Must observe the requested real cache path, not a synthetic event');
            assert.equal(probe.documentId === before, cacheEnabled);
            assert.equal(await page.locator('#comparison').textContent(), '');
            assert.equal(await page.locator('#followup').isVisible(), false);
            if (persisted) {
              assert.equal(await page.locator('#scenario').inputValue(), scenario);
              assert.match(await page.locator('#status').innerText(), /終了しました/);
              assert.equal(await page.locator('#prepare').isEnabled(), false);
              await page.locator('#restart').click();
            } else {
              assert.equal(await page.locator('#scenario').inputValue(), 'normal');
              assert.equal(await page.locator('#history li').count(), 0);
              await page.selectOption('#scenario', scenario);
            }
            for (const step of ['confirm', 'reviewBlockedDispatch', 'compareFixedRecords']) assert.equal(await page.locator('#' + step).isEnabled(), false);
            for (const step of ['prepare', 'confirm', 'reviewBlockedDispatch', 'compareFixedRecords']) await page.locator('#' + step).click();
            assert.match(await page.locator('#status').innerText(), scenario === 'normal' ? /固定の模擬前後記録を比較/ : /結果不明/);
            evidence.push({ browserVersion: browser.version(), width, scenario, cacheEnabled, persisted, sameDocument: probe.documentId === before });
          }
        }
        assert.deepEqual(errors, []); assert.deepEqual(external, []);
      } finally { await browser.close(); }
    }
    fs.writeFileSync(path.join(output, 'dtc-clear-history-runtime.json'), JSON.stringify(evidence, null, 2) + '\n');
    console.log('DTC walkthrough history runtime:', JSON.stringify(evidence));
    console.log('DTC walkthrough actual history: 8 navigation/return/restart cases, cache hit and document reload observed; local fixed samples only');
  } finally { await new Promise(resolve => server.close(resolve)); }
};
