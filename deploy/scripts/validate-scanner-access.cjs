const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');

module.exports = async function validateScannerAccess(browser, root, output) {
  const password = 'synthetic-access-password-only';
  const hash = createHash('sha256').update(password).digest('hex');
  const app = fs.readFileSync(path.join(root, 'script.js'), 'utf8');
  const declaration = /const OBD_ACCESS_PASSWORD_HASH = "[a-f0-9]{64}";/g;
  assert.equal([...app.matchAll(declaration)].length, 1, 'Test must replace exactly one password fixture');
  const fixtureApp = app.replace(declaration, `const OBD_ACCESS_PASSWORD_HASH = "${hash}";`);
  const context = await browser.newContext({ serviceWorkers: 'block', viewport: { width: 1280, height: 900 } });
  const errors = [], blocked = [];
  const origin = 'http://127.0.0.1';
  try {
    await context.addInitScript(() => {
      localStorage.setItem('vehicle-diagnosis-notice-accepted-v1', 'accepted');
      Object.defineProperty(navigator, 'serial', { value: undefined });
      Object.defineProperty(navigator, 'bluetooth', { value: undefined });
    });
    await context.route('**/*', async route => {
      const request = route.request();
      const url = new URL(request.url());
      if (url.origin !== origin || request.method() !== 'GET') {
        blocked.push(request.url());
        return route.abort();
      }
      const file = path.resolve(root, '.' + decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname));
      const relative = path.relative(root, file);
      if (relative.startsWith('..') || path.isAbsolute(relative) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
        return route.fulfill({ status: 404, body: '' });
      }
      const contentType = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' }[path.extname(file)] || 'application/octet-stream';
      await route.fulfill({ contentType, body: file === path.join(root, 'script.js') ? fixtureApp : fs.readFileSync(file) });
    });
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    page.setDefaultTimeout(20000);
    const open = async () => {
      await page.goto(origin + '/');
      await page.getByText('登録済み整備データを読み込みました。', { exact: false }).waitFor();
      await page.getByRole('button', { name: '7. OBD2車両読取', exact: true }).click();
    };
    await open();
    for (const width of [1280, 390]) {
      await page.setViewportSize({ width, height: 900 });
      assert.equal(await page.locator('#obdAccessProtected').evaluate(node => node.hidden), true);
      await page.locator('#obdAccessPasswordInput').fill(password);
      if (width === 1280) await page.locator('#obdAccessUnlockButton').click();
      else await page.locator('#obdAccessPasswordInput').press('Enter');
      await page.waitForFunction(() => obdAccessUnlocked === true && document.getElementById('obdAccessProtected').hidden === false);
      await page.screenshot({ path: path.join(output, `access-unlocked-${width}.png`) });
      assert.equal(await page.locator('#obdAccessPasswordInput').inputValue(), '');
      assert.equal(await page.evaluate(() => sessionStorage.getItem('vehicle-diagnosis-obd-access-v1')), 'enabled');
      const normalMode = page.locator('#obdUiModeSwitch [data-obd-ui-mode="simple"]');
      if (await normalMode.isVisible()) await normalMode.click();
      await page.locator('#obdHomeView [data-obd-ui-mode="details"]').click();
      await page.locator('#obdDevelopmentReference > summary').click();
      await page.locator('#obdOperationTitle').click();
      const preparation = page.locator('.obd-dtc-clear-preparation');
      assert.equal(await preparation.count(), 1);
      assert.equal(await preparation.evaluate(node => node.open), false);
      await preparation.locator('summary').click();
      assert.equal(await preparation.evaluate(node => node.open), true);
      assert.equal(await preparation.locator('button, input, select').count(), 0);
      assert.equal(await preparation.evaluate(node => node.scrollWidth <= node.clientWidth + 1), true);
      assert.equal(await page.locator('#obdOperationGrid button:not(:disabled)').count(), 0);
      await preparation.screenshot({ path: path.join(output, `clear-preparation-${width}.png`) });
      await preparation.locator('summary').click();
      assert.equal(await preparation.evaluate(node => node.open), false);
      await page.locator('#obdOperationTitle').click();
      await page.locator('#obdDevelopmentReference > summary').click();
      await page.locator('#obdAccessLockButton').click();
      await page.locator('#obdAccessPasswordInput').waitFor({ state: 'visible' });
      assert.equal(await page.locator('#obdAccessProtected').evaluate(node => node.hidden), true);
      assert.equal(await page.evaluate(() => sessionStorage.getItem('vehicle-diagnosis-obd-access-v1')), null);
      await open();
      assert.equal(await page.locator('#obdAccessProtected').evaluate(node => node.hidden), true);
      assert.equal(await page.locator('#obdAccessPasswordInput').inputValue(), '');
      await page.screenshot({ path: path.join(output, `access-relocked-${width}.png`) });
    }
    assert.deepEqual(errors, []);
    assert.deepEqual(blocked, [], 'Authentication must not make external or non-GET requests');
    console.log('Synthetic access: button/Enter unlock, input clearing, relock and reload passed at 1280/390px; fixture hash only, no real password');
  } finally {
    await context.close();
  }
};
