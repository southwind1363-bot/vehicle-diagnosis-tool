// Isolate browser download/restart behavior without application code or vehicle I/O.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

(async () => {
  const output = fs.mkdtempSync(path.join(os.tmpdir(), 'browser-download-restart-'));
  const channel = process.env.PLAYWRIGHT_CHANNEL || 'chrome';
  const noRestart = process.argv.includes('--no-restart');
  const payload = JSON.stringify({ fixture: 'synthetic-only', value: 123 });
  const report = { channel, output, restart: !noRestart, applicationLoaded: false, phases: [], passed: false };
  const html = `<!doctype html><html lang="ja"><meta charset="utf-8"><title>Download fixture</title>
    <button id="save">模擬JSON保存</button><p>アプリ・車両通信を使わないブラウザー検査</p>
    <script>document.querySelector('#save').onclick = () => {
      const link = document.createElement('a');
      const url = URL.createObjectURL(new Blob([${JSON.stringify(payload)}], {type:'application/json'}));
      link.href = url; link.download = 'fixture.json'; link.hidden = true;
      document.body.appendChild(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 0);
    };</script></html>`;
  const server = http.createServer((request, response) => {
    if (request.method !== 'GET' || request.url !== '/') { response.writeHead(404).end(); return; }
    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }).end(html);
  });
  let context;
  try {
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
    const origin = `http://127.0.0.1:${server.address().port}`;
    for (const phase of ['first-download', noRestart ? 'same-browser-download' : 'after-restart-download']) {
      const record = { phase, downloadStarted: false, saved: false, errors: [], unexpectedRequests: [] };
      report.phases.push(record);
      if (!context) context = await chromium.launchPersistentContext(path.join(output, 'profile'), {
        channel, headless: true, acceptDownloads: true, serviceWorkers: 'block',
        downloadsPath: path.join(output, 'downloads'), viewport: { width: 390, height: 844 }
      });
      report.browserVersion = context.browser().version();
      await context.unrouteAll();
      await context.route(url => url.origin !== origin, route => {
        record.unexpectedRequests.push(route.request().url());
        return route.abort();
      });
      const page = await context.newPage();
      page.setDefaultTimeout(15000);
      page.on('pageerror', error => record.errors.push(error.message));
      await page.goto(origin);
      await page.locator('#save').waitFor();
      await page.screenshot({ path: path.join(output, `${phase}.png`) });
      const pending = page.waitForEvent('download');
      await page.locator('#save').click();
      const download = await pending;
      record.downloadStarted = true;
      const destination = path.join(output, `${phase}.json`);
      await download.saveAs(destination);
      assert.equal(fs.readFileSync(destination, 'utf8'), payload);
      record.saved = true;
      assert.deepEqual(record.errors, []);
      assert.deepEqual(record.unexpectedRequests, []);
      if (!noRestart) {
        await context.close();
        assert.equal(page.isClosed(), true);
        context = null;
      } else await page.close();
    }
    report.passed = true;
  } catch (error) {
    report.failure = error.message;
    process.exitCode = 1;
  } finally {
    await context?.close();
    await new Promise(resolve => server.close(resolve));
    fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
