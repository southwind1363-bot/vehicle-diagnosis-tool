const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

const root = path.resolve(__dirname, '..');
const output = fs.mkdtempSync(path.join(os.tmpdir(), 'obd-operation-journal-viewer-'));
const typeByExtension = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml' };

function asset(pathname) {
  const file = path.resolve(root, '.' + decodeURIComponent(pathname === '/' ? '/index.html' : pathname));
  const relative = path.relative(root, file);
  if (relative.startsWith('..') || path.isAbsolute(relative) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return null;
  return { file, type: typeByExtension[path.extname(file)] || 'application/octet-stream' };
}

(async () => {
  const errors = [];
  let server;
  let browser;
  const deadline = setTimeout(() => { void browser?.close(); }, 90000);
  try {
    server = http.createServer((request, response) => {
      const entry = request.method === 'GET' ? asset(new URL(request.url, 'http://127.0.0.1').pathname) : null;
      if (!entry) return response.writeHead(404).end();
      response.writeHead(200, { 'Content-Type': entry.type });
      response.end(fs.readFileSync(entry.file));
    });
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
    const origin = `http://127.0.0.1:${server.address().port}`;
    browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome', headless: true });
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block' });
    // Isolated browser storage is the authorization fixture; no user password or vehicle access is used.
    await context.addInitScript(() => {
      localStorage.setItem('vehicle-diagnosis-notice-accepted-v1', 'accepted');
      localStorage.setItem('vehicle-diagnosis-obd-ui-mode-v1', 'details');
      sessionStorage.setItem('vehicle-diagnosis-obd-access-v1', 'enabled');
      sessionStorage.setItem('vehicle-diagnosis-obd-dev-mode-v1', 'enabled');
      Object.defineProperty(navigator, 'serial', { value: undefined, configurable: true });
    });
    await context.route('**/*', async route => {
      const request = route.request();
      const url = new URL(request.url());
      if (url.origin !== origin || request.method() !== 'GET') return route.abort();
      return route.continue();
    });
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    page.setDefaultTimeout(20000);
    await page.goto(origin + '/');
    await page.getByText('登録済み整備データを読み込みました。', { exact: false }).waitFor();
    await page.getByRole('button', { name: '7. OBD2車両読取', exact: true }).click();
    const viewer = page.locator('#obdOperationJournalViewer');
    const refresh = page.locator('#obdOperationJournalRefresh');
    const download = page.locator('#obdOperationJournalDownload');
    const status = page.locator('#obdOperationJournalStatus');
    const list = page.locator('#obdOperationJournalList');
    const record = page.locator('#obdOperationJournalRecord');
    assert.equal(await viewer.evaluate(node => node.open), false);
    assert.equal(await status.textContent(), '一覧未取得');
    assert.equal(await download.isDisabled(), true, 'Download must be disabled before a record is selected');
    const journalDatabases = await page.evaluate(async () => typeof indexedDB.databases === 'function'
      ? (await indexedDB.databases()).map(database => database.name).filter(Boolean)
      : []);
    assert.equal(journalDatabases.includes('vehicle-diagnosis-operation-journal-v1'), false, 'Startup must not open the journal database');
    await viewer.locator(':scope > summary').click();
    assert.equal(await list.locator('button').count(), 0, 'Opening the disclosure must not list records');
    assert.equal(await page.evaluate(() => window.__journalCalls || 0), 0);

    await page.evaluate(async () => {
      const original = window.ObdOperationJournal;
      window.__baseJournal = original;
      window.__journalCalls = 0;
      window.ObdOperationJournal = Object.freeze({
        ...original,
        listPreOperationIds: async (input) => { window.__journalCalls += 1; return original.listPreOperationIds(input); },
        loadPreOperation: async (input) => { window.__journalCalls += 1; return original.loadPreOperation(input); }
      });
    });
    await refresh.click();
    await page.waitForFunction(() => document.getElementById('obdOperationJournalStatus').textContent.includes('ありません'));
    assert.equal(await page.evaluate(() => window.__journalCalls), 1, 'Only the explicit list click may read the journal');

    const canonical = await page.evaluate(() => {
      const session = window.ObdReadOnly.buildDiagnosticScanSession({
        dtcSnapshot: {
          dtcs: [{ code: 'P0300', status: 'stored', description: 'Synthetic DTC' }],
          capturedAt: '2026-09-06T00:00:00.000Z',
          protocol: 'ISO 15765-4 CAN'
        },
        readinessSnapshot: {
          monitorCount: 1,
          completeCount: 1,
          incompleteCount: 0,
          monitors: [{ id: 'misfire', label: 'Misfire', status: 'complete' }]
        },
        livePidSnapshot: { values: [{ pid: '0C', label: 'Engine RPM', value: 742, unit: 'rpm' }] },
        freezeFrameSnapshot: { triggerDtc: 'P0300', items: [{ pid: '0C', label: 'Engine RPM', value: 1860, unit: 'rpm' }] },
        ecuInfoSnapshot: { vin: 'TESTVIN1234567890', calibrationIds: ['CAL-TEST-001'] },
        vehicleProfile: { make: 'Synthetic', model: '<img src=x onerror=alert(1)>', year: 2026 },
        exportedAt: '2026-09-06T00:00:00.000Z'
      });
      const payload = window.ObdReadOnly.buildBridgeSessionExportPayload(session);
      Object.assign(payload, { wouldTransmit: false, canExecute: false, retryAllowed: false, vehicleCommandEnabled: false });
      return JSON.stringify(payload);
    });
    await page.evaluate(async (json) => {
      const journal = window.ObdOperationJournal;
      for (let index = 0; index < 21; index += 1) {
        const result = await journal.savePreOperation({ recordId: `viewer-record-${String(index).padStart(2, '0')}`, sessionJson: json });
        if (result.status !== 'confirmed') throw new Error(`fixture save ${index} failed: ${JSON.stringify(result)}`);
      }
    }, canonical);
    const beforeDiagnosis = await page.evaluate(() => JSON.stringify(obdDevSession.lastSession));
    await refresh.click();
    await page.waitForFunction(() => document.querySelectorAll('#obdOperationJournalList button').length === 20);
    assert.equal(await page.locator('#obdOperationJournalNext').isEnabled(), true);
    assert.equal(await page.locator('#obdOperationJournalPrevious').isEnabled(), false);
    await list.locator('button').first().click();
    const dataDetails = record.locator('details');
    assert.equal(await dataDetails.evaluate(node => node.open), false, 'Large JSON is collapsed by default');
    await dataDetails.locator(':scope > summary').click();
    await record.locator('pre').waitFor();
    assert.equal(await record.locator('pre').textContent(), canonical);
    assert.equal(await record.locator('img').count(), 0, 'Untrusted JSON must remain text');
    assert.equal(await page.evaluate(() => JSON.stringify(obdDevSession.lastSession)), beforeDiagnosis, 'Viewer must not replace the current diagnosis');
    assert.equal(await download.isEnabled(), true, 'A selected current-page record enables download');

    await page.evaluate(() => {
      window.__downloadListOriginal = window.ObdOperationJournal;
      window.ObdOperationJournal = Object.freeze({
        ...window.__downloadListOriginal,
        listPreOperationIds: () => new Promise(resolve => { window.__downloadListDeferred = resolve; })
      });
    });
    await refresh.click();
    await page.waitForFunction(() => typeof window.__downloadListDeferred === 'function');
    assert.equal(await download.isDisabled(), true, 'Download must be disabled while listing');
    await page.evaluate(() => {
      window.__downloadListDeferred({
        status: 'listed',
        recordIds: Array.from({ length: 20 }, (_, index) => `viewer-record-${String(index).padStart(2, '0')}`),
        hasMore: true,
        nextAfterRecordId: 'viewer-record-19'
      });
      window.ObdOperationJournal = window.__downloadListOriginal;
    });
    await page.waitForFunction(() => document.querySelectorAll('#obdOperationJournalList button').length === 20);
    await list.locator('button').first().click();
    await page.waitForFunction(() => !document.getElementById('obdOperationJournalDownload').disabled);

    const selectedBeforeDownloadFailures = await page.evaluate(() => ({
      recordId: obdOperationJournalState.selectedRecord.recordId,
      sessionJson: obdOperationJournalState.selectedRecord.sessionJson
    }));
    await page.evaluate(() => {
      window.__downloadOriginalCreateObjectURL = URL.createObjectURL;
      window.__downloadOriginalRevokeObjectURL = URL.revokeObjectURL;
      window.__downloadOriginalCreateElement = document.createElement.bind(document);
      window.__downloadRevokedUrls = [];
      URL.createObjectURL = () => { throw new Error('url_creation_failed'); };
    });
    await download.click();
    await page.waitForFunction(() => document.getElementById('obdOperationJournalStatus').textContent.includes('開始できませんでした'));
    assert.deepEqual(await page.evaluate(() => ({
      recordId: obdOperationJournalState.selectedRecord.recordId,
      sessionJson: obdOperationJournalState.selectedRecord.sessionJson
    })), selectedBeforeDownloadFailures, 'URL creation failure must retain the selected record');
    await page.evaluate(() => { URL.createObjectURL = window.__downloadOriginalCreateObjectURL; });

    await page.evaluate(() => {
      URL.createObjectURL = () => 'blob:anchor-click-failure';
      URL.revokeObjectURL = url => { window.__downloadRevokedUrls.push(url); };
      document.createElement = tagName => {
        const node = window.__downloadOriginalCreateElement(tagName);
        if (String(tagName).toLowerCase() === 'a') node.click = () => { throw new Error('anchor_click_failed'); };
        return node;
      };
    });
    await download.click();
    await page.waitForFunction(() => document.getElementById('obdOperationJournalStatus').textContent.includes('開始できませんでした'));
    await page.waitForTimeout(20);
    assert.deepEqual(await page.evaluate(() => window.__downloadRevokedUrls), ['blob:anchor-click-failure'], 'Anchor click failure must revoke its object URL');
    assert.equal(await page.locator('a[href="blob:anchor-click-failure"]').count(), 0, 'Anchor click failure must remove its temporary anchor');
    assert.deepEqual(await page.evaluate(() => ({
      recordId: obdOperationJournalState.selectedRecord.recordId,
      sessionJson: obdOperationJournalState.selectedRecord.sessionJson
    })), selectedBeforeDownloadFailures, 'Anchor click failure must retain the selected record');
    await page.evaluate(() => {
      URL.createObjectURL = window.__downloadOriginalCreateObjectURL;
      URL.revokeObjectURL = window.__downloadOriginalRevokeObjectURL || URL.revokeObjectURL;
      document.createElement = window.__downloadOriginalCreateElement;
    });

    await page.evaluate(() => {
      window.__downloadBlob = null;
      URL.createObjectURL = blob => {
        window.__downloadBlob = blob;
        return window.__downloadOriginalCreateObjectURL.call(URL, blob);
      };
    });
    const downloadEvent = page.waitForEvent('download');
    await download.click();
    const savedDownload = await downloadEvent;
    const downloadedFile = path.join(output, savedDownload.suggestedFilename());
    await savedDownload.saveAs(downloadedFile);
    assert.equal(savedDownload.suggestedFilename(), `pre-operation-record-${selectedBeforeDownloadFailures.recordId}.json`);
    assert.deepEqual(fs.readFileSync(downloadedFile), Buffer.from(canonical, 'utf8'), 'Downloaded bytes must exactly match the recovered JSON');
    assert.deepEqual(await page.evaluate(async () => ({ type: window.__downloadBlob.type, text: await window.__downloadBlob.text() })), {
      type: 'application/json;charset=utf-8', text: canonical
    }, 'Download must preserve JSON text and MIME type');
    await page.waitForTimeout(20);
    await page.evaluate(() => {
      URL.createObjectURL = window.__downloadOriginalCreateObjectURL;
      URL.revokeObjectURL = window.__downloadOriginalRevokeObjectURL;
    });
    await page.locator('#obdOperationJournalNext').click();
    await page.waitForFunction(() => document.querySelectorAll('#obdOperationJournalList button').length === 1);
    assert.equal(await page.locator('#obdOperationJournalPrevious').isEnabled(), true);
    assert.equal(await page.locator('#obdOperationJournalNext').isEnabled(), false);
    assert.equal(await download.isDisabled(), true, 'Page changes must clear download eligibility');
    await page.locator('#obdOperationJournalPrevious').click();
    await page.waitForFunction(() => document.querySelectorAll('#obdOperationJournalList button').length === 20);

    async function staleList(action) {
      await page.evaluate(() => {
        const original = window.__baseJournal;
        window.__journalDeferred = {};
        window.ObdOperationJournal = Object.freeze({
          ...original,
          listPreOperationIds: () => new Promise(resolve => { window.__journalDeferred.resolve = resolve; })
        });
      });
      await refresh.click();
      await page.waitForFunction(() => typeof window.__journalDeferred.resolve === 'function');
      await action();
      await page.evaluate(() => window.__journalDeferred.resolve({ status: 'listed', recordIds: ['stale-record'], hasMore: false, nextAfterRecordId: null }));
      await page.waitForTimeout(50);
      assert.equal(await list.locator('button').count(), 0, 'Stale list result must not redraw');
      await page.evaluate(() => { window.ObdOperationJournal = window.__baseJournal; });
    }

    async function ensureViewerOpen() {
      if (!(await viewer.evaluate(node => node.open))) await viewer.locator(':scope > summary').click();
    }

    await staleList(async () => { await page.locator('#obdAccessLockButton').click(); });
    assert.equal(await record.isHidden(), true, 'Access lock clears rendered record synchronously');
    await page.evaluate(() => sessionStorage.setItem('vehicle-diagnosis-obd-access-v1', 'enabled'));
    await page.reload();
    await page.getByText('登録済み整備データを読み込みました。', { exact: false }).waitFor();
    await page.evaluate(() => { window.__baseJournal = window.ObdOperationJournal; });
    await page.getByRole('button', { name: '7. OBD2車両読取', exact: true }).click();
    await viewer.locator(':scope > summary').click();
    await staleList(async () => { await viewer.locator(':scope > summary').click(); });
    await viewer.locator(':scope > summary').click();
    await staleList(async () => { await page.getByRole('button', { name: '診断ホームへ戻る', exact: true }).click(); });
    await page.getByRole('button', { name: '開発・通信設定を開く', exact: true }).click();
    await page.evaluate(() => setObdStage('details'));
    await ensureViewerOpen();
    const tabReturnState = await page.evaluate(() => ({
      panelActive: document.getElementById('obd-panel').classList.contains('is-active'),
      mode: document.getElementById('obd-panel').dataset.obdUiMode,
      stage: document.getElementById('obd-panel').dataset.obdActiveStage,
      viewerOpen: document.getElementById('obdOperationJournalViewer').open,
      viewerHidden: document.getElementById('obdOperationJournalViewer').hidden,
      refreshDisabled: document.getElementById('obdOperationJournalRefresh').disabled,
      developerLocked: document.getElementById('obdDevLockButton').disabled
    }));
    assert.equal(tabReturnState.refreshDisabled, false, JSON.stringify(tabReturnState));
    await staleList(async () => { await page.evaluate(() => activateTab('diagnosis-panel')); });

    for (const [width, dark] of [[1280, false], [390, true]]) {
      await page.evaluate(() => activateTab('obd-panel'));
      await page.evaluate(() => setObdStage('details'));
      await page.setViewportSize({ width, height: 900 });
      await page.evaluate(value => document.body.classList.toggle('dark', value), dark);
      await ensureViewerOpen();
      await refresh.click();
      await page.waitForFunction(() => document.querySelectorAll('#obdOperationJournalList button').length > 0);
      await list.locator('button').first().click();
      await record.locator('details > summary').click();
      await record.locator('pre').waitFor();
      const overflow = await viewer.evaluate(node => [...node.querySelectorAll('button, dt, dd, pre')].filter(item => {
        const box = item.getBoundingClientRect();
        return box.width && (box.left < -1 || box.right > innerWidth + 1 || item.scrollWidth > item.clientWidth + 1);
      }).map(item => item.id || item.className || item.textContent.slice(0, 20)));
      assert.deepEqual(overflow, [], `${width}px viewer content must fit or scroll internally`);
      await record.locator('details > summary').click();
      await viewer.evaluate(node => node.scrollIntoView({ block: 'center' }));
      await viewer.screenshot({ path: path.join(output, `operation-journal-viewer-${width}-${dark ? 'dark' : 'light'}.png`) });
      await viewer.locator(':scope > summary').click();
    }
    await ensureViewerOpen();
    await refresh.click();
    await page.waitForFunction(() => document.querySelectorAll('#obdOperationJournalList button').length > 0);
    await page.evaluate(() => {
      window.__loadCalls = 0;
      window.ObdOperationJournal = Object.freeze({
        ...window.__baseJournal,
        loadPreOperation: () => {
          window.__loadCalls += 1;
          return new Promise(resolve => { window.__resolveLoad = resolve; });
        }
      });
      void loadObdOperationJournalRecord('not-in-current-list');
    });
    assert.equal(await page.evaluate(() => window.__loadCalls), 0, 'Unlisted IDs must not reach storage');
    await list.locator('button').first().click();
    await page.waitForFunction(() => typeof window.__resolveLoad === 'function');
    await page.evaluate(() => {
      window.__postLockObjectUrlCalls = 0;
      window.__postLockCreateObjectURL = URL.createObjectURL;
      URL.createObjectURL = () => { window.__postLockObjectUrlCalls += 1; return 'blob:post-lock'; };
      lockObdDeveloperMode();
      document.getElementById('obdOperationJournalDownload').click();
      window.__resolveLoad({ status: 'loaded', reason: 'valid_record_recovered', record: {
        recordId: 'viewer-record-00', sessionJson: 'stale private content', createdAt: new Date().toISOString(), byteLength: 21
      } });
    });
    await page.waitForTimeout(50);
    assert.equal(await record.textContent(), '', 'Developer lock must discard a late loaded record');
    assert.equal(await viewer.isHidden(), true, 'Developer lock must hide the viewer');
    assert.equal(await download.isDisabled(), true, 'Developer lock must disable download');
    assert.equal(await page.evaluate(() => window.__postLockObjectUrlCalls), 0, 'Locked viewer must not create object URLs or start downloads');
    await page.evaluate(() => { URL.createObjectURL = window.__postLockCreateObjectURL; });
    assert.deepEqual(errors, [], 'No page or console errors');
    console.log(`Operation journal viewer checks: empty, load, pagination, download guards, stale guards, layout / Errors: 0`);
    console.log(`Screenshots: ${output}`);
    await context.close();
  } finally {
    clearTimeout(deadline);
    if (browser) await browser.close();
    if (server) await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
