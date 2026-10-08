const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
module.exports = async (context, output) => {
  const { createDevelopmentSessionPreview } = await import('./preview-development-session.js');
  const file = path.join(output, 'development-session.html');
  fs.writeFileSync(file, createDevelopmentSessionPreview());
  const page = await context.newPage(), errors = [], external = [];
  page.on('pageerror', error => errors.push(String(error)));
  page.on('request', request => { if (/^https?:/.test(request.url())) external.push(request.url()); });
  try {
    await page.clock.install({ time: new Date('2026-10-08T00:00:00Z') });
    await page.clock.pauseAt(new Date('2026-10-08T00:00:01Z'));
    for (const width of [390, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      await page.emulateMedia({ colorScheme: width === 390 ? 'light' : 'dark' });
      await page.goto(pathToFileURL(file).href);
      const prepare = page.locator('#prepare'), read = page.locator('#read'), cancel = page.locator('#cancel');
      const end = page.locator('#end'), restart = page.locator('#restart'), result = page.locator('#output');
      assert(await cancel.isDisabled());
      await prepare.focus(); await page.keyboard.press('Enter');
      assert(await prepare.isDisabled()); assert(await read.isDisabled());
      await read.dispatchEvent('click');
      assert.equal(await page.locator('#status').innerText(), '模擬設定の応答を確認中');
      await page.clock.runFor(600);
      assert.match(await result.innerText(), /実機設定・復元・通信形式は未確認/);
      const settingsText = await result.innerText();
      await page.clock.runFor(2000);
      assert.equal(await result.innerText(), settingsText, 'Settings must not auto-start readout');
      await read.click(); assert.equal(await result.textContent(), '');
      await page.clock.runFor(600);
      assert.match(await result.innerText(), /模擬の一回分の記録/);
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      await page.screenshot({ path: path.join(output, `${width}-development-session.png`), fullPage: true });
      for (const button of [prepare, read]) {
        await button.click(); await page.clock.runFor(150);
        await cancel.click();
        assert(await prepare.isDisabled()); assert(await read.isDisabled());
        assert.equal(await result.textContent(), '');
        assert.match(await page.locator('#status').innerText(), /戻るのを待っています/);
        await page.clock.runFor(600);
        assert(await prepare.isEnabled()); assert(await read.isEnabled());
        assert.equal(await result.textContent(), '');
        await page.clock.runFor(1000);
        assert.equal(await result.textContent(), '');
        await button.click(); await page.clock.runFor(150);
        await end.click();
        assert(await prepare.isDisabled()); assert(await read.isDisabled());
        assert.equal(await result.textContent(), '');
        await restart.click();
        assert.equal(await page.evaluate(() => document.activeElement.id), 'prepare');
        await read.click(); await page.clock.runFor(600);
        assert.match(await result.innerText(), /模擬の一回分の記録/, 'Old completion cannot replace the new session');
      }
      await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true })));
      assert.equal(await result.textContent(), '');
      assert(await restart.isVisible()); assert(await read.isDisabled());
      await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })));
      assert(await read.isDisabled());
      await page.evaluate(() => { const script = document.createElement('script'); script.textContent = 'window.unapproved = true'; document.body.append(script); });
      assert.equal(await page.evaluate(() => window.unapproved), undefined);
      assert.equal(await page.evaluate(() => typeof window.ObdReadOnly), 'undefined');
    }
    assert.deepEqual(errors, []); assert.deepEqual(external, []);
    console.log('Development session browser: manual settings/readout, mutual exclusion, pending cancellation, disposal/restart and CSP passed at 390/1280px');
  } finally { await page.close(); }
};
