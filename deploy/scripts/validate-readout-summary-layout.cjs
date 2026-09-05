const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

(async () => {
  const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
  const css = fs.readFileSync(path.join(__dirname, '../style.css'), 'utf8');
  const source = fs.readFileSync(path.join(__dirname, '../script.js'), 'utf8');
  const renderer = source.match(/function renderObdSimpleResultSummary\(session = null\) \{[\s\S]*?\r?\n\}/)?.[0];
  assert.ok(renderer);
  const output = fs.mkdtempSync(path.join(os.tmpdir(), 'obd-summary-'));
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  let checks = 0;
  try {
    for (const width of [320, 390, 768, 1366]) {
      const page = await browser.newPage({ viewport: { width, height: 900 } });
      await page.route('**/*', route => route.abort());
      await page.setContent('<!doctype html><html lang="ja"><body><main><section id="obd-panel" data-obd-ui-mode="simple" data-obd-active-stage="results"></section></main></body></html>');
      await page.evaluate(markup => {
        const doc = new DOMParser().parseFromString(markup, 'text/html');
        const view = doc.getElementById('obdStageResultsView');
        view.hidden = false;
        document.getElementById('obd-panel').append(view);
      }, html);
      await page.addStyleTag({ content: css });
      // Isolated display fixture: only the summary renderer runs, never vehicle I/O.
      await page.addScriptTag({ content: `
        const obdSimpleResultSummary = document.getElementById('obdSimpleResultSummary');
        const obdSimpleResultBadge = document.getElementById('obdSimpleResultBadge');
        const obdSimpleResultGrid = document.getElementById('obdSimpleResultGrid');
        const obdSimpleResultNote = document.getElementById('obdSimpleResultNote');
        const obdDevSession = {}, NO_DATA = 'none';
        function formatObdBridgeDtcStatusSummary() { return ''; }
        function formatObdDtcReadoutStatusSummary() { return ''; }
        function formatObdSimpleFreezeFrameTriggerSummary() { return ''; }
        function formatObdBridgeReadinessSummary() { return ''; }
        function scrollToObdSection() { throw new Error('Unexpected navigation'); }
        ${renderer}
      ` });
      for (const theme of ['light', 'dark']) {
        await page.evaluate(value => document.body.classList.toggle('dark', value === 'dark'), theme);
        await page.evaluate(() => renderObdSimpleResultSummary(null));
        assert.equal(await page.locator('#obdResultsEmptyState').isVisible(), true);
        assert.equal(await page.locator('#obdSimpleResultSummary').isVisible(), false);
        const bounds = await page.locator('#obdResultsEmptyState').evaluate(el => ({ width: el.clientWidth, content: el.scrollWidth }));
        assert.ok(bounds.width >= bounds.content, `${width}/${theme}: empty state overflow`);
        await page.screenshot({ path: path.join(output, `${width}-${theme}-empty.png`) });
        for (const session of [{}, { dtcSnapshot: { dtcs: [] } }, { dtcSnapshot: { dtcs: [{ code: 'P0300' }] } }]) {
          await page.evaluate(value => renderObdSimpleResultSummary(value), session);
          assert.equal(await page.locator('#obdResultsEmptyState').isVisible(), false);
          assert.equal(await page.locator('#obdSimpleResultSummary').isVisible(), true);
          const value = await page.locator('.obd-simple-result-value').first().innerText();
          assert.equal(value, !session.dtcSnapshot ? '未取得' : session.dtcSnapshot.dtcs.length ? '1件' : '0件');
        }
        await page.evaluate(() => {
          renderObdSimpleResultSummary(null);
          document.getElementById('obd-panel').dataset.obdUiMode = 'details';
        });
        assert.equal(await page.locator('#obdResultsEmptyState').isVisible(), false);
        await page.evaluate(() => { document.getElementById('obd-panel').dataset.obdUiMode = 'simple'; });
        checks += 1;
      }
      await page.close();
    }
    console.log(`Readout summary layout combinations: ${checks} / Errors: 0 / Screenshots: ${output}`);
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
