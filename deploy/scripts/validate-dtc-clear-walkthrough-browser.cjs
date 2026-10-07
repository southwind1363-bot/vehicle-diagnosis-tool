const assert = require('node:assert/strict');
const path = require('node:path');
module.exports = async (browser, output) => {
  const { createDtcClearWalkthroughHtml } = await import('./preview-dtc-clear-walkthrough.js');
  const context = await browser.newContext({ serviceWorkers: 'block' });
  const errors = [], external = [];
  try {
    await context.route('**/*', route => {
      if (route.request().url() !== 'http://127.0.0.1/walkthrough') { external.push(route.request().url()); return route.abort(); }
      return route.fulfill({ contentType: 'text/html', body: createDtcClearWalkthroughHtml() });
    });
    const page = await context.newPage(); page.on('pageerror', error => errors.push(error.message));
    for (const width of [390, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto('http://127.0.0.1/walkthrough');
      const steps = ['prepare', 'confirm', 'reviewBlockedDispatch', 'compareFixedRecords'];
      for (let index = 0; index < steps.length; index++) {
        for (let other = 0; other < steps.length; other++) assert.equal(await page.locator('#' + steps[other]).isEnabled(), index === other);
        await page.locator('#' + steps[index]).focus(); await page.keyboard.press('Enter');
      }
      assert.match(await page.locator('#status').innerText(), /実際の消去成功や修理完了を示しません/);
      assert.ok((await page.locator('#comparison').innerText()).length > 0);
      assert.match(await page.locator('#comparison').innerText(), /前のみ P0133/);
      assert.match(await page.locator('#comparison').innerText(), /後のみ P0300/);
      assert.match(await page.locator('#comparison').innerText(), /前後共通 P0420/);
      assert.equal(await page.locator('#history li').count(), 4);
      assert.match(await page.locator('#history').innerText(), /送信拒否を確認/);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      await page.screenshot({ path: path.join(output, `dtc-clear-walkthrough-${width}.png`), fullPage: true });
      await page.locator('#cancel').click(); assert.equal(await page.locator('#comparison').innerText(), '');
      assert.equal(await page.locator('#history li').count(), 5);
      await page.locator('#cancel').click(); assert.equal(await page.locator('#history li').count(), 5);
      for (const scenario of ['result_unknown', 'reread_failed']) {
        await page.selectOption('#scenario', scenario);
        assert.equal(await page.locator('#history li').count(), 0);
        for (const step of steps) await page.locator('#' + step).click();
        assert.equal(await page.locator('#comparison').innerText(), '');
        assert.match(await page.locator('#status').innerText(), scenario === 'result_unknown' ? /結果不明/ : /再読取が完了していません/);
        assert.match(await page.locator('#status').innerText(), /自動再/);
        assert.equal(await page.locator('#history li').count(), 4);
        assert.match(await page.locator('#history li').last().innerText(), /比較保留/);
        for (const step of steps) assert.equal(await page.locator('#' + step).isEnabled(), false);
        await page.screenshot({ path: path.join(output, `dtc-clear-${scenario}-${width}.png`), fullPage: true });
      }
      await page.selectOption('#scenario', 'normal');
      await page.locator('#prepare').click(); await page.locator('#confirm').click();
      await page.selectOption('#scenario', 'reread_failed');
      assert.equal(await page.locator('#prepare').isEnabled(), true);
      assert.equal(await page.locator('#reviewBlockedDispatch').isEnabled(), false);
      assert.equal(await page.locator('#comparison').innerText(), '');
      assert.equal(await page.locator('#history li').count(), 0);
      await page.reload(); await page.locator('#prepare').click();
      await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
      assert.equal(await page.locator('#confirm').isEnabled(), false);
      assert.match(await page.locator('#status').innerText(), /破棄/);
    }
    assert.deepEqual(errors, []); assert.deepEqual(external, []);
    console.log('DTC clear walkthrough browser: staged keyboard flow, comparison, cancel/pagehide, 390/1280px and no external requests passed');
  } finally { await context.close(); }
};
