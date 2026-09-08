const assert = require('node:assert/strict');
const path = require('node:path');

module.exports = async (page, output) => {
  const initial = await page.evaluate(() => ({ session: JSON.stringify(obdDevSession.lastSession), open: document.querySelector('#obdReadoutDetails').open }));
  const dtcVisible = await page.locator('#obdDetectedCodes').isVisible();
  await page.evaluate(() => {
    window.__originalPrint = window.print;
    window.__printCalls = 0;
    window.print = () => {
      window.__printCalls++;
      window.dispatchEvent(new Event('beforeprint'));
      window.__printMarked = document.body.classList.contains('obd-print-readout');
      window.dispatchEvent(new Event('afterprint'));
    };
  });
  try {
    await page.locator('[data-obd-readout-print]').click();
    assert.equal(await page.evaluate(() => window.__printCalls), 1);
    assert.equal(await page.evaluate(() => window.__printMarked), true);
    assert.equal(await page.locator('.obd-print-ancestor, .obd-print-readout').count(), 0);
    assert.equal(await page.evaluate(() => document.querySelector('#obdReadoutDetails').open), initial.open);
    // Recreate the exact print-only scope for media inspection; no real printer or dialog.
    await page.evaluate(() => {
      for (let node = obdStageResultsView.parentElement; node; node = node.parentElement) node.classList.add('obd-print-ancestor');
      document.body.classList.add('obd-print-readout');
    });
    await page.emulateMedia({ media: 'print' });
    assert.equal(await page.locator('#obdSimpleResultSummary').isVisible(), true);
    assert.equal(await page.locator('#obdDetectedCodes').isVisible(), dtcVisible);
    assert.equal(await page.locator('.obd-simple-result-item').first().isVisible(), true);
    assert.match(await page.locator('.obd-simple-result-item').first().innerText(), /2件/);
    assert.equal(await page.locator('h1').isVisible(), false);
    assert.equal(await page.locator('[data-obd-readout-print]').isVisible(), false);
    assert.equal(await page.locator('#obdAccessPasswordInput').isVisible(), false);
    assert.equal(await page.locator('#obdStageSetupView').isVisible(), false);
    assert.equal(await page.locator('.obd-readout-print-note').isVisible(), true);
    await page.screenshot({ path: path.join(output, 'readout-print.png'), fullPage: true });
    await page.emulateMedia({ media: 'screen' });
    await page.evaluate(() => {
      document.querySelectorAll('.obd-print-ancestor, .obd-print-readout').forEach(node => node.classList.remove('obd-print-ancestor', 'obd-print-readout'));
      window.print = () => { throw new Error('synthetic print failure'); };
    });
    await page.locator('[data-obd-readout-print]').click();
    assert.match(await page.locator('#obdStageResultsView [data-obd-session-export-status]').innerText(), /印刷画面を開けませんでした/);
    assert.equal(await page.locator('.obd-print-ancestor, .obd-print-readout').count(), 0);
    assert.equal(await page.evaluate(() => JSON.stringify(obdDevSession.lastSession)), initial.session);
    await page.evaluate(() => setObdSessionExportStatus(''));
  } finally {
    await page.emulateMedia({ media: 'screen' });
    await page.evaluate(() => {
      document.querySelectorAll('.obd-print-ancestor, .obd-print-readout').forEach(node => node.classList.remove('obd-print-ancestor', 'obd-print-readout'));
      window.print = window.__originalPrint;
      delete window.__originalPrint;
      delete window.__printCalls;
      delete window.__printMarked;
    });
  }
};
