const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

module.exports = async function validateDtcClearBrowserParity(context) {
  const { runDtcClearBrowserCases } = await import('./fixtures/dtc-clear-browser-cases.js');
  const runtimeSource = fs.readFileSync(path.join(__dirname, '../obd-readonly.js'), 'utf8');
  const runtime = vm.createContext({ window: {}, navigator: {} });
  vm.runInContext(runtimeSource, runtime);
  const expected = JSON.parse(JSON.stringify(runDtcClearBrowserCases(runtime.window.ObdReadOnly)));
  assert.equal(expected.length, 14);
  assert.equal(expected[0].ok, true);
  assert(expected.slice(1).every(result => !result.ok), 'Negative fixture unexpectedly accepted');
  assert(expected.every(result => result.reason !== 'accessor_must_not_execute'));
  assert.equal(expected.find(result => result.name === 'copied_scope').reason, 'unrecognized_fixture_scope_handle');
  assert.equal(expected[0].disposed.reason, 'evidence_disposed');
  assert.equal(expected[0].invalidated.reason, 'scope_invalidated');
  for (const key of ['realTransportProofAvailable', 'sameVehicleVerified', 'clearBoundaryVerified',
    'readoutCoverageComplete', 'comparisonAvailable', 'clearSucceededInferred',
    'executionEnabled', 'vehicleCommandEnabled', 'wouldTransmit', 'canExecute']) {
    assert.equal(expected[0].pairs.summary[key], false);
  }
  const assets = new Map([['/runtime.js', runtimeSource]]);
  for (const name of ['dtc-clear-browser-cases.js', 'dtc-clear-scoped-readout-core.js', 'dtc-clear-readout-scope.js',
    'dtc-clear-browser-sample.js', 'dtc-clear-browser-preview-session.js', 'monitor-preview-controller.js', 'monitor-preview-view.js',
    'readonly-receipt-owner.js', 'readonly-receipt-capture.js', 'readonly-capture-browser-cases.js', 'readonly-receipt-raw-validation.js', 'single-readout-preview-session.js', 'single-readout-preview-view.js',
    'single-readout-receipt-preview.js', 'single-readout-sample.js', 'readout-presentation-integrity-cases.js', 'readonly-receipt-session.js', 'readonly-timed-receipt-session.js',
    'readonly-receipt-run.js', 'single-readout-run-preview-session.js',
    'readonly-development-session.js', 'readonly-settings-preparation.js',
    'readonly-settings-preparation-session.js', 'readonly-settings-transition.js',
    'readonly-settings-preparation-run.js']) {
    assets.set('/' + name, fs.readFileSync(path.join(__dirname, 'fixtures', name), 'utf8'));
  }
  assets.set('/index.html', '<!doctype html><html lang="ja"><meta charset="utf-8"><title>固定receipt照合試験</title><script src="/runtime.js"></script><script type="module">import {runDtcClearBrowserCases} from "./dtc-clear-browser-cases.js"; window.runFixtureCases = runDtcClearBrowserCases;</script></html>');
  const page = await context.newPage();
  const errors = [], rejectedRequests = [];
  page.on('pageerror', error => errors.push(String(error)));
  // All requests are fulfilled from an explicit local source allowlist. No server or external network.
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.origin !== 'https://fixture.invalid' || !assets.has(url.pathname)) {
      rejectedRequests.push(url.href); return route.abort();
    }
    return route.fulfill({ status: 200, contentType: url.pathname.endsWith('.js') ? 'text/javascript' : 'text/html', body: assets.get(url.pathname) });
  });
  try {
    await page.goto('https://fixture.invalid/index.html');
    await page.waitForFunction(() => typeof window.runFixtureCases === 'function');
    const actual = await page.evaluate(() => window.runFixtureCases(window.ObdReadOnly));
    assert.deepEqual(actual, expected, 'Browser evidence validation differs from Node');
    const { runSingleReadoutCases } = await import('./validate-single-readout-semantics.js');
    const singleCases = runSingleReadoutCases(runtime.window.ObdReadOnly);
    const singleActual = await page.evaluate(inputs => inputs.map(receipts =>
      window.ObdReadOnly.evaluateSingleReadoutRawReceipts({ receipts })), singleCases.map(row => row.receipts));
    assert.deepEqual(singleActual, JSON.parse(JSON.stringify(singleCases.map(row => row.observation))));
    console.log('Single-readout Node/Chromium semantic parity: 17 cases passed');
    await require('./validate-dtc-clear-browser-owner.cjs')(page, expected[0].text.text);
    await require('./validate-single-readout-preview.cjs')(page, runtime.window.ObdReadOnly);
    const { runReadoutPresentationIntegrityCases } = await import('./fixtures/readout-presentation-integrity-cases.js');
    const integrityExpected = runReadoutPresentationIntegrityCases(runtime.window.ObdReadOnly);
    assert.equal(integrityExpected.length, 25);
    assert(integrityExpected.every(entry => entry.result.ok === false && entry.result.text === null && entry.frozen && entry.unchanged));
    const integrityActual = await page.evaluate(async () => {
      const { runReadoutPresentationIntegrityCases } = await import('./readout-presentation-integrity-cases.js');
      return runReadoutPresentationIntegrityCases(window.ObdReadOnly);
    });
    assert.deepEqual(integrityActual, integrityExpected);
    console.log('Readout presentation integrity Node/Chromium parity: 25 malformed summaries rejected, immutable results and unchanged inputs passed');
    await require('./validate-readonly-capture-browser.cjs')(page, runtime.window.ObdReadOnly);
    const { runCompactTranscriptCases } = await import('./validate-elm-readonly-compact.js');
    const compactCases = runCompactTranscriptCases(runtime.window.ObdReadOnly);
    const compactActual = await page.evaluate(inputs => inputs.map(input => window.ObdReadOnly.parseElmReadOnlyRawTranscript(input)), compactCases.map(row => row.input));
    assert.deepEqual(compactActual, JSON.parse(JSON.stringify(compactCases.map(row => row.result))));
    console.log(`Compact read-only Node/Chromium parity: ${compactCases.length} cases passed`);
    const { runCompactReadoutCases } = await import('./validate-single-readout-compact.js');
    const compactReadouts = runCompactReadoutCases(runtime.window.ObdReadOnly);
    const compactObservations = await page.evaluate(inputs => inputs.map(receipts => window.ObdReadOnly.evaluateSingleReadoutRawReceipts({ receipts })), compactReadouts.map(row => row.receipts));
    assert.deepEqual(compactObservations, JSON.parse(JSON.stringify(compactReadouts.map(row => row.observation))));
    console.log(`Compact single-readout Node/Chromium semantic parity: ${compactReadouts.length} cases passed`);
    assert.deepEqual(errors, []); assert.deepEqual(rejectedRequests, []);
    console.log('Fixed receipt Node/Chromium parity: 14 cases, monitor output, disposal, invalidation and false authority flags passed');
  } finally { await page.close(); }
};
