const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

(async () => {
  const outputArg = process.argv.find(arg => arg.startsWith('--output='));
  const output = outputArg ? outputArg.slice('--output='.length) : fs.mkdtempSync(path.join(os.tmpdir(), 'browser-download-restart-'));
  const nativeDownload = process.argv.includes('--native-download');
  const httpDownload = process.argv.includes('--http-download');
  const clearTestHistory = process.argv.includes('--clear-test-download-history');
  const restoreTestHistory = process.argv.includes('--restore-test-download-history');
  assert.ok(!restoreTestHistory || clearTestHistory, 'Restoration experiment requires --clear-test-download-history');
  assert.ok(!clearTestHistory || (!outputArg && !process.argv.some(arg => arg.startsWith('--phase='))
    && !process.argv.includes('--separate-process') && !process.argv.includes('--no-first-download')),
    'History experiment requires a newly generated temporary profile and both phases');
  assert.ok(!httpDownload || process.argv.includes('--online'), '--http-download requires --online');
  if (process.argv.includes('--separate-process')) {
    for (const phase of [0, 1]) {
      const args = [__filename, `--output=${output}`, `--phase=${phase}`];
      if (nativeDownload) args.push('--native-download');
      for (const flag of ['--http-download', '--online', '--no-first-download', '--settle-before-close']) {
        if (process.argv.includes(flag)) args.push(flag);
      }
      const run = spawnSync(process.execPath, args, { stdio: 'inherit', timeout: 60000, windowsHide: true });
      assert.equal(run.status, 0, `Separate process phase ${phase} failed`);
    }
    console.log(`Separate-process download restart passed: ${output}`);
    return;
  }
  const phaseArg = process.argv.find(arg => arg.startsWith('--phase='));
  const phases = phaseArg ? [Number(phaseArg.slice('--phase='.length))] : restoreTestHistory ? [0, 1, 2] : [0, 1];
  const options = {
    channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome', headless: true,
    acceptDownloads: true, downloadsPath: path.join(output, 'downloads')
  };
  const report = {
    schemaVersion: 1, nodeVersion: process.version, platform: process.platform,
    channel: options.channel, nativeDownload, downloadSource: httpDownload ? 'http' : 'blob', offlineAfterRestart: !process.argv.includes('--online'),
    clearTestHistory, restoreTestHistory,
    phases: [], passed: false,
    scope: 'Temporary profile and synthetic JSON only; no application, service worker, vehicle or user data'
  };
  const reportFile = path.join(output, `restart-report${phaseArg ? '-' + phases[0] : ''}.json`);
  let context;
  let server, origin;
  try {
    if (httpDownload) {
      server = http.createServer((request, response) => {
        if (request.method === 'GET' && request.url === '/download') {
          response.writeHead(200, { 'Content-Type': 'application/json', 'Content-Disposition': 'attachment; filename="synthetic.json"', 'Cache-Control': 'no-store' });
          response.end('{"test":true}');
        } else if (request.method === 'GET' && request.url === '/') {
          response.writeHead(200, { 'Content-Type': 'text/html' });
          response.end('<button id="save">Save JSON</button>');
        } else response.writeHead(404).end();
      });
      await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
      origin = `http://127.0.0.1:${server.address().port}`;
    }
    for (const phase of phases) {
      const observation = { phase, stage: 'launch', status: 'running' };
      report.phases.push(observation);
      context = await chromium.launchPersistentContext(path.join(output, 'profile'), { ...options, downloadsPath: path.join(output, `downloads-${phase}`) });
      observation.browserVersion = context.browser().version();
      console.log(`browser.version: ${observation.browserVersion}`);
      if (!phase && process.argv.includes('--no-first-download')) {
        observation.status = 'skipped-download';
        await context.close();
        context = null;
        continue;
      }
      const page = await context.newPage();
      const nativeDownloadPath = path.resolve(output, `native-downloads-${phase}`);
      if (nativeDownload) {
        fs.mkdirSync(nativeDownloadPath, { recursive: true });
        const cdp = await context.newCDPSession(page);
        await cdp.send('Browser.setDownloadBehavior', {
          behavior: 'allow',
          downloadPath: nativeDownloadPath,
          eventsEnabled: true
        });
      }
      if (httpDownload) await page.goto(origin);
      else await page.setContent('<button id="save">Save JSON</button>');
      await page.evaluate(httpDownload => {
        document.querySelector('#save').onclick = () => {
          const link = document.createElement('a');
          const url = httpDownload ? '/download' : URL.createObjectURL(new Blob(['{"test":true}'], { type: 'application/json;charset=utf-8' }));
          link.href = url;
          link.download = 'synthetic.json';
          document.body.append(link);
          link.click();
          link.remove();
          if (!httpDownload) setTimeout(() => URL.revokeObjectURL(url), 0);
        };
      }, httpDownload);
      if (phase && !process.argv.includes('--online')) await context.setOffline(true);
      observation.stage = 'download';
      if (nativeDownload) {
        const file = path.join(nativeDownloadPath, 'synthetic.json');
        const expected = Buffer.from('{"test":true}', 'utf8');
        assert.ok(!fs.existsSync(file), `Native download target already exists: ${file}`);
        await page.click('#save');
        const deadline = Date.now() + 20000;
        let actual;
        while (Date.now() < deadline) {
          const pageClosed = page.isClosed();
          const browserConnected = context.browser().isConnected();
          assert.ok(!pageClosed && browserConnected, `Native download closed before completion: ${file} (pageClosed=${pageClosed}, browserConnected=${browserConnected})`);
          if (fs.existsSync(file)) {
            actual = fs.readFileSync(file);
            if (Buffer.compare(actual, expected) === 0) break;
          }
          await new Promise(resolve => setTimeout(resolve, 100));
        }
        assert.ok(actual, `Native download did not create ${file} within 20000ms`);
        assert.deepEqual(actual, expected, `Native download bytes differ: ${file}`);
      } else {
        const pending = page.waitForEvent('download', { timeout: 20000 });
        await page.click('#save');
        const file = path.join(output, `phase-${phase}.json`);
        await (await pending).saveAs(file);
        assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8')), { test: true });
      }
      console.log(`Minimal download phase ${phase}: passed`);
      observation.status = 'passed';
      observation.stage = 'verified-bytes';
      if (process.argv.includes('--settle-before-close')) await new Promise(resolve => setTimeout(resolve, 2000));
      await context.close();
      context = null;
      if (phase === 0 && clearTestHistory) {
        // Diagnostic intervention in this run's new synthetic profile only.
        // Preserve the closed database before removing just download records.
        const history = path.join(output, 'profile', 'Default', 'History');
        fs.copyFileSync(history, path.join(output, 'History-before-experiment'), fs.constants.COPYFILE_EXCL);
        const { DatabaseSync } = require('node:sqlite');
        const db = new DatabaseSync(history);
        try {
          observation.downloadHistoryRows = db.prepare('SELECT count(*) AS count FROM downloads').get().count;
          assert.ok(observation.downloadHistoryRows > 0, 'No prior download records to isolate');
          db.exec('BEGIN; DELETE FROM downloads_slices; DELETE FROM downloads_url_chains; DELETE FROM downloads; COMMIT;');
        } finally { db.close(); }
      }
      if (phase === 1 && restoreTestHistory) {
        const history = path.join(output, 'profile', 'Default', 'History');
        fs.copyFileSync(history, path.join(output, 'History-after-experiment'), fs.constants.COPYFILE_EXCL);
        fs.copyFileSync(path.join(output, 'History-before-experiment'), history);
        observation.originalHistoryRestored = true;
      }
    }
    report.passed = true;
    console.log(`${phaseArg ? 'Single download phase' : 'Browser download restart'} passed: ${output}`);
  } catch (error) {
    const observation = report.phases.at(-1);
    if (observation) {
      observation.status = 'failed';
      observation.browserConnected = context?.browser()?.isConnected() ?? false;
    }
    // Keep reusable evidence free of arbitrary browser output and profile paths.
    report.failure = 'phase_did_not_complete';
    throw error;
  } finally {
    try { await context?.close(); }
    finally {
      if (server) await new Promise(resolve => server.close(resolve));
      fs.writeFileSync(reportFile, JSON.stringify(report, null, 2) + '\n');
      console.log(`Restart evidence: ${reportFile}`);
    }
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
