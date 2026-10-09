const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const vm = require('node:vm');
module.exports = async (context, output) => {
  const { createDevelopmentSessionPreview } = await import('./preview-development-session.js');
  const { createSingleReadoutPreviewSession } = await import('./fixtures/single-readout-preview-session.js');
  const runtime = vm.createContext({ window: {} });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../obd-readonly.js'), 'utf8'), runtime);
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
      const showResult = page.getByRole('button', { name: '結果へ移動', exact: true });
      const backControls = page.locator('#back-controls');
      assert(await backControls.isHidden());
      assert(await backControls.isDisabled());
      assert(await showResult.isDisabled());
      assert.equal(await result.getAttribute('aria-label'), '模擬操作の結果');
      const checkResultNavigation = async () => {
        assert(await showResult.isEnabled());
        const before = await result.textContent();
        const message = await page.locator('#status').innerText();
        await showResult.focus(); await page.keyboard.press('Enter');
        assert.equal(await page.evaluate(() => document.activeElement.id), 'output');
        assert.equal(await result.textContent(), before, 'Navigation does not reacquire or replace the result');
        assert.equal(await page.locator('#status').innerText(), message);
        assert(await read.isEnabled());
        assert(await backControls.isVisible());
        await backControls.focus(); await page.keyboard.press('Enter');
        assert.equal(await page.evaluate(() => document.activeElement.id), 'scenario');
        await page.clock.runFor(600);
        assert.equal(await result.textContent(), before, 'Returning to controls must not start an acquisition');
        assert.equal(await page.locator('#status').innerText(), message);
        assert(await read.isEnabled());
      };
      const scenario = page.getByRole('combobox', { name: '模擬取得の進み方', exact: true });
      const sampleChoice = page.locator('#sample');
      const failurePosition = page.locator('#failure-position');
      assert(await failurePosition.isDisabled());
      const progress = page.locator('#progress');
      const checkSteps = async labels => {
        for (let index = 0; index < labels.length; index++) {
          assert.equal(await progress.innerText(), `${index + 1}/4：${labels[index]}（模擬応答待ち）`);
          assert.equal(await result.textContent(), '', 'Progress does not publish partial results');
          assert(await showResult.isDisabled(), 'Pending acquisition has no navigable result');
          assert(await backControls.isHidden());
          assert(await backControls.isDisabled());
          await page.clock.runFor(120);
        }
        assert.equal(await progress.textContent(), '', 'Settled operations clear progress');
      };
      assert(await cancel.isDisabled());
      await prepare.focus(); await page.keyboard.press('Enter');
      assert(await prepare.isDisabled()); assert(await read.isDisabled());
      await read.dispatchEvent('click');
      assert.equal(await page.locator('#status').innerText(), '模擬設定の応答を確認中');
      await checkSteps(['応答整形の設定', 'データ長表示の設定', '拡張アドレスの設定', '通信番号の確認']);
      assert.match(await result.innerText(), /実機設定・復元・通信形式は未確認/);
      const settingsText = await result.innerText();
      await checkResultNavigation();
      await page.clock.runFor(2000);
      assert.equal(await result.innerText(), settingsText, 'Settings must not auto-start readout');
      await read.click(); assert.equal(await result.textContent(), '');
      await checkSteps(['保存DTC', '保留DTC', '恒久DTC', 'レディネス']);
      assert.match(await result.innerText(), /模擬の一回分の記録/);
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      await page.screenshot({ path: path.join(output, `${width}-development-session.png`), fullPage: true });
      for (const button of [prepare, read]) {
        await button.click(); await page.clock.runFor(150);
        await cancel.click();
        assert(await showResult.isDisabled());
        assert.equal(await progress.textContent(), '');
        assert(await prepare.isDisabled()); assert(await read.isDisabled());
        assert.equal(await result.textContent(), '');
        assert.match(await page.locator('#status').innerText(), /戻るのを待っています/);
        await page.clock.runFor(600);
        assert.equal(await progress.textContent(), '', 'Cancelled callback cannot restore progress');
        assert(await prepare.isEnabled()); assert(await read.isEnabled());
        assert.match(await page.locator('#status').innerText(), /模擬操作を取り消しました/);
        assert.equal(await result.textContent(), '');
        await page.clock.runFor(1000);
        assert.equal(await result.textContent(), '');
        await button.click(); await page.clock.runFor(150);
        await end.focus(); await page.keyboard.press('Enter');
        assert(await showResult.isDisabled());
        assert(await backControls.isHidden());
        await backControls.dispatchEvent('click');
        assert.equal(await page.evaluate(() => document.activeElement.id), 'restart');
        assert.equal(await progress.textContent(), '');
        assert(await prepare.isDisabled()); assert(await read.isDisabled());
        assert.equal(await result.textContent(), '');
        await page.keyboard.press('Enter');
        assert.equal(await page.evaluate(() => document.activeElement.id), 'prepare');
        await page.clock.runFor(600);
        assert.equal(await page.evaluate(() => document.activeElement.id), 'prepare', 'Old completion must not move focus');
        assert.equal(await result.textContent(), '', 'Keyboard restart does not start acquisition');
        await read.click(); await page.clock.runFor(600);
        assert.match(await result.innerText(), /模擬の一回分の記録/, 'Old completion cannot replace the new session');
      }
      for (const failure of ['incomplete', 'exception']) {
        for (const button of [prepare, read]) {
          await scenario.selectOption(failure);
          assert.equal(await result.textContent(), '', 'Changing conditions clears old results');
          await button.click();
          assert(await scenario.isDisabled());
          await page.evaluate(() => {
            const select = document.getElementById('scenario');
            select.value = 'normal'; select.dispatchEvent(new Event('change'));
          });
          assert.equal(await scenario.inputValue(), failure, 'Pending conditions cannot change');
          await page.clock.runFor(600);
          assert.equal(await progress.textContent(), '', 'Failed acquisition clears progress');
          assert.equal(await result.textContent(), '', 'Partial acquisition must not appear');
          const failureText = await page.locator('#status').innerText();
          assert.match(failureText, failure === 'incomplete' ? /取得が完了しませんでした/ : /模擬処理でエラーが発生/);
          assert.doesNotMatch(failureText, /取り消しました/);
          assert(await scenario.isEnabled()); assert(await read.isEnabled()); assert(await prepare.isEnabled());
          assert.doesNotMatch(await page.locator('body').innerText(), /synthetic_private_failure|readout_failed|settings_preparation_failed/);
          await page.clock.runFor(2000);
          assert.equal(await result.textContent(), '', 'No automatic retry');
          assert.equal(await page.locator('#status').innerText(), failureText);
          await scenario.selectOption('normal');
          assert.doesNotMatch(await page.locator('#status').innerText(), /完了しませんでした|エラーが発生/);
          await button.click();
          assert.match(await page.locator('#status').innerText(), /確認中|取得中/);
          await page.clock.runFor(600);
          assert.equal(await page.locator('#status').innerText(), button === prepare ? '模擬操作が終了しました' : '模擬記録の取得が終了しました。4項目で正応答を観測しましたが、故障なし・修理完了の判定ではありません。');
          assert.match(await result.innerText(), button === prepare ? /実機設定・復元・通信形式は未確認/ : /模擬の一回分の記録/);
          await scenario.selectOption(failure);
          await button.click(); await page.clock.runFor(150); await end.click();
          assert(await scenario.isDisabled());
          await restart.click(); await scenario.selectOption('normal');
          await read.click(); await page.clock.runFor(600);
          assert.match(await result.innerText(), /模擬の一回分の記録/, 'Late failure cannot replace a new result');
        }
      }
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      await page.screenshot({ path: path.join(output, `${width}-development-session.png`), fullPage: true });
      const samples = ['normal', 'codes_present', 'mixed_sources', 'mixed_conflict', 'compact', 'conflict', 'missing_prompt', 'negative_response', 'no_data'];
      assert.deepEqual(await sampleChoice.locator('option').evaluateAll(options => options.map(option => option.value)), samples);
      for (const sample of samples) {
        await sampleChoice.selectOption(sample);
        assert.equal(await result.textContent(), '', 'Sample changes discard the previous display');
        assert(await showResult.isDisabled());
        assert.equal(await page.locator('#status').innerText(), '模擬条件を変更しました。操作を選んでください', 'Sample changes clear the previous conclusion');
        assert.equal(await progress.textContent(), '');
        await prepare.click(); await page.clock.runFor(600);
        assert.match(await result.innerText(), /実機設定・復元・通信形式は未確認/);
        await read.click();
        assert(await sampleChoice.isDisabled());
        await page.evaluate(() => {
          const select = document.getElementById('sample');
          select.value = select.value === 'normal' ? 'no_data' : 'normal';
          select.dispatchEvent(new Event('change'));
        });
        assert.equal(await sampleChoice.inputValue(), sample, 'A pending capture keeps its original sample');
        await page.clock.runFor(600);
        const baseline = createSingleReadoutPreviewSession(runtime.window.ObdReadOnly, sample);
        try { assert.equal(await result.innerText(), baseline.inspect().text, `${width}/${sample}: semantic output matches existing evaluator`); }
        finally { baseline.dispose(); }
        assert.equal(await page.locator('#status').innerText(), ['normal', 'codes_present', 'compact'].includes(sample)
          ? '模擬記録の取得が終了しました。4項目で正応答を観測しましたが、故障なし・修理完了の判定ではありません。'
          : '模擬記録の取得が終了しました。正応答未確認・判定保留・分類不明の項目があります。本文で各項目の内容を確認してください。', `${width}/${sample}: acquisition completion preserves uncertainty`);
        assert.equal(await progress.textContent(), '');
        assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
        const completeText = await result.innerText();
        const completeStatus = await page.locator('#status').innerText();
        await checkResultNavigation();
        // Re-read the same sample: discard the old conclusion before any response,
        // and do not restore it when a cancelled response settles late.
        await read.click();
        assert.equal(await result.textContent(), '');
        assert.equal(await page.locator('#status').innerText(), '模擬記録を取得中');
        assert(await showResult.isDisabled());
        await showResult.dispatchEvent('click');
        await backControls.dispatchEvent('click');
        assert.notEqual(await page.evaluate(() => document.activeElement.id), 'scenario', 'Hidden return control rejects synthetic clicks');
        assert.notEqual(await page.evaluate(() => document.activeElement.id), 'output', 'Disabled navigation also rejects synthetic clicks');
        await page.clock.runFor(150); await cancel.click();
        assert.equal(await result.textContent(), '');
        assert.match(await page.locator('#status').innerText(), /戻るのを待っています/);
        await page.clock.runFor(600);
        assert.equal(await result.textContent(), '');
        assert.match(await page.locator('#status').innerText(), /模擬操作を取り消しました/);
        assert(await showResult.isDisabled());
        assert.notEqual(await page.locator('#status').innerText(), completeStatus);
        await read.click(); await page.clock.runFor(600);
        assert.equal(await result.innerText(), completeText);
        assert.equal(await page.locator('#status').innerText(), completeStatus, 'Explicit retry restores the current sample conclusion');
        assert(await showResult.isEnabled());
        for (const failure of ['incomplete', 'exception']) {
          await scenario.selectOption(failure);
          assert.equal(await result.textContent(), '');
          assert.equal(await page.locator('#status').innerText(), '模擬条件を変更しました。操作を選んでください');
          await read.click(); await page.clock.runFor(600);
          assert.equal(await result.textContent(), '', `${sample}/${failure}: no partial diagnostic display`);
          assert(await showResult.isDisabled());
          assert.equal(await progress.textContent(), '');
          assert.match(await page.locator('#status').innerText(), failure === 'incomplete' ? /取得が完了しませんでした/ : /模擬処理でエラーが発生/);
          await scenario.selectOption('normal');
          await read.click();
          assert.equal(await page.locator('#status').innerText(), '模擬記録を取得中', 'Failure explanation clears before recovery completes');
          await page.clock.runFor(600);
          assert.equal(await result.innerText(), completeText, 'Manual recovery keeps the selected sample semantics');
          assert.equal(await page.locator('#status').innerText(), completeStatus, 'Manual recovery restores the selected sample conclusion');
        }
      }
      await sampleChoice.selectOption('normal');
      for (const failure of ['incomplete', 'exception']) {
        await scenario.selectOption(failure);
        for (const position of ['1', '2', '3', '4']) {
          await failurePosition.selectOption(position);
          for (const button of [prepare, read]) {
            await button.click();
            assert(await failurePosition.isDisabled());
            await page.evaluate(() => {
              const select = document.getElementById('failure-position');
              select.value = select.value === '1' ? '4' : '1'; select.dispatchEvent(new Event('change'));
            });
            assert.equal(await failurePosition.inputValue(), position);
            await page.clock.runFor((Number(position) - 1) * 120);
            assert.match(await progress.innerText(), new RegExp('^' + position + '/4：'));
            await page.clock.runFor(120);
            assert.equal(await result.textContent(), '', 'No completed result even when the fourth response fails');
            assert.equal(await progress.textContent(), '');
            assert.match(await page.locator('#status').innerText(), failure === 'incomplete' ? /取得が完了しませんでした/ : /模擬処理でエラーが発生/);
            await page.clock.runFor(600);
            assert.equal(await result.textContent(), '');
          }
        }
      }
      await scenario.selectOption('normal');
      assert(await failurePosition.isDisabled());
      for (const interruption of ['disconnect', 'settings_changed']) {
        for (const position of ['1', '2', '3', '4']) {
          for (const button of [prepare, read]) {
            await scenario.selectOption(interruption);
            await failurePosition.selectOption(position);
            await button.click(); await page.clock.runFor(600);
            assert.equal(await result.textContent(), ''); assert.equal(await progress.textContent(), '');
            const stopped = await page.locator('#status').innerText();
            assert.match(stopped, /模擬接続または設定条件が変わった/);
            assert(await read.isDisabled()); assert(await prepare.isDisabled());
            assert(await scenario.isDisabled()); assert(await restart.isVisible());
            assert.equal(await page.evaluate(() => document.activeElement.id), 'restart');
            await read.dispatchEvent('click'); await prepare.dispatchEvent('click');
            await page.clock.runFor(1000);
            assert.equal(await page.locator('#status').innerText(), stopped);
            assert.equal(await result.textContent(), '');
            await page.keyboard.press('Enter');
            assert.equal(await page.evaluate(() => document.activeElement.id), 'prepare');
            assert.equal(await result.textContent(), '', 'Restart never starts a read automatically');
            await scenario.selectOption('normal');
            await button.click(); await page.clock.runFor(600);
            assert.match(await result.innerText(), button === prepare ? /実機設定・復元・通信形式は未確認/ : /模擬の一回分の記録/);
          }
        }
      }
      await sampleChoice.selectOption('no_data'); await read.click(); await page.clock.runFor(600);
      // Emulate silent form restoration after pageshow: no change event is dispatched.
      await page.evaluate(() => {
        document.getElementById('scenario').value = 'exception';
        document.getElementById('sample').value = 'codes_present';
        document.getElementById('failure-position').value = '4';
      });
      await read.click(); await page.clock.runFor(360);
      assert.match(await progress.innerText(), /^4\/4：/);
      await page.clock.runFor(120);
      assert.match(await page.locator('#status').innerText(), /模擬処理でエラーが発生/);
      assert.equal(await result.textContent(), '');
      await scenario.selectOption('normal'); await sampleChoice.selectOption('no_data');
      await read.click(); await page.clock.runFor(600);
      await page.evaluate(() => {
        const select = document.getElementById('sample');
        select.add(new Option('unsupported', 'unknown')); select.value = 'unknown'; select.dispatchEvent(new Event('change'));
      });
      assert.equal(await sampleChoice.inputValue(), 'no_data', 'Unknown samples are refused');
      await page.screenshot({ path: path.join(output, `${width}-development-session-samples.png`), fullPage: true });
      await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true })));
      assert.equal(await result.textContent(), '');
      assert(await restart.isVisible()); assert(await read.isDisabled());
      assert(await sampleChoice.isDisabled());
      await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })));
      assert(await read.isDisabled());
      assert.equal(await page.evaluate(() => document.activeElement.id), 'restart', 'History restore offers explicit keyboard restart');
      await page.evaluate(() => { const script = document.createElement('script'); script.textContent = 'window.unapproved = true'; document.body.append(script); });
      assert.equal(await page.evaluate(() => window.unapproved), undefined);
      assert.equal(await page.evaluate(() => typeof window.ObdReadOnly), 'undefined');
    }
    assert.deepEqual(errors, []); assert.deepEqual(external, []);
    console.log('Development session browser: 9 samples, 36 sample recovery paths, 32 failure-position paths, 32 connection/settings interruption and restart paths and CSP passed at 390/1280px');
  } finally { await page.close(); }
};
