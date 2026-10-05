// Verify the generated artifact in a real, offline browser, not a duplicate renderer.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

(async () => {
  const { createMonitorPairHtmlPreview } = await import('./preview-monitor-pair-html.js');
  const { createMonitorPairPreview } = await import('./preview-dtc-clear-monitor-pairs.js');
  const text = createMonitorPairPreview();
  const expectedGroups = text.split(/\n(?=\[)/).slice(1).map(group => group.split('\n')[0]);
  const expectedRows = text.split('\n').filter(line => line.startsWith('  ')).map(line => line.trim());
  const output = fs.mkdtempSync(path.join(os.tmpdir(), 'monitor-preview-'));
  const file = path.join(output, 'preview.html');
  fs.writeFileSync(file, createMonitorPairHtmlPreview(), 'utf8');
  const browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || 'chromium', headless: true });
  try {
    const context = await browser.newContext({ offline: true });
    const page = await context.newPage();
    const errors = [], external = [];
    page.on('pageerror', error => errors.push(String(error)));
    page.on('request', request => { if (!request.url().startsWith('file:')) external.push(request.url()); });
    for (const width of [390, 1280]) {
      for (const colorScheme of ['dark', 'light']) {
        await page.setViewportSize({ width, height: 900 });
        await page.emulateMedia({ colorScheme });
        await page.goto(pathToFileURL(file).href);
        assert.deepEqual(await page.locator('h2').allTextContents(), expectedGroups, 'ECU/group identity changed');
        assert.deepEqual(await page.locator('li').allTextContents(), expectedRows, 'Reported states or hold reasons lost');
        assert.equal(await page.locator('aside').innerText(), text.split(/\n(?=\[)/)[0], 'Provenance or limits lost');
        assert.equal(await page.locator('script, input, button, form, a, iframe').count(), 0, 'Unexpected runtime or operation');
        assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Horizontal overflow');
        await page.screenshot({ path: path.join(output, `${width}-${colorScheme}.png`), fullPage: true });
      }
    }
    assert.deepEqual(errors, [], 'Browser errors');
    assert.deepEqual(external, [], 'External resource requested');
    // Confirm the document policy actually rejects an inline browser script.
    await page.evaluate(() => {
      const script = document.createElement('script');
      script.textContent = 'window.monitorPreviewUnexpectedExecution = true';
      document.body.appendChild(script);
    });
    assert.equal(await page.evaluate(() => window.monitorPreviewUnexpectedExecution), undefined, 'Inline script allowed');
    await require('./validate-monitor-preview-view.cjs')(context, output, text);
    await require('./validate-monitor-interactive-browser.cjs')(context, output, text);
    console.log(JSON.stringify({ output, viewports: 2, themes: 2, rows: expectedRows.length,
      offline: true, externalRequests: external.length, inlineScriptBlocked: true }));
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
