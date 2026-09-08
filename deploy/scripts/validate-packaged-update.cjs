const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

// Two existing packages, one temporary browser, one origin. No personal storage.
(async () => {
  assert.ok(process.argv[2] && process.argv[3], 'Pass old and new package directories');
  const packages = [];
  for (const argument of process.argv.slice(2, 4)) {
    const root = fs.realpathSync(path.resolve(argument));
    const load = file => import(pathToFileURL(path.join(root, 'scripts', file)).href);
    const { verifyWorkstationPackage: verify } = await load('verify-workstation-package.js');
    const integrity = verify(root);
    const { startLocalWorkstation: start } = await load('start-local-workstation.js');
    const manifest = JSON.parse(fs.readFileSync(path.join(root, 'offline-assets.json'), 'utf8'));
    packages.push({ root, verify, integrity, start, manifest });
  }
  assert.notEqual(packages[0].manifest.version, packages[1].manifest.version);
  const output = fs.mkdtempSync(path.join(os.tmpdir(), 'packaged-update-'));
  const failedUpdate = process.argv.includes('--failed-update');
  let failedAssetRequests = 0;
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext({ serviceWorkers: 'allow', viewport: { width: 390, height: 844 } });
  let workstation, origin, port, stored;
  const errors = [], blocked = [], versions = [], optionalIconErrors = [];
  try {
    await context.addInitScript(() => {
      Object.defineProperty(navigator, 'serial', { value: undefined, configurable: true });
      Object.defineProperty(navigator, 'bluetooth', { value: undefined, configurable: true });
    });
    await context.route('**/*', route => {
      const request = route.request();
      if (new URL(request.url()).origin !== origin || request.method() !== 'GET') {
        blocked.push(request.url()); return route.abort();
      }
      return route.continue();
    });
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => {
      if (message.type() !== 'error') return;
      if (message.location().url === origin + '/favicon.ico'
        && /^(Failed to load resource: net::ERR_FAILED|Failed to load resource: the server responded with a status of 404 \(Not Found\))$/.test(message.text())) optionalIconErrors.push(message.text());
      else errors.push(message.text());
    });
    page.setDefaultTimeout(20000);
    const waitCache = async manifest => {
      const deadline = Date.now() + 60000;
      while (!await page.evaluate(async manifest => {
        const controller = navigator.serviceWorker.controller;
        if (!controller || controller.state !== 'activated') return false;
        const identity = await getOfflineWorkerIdentity(controller);
        if (identity?.version !== manifest.version || identity.cacheName !== 'vehicle-diagnosis-tool-' + manifest.version) return false;
        const cacheName = 'vehicle-diagnosis-tool-' + manifest.version;
        if (!(await caches.has(cacheName))) return false;
        const cache = await caches.open(cacheName);
        const keys = new Set((await cache.keys()).map(request => request.url));
        return ['/', '/index.html', '/offline-assets.json', ...manifest.assets].every(url => keys.has(new URL(url, location.href).href));
      }, manifest)) {
        assert.ok(Date.now() < deadline, 'Package cache not ready: ' + manifest.version);
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    };
    const checkSaved = async () => {
      await page.waitForFunction(() => Array.isArray(savedCases) && savedCases.some(item => item.id === 'package-update-fixture'));
      assert.equal(await page.evaluate(() => localStorage.getItem('vehicle-diagnosis-cases-v1')), stored);
      assert.equal(await page.evaluate(() => savedCases.length), 1);
      assert.equal(await page.evaluate(() => sessionStorage.getItem('vehicle-diagnosis-obd-access-v1')), null);
    };
    for (const [index, pkg] of [packages[0], packages[1], packages[0]].entries()) {
      workstation = await pkg.start({ webPort: port ?? 0, bridgePort: 0, j2534RegistryText: '' });
      if (!origin) { origin = workstation.webUrl; port = Number(new URL(origin).port); }
      assert.equal(workstation.webUrl, origin);
      if (index === 1 && failedUpdate) {
        // Fault injection applies only to this test-owned server, never package files.
        const server = workstation.webServer;
        const listeners = server.listeners('request');
        assert.equal(listeners.length, 1);
        server.removeAllListeners('request');
        server.on('request', (request, response) => {
          if (new URL(request.url, origin).pathname === '/style.css') {
            failedAssetRequests += 1;
            response.writeHead(503, { 'Cache-Control': 'no-store' });
            response.end('Synthetic update asset unavailable');
            return;
          }
          listeners[0].call(server, request, response);
        });
      }
      await context.setOffline(false);
      if (index === 0) {
        await page.goto(origin);
        await page.locator('#noticeCloseButton').click();
      } else {
        await page.reload(); // Existing app checks for a worker update itself.
      }
      if (index === 1 && failedUpdate) {
        await page.waitForFunction(() => document.querySelector('#offlineCacheStatus').textContent.includes('今回のオフライン更新は採用されませんでした'));
        assert.ok(failedAssetRequests > 0, 'Fault must actually reach the worker download');
        assert.equal(await page.locator('#appVersion').innerText(), packages[0].manifest.version);
        assert.equal(await page.evaluate(version => caches.has('vehicle-diagnosis-tool-' + version), pkg.manifest.version), false);
        await waitCache(packages[0].manifest);
        await checkSaved();
        await page.getByRole('button', { name: '1. 診断補助', exact: true }).click();
        await page.locator('#offlineCacheStatus').scrollIntoViewIfNeeded();
        await page.screenshot({ path: path.join(output, 'failed-update-warning.png') });
        await workstation.close();
        assert.equal(workstation.webServer.listening, false);
        assert.equal(workstation.bridgeServer.listening, false);
        await context.setOffline(true);
        assert.equal((await page.reload()).fromServiceWorker(), true);
        await page.waitForFunction(version => document.querySelector('#appVersion').textContent === version, packages[0].manifest.version);
        await checkSaved();
        await waitCache(packages[0].manifest);
        console.log('Failed update rejected; prior complete cache and synthetic case retained offline');
        // Explicit operator-like retry with a fresh healthy server; no automatic retry added.
        workstation = await pkg.start({ webPort: port, bridgePort: 0, j2534RegistryText: '' });
        assert.equal(workstation.webUrl, origin);
        await context.setOffline(false);
        await page.reload();
      }
      await waitCache(pkg.manifest);
      if (index > 0) {
        if (index === 1) {
          await page.locator('#offlineUpdateStatus').waitFor({ state: 'visible' });
          assert.ok((await page.locator('#offlineUpdateStatus').innerText()).includes(pkg.manifest.version));
        } else {
          await page.waitForFunction(() => document.querySelector('#offlineCacheStatus').textContent.includes('画面とオフライン基盤の版を照合できません'));
          assert.equal(await page.locator('#offlineUpdateStatus').isVisible(), false);
        }
        await checkSaved();
        await page.reload();
      }
      await page.waitForFunction(version => document.querySelector('#appVersion').textContent === version, pkg.manifest.version);
      if (index === 0) {
        await page.getByRole('button', { name: '5. データ管理', exact: true }).click();
        await page.locator('#importJsonInput').setInputFiles({ name: 'synthetic-update.json', mimeType: 'application/json',
          buffer: Buffer.from(JSON.stringify([{ id: 'package-update-fixture', model: '模擬車両', symptom: '更新試験専用', obdCode: 'P0300' }])) });
        await page.waitForFunction(() => savedCases.some(item => item.id === 'package-update-fixture'));
        stored = await page.evaluate(() => localStorage.getItem('vehicle-diagnosis-cases-v1'));
      }
      await checkSaved();
      await workstation.close();
      assert.equal(workstation.webServer.listening, false);
      assert.equal(workstation.bridgeServer.listening, false);
      await context.setOffline(true);
      assert.equal((await page.reload()).fromServiceWorker(), true);
      await page.waitForFunction(version => document.querySelector('#appVersion').textContent === version, pkg.manifest.version);
      await checkSaved();
      await page.getByRole('button', { name: '5. データ管理', exact: true }).click();
      await page.screenshot({ path: path.join(output, `${index}-${pkg.manifest.version}-offline.png`) });
      versions.push(pkg.manifest.version);
      console.log('Package version and synthetic case retained offline: ' + pkg.manifest.version);
    }
    assert.deepEqual(errors, []); assert.deepEqual(blocked, []);
    for (const pkg of packages) assert.deepEqual(pkg.verify(pkg.root), pkg.integrity);
    console.log(JSON.stringify({ passed: true, versions, output, failedUpdate, failedAssetRequests, savedDataUnchanged: true, optionalIconErrors,
      limitations: 'Same PC and origin; synthetic case only; no real password, vehicle, OS restart, or format migration' }));
  } finally { await context.close(); await browser.close(); if (workstation) await workstation.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
