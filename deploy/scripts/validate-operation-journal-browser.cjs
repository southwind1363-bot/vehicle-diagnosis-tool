const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

const ORIGIN = 'http://127.0.0.1';
const DB_NAME = 'vehicle-diagnosis-operation-journal-v1';
const STORE_NAME = 'preOperationRecords';

const ROOT = path.join(__dirname, '..');
const LOCAL_FILES = new Map([
  ['/obd-readonly.js', path.join(ROOT, 'obd-readonly.js')],
  ['/obd-operation-journal.js', path.join(ROOT, 'obd-operation-journal.js')]
]);

function sha256(text) {
  return crypto.createHash('sha256').update(Buffer.from(text, 'utf8')).digest('hex');
}

function byteLength(text) {
  return Buffer.byteLength(text, 'utf8');
}

function assertExecutionFrozen(result, label) {
  assert.equal(result && typeof result, 'object', true, `${label}: result object`);
  assert.deepEqual(result.execution, {
    wouldTransmit: false,
    canExecute: false,
    retryAllowed: false
  }, `${label}: execution safety flags`);
}

async function installRoutes(context) {
  await context.route('**/*', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin !== ORIGIN || request.method() !== 'GET') return route.abort();
    if (request.resourceType() === 'document' && url.pathname === '/') {
      return route.fulfill({
        status: 200,
        contentType: 'text/html',
        body: '<!doctype html><html><head><meta charset="utf-8"><title>operation journal validation</title><script src="/obd-readonly.js"></script><script src="/obd-operation-journal.js"></script></head><body></body></html>'
      });
    }
    const file = LOCAL_FILES.get(url.pathname);
    if (!file) return route.abort();
    return route.fulfill({
      status: 200,
      contentType: 'text/javascript',
      body: fs.readFileSync(file, 'utf8')
    });
  });
}

async function openPage(context, errors) {
  const page = await context.newPage();
  page.on('pageerror', (error) => errors.push(error.stack || error.message || String(error)));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await page.goto(ORIGIN + '/', { waitUntil: 'load' });
  await page.evaluate(() => {
    if (!window.ObdReadOnly) throw new Error('ObdReadOnly missing');
    if (!window.ObdOperationJournal) throw new Error('ObdOperationJournal missing');
  });
  return page;
}

async function buildCanonicalFixture(page, overrides = {}) {
  return page.evaluate((overridesValue) => {
    const obd = window.ObdReadOnly;
    const session = obd.buildDiagnosticScanSession({
      dtcSnapshot: {
        dtcs: [{ code: 'P0300', status: 'stored', description: 'Random/multiple cylinder misfire detected' }],
        capturedAt: '2026-09-06T00:00:00.000Z',
        protocol: 'ISO 15765-4 CAN'
      },
      readinessSnapshot: {
        monitorCount: 3,
        completeCount: 2,
        incompleteCount: 1,
        monitors: [
          { id: 'misfire', label: 'Misfire', status: 'complete' },
          { id: 'fuel_system', label: 'Fuel system', status: 'complete' },
          { id: 'catalyst', label: 'Catalyst', status: 'incomplete' }
        ]
      },
      livePidSnapshot: {
        values: [
          { pid: '0C', label: 'Engine RPM', value: 742, unit: 'rpm' },
          { pid: '05', label: 'Coolant temperature', value: 84, unit: 'C' }
        ]
      },
      freezeFrameSnapshot: {
        triggerDtc: 'P0300',
        items: [{ pid: '0C', label: 'Engine RPM', value: 1860, unit: 'rpm' }]
      },
      ecuInfoSnapshot: {
        vin: 'TESTVIN1234567890',
        calibrationIds: ['CAL-TEST-001']
      },
      vehicleProfile: {
        make: 'Synthetic',
        model: 'ReadOnly',
        year: 2026
      },
      exportedAt: '2026-09-06T00:00:00.000Z'
    });
    const payload = obd.buildBridgeSessionExportPayload(session);
    payload.wouldTransmit = false;
    payload.canExecute = false;
    payload.retryAllowed = false;
    payload.vehicleCommandEnabled = false;
    Object.assign(payload, overridesValue);
    if (payload.schema_version !== 'bridge_session_export_v1') throw new Error('fixture schema mismatch');
    if (!payload.session || typeof payload.session !== 'object' || !Object.keys(payload.session).length) throw new Error('fixture session empty');
    return JSON.stringify(payload);
  }, overrides);
}

async function listDatabases(page) {
  return page.evaluate(async () => {
    if (typeof indexedDB.databases !== 'function') return null;
    return (await indexedDB.databases()).map((db) => db.name).filter(Boolean).sort();
  });
}

