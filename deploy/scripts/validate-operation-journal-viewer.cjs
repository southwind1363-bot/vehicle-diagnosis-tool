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
      window.__comparisonSessionJson = JSON.stringify(session);
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
    const compare = page.locator('#obdOperationJournalCompareCurrent');
    assert.equal(await compare.isDisabled(), true, 'Comparison requires a current readout');
    await page.evaluate(() => {
      obdDevSession.lastSession = JSON.parse(window.__comparisonSessionJson);
      renderObdOperationJournalViewer();
    });
    assert.equal(await compare.isEnabled(), true, 'A selected validated record and idle readout enable explicit comparison');
    await compare.click();
    await page.waitForFunction(() => obdOperationJournalComparisonState.association !== null);
    const matched = await page.evaluate(() => {
      const association = getObdOperationJournalComparisonAssociation();
      const snapshot = association?.controller?.getSnapshot?.();
      return {
        recordId: association?.record?.recordId,
        state: snapshot?.state,
        checks: snapshot?.readiness?.checks?.map(check => check.complete),
        executionEnabled: snapshot?.executionEnabled,
        vehicleCommandEnabled: snapshot?.vehicleCommandEnabled,
        wouldTransmit: snapshot?.wouldTransmit,
        canExecute: snapshot?.canExecute,
        status: obdOperationJournalComparisonState.status
      };
    });
    assert.equal(matched.recordId, 'viewer-record-00', 'Only the selected loaded record may be associated');
    assert.equal(matched.state, 'pre_save_required');
    assert.ok(matched.checks.length > 0 && matched.checks.every(value => value === false), 'Comparison controller must retain all unmet checks');
    assert.deepEqual({ executionEnabled: matched.executionEnabled, vehicleCommandEnabled: matched.vehicleCommandEnabled, wouldTransmit: matched.wouldTransmit, canExecute: matched.canExecute }, {
      executionEnabled: false, vehicleCommandEnabled: false, wouldTransmit: false, canExecute: false
    }, 'Comparison must not enable execution or vehicle commands');
    assert.match(matched.status, /車両同一性・適合・安全条件・消去許可は未確認。 記録ID: viewer-record-00/, 'Match status must remain historical and non-authoritative');
    const preparation = record.locator('.obd-operation-journal-clear-preparation');
    const unbind = preparation.getByRole('button', { name: '比較候補を解除', exact: true });
    const conditions = preparation.locator('details');
    const associationView = await page.evaluate(() => {
      const controller = getObdOperationJournalComparisonAssociation().controller;
      const snapshot = controller.getSnapshot();
      window.__comparisonController = controller;
      window.__comparisonSnapshot = snapshot;
      return {
        recordId: obdOperationJournalState.selectedRecord.recordId,
        sessionJson: obdOperationJournalState.selectedRecord.sessionJson,
        save: { ...obdOperationJournalSaveState },
        list: [...obdOperationJournalState.recordIds],
        currentSession: obdDevSession.lastSession,
        expectedLabels: snapshot.readiness.checks.map(check => check.label),
        expectedCount: snapshot.readiness.totalCount - snapshot.readiness.completedCount,
        completedCount: snapshot.readiness.completedCount,
        totalCount: snapshot.readiness.totalCount,
        journalCalls: window.__journalCalls
      };
    });
    assert.equal(await preparation.getByText('消去前確認', { exact: true }).count(), 1);
    assert.match(await preparation.textContent(), /対象: 未設定/);
    assert.match(await preparation.textContent(), /実車送信なし/);
    assert.equal(await record.locator('.obd-operation-journal-status').first().textContent(), '照合時点の読取内容が一致。車両同一性・適合・安全条件・消去許可は未確認。');
    assert.equal((await record.textContent()).split(associationView.recordId).length - 1, 1, 'Record ID must appear only in existing metadata');
    assert.equal(await conditions.evaluate(node => node.open), false, 'Unconfirmed conditions must be collapsed by default');
    assert.equal(await conditions.locator('summary').textContent(), `未確認の条件 ${associationView.expectedCount}件（確認済み ${associationView.completedCount}/${associationView.totalCount}）`);
    await conditions.locator('summary').click();
    assert.deepEqual(await conditions.locator('li').allTextContents(), associationView.expectedLabels, 'Expanded conditions must show every controller check label');
    assert.equal(await preparation.locator('input, [role="checkbox"], button:not(.secondary-button)').count(), 0, 'Preparation must not expose editable readiness or execution controls');
    assert.deepEqual(await page.evaluate(() => getObdOperationJournalComparisonAssociation().controller.getSnapshot().readiness.checks.map(check => check.complete)), matched.checks, 'Viewing preparation must not mark readiness automatically');
    assert.deepEqual(await page.evaluate(() => {
      const readiness = getObdOperationJournalComparisonAssociation().controller.getSnapshot().readiness;
      return [readiness.completedCount, readiness.totalCount];
    }), [associationView.completedCount, associationView.totalCount], 'Viewing preparation must not rejudge readiness counts');
    await viewer.screenshot({ path: path.join(output, 'operation-journal-comparison-1280.png') });
    await page.setViewportSize({ width: 390, height: 900 });
    assert.equal(await conditions.locator('summary').evaluate(node => node.scrollWidth <= node.clientWidth), true, '390px conditions summary must wrap without horizontal overflow');
    await viewer.screenshot({ path: path.join(output, 'operation-journal-comparison-390.png') });
    await conditions.locator('summary').click();
    await preparation.evaluate(node => node.scrollIntoView({ block: 'center' }));
    assert.equal(await unbind.evaluate(node => {
      const rect = node.getBoundingClientRect();
      return node.contains(document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2));
    }), true, 'The mobile unbind button must not be covered by sticky navigation');
    await page.screenshot({ path: path.join(output, 'operation-journal-preparation-390-viewport.png') });
    await page.setViewportSize({ width: 1280, height: 900 });
    await unbind.click();
    assert.equal(await preparation.count(), 0, 'Unbind must remove the clear-preparation candidate');
    assert.equal(await page.evaluate(() => getObdOperationJournalComparisonAssociation()), null, 'Unbind must clear only the comparison association');
    assert.deepEqual(await page.evaluate(() => ({
      recordId: obdOperationJournalState.selectedRecord.recordId,
      sessionJson: obdOperationJournalState.selectedRecord.sessionJson,
      save: { ...obdOperationJournalSaveState },
      list: [...obdOperationJournalState.recordIds],
      currentSession: obdDevSession.lastSession,
      journalCalls: window.__journalCalls
    })), {
      recordId: associationView.recordId,
      sessionJson: associationView.sessionJson,
      save: associationView.save,
      list: associationView.list,
      currentSession: associationView.currentSession,
      journalCalls: associationView.journalCalls
    }, 'Unbind must retain the selected record, saved outcome, list, and current diagnosis without storage access');
    assert.equal(await download.isEnabled(), true, 'Unbind must retain JSON download eligibility for the selected record');
    assert.equal(await compare.isEnabled(), true, 'Relinking requires the explicit comparison command');
    assert.equal(await page.evaluate(() => obdOperationJournalComparisonState.status), '', 'Unbind must clear the comparison status');
    assert.equal(await page.evaluate(() => window.__comparisonController.getSnapshot() === window.__comparisonSnapshot), true, 'Unbind must not transition or cancel the controller');
    await compare.click();
    await page.waitForFunction(() => obdOperationJournalComparisonState.association !== null);
    await page.evaluate(() => {
      obdDevSession.lastSession.dtcSnapshot.dtcs[0].code = 'P0420';
      renderObdOperationJournalViewer();
    });
    assert.equal(await record.textContent().then(value => value.includes('照合時点の読取内容が一致。')), false, 'A render after in-place mutation must remove the historical match claim');
    assert.equal(await record.locator('.obd-operation-journal-clear-preparation').count(), 0, 'Current-session changes must clear the preparation panel');
    assert.equal(await page.evaluate(() => getObdOperationJournalComparisonAssociation()), null, 'In-place current-session changes must invalidate future association use');
    await compare.click();
    await page.waitForFunction(() => document.getElementById('obdOperationJournalStatus').textContent.includes('一致しません'));
    assert.equal(await page.evaluate(() => obdOperationJournalComparisonState.association), null, 'A mismatch must not associate a record');
    await page.evaluate(() => {
      obdDevSession.lastSession = JSON.parse(window.__comparisonSessionJson);
      renderObdOperationJournalViewer();
    });
    await compare.click();
    await page.waitForFunction(() => obdOperationJournalComparisonState.association !== null);
    await page.evaluate(() => {
      const controller = obdOperationJournalComparisonState.association.controller;
      const snapshot = controller.getSnapshot();
      controller.transition(snapshot, { type: 'cancel', revision: snapshot.revision });
    });
    assert.equal(await page.evaluate(() => getObdOperationJournalComparisonAssociation()), null, 'A transitioned controller must not remain associated');
    await compare.click();
    await page.waitForFunction(() => obdOperationJournalComparisonState.association !== null);
    await page.evaluate(() => {
      obdDevSession.lastSession = JSON.parse(window.__comparisonSessionJson);
      handleObdReadoutSessionReplacement();
    });
    assert.equal(await page.evaluate(() => obdOperationJournalComparisonState.association), null, 'Session-reference replacement must invalidate association');
    assert.equal(await record.locator('.obd-operation-journal-clear-preparation').count(), 0, 'Session-reference replacement must clear the preparation panel');
    await page.evaluate(() => {
      obdDevSession.lastSession = JSON.parse(window.__comparisonSessionJson);
      renderObdOperationJournalViewer();
    });
    await compare.click();
    await page.waitForFunction(() => obdOperationJournalComparisonState.association !== null);
    await list.locator('button').nth(1).click();
    await page.waitForFunction(() => obdOperationJournalState.selectedRecord?.recordId === 'viewer-record-01');
    assert.equal(await page.evaluate(() => obdOperationJournalComparisonState.association), null, 'Selecting another record must invalidate association');
    await compare.click();
    await page.waitForFunction(() => obdOperationJournalComparisonState.association !== null);
    await page.evaluate(() => {
      const payload = JSON.parse(obdOperationJournalState.selectedRecord.sessionJson);
      payload.exported_at = 'invalid-export-time';
      obdOperationJournalState.selectedRecord = { ...obdOperationJournalState.selectedRecord, sessionJson: JSON.stringify(payload) };
      clearObdOperationJournalComparison();
      renderObdOperationJournalViewer();
    });
    assert.equal(await page.evaluate(() => compareCurrentObdReadoutToOperationJournalRecord()), false, 'Invalid exported_at must reject comparison');
    assert.match(await status.textContent(), /照合時刻を確認できない/);
    assert.equal(await page.evaluate(() => obdOperationJournalComparisonState.association), null, 'Invalid exported_at must not fall back to a current timestamp');
    await refresh.click();
    await page.waitForFunction(() => document.querySelectorAll('#obdOperationJournalList button').length === 20);
    await list.locator('button').first().click();
    await page.waitForFunction(() => !document.getElementById('obdOperationJournalCompareCurrent').disabled);
    await page.evaluate(() => {
      obdDevSession.pendingCommandOperation = {};
      renderObdOperationJournalViewer();
    });
    assert.equal(await compare.isDisabled(), true, 'Active vehicle I/O must disable comparison');
    await page.evaluate(() => {
      compareCurrentObdReadoutToOperationJournalRecord();
      obdDevSession.pendingCommandOperation = null;
      renderObdOperationJournalViewer();
    });
    assert.equal(await page.evaluate(() => obdOperationJournalComparisonState.association), null, 'Active vehicle I/O must not create an association');

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
