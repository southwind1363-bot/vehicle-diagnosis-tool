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
        checks += 1;
        await page.locator('#obdStageDetailsView > .obd-dev-panel').screenshot({ path: path.join(output, `${width}-${theme}.png`) });
      }
      await page.close();
    }
    console.log(`Developer layout checks: ${checks} / Errors: 0`);
    console.log(`Screenshots: ${output}`);
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
