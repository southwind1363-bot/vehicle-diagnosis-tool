const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

(async () => {
  const outputArg = process.argv.find(arg => arg.startsWith('--output='));
  const output = outputArg ? outputArg.slice('--output='.length) : fs.mkdtempSync(path.join(os.tmpdir(), 'browser-download-restart-'));
  const nativeDownload = process.argv.includes('--native-download');
  if (process.argv.includes('--separate-process')) {
    for (const phase of [0, 1]) {
      const args = [__filename, `--output=${output}`, `--phase=${phase}`];
      if (nativeDownload) args.push('--native-download');
      const run = spawnSync(process.execPath, args, { stdio: 'inherit', timeout: 60000, windowsHide: true });
      assert.equal(run.status, 0, `Separate process phase ${phase} failed`);
    }
    console.log(`Separate-process download restart passed: ${output}`);
    return;
  }
  const phaseArg = process.argv.find(arg => arg.startsWith('--phase='));
  const phases = phaseArg ? [Number(phaseArg.slice('--phase='.length))] : [0, 1];
  const options = {
    channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome', headless: true,
    acceptDownloads: true, downloadsPath: path.join(output, 'downloads')
  };
  const report = {
    schemaVersion: 1, nodeVersion: process.version, platform: process.platform,
    channel: options.channel, nativeDownload, offlineAfterRestart: !process.argv.includes('--online'),
    phases: [], passed: false,
    scope: 'Temporary profile and synthetic JSON only; no application, service worker, vehicle or user data'
  };
  const reportFile = path.join(output, `restart-report${phaseArg ? '-' + phases[0] : ''}.json`);
  let context;
  try {
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
      await page.setContent('<button id="save">Save JSON</button>');
      await page.evaluate(() => {
        document.querySelector('#save').onclick = () => {
          const link = document.createElement('a');
          const url = URL.createObjectURL(new Blob(['{"test":true}'], { type: 'application/json;charset=utf-8' }));
          link.href = url;
          link.download = 'synthetic.json';
          document.body.append(link);
          link.click();
          link.remove();
          setTimeout(() => URL.revokeObjectURL(url), 0);
        };
      });
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
      fs.writeFileSync(reportFile, JSON.stringify(report, null, 2) + '\n');
      console.log(`Restart evidence: ${reportFile}`);
    }
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
