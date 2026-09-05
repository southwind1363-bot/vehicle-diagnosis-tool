const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

(async () => {
  const outputArg = process.argv.find(arg => arg.startsWith('--output='));
  const output = outputArg ? outputArg.slice('--output='.length) : fs.mkdtempSync(path.join(os.tmpdir(), 'browser-download-restart-'));
  if (process.argv.includes('--separate-process')) {
    for (const phase of [0, 1]) {
      const run = spawnSync(process.execPath, [__filename, `--output=${output}`, `--phase=${phase}`], { stdio: 'inherit', timeout: 60000, windowsHide: true });
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
  let context;
  try {
    for (const phase of phases) {
      context = await chromium.launchPersistentContext(path.join(output, 'profile'), { ...options, downloadsPath: path.join(output, `downloads-${phase}`) });
      if (!phase && process.argv.includes('--no-first-download')) {
        await context.close();
        context = null;
        continue;
      }
      const page = await context.newPage();
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
      const pending = page.waitForEvent('download', { timeout: 20000 });
      await page.click('#save');
      const file = path.join(output, `phase-${phase}.json`);
      await (await pending).saveAs(file);
      assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8')), { test: true });
      console.log(`Minimal download phase ${phase}: passed`);
      if (process.argv.includes('--settle-before-close')) await new Promise(resolve => setTimeout(resolve, 2000));
      await context.close();
      context = null;
    }
    console.log(`${phaseArg ? 'Single download phase' : 'Browser download restart'} passed: ${output}`);
  } finally {
    await context?.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
