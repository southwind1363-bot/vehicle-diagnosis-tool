const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { spawnSync } = require('node:child_process');

module.exports = async function validateInteractiveMonitor(context, output) {
  const vm = require('node:vm');
  const { createDtcClearBrowserPreviewSession } = await import('./fixtures/dtc-clear-browser-preview-session.js');
  const runtime = vm.createContext({ window: {}, navigator: {} });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../obd-readonly.js'), 'utf8'), runtime);
  const sample = createDtcClearBrowserPreviewSession(runtime.window.ObdReadOnly);
  let expected;
  try { assert(sample.inspect().ok); expected = sample.inspect().text; }
  finally { sample.dispose(); }
  const { createInteractiveMonitorPreview } = await import('./preview-monitor-review-interactive.js');
  const file = path.join(output, 'interactive.html');
  fs.writeFileSync(file, createInteractiveMonitorPreview(), 'utf8');
  const invalid = spawnSync(process.execPath, [path.join(__dirname, 'preview-monitor-review-interactive.js'), 'private.json'], { encoding: 'utf8', timeout: 10000 });
  assert.equal(invalid.status, 2); assert.equal(invalid.stdout, ''); assert(!invalid.stderr.includes('private.json'));
  const page = await context.newPage();
  const errors = [], external = [];
  page.on('pageerror', error => errors.push(String(error)));
  page.on('request', request => { if (/^https?:/.test(request.url())) external.push(request.url()); });
  try {
    await page.clock.install({ time: new Date('2026-10-05T00:00:00Z') });
    await page.clock.pauseAt(new Date('2026-10-05T00:00:01Z'));
    await page.setViewportSize({ width: 390, height: 900 });
    await page.goto(pathToFileURL(file).href);
    const show = page.getByRole('button', { name: '模擬記録を表示', exact: true });
    const close = page.getByRole('button', { name: '表示を閉じる', exact: true });
    assert(await close.isDisabled());
    await show.focus();
    await page.keyboard.press('Enter');
    assert(await show.isDisabled());
    assert.equal(await page.evaluate(() => document.activeElement.id), 'show', 'Waiting must retain the initiating keyboard position');
    await page.keyboard.press('Enter');
    await page.keyboard.press('Space');
    assert.equal(await page.locator('#review section').count(), 1);
    assert.equal(await page.locator('#review pre').textContent(), '');
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'close');
    await page.keyboard.press('Enter');
    assert.equal(await page.locator('#review').textContent(), '');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'show');
    await page.clock.runFor(500);
    assert.equal(await page.locator('#review').textContent(), '', 'Closed acquisition returned to the DOM');
    await show.click();
    await page.clock.runFor(500);
    assert.equal(await page.locator('pre').textContent(), expected);
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.screenshot({ path: path.join(output, '390-interactive-ready.png'), fullPage: true });
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.emulateMedia({ colorScheme: 'dark' });
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.screenshot({ path: path.join(output, '1280-interactive-dark.png') });
    await page.setViewportSize({ width: 390, height: 900 });
    await page.emulateMedia({ colorScheme: 'light' });
    // Refresh clears immediately; reopening while old work is pending retains only the new result.
    await show.click();
    assert.equal(await page.locator('pre').textContent(), '');
    await close.click();
    await show.click();
    await page.clock.runFor(500);
    assert.equal(await page.locator('pre').textContent(), expected);
    assert.equal(await page.locator('#review section').count(), 1);
    await close.focus();
    await page.keyboard.press('Enter');
    assert.equal(await page.locator('#review').textContent(), '');
    await page.screenshot({ path: path.join(output, '390-interactive-closed.png') });
    const scenario = page.getByLabel('模擬条件', { exact: true });
    await scenario.selectOption('failure');
    await show.click();
    await page.clock.runFor(500);
    assert.equal(await page.locator('#review [role="status"]').innerText(), '前後記録を確認できません');
    assert.equal(await page.locator('pre').textContent(), '');
    assert(await show.isEnabled());
    assert.equal(await page.evaluate(() => document.activeElement.id), 'show', 'Failure must retain the initiating keyboard position');
    const failureText = await page.locator('#review').innerText();
    await page.clock.runFor(2000);
    assert.equal(await page.locator('#review').innerText(), failureText, 'Failure retried without explicit input');
    assert(!failureText.includes('simulated_preview_failure'));
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.screenshot({ path: path.join(output, '390-interactive-failure.png') });
    // A failed old attempt must not clear a new success after changing the scenario.
    await show.click();
    await scenario.selectOption('normal');
    assert.equal(await page.locator('#review').textContent(), '');
    await show.click();
    await page.clock.runFor(500);
    assert.equal(await page.locator('pre').textContent(), expected);
    // A successful old attempt must not restore content under a new failure scenario.
    await show.click();
    await scenario.selectOption('failure');
    assert.equal(await page.locator('#review').textContent(), '');
    await page.clock.runFor(500);
    assert.equal(await page.locator('#review').textContent(), '');
    await show.click();
    await page.clock.runFor(500);
    assert.equal(await page.locator('pre').textContent(), '');
    assert.equal(await page.locator('#review [role="status"]').innerText(), '前後記録を確認できません');
    // The pagehide listener closes ready/pending owners, including a simulated persisted page.
    await scenario.selectOption('normal');
    for (const pending of [false, true]) {
      await show.click();
      if (!pending) await page.clock.runFor(500);
      await page.evaluate(persisted => window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted })), pending);
      assert.equal(await page.locator('#review').textContent(), '');
      assert(await close.isDisabled());
      await page.clock.runFor(500);
      assert.equal(await page.locator('#review').textContent(), '', 'pagehide restored stale evidence');
    }
    await show.click(); await page.clock.runFor(500);
    assert.equal(await page.locator('pre').textContent(), expected);
    assert.equal(await page.evaluate(() => typeof window.ObdReadOnly), 'undefined', 'Runtime escaped private fixture owner');
    await page.evaluate(() => { const script = document.createElement('script'); script.textContent = 'window.unapprovedScript = true'; document.body.appendChild(script); });
    assert.equal(await page.evaluate(() => window.unapprovedScript), undefined, 'Non-hashed script executed');
    await page.goto('about:blank');
    await page.goBack();
    assert.equal(await page.locator('#review').textContent(), '', 'History return restored old evidence');
    assert(await close.isDisabled());
    await show.click(); await page.clock.runFor(500);
    assert.equal(await page.locator('pre').textContent(), expected, 'Explicit read after history return failed');
    assert.deepEqual(errors, []); assert.deepEqual(external, []);
    console.log('Interactive receipt preview: browser-derived output, close/pagehide, late results, failure, recovery, focus and CSP passed');
  } finally { await page.close(); }
};