async function readRecord(page, recordId) {
  return page.evaluate(async ({ dbName, storeName, id }) => {
    const open = indexedDB.open(dbName);
    const db = await new Promise((resolve, reject) => {
      open.onsuccess = () => resolve(open.result);
      open.onerror = () => reject(open.error || new Error('open failed'));
      open.onupgradeneeded = () => reject(new Error('read opened missing database'));
    });
    try {
      return await new Promise((resolve, reject) => {
        const request = db.transaction(storeName, 'readonly').objectStore(storeName).get(id);
        request.onsuccess = () => {
          const value = request.result;
          if (!value) return resolve(null);
          resolve({
            recordId: value.recordId,
            createdAt: value.createdAt,
            exportType: value.exportType,
            byteLength: value.byteLength,
            sha256: Array.from(new Uint8Array(value.sha256), byte => byte.toString(16).padStart(2, '0')).join(''),
            sourceText: new TextDecoder().decode(value.sourceBytes)
          });
        };
        request.onerror = () => reject(request.error || new Error('get failed'));
      });
    } finally {
      db.close();
    }
  }, { dbName: DB_NAME, storeName: STORE_NAME, id: recordId });
}

async function recordCount(page) {
  return page.evaluate(async ({ dbName, storeName }) => {
    const open = indexedDB.open(dbName);
    const db = await new Promise((resolve, reject) => {
      open.onsuccess = () => resolve(open.result);
      open.onerror = () => reject(open.error || new Error('open failed'));
      open.onupgradeneeded = () => reject(new Error('count opened missing database'));
    });
    try {
      return await new Promise((resolve, reject) => {
        const request = db.transaction(storeName, 'readonly').objectStore(storeName).count();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error || new Error('count failed'));
      });
    } finally {
      db.close();
    }
  }, { dbName: DB_NAME, storeName: STORE_NAME });
}

async function save(page, recordId, sessionJson) {
  return page.evaluate(async ({ id, json }) => {
    const result = await window.ObdOperationJournal.savePreOperation({ recordId: id, sessionJson: json });
    if (!Object.isFrozen(result) || !Object.isFrozen(result.execution)) throw new Error('Save result is not frozen');
    return result;
  }, { id: recordId, json: sessionJson });
}

