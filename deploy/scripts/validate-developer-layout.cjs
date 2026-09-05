const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

(async () => {
  const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
  const css = fs.readFileSync(path.join(__dirname, '../style.css'), 'utf8');
  const output = fs.mkdtempSync(path.join(os.tmpdir(), 'obd-layout-'));
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  let checks = 0;
  try {
    for (const width of [390, 768, 1366]) {
      const page = await browser.newPage({ viewport: { width, height: 1000 } });
      await page.route('**/*', route => route.abort());
      await page.setContent('<!doctype html><html lang="ja"><body><main><section id="obd-panel"></section></main></body></html>');
      // Presentation fixture only: no application scripts, credentials, or vehicle I/O.
      await page.evaluate(markup => {
        const source = new DOMParser().parseFromString(markup, 'text/html');
        const section = source.querySelector('#obdStageDetailsView');
        document.querySelector('#obd-panel').append(section);
        section.hidden = false;
        section.querySelector('#obdDevControls').hidden = false;
        section.querySelectorAll('details').forEach(item => { item.open = true; });
      }, html);
      await page.addStyleTag({ content: css });
      for (const theme of ['light', 'dark']) {
        await page.evaluate(value => document.body.classList.toggle('dark', value === 'dark'), theme);
        const problems = await page.evaluate(() => {
          const root = document.querySelector('#obdDevControls');
          const issues = [];
          for (const node of root.querySelectorAll('button, input, select, label, summary')) {
            const box = node.getBoundingClientRect();
            if (!box.width || !box.height) continue;
            if (box.left < -1 || box.right > innerWidth + 1 || node.scrollWidth > node.clientWidth + 1) issues.push(node.id || node.textContent.trim());
            if (node.tagName === 'BUTTON' && box.height < 48) issues.push('small: ' + node.id);
          }
          return issues;
        });
        assert.deepEqual(problems, [], `${width}px ${theme}: overflowing or undersized controls`);
        checks += 1;
        await page.locator('#obdDevControls').screenshot({ path: path.join(output, `${width}-${theme}.png`) });
      }
      await page.close();
    }
    console.log(`Developer layout checks: ${checks} / Errors: 0`);
    console.log(`Screenshots: ${output}`);
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
