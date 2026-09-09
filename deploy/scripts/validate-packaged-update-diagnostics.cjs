const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const source = fs.readFileSync(require.resolve('./validate-packaged-update.cjs'), 'utf8');
const code = source.match(/async function capturePackagedUpdateState\([^)]*\) \{[\s\S]*?\r?\n\}/)?.[0];
assert.ok(code);
(async () => {
  for (const scenario of ['complete', 'missing-asset', 'missing-cache', 'unknown-identity']) {
    let opens = 0;
    const worker = { scriptURL: 'http://127.0.0.1:3001/service-worker.js?version=1.0.0', state: 'activated' };
    const urls = ['/', '/index.html', '/offline-assets.json', '/script.js'];
    const context = vm.createContext({ URL, Set, Promise,
      navigator: { serviceWorker: { controller: worker, getRegistration: async () => ({ active: worker, waiting: { ...worker, state: 'installed' } }) } },
      getOfflineWorkerIdentity: async () => scenario === 'unknown-identity' ? null : { version: '1.0.1', cacheName: 'vehicle-diagnosis-tool-1.0.1' },
      location: { href: 'http://127.0.0.1:3001/' },
      document: { querySelector: selector => ({ textContent: selector === '#appVersion' ? '1.0.1' : 'waiting' }) },
      localStorage: { getItem: () => 'synthetic-private-record-body' },
      caches: {
        keys: async () => scenario === 'missing-cache' ? [] : ['vehicle-diagnosis-tool-1.0.0'],
        has: async () => scenario !== 'missing-cache',
        open: async () => { opens++; return { keys: async () => urls.slice(0, scenario === 'missing-asset' ? 3 : 4).map(url => ({ url: 'http://127.0.0.1:3001' + url })) }; }
      }
    });
    vm.runInContext(code, context);
    const result = await context.capturePackagedUpdateState({ expectedStorage: 'synthetic-private-record-body', expectedManifest: { version: '1.0.0', assets: ['./', 'index.html', 'script.js'] } });
    assert.equal(result.expectedVersion, '1.0.0');
    assert.equal(result.controller.identity?.version ?? null, scenario === 'unknown-identity' ? null : '1.0.1');
    assert.equal(result.waiting.state, 'installed');
    assert.equal(result.installing, null);
    assert.equal(result.missingAssetCount, scenario === 'missing-cache' ? null : scenario === 'missing-asset' ? 1 : 0);
    assert.equal(opens, scenario === 'missing-cache' ? 0 : 1);
    assert.equal(result.savedDataUnchanged, true);
    assert.equal(JSON.stringify(result).includes('synthetic-private-record-body'), false);
  }
  console.log('Update diagnostics: internal identity, missing cache/assets and record-body exclusion passed; no browser update attempted');
})().catch(error => { console.error(error); process.exitCode = 1; });
