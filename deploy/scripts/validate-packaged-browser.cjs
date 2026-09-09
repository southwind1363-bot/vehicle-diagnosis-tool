const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { pathToFileURL } = require('node:url');
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

// Run against an extracted, unmodified package; never use a personal browser profile.
(async () => {
  assert.ok(process.argv[2], 'Pass the extracted package directory');
  const root = fs.realpathSync(path.resolve(process.argv[2]));
  const load = file => import(pathToFileURL(path.join(root, 'scripts', file)).href);
  const { verifyWorkstationPackage } = await load('verify-workstation-package.js');
  const before = verifyWorkstationPackage(root);
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'offline-assets.json'), 'utf8'));
  const { startLocalWorkstation } = await load('start-local-workstation.js');
  const output = fs.mkdtempSync(path.join(os.tmpdir(), 'packaged-browser-'));
  const restart = process.argv.includes('--restart');
  const serverStopOnly = process.argv.includes('--server-stop-only');
  const profile = path.join(output, 'browser-profile');
  const contextOptions = { serviceWorkers: 'allow', viewport: { width: 390, height: 844 } };
  let workstation, browser, context;
  const errors = [], unexpected = [], optionalIconErrors = [];
  let offlinePhase = false;
  try {
    // Empty registry fixture prevents host driver discovery. No bridge requests are made.
    workstation = await startLocalWorkstation({ webPort: 0, bridgePort: 0, j2534RegistryText: '' });
    const origin = workstation.webUrl;
    if (restart) context = await chromium.launchPersistentContext(profile, { ...contextOptions, channel: 'chrome', headless: true });
    else {
      browser = await chromium.launch({ channel: 'chrome', headless: true });
      context = await browser.newContext(contextOptions);
    }
    const configureContext = async () => {
    await context.addInitScript(() => {
      Object.defineProperty(navigator, 'serial', { value: undefined, configurable: true });
      Object.defineProperty(navigator, 'bluetooth', { value: undefined, configurable: true });
    });
    await context.route('**/*', route => {
      const request = route.request();
      if (new URL(request.url()).origin !== origin || request.method() !== 'GET') {
        unexpected.push(request.url()); return route.abort();
      }
      return route.continue();
    });
    };
    const observePage = page => {
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => {
      if (message.type() !== 'error') return;
      const entry = { text: message.text(), location: message.location() };
      // Chromium requests this undeclared icon itself. Report it, never hide app errors.
      if (offlinePhase && entry.location.url === origin + '/favicon.ico'
        && entry.text === 'Failed to load resource: net::ERR_FAILED') optionalIconErrors.push(entry.text);
      else errors.push(entry);
    });
    page.setDefaultTimeout(20000);
    };
    await configureContext();
    let page = await context.newPage();
    observePage(page);
    const inspectStorage = async phase => {
      const client = await context.newCDPSession(page);
      try {
        const usage = await client.send('Storage.getUsageAndQuota', { origin });
        let caches, cacheInspectionError;
        try { caches = (await client.send('CacheStorage.requestCacheNames', { securityOrigin: origin })).caches.map(item => item.cacheName); }
        catch (error) { cacheInspectionError = error.message; }
        console.log(JSON.stringify({ phase, usage: usage.usageBreakdown, caches, cacheInspectionError }));
      } finally { await client.detach(); }
    };
    assert.equal((await page.goto(origin + '/#obd-panel')).status(), 200);
    await page.locator('#noticeModal').waitFor({ state: 'visible' });
    await page.screenshot({ path: path.join(output, 'first-start.png') });
    await page.locator('#noticeCloseButton').click();
    const locked = async () => {
      await page.locator('#obdAccessGatePanel').waitFor({ state: 'visible' });
      assert.equal(await page.locator('#obdAccessProtected').isVisible(), false);
      assert.equal(await page.evaluate(() => sessionStorage.getItem('vehicle-diagnosis-obd-access-v1')), null);
    };
    await locked();
    await page.locator('#obdAccessPasswordInput').fill('synthetic-invalid-password-not-a-user-secret');
    await page.locator('#obdAccessUnlockButton').click();
    await page.waitForFunction(() => document.querySelector('#obdAccessStatus').textContent === 'パスワードが違います。');
    await locked();
    // Await the resolved boolean in Node. This runtime's waitForFunction treats
    // an async predicate's Promise as truthy before its result becomes false.
    const cacheDeadline = Date.now() + 60000;
    while (!await page.evaluate(async manifest => {
      if (!navigator.serviceWorker.controller) return false;
      const cache = await caches.open('vehicle-diagnosis-tool-' + manifest.version);
      const keys = new Set((await cache.keys()).map(request => request.url));
      return ['/', '/index.html', '/offline-assets.json', ...manifest.assets].every(url => keys.has(new URL(url, location.href).href));
    }, manifest)) {
      assert.ok(Date.now() < cacheDeadline, 'Complete offline cache did not become ready');
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    assert.deepEqual(errors, [], 'Online page errors');
    if (process.argv.includes('--clipboard-cleanup')) {
      const results = await page.evaluate(async () => {
        const clipboardDescriptor = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
        const select = HTMLTextAreaElement.prototype.select;
        const commandDescriptor = Object.getOwnPropertyDescriptor(document, 'execCommand');
        const originalSession = obdDevSession.lastSession;
        const initialCount = document.querySelectorAll('textarea').length;
        const results = [];
        let copies = 0;
        try {
          Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async () => { throw new Error('synthetic API rejection'); } } });
          Object.defineProperty(document, 'execCommand', { configurable: true, value: () => { copies++; return true; } });
          for (const failSelection of [true, false]) {
            HTMLTextAreaElement.prototype.select = failSelection ? function () { throw new Error('synthetic selection failure'); } : select;
            let succeeded = false;
            try { await copyTextToClipboard('synthetic consultation only'); succeeded = true; } catch (_) {}
            results.push({ succeeded, temporaryElementsRemoved: document.querySelectorAll('textarea').length === initialCount,
              sessionRetained: obdDevSession.lastSession === originalSession });
          }
          return { results, copies };
        } finally {
          HTMLTextAreaElement.prototype.select = select;
          if (clipboardDescriptor) Object.defineProperty(navigator, 'clipboard', clipboardDescriptor); else delete navigator.clipboard;
          if (commandDescriptor) Object.defineProperty(document, 'execCommand', commandDescriptor); else delete document.execCommand;
        }
      });
      assert.deepEqual(results, { results: [
        { succeeded: false, temporaryElementsRemoved: true, sessionRetained: true },
        { succeeded: true, temporaryElementsRemoved: true, sessionRetained: true }
      ], copies: 1 });
      console.log('Actual DOM clipboard fallback: selection failure cleanup and subsequent operation passed; clipboard writes stubbed');
    }
    const inspectPageStorage = async phase => console.log(JSON.stringify({ phase, ...await page.evaluate(async () => ({
      caches: await caches.keys(),
      registrations: (await navigator.serviceWorker.getRegistrations()).map(item => ({ scope: item.scope, active: item.active?.state, installing: item.installing?.state })),
      controller: navigator.serviceWorker.controller?.state
    })) }));
    if (restart) await inspectPageStorage('before-server-stop');
    console.log('Package first start: notice, locked scanner, invalid password and complete offline cache passed');
    offlinePhase = true;
    await workstation.close();
    assert.equal(workstation.webServer.listening, false);
    assert.equal(workstation.bridgeServer.listening, false);
    if (restart) await inspectPageStorage('after-server-stop');
    if (restart) {
      await inspectStorage('before-browser-close');
      const oldBrowser = context.browser();
      await context.close();
      assert.equal(page.isClosed(), true);
      assert.equal(oldBrowser.isConnected(), false, 'Original browser must fully disconnect');
      context = await chromium.launchPersistentContext(profile, { ...contextOptions, channel: 'chrome', headless: true });
      await configureContext();
      page = await context.newPage();
      observePage(page);
      await inspectStorage('after-browser-restart');
      console.log('Persistent browser closed and relaunched; both package servers remain stopped');
    }
    if (!serverStopOnly) await context.setOffline(true);
    const response = restart ? await page.goto(origin + '/#obd-panel') : await page.reload();
    assert.equal(response.fromServiceWorker(), true);
    await locked();
    assert.equal(await page.locator('#noticeModal').isVisible(), false);
    assert.equal(await page.locator('#obdAccessPasswordInput').inputValue(), '');
    assert.equal(await page.evaluate(() => localStorage.getItem('vehicle-diagnosis-notice-accepted-v1')), 'accepted');
    assert.equal(await page.evaluate(() => localStorage.getItem('vehicle-diagnosis-cases-v1')), null);
    for (const width of [390, 1280]) {
      await page.setViewportSize({ width, height: 844 });
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      await page.screenshot({ path: path.join(output, `offline-lock-${width}.png`) });
    }
    assert.deepEqual(errors, [], 'Cached page errors');
    const unavailable = await page.evaluate(async () => {
      try { await fetch('/uncached-package-probe', { signal: AbortSignal.timeout(2000) }); return false; }
      catch { return true; }
    });
    assert.equal(unavailable, true, 'Uncached network must be unavailable');
    assert.deepEqual(unexpected, []);
    assert.deepEqual(verifyWorkstationPackage(root), before, 'Package must remain unchanged');
    console.log(JSON.stringify({ passed: true, version: before.appVersion, output, restart, serverStopOnly, optionalIconErrors,
      flow: 'extracted package -> actual local server -> first notice -> rejected password -> stopped servers and offline cache reload -> retained lock',
      limitations: `No successful real-password login, ${restart ? '' : 'browser restart, '}OS restart, other PC, or vehicle test` }));
  } catch (error) {
    console.error(JSON.stringify({ passed: false, version: before.appVersion, restart, serverStopOnly, output,
      phase: offlinePhase ? 'servers stopped / cache startup' : 'first startup' }));
    throw error;
  } finally {
    if (context) await context.close();
    if (browser) await browser.close();
    if (workstation) await workstation.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
