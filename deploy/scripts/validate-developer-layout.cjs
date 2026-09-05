const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

(async () => {
  const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
  const css = fs.readFileSync(path.join(__dirname, '../style.css'), 'utf8');
  const source = fs.readFileSync(path.join(__dirname, '../script.js'), 'utf8');
  const start = source.indexOf('function renderObdMeasurementConditionSummary(');
  const end = source.indexOf('function handleObdUnlockKeydown(', start);
  assert.ok(start >= 0 && end > start, 'Measurement summary renderer must be available');
  const renderer = source.slice(start, end);
  const navigationStart = source.indexOf('function navigateToObdReadoutControl(');
  const navigationEnd = source.indexOf('function triggerObdNextReadoutCandidate(', navigationStart);
  assert.ok(navigationStart >= 0 && navigationEnd > navigationStart, 'Navigation helpers must be available');
  const navigation = source.slice(navigationStart, navigationEnd);
  const fields = ['obdLiveObservationCondition', 'obdLiveThermalState', 'obdVehicleMotionState', 'obdTransmissionPosition', 'obdAccessoryLoadState', 'obdSameVehicleConfirmed'];
  const output = fs.mkdtempSync(path.join(os.tmpdir(), 'obd-layout-'));
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  let checks = 0;
  try {
    for (const width of [320, 390, 768, 1366]) {
      const page = await browser.newPage({ viewport: { width, height: 1000 } });
      await page.route('**/*', route => route.abort());
      await page.setContent('<!doctype html><html lang="ja"><body><main><section id="obd-panel"></section></main></body></html>');
      // Presentation fixture only: no application scripts, credentials, or vehicle I/O.
      await page.evaluate(markup => {
        const source = new DOMParser().parseFromString(markup, 'text/html');
        const section = source.querySelector('#obdStageDetailsView');
        document.querySelector('#obd-panel').append(source.querySelector('#obdAccessGatePanel'));
        document.querySelector('#obd-panel').append(section);
        section.hidden = false;
        section.querySelector('#obdDevControls').hidden = false;
        section.querySelectorAll('details').forEach(item => { item.open = true; });
      }, html);
      await page.addStyleTag({ content: css });
      // Execute only the read-only presentation function, not application startup.
      await page.addScriptTag({ content: fields.map(id => `const ${id} = document.getElementById('${id}');`).join('\n') + '\n' + renderer + '\ndocument.getElementById("obdMeasurementConditions").addEventListener("change", renderObdMeasurementConditionSummary);' });
      await page.addScriptTag({ content: `
        let obdAccessUnlocked = false, obdDevModeUnlocked = false;
        const obdAccessPasswordInput = document.getElementById('obdAccessPasswordInput');
        const obdDevPasswordInput = document.getElementById('obdDevPasswordInput');
        const obdDevControls = document.getElementById('obdDevControls');
        const obdDevSessionSummary = document.getElementById('obdDevSessionSummary');
        function setObdUiMode(mode) { document.getElementById('obd-panel').dataset.obdUiMode = mode; }
        ${navigation}
      ` });
      for (const theme of ['light', 'dark']) {
        await page.evaluate(value => document.body.classList.toggle('dark', value === 'dark'), theme);
        for (const [unlockDisabled, lockDisabled, visible] of [[false, true, true], [true, true, true], [true, false, false], [false, true, true]]) {
          await page.evaluate(([unlockDisabled, lockDisabled]) => {
            document.getElementById('obdDevUnlockButton').disabled = unlockDisabled;
            document.getElementById('obdDevLockButton').disabled = lockDisabled;
          }, [unlockDisabled, lockDisabled]);
          assert.equal(await page.locator('#obdDevPasswordInput').isVisible(), visible, 'Only fully unlocked entry should collapse');
          assert.equal(await page.locator('#obdDevLockButton').isVisible(), true);
          assert.equal(await page.locator('#obdDevStatus').isVisible(), true);
          if (!lockDisabled) {
            await page.locator('#obdDevLockButton').focus();
            assert.equal(await page.locator('#obdDevLockButton').evaluate(node => document.activeElement === node), true);
          }
        }
        const focusResults = await page.evaluate(() => {
          const button = document.getElementById('obdDevReadDtcButton');
          const group = button.closest('details');
          let clicks = 0;
          const record = () => { clicks += 1; };
          button.addEventListener('click', record);
          const focused = [];
          for (const [access, developer] of [[false, false], [true, false], [true, true]]) {
            obdAccessUnlocked = access;
            obdDevModeUnlocked = developer;
            group.open = false;
            navigateToObdReadoutControl(button);
            focused.push(document.activeElement === group.querySelector('summary') ? 'group' : document.activeElement.id);
          }
          const revealed = group.open;
          // Enabled only in this inert fixture; no readout handlers are loaded.
          button.disabled = false;
          navigateToObdReadoutControl(button);
          focused.push(document.activeElement.id);
          button.disabled = true;
          navigateToObdReadoutControl(null);
          focused.push(document.activeElement === obdDevControls.querySelector('summary') ? 'first-group' : 'missing-focus');
          button.removeEventListener('click', record);
          return { focused, clicks, revealed };
        });
        assert.deepEqual(focusResults, { focused: ['obdAccessPasswordInput', 'obdDevPasswordInput', 'group', 'obdDevReadDtcButton', 'first-group'], clicks: 0, revealed: true });
        const groups = page.locator('#obdDevControls > details[name="obd-readout-task"]');
        assert.equal(await groups.count(), 5);
        for (let i = 0; i < 5; i += 1) {
          if (!(await groups.nth(i).evaluate(node => node.open))) await groups.nth(i).locator(':scope > summary').click();
          assert.equal(await page.locator('#obdDevControls > details[name="obd-readout-task"][open]').count(), 1);
          const routes = groups.nth(i).locator(':scope > .obd-dev-routes > fieldset');
          assert.equal(await routes.count(), 2);
          assert.deepEqual(await routes.locator('legend').allTextContents(), ['PC直接接続 / ELM327', 'ローカルブリッジ']);
          for (let route = 0; route < 2; route += 1) {
            const buttons = await routes.nth(route).locator('button').evaluateAll(nodes => nodes.map(node => ({ id: node.id, disabled: node.disabled })));
            assert.ok(buttons.length > 0);
            assert.ok(buttons.every(button => button.id.includes('Bridge') === (route === 1) && button.disabled), 'Transport grouping must preserve disabled controls and ownership');
          }
          const overflow = await groups.nth(i).evaluate(group => [...group.querySelectorAll('button, input, select, label, summary')].filter(node => {
            const box = node.getBoundingClientRect();
            if (!box.width || !box.height) return false;
            return box.left < -1 || box.right > innerWidth + 1 || node.scrollWidth > node.clientWidth + 1
              || (node.tagName === 'BUTTON' && box.height < 48);
          }).map(node => node.id || node.textContent.trim()));
          assert.deepEqual(overflow, [], `${width}px ${theme}: task ${i} controls must fit`);
        }
        await groups.nth(3).locator(':scope > summary').click();
        const conditionToggle = page.locator('#obdMeasurementConditions > summary');
        const sameVehicle = page.locator('#obdSameVehicleConfirmed');
        await page.locator('#obdLiveObservationCondition').selectOption('post_repair');
        await page.locator('#obdLiveThermalState').selectOption('warmed_up');
        await page.locator('#obdVehicleMotionState').selectOption('stationary');
        await page.locator('#obdAccessoryLoadState').selectOption('on');
        await page.locator('#obdTransmissionPosition').selectOption('park');
        await sameVehicle.setChecked(false);
        await page.locator('label:has(#obdSameVehicleConfirmed)').click();
        assert.equal(await sameVehicle.isChecked(), true, 'Checkbox label must toggle the control');
        await conditionToggle.click();
        assert.equal(await page.locator('#obdTransmissionPosition').isVisible(), false);
        assert.equal(await page.locator('#obdMeasurementConditionSummary').innerText(), '修理後 / 暖機後 / 停車中 / P / A/C等ON / 同一車両確認済み');
        assert.equal(await page.locator('#obdMeasurementConditionSummary').isVisible(), true);
        await conditionToggle.press('Enter');
        assert.equal(await page.locator('#obdTransmissionPosition').isVisible(), true, 'Keyboard must reopen conditions');
        assert.equal(await page.locator('#obdTransmissionPosition').inputValue(), 'park', 'Collapsing must retain selected conditions');
        assert.equal(await sameVehicle.isChecked(), true, 'Collapsing must retain confirmation');
        await groups.nth(2).locator(':scope > summary').click();
        assert.equal(await page.locator('#obdTransmissionPosition').isVisible(), false);
        await groups.nth(3).locator(':scope > summary').press('Enter');
        assert.equal(await page.locator('#obdTransmissionPosition').inputValue(), 'park', 'Switching tasks must retain conditions');
        assert.equal(await sameVehicle.isChecked(), true, 'Switching tasks must retain same-vehicle confirmation');
        assert.equal(await page.locator('#obdDevStatus').isVisible(), true);
        assert.equal(await page.locator('#obdDevDisconnectButton').isVisible(), true);
        assert.equal(await page.locator('#obdDevReadDtcButton').isDisabled(), true, 'Presentation interactions must not enable readout');
        await page.evaluate(() => {
          const status = document.querySelector('#obdDevStatus');
          status.classList.add('error');
          status.textContent = '接続を確認できませんでした。 ' + 'test-connection-status-'.repeat(12);
        });
        const problems = await page.evaluate(() => {
          const root = document.querySelector('#obdStageDetailsView > .obd-dev-panel');
          const issues = [];
          for (const node of root.querySelectorAll('button, input, select, label, summary, #obdDevStatus')) {
            const box = node.getBoundingClientRect();
            if (!box.width || !box.height) continue;
            if (box.left < -1 || box.right > innerWidth + 1 || node.scrollWidth > node.clientWidth + 1) issues.push(node.id || node.textContent.trim());
            if (node.tagName === 'BUTTON' && box.height < (node.closest('#obdDevControls') ? 48 : 42)) issues.push('small: ' + node.id);
          }
          return issues;
        });
        assert.deepEqual(problems, [], `${width}px ${theme}: overflowing or undersized controls`);
        const reference = page.locator('#obdDevelopmentReference');
        const topics = reference.locator(':scope > details[name="obd-reference-topic"]');
        assert.equal(await topics.count(), 6);
        await topics.evaluateAll(nodes => nodes.forEach(node => { node.open = false; }));
        if (!(await reference.evaluate(node => node.open))) await reference.locator(':scope > summary').click();
        for (let i = 0; i < 6; i += 1) {
          const topic = topics.nth(i);
          await topic.locator(':scope > summary').press('Enter');
          assert.equal(await reference.locator('details[open]').count(), 1);
          const visibleContent = await topic.evaluate(node => [...node.children].slice(1).every(child => child.getClientRects().length > 0));
          assert.equal(visibleContent, true, 'Reference render targets must be revealed');
          assert.equal(await groups.nth(3).evaluate(node => node.open), true, 'Reference selection must not collapse readout controls');
          const box = await topic.boundingBox();
          assert.ok(box && box.x >= 0 && box.x + box.width <= width + 1);
        }
        await reference.locator(':scope > summary').click();
        assert.equal(await topics.nth(5).locator(':scope > summary').isVisible(), false);
        await reference.locator(':scope > summary').press('Enter');
        assert.equal(await topics.nth(5).evaluate(node => node.open), true, 'Returning to reference must retain selected topic');
        await reference.screenshot({ path: path.join(output, `${width}-${theme}-reference.png`) });
        checks += 1;
        await page.locator('#obdStageDetailsView > .obd-dev-panel').screenshot({ path: path.join(output, `${width}-${theme}.png`) });
        if (theme === 'light' && [390, 768].includes(width)) {
          await page.evaluate(() => {
            document.getElementById('obdDevUnlockButton').disabled = true;
            document.getElementById('obdDevLockButton').disabled = false;
            document.getElementById('obdDevModeBadge').textContent = '詳細有効';
          });
          await page.locator('#obdDeveloperGatePanel').screenshot({ path: path.join(output, `${width}-unlocked.png`) });
          await page.evaluate(() => { document.getElementById('obdDevModeBadge').textContent = 'ロック中'; });
        }
      }
      await page.close();
    }
    console.log(`Developer layout checks: ${checks} / Errors: 0`);
    console.log(`Screenshots: ${output}`);
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