async function verify(page, recordId, sessionJson) {
  return page.evaluate(async ({ id, json }) => {
    const result = await window.ObdOperationJournal.verifyPreOperation({ recordId: id, sessionJson: json });
    if (!Object.isFrozen(result) || !Object.isFrozen(result.execution)) throw new Error('Verify result is not frozen');
    return result;
  }, { id: recordId, json: sessionJson });
}

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext({ serviceWorkers: 'block' });
  const deadline = setTimeout(() => { void browser.close(); }, 90000);
  const errors = [];
  let checks = 0;
  try {
    await installRoutes(context);
    let page = await openPage(context, errors);
    const databasesBeforeFirstCall = await listDatabases(page);
    if (databasesBeforeFirstCall) {
      assert.deepEqual(databasesBeforeFirstCall.filter((name) => name === DB_NAME), [], 'journal module must not auto-open IndexedDB');
      checks += 1;
    }

    const canonical = await buildCanonicalFixture(page);
    const canonicalParsed = JSON.parse(canonical);
    assert.equal(canonicalParsed.schema_version, 'bridge_session_export_v1');
    assert.ok(canonicalParsed.session && Object.keys(canonicalParsed.session).length > 0);
    for (const key of ['wouldTransmit', 'canExecute', 'retryAllowed', 'vehicleCommandEnabled']) {
      assert.equal(canonicalParsed[key], false, `canonical ${key}`);
    }
    checks += 1;

    const firstSave = await save(page, 'canonical-record', canonical);
    assert.equal(firstSave.status, 'confirmed', 'first canonical save');
    assertExecutionFrozen(firstSave, 'first canonical save');
    const firstVerify = await verify(page, 'canonical-record', canonical);
    assert.equal(firstVerify.status, 'confirmed', 'canonical verify');
    assertExecutionFrozen(firstVerify, 'canonical verify');
    assert.equal(firstVerify.recordId, 'canonical-record');
    checks += 1;

    const stored = await readRecord(page, 'canonical-record');
    assert.equal(stored.recordId, 'canonical-record');
    assert.equal(stored.exportType, 'bridge_session_export_v1');
    assert.equal(stored.byteLength, byteLength(canonical));
    assert.equal(stored.sha256, sha256(canonical));
    assert.equal(stored.sourceText, canonical, 'stored source bytes preserve exact JSON text');
    assert.ok(Number.isFinite(Date.parse(stored.createdAt)), 'stored createdAt timestamp');
    checks += 1;

    await page.reload({ waitUntil: 'load' });
    const reloadVerify = await verify(page, 'canonical-record', canonical);
    assert.equal(reloadVerify.status, 'confirmed', 'reload verify');
    assertExecutionFrozen(reloadVerify, 'reload verify');
    checks += 1;

    const page2 = await openPage(context, errors);
    const multiPageVerify = await verify(page2, 'canonical-record', canonical);
    assert.equal(multiPageVerify.status, 'confirmed', 'same-context second page verify');
    assertExecutionFrozen(multiPageVerify, 'same-context second page verify');
    checks += 1;

    const missing = await verify(page, 'missing-record', canonical);
    assert.equal(missing.status, 'indeterminate', 'missing record verify');
    assertExecutionFrozen(missing, 'missing record verify');
    checks += 1;

    const duplicateSame = await save(page, 'canonical-record', canonical);
    assert.equal(duplicateSame.status, 'conflict', 'duplicate same text save');
    assertExecutionFrozen(duplicateSame, 'duplicate same text save');
    const modified = await buildCanonicalFixture(page, { diagnosticNote: 'changed fixture' });
    const duplicateDifferent = await save(page, 'canonical-record', modified);
    assert.equal(duplicateDifferent.status, 'conflict', 'duplicate different text save');
    assertExecutionFrozen(duplicateDifferent, 'duplicate different text save');
    assert.equal((await readRecord(page, 'canonical-record')).sourceText, canonical, 'duplicate must not overwrite original');
    checks += 1;

    const concurrentText = await buildCanonicalFixture(page, { diagnosticNote: 'concurrent fixture' });
    const concurrent = await Promise.all([
      save(page, 'concurrent-record', concurrentText),
      save(page2, 'concurrent-record', concurrentText)
    ]);
    assert.deepEqual(concurrent.map((item) => item.status).sort(), ['confirmed', 'conflict'], 'concurrent same id status split');
    concurrent.forEach((item, index) => assertExecutionFrozen(item, `concurrent result ${index}`));
    assert.equal((await readRecord(page, 'concurrent-record')).sourceText, concurrentText);
    checks += 1;

    const [differentA, differentB] = await Promise.all([
      save(page, 'different-a', await buildCanonicalFixture(page, { diagnosticNote: 'different A' })),
      save(page2, 'different-b', await buildCanonicalFixture(page2, { diagnosticNote: 'different B' }))
    ]);
    assert.equal(differentA.status, 'confirmed', 'different id A');
    assert.equal(differentB.status, 'confirmed', 'different id B');
    assertExecutionFrozen(differentA, 'different id A');
    assertExecutionFrozen(differentB, 'different id B');
    checks += 1;

    const unicodeJson = await buildCanonicalFixture(page, { diagnosticNote: '日本語診断記録 / Ω / emoji-free exact bytes' });
    const unicodeSave = await save(page, 'unicode-record', unicodeJson);
    assert.equal(unicodeSave.status, 'confirmed', 'unicode save');
    assertExecutionFrozen(unicodeSave, 'unicode save');
    const unicodeStored = await readRecord(page, 'unicode-record');
    assert.equal(unicodeStored.byteLength, byteLength(unicodeJson));
    assert.equal(unicodeStored.sha256, sha256(unicodeJson));
    assert.equal(unicodeStored.sourceText, unicodeJson, 'unicode JSON exact byte preservation');
    checks += 1;

    const beforeBadInput = await recordCount(page);
    for (const badInput of [
      {},
      { recordId: '', sessionJson: canonical },
      { recordId: 'bad-missing-json' },
      { recordId: 'bad-json', sessionJson: '{"schema_version":"bridge_session_export_v1",' },
      { recordId: 'bad-schema', sessionJson: JSON.stringify({ schema_version: 'other', session: { value: true } }) },
      { recordId: 'bad-flags', sessionJson: await buildCanonicalFixture(page, { canExecute: true }) }
    ]) {
      const result = await page.evaluate((input) => window.ObdOperationJournal.savePreOperation(input), badInput);
      assert.equal(result.status, 'rejected', `bad input rejected: ${badInput.recordId || 'missing fields'}`);
      assertExecutionFrozen(result, `bad input rejected: ${badInput.recordId || 'missing fields'}`);
    }
    assert.equal(await recordCount(page), beforeBadInput, 'bad input must not create DB records');
    checks += 1;

    await page.close();
    await page2.close();
    page = await openPage(context, errors);
    const reopenVerify = await verify(page, 'canonical-record', canonical);
    assert.equal(reopenVerify.status, 'confirmed', 'page close/reopen same context verify');
    assertExecutionFrozen(reopenVerify, 'page close/reopen same context verify');
    checks += 1;

    assert.deepEqual(errors, [], 'page errors and console errors');
    console.log(`Operation journal browser checks: ${checks} / Errors: 0`);
  } finally {
    clearTimeout(deadline);
    await context.close();
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
