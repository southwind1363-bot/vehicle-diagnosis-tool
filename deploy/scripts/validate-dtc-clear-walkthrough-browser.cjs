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
      // Model form-state restoration without a user change event.
      await page.evaluate(() => {
        document.querySelector('#scenario').value = 'no_data';
        window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: false }));
      });
      assert.equal(await page.locator('#scenario').inputValue(), 'normal');
      assert.equal(await page.locator('#followup').isVisible(), false);
      const steps = ['prepare', 'confirm', 'reviewBlockedDispatch', 'compareFixedRecords'];
      for (let index = 0; index < steps.length; index++) {
        for (let other = 0; other < steps.length; other++) assert.equal(await page.locator('#' + steps[other]).isEnabled(), index === other);
        await page.locator('#' + steps[index]).focus(); await page.keyboard.press('Enter');
        if (index === 0) assert.equal(await page.locator('#requirements li[data-complete="false"]').count(), 1);
        if (index === 1) assert.equal(await page.locator('#requirements li[data-complete="false"]').count(), 0);
      }
      assert.match(await page.locator('#status').innerText(), /実際の消去成功や修理完了を示しません/);
      assert.ok((await page.locator('#comparison').innerText()).length > 0);
      assert.match(await page.locator('#comparison').innerText(), /前のみ P0133/);
      assert.match(await page.locator('#comparison').innerText(), /後のみ P0300/);
      assert.match(await page.locator('#comparison').innerText(), /前後共通 P0420/);
      assert.equal(await page.locator('#followup').isVisible(), true);
      assert.deepEqual(await page.locator('#followup-items li').allTextContents(), ['保存DTC', '保留DTC', '永久DTC', 'レディネス']);
      assert.equal(await page.locator('#history li').count(), 4);
      assert.match(await page.locator('#history').innerText(), /送信拒否を確認/);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      await page.screenshot({ path: path.join(output, `dtc-clear-walkthrough-${width}.png`), fullPage: true });
      await page.locator('#cancel').click(); assert.equal(await page.locator('#comparison').innerText(), '');
      assert.equal(await page.locator('#followup').isVisible(), false);
      assert.equal(await page.locator('#followup-items li').count(), 0);
      assert.equal(await page.locator('#history li').count(), 5);
      await page.locator('#cancel').click(); assert.equal(await page.locator('#history li').count(), 5);
      for (const [scenario, missing] of [['pre_record_missing', '消去前DTC状態保存'], ['recovery_missing', '失敗時復旧計画'], ['applicability_missing', '車種・ECU適合確認']]) {
        await page.selectOption('#scenario', scenario);
        assert.equal(await page.locator('#requirements li').count(), 0);
        await page.locator('#prepare').click();
        assert.match(await page.locator('#status').innerText(), /事前条件が不足/);
        assert.equal(await page.locator('#followup').isVisible(), false);
        assert.equal(await page.locator('#requirements li').count(), 12);
        assert.ok((await page.locator('#requirements li[data-complete="false"]').allTextContents()).some(text => text.includes(missing)));
        if (scenario === 'pre_record_missing') assert.match(await page.locator('#record-state').textContent(), /参照がありません/);
        for (const step of steps) assert.equal(await page.locator('#' + step).isEnabled(), false);
        assert.equal(await page.locator('#comparison').innerText(), '');
        await page.locator('details').evaluate(el => { el.open = true; });
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
        await page.screenshot({ path: path.join(output, `dtc-clear-${scenario}-${width}.png`), fullPage: true });
      }
      for (const [scenario, message] of [['result_unknown', /結果不明/], ['reread_failed', /再読取が完了していません/],
        ['no_data', /NO DATA.*DTCゼロ件の証明にはならず/], ['ecu_missing', /対象ECU 7E9の記録が欠け/]]) {
        await page.selectOption('#scenario', scenario);
        assert.equal(await page.locator('#history li').count(), 0);
        for (const step of steps) await page.locator('#' + step).click();
        assert.equal(await page.locator('#comparison').innerText(), '');
        assert.match(await page.locator('#status').innerText(), message);
        assert.match(await page.locator('#status').innerText(), /自動再/);
        assert.equal(await page.locator('#followup').isVisible(), true);
        assert.deepEqual(await page.locator('#followup-items li').allTextContents(), ['保存DTC', '保留DTC', '永久DTC', 'レディネス']);
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
      assert.equal(await page.locator('#followup').isVisible(), false);
      await page.reload(); await page.locator('#prepare').click();
      await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
      assert.equal(await page.locator('#confirm').isEnabled(), false);
      assert.match(await page.locator('#status').innerText(), /破棄/);
      // A restored page remains closed until an explicit restart; no automatic replay.
      await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })));
      assert.equal(await page.locator('#confirm').isEnabled(), false);
      for (const stop of [1, 2, 3, 4]) {
        await page.selectOption('#scenario', 'no_data');
        for (const step of steps.slice(0, stop)) await page.locator('#' + step).click();
        await page.evaluate(() => {
          document.querySelector('#scenario').value = 'normal';
          window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }));
        });
        assert.equal(await page.locator('#scenario').inputValue(), 'no_data');
        assert.match(await page.locator('#status').innerText(), /終了しました/);
        assert.equal(await page.locator('#comparison').textContent(), '');
        assert.equal(await page.locator('#followup').isVisible(), false);
        for (const step of steps) assert.equal(await page.locator('#' + step).isEnabled(), false);
        const count = await page.locator('#history li').count();
        await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })));
        assert.equal(await page.locator('#history li').count(), count);
        await page.locator('#restart').click();
        for (const step of steps) await page.locator('#' + step).click();
        assert.match(await page.locator('#status').innerText(), /NO DATA/);
      }
      for (const scenario of ['normal', 'pre_record_missing', 'recovery_missing', 'applicability_missing',
        'result_unknown', 'reread_failed', 'no_data', 'ecu_missing']) {
        await page.selectOption('#scenario', scenario);
        assert.equal(await page.locator('#restart').isVisible(), false);
        await page.locator('#prepare').click();
        if (!scenario.endsWith('_missing') || scenario === 'ecu_missing') {
          for (const step of steps.slice(1)) await page.locator('#' + step).click();
        }
        const oldStatus = await page.locator('#status').innerText();
        await page.locator('#cancel').click();
        assert.equal(await page.locator('#restart').isVisible(), true);
        await page.locator('details').evaluate(el => { el.open = true; });
        await page.locator('#restart').focus(); await page.keyboard.press('Enter');
        assert.equal(await page.locator('#scenario').inputValue(), scenario);
        assert.equal(await page.evaluate(() => document.activeElement.id), 'prepare');
        assert.equal(await page.locator('#restart').isVisible(), false);
        assert.equal(await page.locator('#history li').count(), 0);
        assert.equal(await page.locator('#requirements li').count(), 0);
        assert.equal(await page.locator('#record-state').textContent(), '');
        assert.equal(await page.locator('#comparison').textContent(), '');
        assert.equal(await page.locator('#followup').isVisible(), false);
        assert.equal(await page.locator('details').evaluate(el => el.open), false);
        for (const step of steps.slice(1)) assert.equal(await page.locator('#' + step).isEnabled(), false);
        await page.keyboard.press('Enter');
        if (!scenario.endsWith('_missing') || scenario === 'ecu_missing') {
          for (const step of steps.slice(1)) await page.locator('#' + step).click();
        }
        assert.equal(await page.locator('#status').innerText(), oldStatus);
      }
    }
    assert.deepEqual(errors, []); assert.deepEqual(external, []);
    console.log('DTC clear walkthrough browser: staged keyboard flow, comparison, cancel/pagehide, 390/1280px and no external requests passed');
  } finally { await context.close(); }
};
