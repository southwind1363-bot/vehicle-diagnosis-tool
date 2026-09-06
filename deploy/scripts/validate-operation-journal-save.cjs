const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

const root = path.resolve(__dirname, '..');
const output = fs.mkdtempSync(path.join(os.tmpdir(), 'obd-operation-journal-save-'));
const typeByExtension = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml' };

function asset(pathname) {
  const file = path.resolve(root, '.' + decodeURIComponent(pathname === '/' ? '/index.html' : pathname));
  const relative = path.relative(root, file);
  if (relative.startsWith('..') || path.isAbsolute(relative) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return null;
  return { file, type: typeByExtension[path.extname(file)] || 'application/octet-stream' };
}

(async () => {
  let server;
  let browser;
  const errors = [];
  const deadline = setTimeout(() => { void browser?.close(); }, 90000);
  try {
    server = http.createServer((request, response) => {
      const pathname = new URL(request.url, 'http://127.0.0.1').pathname;
      if (request.method === 'GET' && pathname === '/favicon.ico') return response.writeHead(204).end();
      const entry = request.method === 'GET' ? asset(pathname) : null;
      if (!entry) return response.writeHead(404).end();
      response.writeHead(200, { 'Content-Type': entry.type });
      response.end(fs.readFileSync(entry.file));
    });
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
    const origin = `http://127.0.0.1:${server.address().port}`;
    browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome', headless: true });
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true, serviceWorkers: 'block' });
    await context.addInitScript(() => {
      localStorage.setItem('vehicle-diagnosis-notice-accepted-v1', 'accepted');
      localStorage.setItem('vehicle-diagnosis-obd-ui-mode-v1', 'details');
      sessionStorage.setItem('vehicle-diagnosis-obd-access-v1', 'enabled');
      sessionStorage.setItem('vehicle-diagnosis-obd-dev-mode-v1', 'enabled');
      Object.defineProperty(navigator, 'serial', { value: undefined, configurable: true });
    });
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(`${message.text()} ${message.location().url || ''}`.trim()); });
    page.setDefaultTimeout(15000);
    await page.goto(origin + '/');
    await page.getByText('登録済み整備データを読み込みました。', { exact: false }).waitFor();
    await page.getByRole('button', { name: '7. OBD2車両読取', exact: true }).click();
    await page.evaluate(() => setObdStage('details'));
    const viewer = page.locator('#obdOperationJournalViewer');
    await viewer.locator(':scope > summary').click();
    const save = page.locator('#obdOperationJournalSaveCurrent');
    const saveStatus = page.locator('#obdOperationJournalSaveStatus');
    const saveAck = page.locator('#obdOperationJournalSaveAck');

    await page.evaluate(() => {
      window.__journalOriginal = window.ObdOperationJournal;
      window.__saveCalls = [];
      window.ObdOperationJournal = Object.freeze({
        ...window.__journalOriginal,
        savePreOperation: async input => {
          window.__saveCalls.push(input);
          return window.__journalOriginal.savePreOperation(input);
        }
      });
      window.__makeSession = () => window.ObdReadOnly.buildDiagnosticScanSession({
        source: 'synthetic_current_readout',
        session_id: 'synthetic-current-readout',
        captured_at: '2026-09-06T00:00:00.000Z',
        dtcSnapshot: { dtcs: [{ code: 'P0300', status: 'stored', description: 'Synthetic DTC' }] },
        readinessSnapshot: { monitorCount: 1, completeCount: 1, incompleteCount: 0, monitors: [{ id: 'misfire', label: 'Misfire', status: 'complete' }] },
        livePidSnapshot: { monitorValues: [{ pid: '0C', label: 'Engine RPM', value: 742, unit: 'rpm' }] },
        vehicleProfile: { make: 'Synthetic', model: 'Current Readout', year: 2026 },
        vehicle_command_enabled: false,
        would_transmit: false
      });
      obdDevSession.lastSession = window.__makeSession();
      window.confirm = () => false;
      renderObdOperationJournalViewer();
    });
    const initialDiagnosis = await page.evaluate(() => JSON.stringify(obdDevSession.lastSession));
    assert.equal(await saveAck.isHidden(), true, 'The acknowledgement must not occupy space before uncertainty exists');

    await save.click();
    await page.waitForFunction(() => document.getElementById('obdOperationJournalSaveStatus').textContent.includes('取り消しました'));
    assert.equal(await page.evaluate(() => window.__saveCalls.length), 0, 'Cancel must not save');
    assert.equal(await page.evaluate(() => JSON.stringify(obdDevSession.lastSession)), initialDiagnosis, 'Cancel must not mutate current diagnosis');

    await page.evaluate(() => { window.confirm = () => { throw new Error('confirm_unavailable'); }; });
    await page.evaluate(() => saveCurrentObdReadoutToOperationJournal());
    await page.waitForFunction(() => document.getElementById('obdOperationJournalSaveStatus').textContent.includes('確認を開始できませんでした'));
    assert.equal(await page.evaluate(() => window.__saveCalls.length), 0, 'A throwing confirmation must not save');
    assert.equal(await page.evaluate(() => obdOperationJournalSaveState.promise), null, 'A throwing confirmation must release the busy sentinel');

    for (const mutation of ['replace', 'same-object', 'lock', 'read-start']) {
      await page.evaluate(kind => {
        obdDevSession.lastSession = window.__makeSession();
        obdDevSession.pendingCommandOperation = null;
        obdSerialDisconnectOperation = null;
        obdDevModeUnlocked = true;
        sessionStorage.setItem('vehicle-diagnosis-obd-dev-mode-v1', 'enabled');
        window.confirm = () => {
          if (kind === 'replace') obdDevSession.lastSession = window.__makeSession();
          if (kind === 'same-object') obdDevSession.lastSession.vehicleProfile = { make: 'Mutated', model: 'Same Object', year: 2026 };
          if (kind === 'lock') lockObdDeveloperMode();
          if (kind === 'read-start') obdDevSession.pendingCommandOperation = {};
          return true;
        };
        renderObdDeveloperGate();
        renderObdOperationJournalViewer();
      }, mutation);
      const callsBefore = await page.evaluate(() => window.__saveCalls.length);
      await page.evaluate(() => saveCurrentObdReadoutToOperationJournal());
      await page.waitForTimeout(40);
      assert.equal(await page.evaluate(() => window.__saveCalls.length), callsBefore, `${mutation} during confirmation must make zero saves`);
      if (mutation === 'lock') assert.equal(await saveStatus.textContent(), '', 'Lock must not leave a saved ID or status in the DOM');
    }

    await page.reload();
    await page.getByText('登録済み整備データを読み込みました。', { exact: false }).waitFor();
    await page.getByRole('button', { name: '7. OBD2車両読取', exact: true }).click();
    await page.evaluate(() => {
      setObdStage('details');
      window.__journalOriginal = window.ObdOperationJournal;
      window.__saveCalls = [];
      window.ObdOperationJournal = Object.freeze({
        ...window.__journalOriginal,
        savePreOperation: input => {
          window.__saveCalls.push(input);
          return new Promise(resolve => { window.__resolveSave = async () => resolve(await window.__journalOriginal.savePreOperation(input)); });
        }
      });
      obdDevSession.lastSession = window.ObdReadOnly.buildDiagnosticScanSession({ source: 'synthetic_current_readout', session_id: 'synthetic-current-readout', captured_at: '2026-09-06T00:00:00.000Z', dtcSnapshot: { dtcs: [{ code: 'P0300', status: 'stored' }] }, vehicleProfile: { make: 'Synthetic', model: 'Current Readout', year: 2026 } });
      window.confirm = () => true;
    });
    const reopenedViewer = page.locator('#obdOperationJournalViewer');
    await reopenedViewer.locator(':scope > summary').click();
    await page.evaluate(() => { void saveCurrentObdReadoutToOperationJournal(); void saveCurrentObdReadoutToOperationJournal(); });
    await page.waitForFunction(() => typeof window.__resolveSave === 'function');
    assert.equal(await page.evaluate(() => window.__saveCalls.length), 1, 'Double save attempts must issue one write');
    await reopenedViewer.locator(':scope > summary').click();
    await reopenedViewer.locator(':scope > summary').click();
    const pendingId = await page.evaluate(() => obdOperationJournalSaveState.id);
    await page.evaluate(() => window.__resolveSave());
    await page.waitForFunction(() => obdOperationJournalSaveState.phase === 'confirmed');
    assert.equal(await page.evaluate(() => obdOperationJournalSaveState.id), pendingId, 'Close and reopen must retain the pending result');
    await reopenedViewer.evaluate(node => node.scrollIntoView({ block: 'center' }));
    await reopenedViewer.screenshot({ path: path.join(output, 'save-confirmed-1280.png') });

    const exactJson = await page.evaluate(() => window.__saveCalls[0].sessionJson);
    await page.evaluate(() => { window.ObdOperationJournal = window.__journalOriginal; });
    await page.locator('#obdOperationJournalRefresh').click();
    await page.waitForFunction(id => [...document.querySelectorAll('#obdOperationJournalList button')].some(node => node.textContent === id), pendingId);
    await page.locator('#obdOperationJournalList button').filter({ hasText: pendingId }).click();
    await page.waitForFunction(id => obdOperationJournalState.selectedRecord?.recordId === id, pendingId);
    const downloadEvent = page.waitForEvent('download');
    await page.locator('#obdOperationJournalDownload').click();
    const download = await downloadEvent;
    const savedFile = path.join(output, download.suggestedFilename());
    await download.saveAs(savedFile);
    assert.deepEqual(fs.readFileSync(savedFile), Buffer.from(exactJson, 'utf8'), 'Refresh, load, and download must preserve exact saved bytes');

    await page.evaluate(() => {
      window.__journalOriginal = window.ObdOperationJournal;
      window.__saveCalls = [];
      window.ObdOperationJournal = Object.freeze({
        ...window.__journalOriginal,
        savePreOperation: input => { window.__saveCalls.push(input); return Promise.resolve({ status: 'indeterminate', reason: 'operation_timeout', recordId: input.recordId }); }
      });
      obdDevSession.lastSession = window.ObdReadOnly.buildDiagnosticScanSession({ source: 'synthetic_current_readout', session_id: 'unknown-save', dtcSnapshot: { dtcs: [{ code: 'P0300', status: 'stored' }] } });
      window.confirm = () => true;
      renderObdOperationJournalViewer();
    });
    await page.locator('#obdOperationJournalSaveCurrent').click();
    await page.waitForFunction(() => obdOperationJournalSaveState.requiresAck === true);
    assert.equal(await page.evaluate(() => window.__saveCalls.length), 1, 'Indeterminate save must not auto retry');
    assert.equal(await page.locator('#obdOperationJournalSaveCurrent').isDisabled(), true, 'Manual retry requires acknowledgement');
    await page.setViewportSize({ width: 390, height: 900 });
    const acknowledgementLayout = await page.evaluate(() => {
      const label = document.getElementById('obdOperationJournalSaveAck');
      const input = document.getElementById('obdOperationJournalSaveAckInput');
      return { labelHeight: label.getBoundingClientRect().height, inputWidth: input.getBoundingClientRect().width, inputHeight: input.getBoundingClientRect().height };
    });
    assert.ok(acknowledgementLayout.labelHeight < 110 && acknowledgementLayout.inputWidth <= 20 && acknowledgementLayout.inputHeight <= 20, `Mobile acknowledgement must remain compact: ${JSON.stringify(acknowledgementLayout)}`);
    await reopenedViewer.evaluate(node => node.scrollIntoView({ block: 'center' }));
    await reopenedViewer.screenshot({ path: path.join(output, 'save-unknown-390.png') });
    await page.locator('#obdOperationJournalSaveAckInput').check();
    await page.evaluate(() => {
      window.ObdOperationJournal = Object.freeze({
        ...window.__journalOriginal,
        savePreOperation: input => { window.__saveCalls.push(input); return Promise.resolve({ status: 'rejected', reason: 'invalid_input', recordId: input.recordId }); }
      });
    });
    await page.locator('#obdOperationJournalSaveCurrent').click();
    await page.waitForFunction(() => window.__saveCalls.length === 2);
    await page.waitForTimeout(30);
    assert.equal(await page.evaluate(() => window.__saveCalls.length), 2, 'Acknowledgement may consume exactly one manual attempt');

    const beforeCryptoFailure = await page.evaluate(() => window.__saveCalls.length);
    await page.evaluate(() => {
      window.__cryptoOriginal = globalThis.crypto;
      Object.defineProperty(globalThis, 'crypto', { value: {}, configurable: true });
      obdOperationJournalSaveState.requiresAck = false;
      obdDevSession.lastSession = window.ObdReadOnly.buildDiagnosticScanSession({ source: 'synthetic_current_readout', session_id: 'crypto-failure', dtcSnapshot: { dtcs: [{ code: 'P0300', status: 'stored' }] } });
      window.confirm = () => true;
      renderObdOperationJournalViewer();
    });
    await page.locator('#obdOperationJournalSaveCurrent').click();
    await page.waitForFunction(() => document.getElementById('obdOperationJournalSaveStatus').textContent.includes('IDを作成できない'));
    assert.equal(await page.evaluate(() => window.__saveCalls.length), beforeCryptoFailure, 'Crypto failure must happen before the API call');
    await page.evaluate(() => Object.defineProperty(globalThis, 'crypto', { value: window.__cryptoOriginal, configurable: true }));
    assert.deepEqual(errors, [], 'No page or console errors');
    console.log(`Operation journal save checks: cancel, snapshot guards, exact save/load/download, acknowledgement, crypto / Errors: 0`);
    console.log(`Screenshots: ${output}`);
  } finally {
    clearTimeout(deadline);
    if (browser) await browser.close();
    if (server) await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
