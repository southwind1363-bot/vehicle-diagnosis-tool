// Real DOM tests with a synthetic notification source; no Node ownership model is ported to the browser.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

module.exports = async function validateMonitorPreviewView(context, output, text) {
  const page = await context.newPage();
  const errors = [];
  const external = [];
  page.on('pageerror', error => errors.push(String(error)));
  page.on('request', request => { if (/^https?:/.test(request.url())) external.push(request.url()); });
  try {
    await page.setViewportSize({ width: 390, height: 900 });
    await page.setContent('<!doctype html><html lang="ja"><meta charset="utf-8"><title>模擬通知のDOM試験</title><main><p id="preserved">既存の診断記録</p><div id="view"></div></main></html>');
    await page.evaluate(async ({ source, text }) => {
      const url = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
      const { attachMonitorPreviewView } = await import(url);
      URL.revokeObjectURL(url);
      const listeners = new Set();
      const snapshot = (status, content = null) => Object.freeze({ status, text: content, provenance: 'simulated_only',
        executionEnabled: false, vehicleCommandEnabled: false, wouldTransmit: false, canExecute: false });
      let current = snapshot('empty');
      const review = { inspect: () => current, subscribe(callback) { listeners.add(callback); return () => listeners.delete(callback); } };
      const root = document.querySelector('#view');
      let binding = attachMonitorPreviewView(root, review);
      window.fixtureView = {
        emit(status, content = null) { current = snapshot(status, content); for (const callback of [...listeners]) callback(current); },
        ready() { this.emit('ready', text); },
        dispose() { binding.dispose(); },
        reopen() { binding = attachMonitorPreviewView(root, review); },
        count() { return listeners.size; },
        invalidFlags() { for (const callback of listeners) callback({ ...snapshot('ready', text), canExecute: true }); }
      };
    }, { source: fs.readFileSync(path.join(__dirname, 'fixtures/monitor-preview-view.js'), 'utf8'), text });
    assert.equal(await page.getByRole('status').innerText(), '前後記録がありません');
    await page.evaluate(() => window.fixtureView.ready());
    assert.equal(await page.locator('pre').textContent(), text);
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.screenshot({ path: path.join(output, '390-notification-ready.png'), fullPage: true });
    for (const state of ['reading', 'invalidated', 'unavailable', 'empty', 'unknown', 'constructor']) {
      const cleared = await page.evaluate(state => {
        window.fixtureView.ready();
        window.fixtureView.emit(state, 'stale content must not remain');
        const pre = document.querySelector('pre');
        return pre.textContent === '' && pre.hidden;
      }, state);
      assert(cleared, `${state} did not synchronously clear the DOM`);
    }
    await page.evaluate(() => window.fixtureView.emit('ready', '<img src="https://example.invalid/probe" onerror="window.executed=true">'));
    assert.equal(await page.locator('img').count(), 0, 'Display text became markup');
    assert.equal(await page.evaluate(() => window.executed), undefined);
    await page.evaluate(() => window.fixtureView.invalidFlags());
    assert.equal(await page.locator('pre').textContent(), '');
    assert.equal(await page.getByRole('status').innerText(), '前後記録を確認できません');
    await page.evaluate(() => { window.fixtureView.dispose(); window.fixtureView.dispose(); window.fixtureView.ready(); });
    assert.equal(await page.locator('#view').textContent(), '');
    assert.equal(await page.evaluate(() => window.fixtureView.count()), 0);
    assert.equal(await page.locator('#preserved').innerText(), '既存の診断記録');
    await page.evaluate(() => { window.fixtureView.emit('invalidated'); window.fixtureView.reopen(); });
    assert.equal(await page.locator('pre').textContent(), '');
    assert.equal(await page.getByRole('status').innerText(), '記録の確認条件が変わりました');
    await page.screenshot({ path: path.join(output, '390-notification-invalidated.png') });
    assert.deepEqual(errors, []);
    assert.deepEqual(external, [], 'DOM presentation requested external content');
    console.log('Monitor preview DOM: synchronous clearing, safe text, detach, reopen and unrelated content preservation passed');
  } finally { await page.close(); }
};
