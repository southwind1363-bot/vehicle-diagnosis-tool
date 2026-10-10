import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

// Approved migration regression. Production code only; no patched VM or transport.
const coreSource = fs.readFileSync(new URL('../obd-readonly.js', import.meta.url), 'utf8');
const appSource = fs.readFileSync(new URL('../script.js', import.meta.url), 'utf8');
const legacy = JSON.parse(fs.readFileSync(new URL('./fixtures/timeline-legacy-3.13.655.json', import.meta.url), 'utf8'));
const chartCode = appSource.match(/function buildLivePidTimelineChartRows\([^)]*\) \{[\s\S]*?\r?\n\}/)?.[0];
assert.ok(chartCode);
const context = vm.createContext({ window: {} });
vm.runInContext(coreSource, context); vm.runInContext(chartCode, context);
const model = context.window.ObdReadOnly;
model.configureMonitorDefinitions(JSON.parse(fs.readFileSync(new URL('../data/obd-monitor-definitions.json', import.meta.url), 'utf8')));
const after = { model, chart: context.buildLivePidTimelineChartRows };
let checks = 0;
const check = (condition, message) => { assert.ok(condition, message); checks++; };
const plain = value => JSON.parse(JSON.stringify(value));
const pair = (overrides = {}) => ({ samples: [0, 1].map(step => ({
  capturedAt: `2026-10-10T00:00:0${step}Z`, observationCondition: 'warm', livePidReadoutStatus: 'reported',
  monitorValues: [{ id: 'engine_speed', label: 'Engine speed', sourceEcu: '7E8', unit: 'rpm', value: step * 100, ...overrides }]
})) });
const cases = [
  [{ decoded: false }, false], [{ valueType: 'raw_hex' }, false], [{ value_type: 'raw_hex' }, false],
  [{ valueType: 'text' }, false], [{ decoded: true, valueType: 'text' }, false],
  [{ decoded: false, valueType: 'number' }, false], [{ value: '28 28', valueType: 'raw_hex' }, false],
  [{ value: 'Regeneration active', valueType: 'text' }, false], [{ value: '0', valueType: 'text' }, false],
  [{ decoded: true, valueType: 'number' }, true], [{}, true]
];
for (const [index, [overrides, eligible]] of cases.entries()) {
  const input = pair(overrides), original = JSON.stringify(input);
  const oldTimeline = legacy.cases[index].timeline;
  const timeline = after.model.normalizeLivePidTimeline(input);
  assert.deepEqual(plain(timeline), plain(oldTimeline)); checks++;
  const summary = after.model.buildLivePidTimelineSummary(timeline);
  const charts = after.chart(timeline);
  check(summary.comparedValueCount === (eligible ? 1 : 0), 'numeric comparison eligibility: ' + JSON.stringify(overrides));
  check(summary.changedValueCount === (eligible ? 1 : 0), 'difference eligibility');
  check(charts.length === (eligible ? 1 : 0), 'graph eligibility');
  check(summary.comparisonAvailable === true, 'capture-context comparison flag changed');
  check(summary.vehicleCommandEnabled === false && summary.wouldTransmit === false, 'execution boundary');
  check(JSON.stringify(input) === original, 'input was mutated');
  if (eligible) {
    check(summary.changes[0].delta === 100 && charts[0].minimum === 0 && charts[0].latest === 100, 'zero/valid delta changed');
    assert.deepEqual(plain(summary), plain(legacy.cases[index].summary)); checks++;
  }
  const oldArchive = { ...legacy.mixedArchive, session: { live_pid_timeline: oldTimeline } };
  const restored = after.model.buildDiagnosticScanSessionFromJson(JSON.stringify(oldArchive));
  check(restored?.livePidTimeline?.samples?.length === 2, 'legacy archive lost samples');
  assert.deepEqual(plain(restored.livePidTimeline.samples), plain(oldTimeline.samples)); checks++;
  const again = after.model.buildDiagnosticScanSessionFromJson(JSON.stringify(after.model.buildBridgeSessionExportPayload(restored)));
  assert.deepEqual(plain(again.livePidTimeline.samples), plain(restored.livePidTimeline.samples)); checks++;
}
for (const rawIndex of [0, 1]) {
  const input = pair(); input.samples[rawIndex].monitorValues[0].decoded = false;
  check(after.model.buildLivePidTimelineSummary(input).comparedValueCount === 0, 'mixed numeric/RAW pair compared');
  check(after.chart(after.model.normalizeLivePidTimeline(input)).length === 0, 'one valid point was graphed');
}
const mixed = pair();
mixed.samples.forEach((sample, step) => sample.monitorValues.push({ id: 'coolant_temp', label: 'Raw temperature', sourceEcu: '7E8', unit: '°C', value: 999 + step, decoded: false }));
const newSummary = after.model.buildLivePidTimelineSummary(mixed);
check(newSummary.comparedValueCount === 1, 'mixed comparison eligibility');
check(after.chart(after.model.normalizeLivePidTimeline(mixed)).length === 1, 'mixed graph eligibility');
check(newSummary.changes.length === 1 && newSummary.changes[0].id === 'engine_speed' && newSummary.changes[0].delta === 100, 'valid series lost');
for (const overrides of [{ decoded: false }, { undecodedRaw: true }, { undecoded_raw: true }, { valueType: 'raw_hex' }, { value_type: 'raw_hex' }, { valueType: 'text' }, { value_type: 'text' }]) {
  check(after.chart(pair(overrides)).length === 0, 'direct display RAW/text flag ignored');
}
for (const change of [input => { input.samples[1].observationCondition = 'cold'; }, input => { input.samples[1].monitorValues[0].unit = 'rps'; }, input => { input.samples[1].monitorValues[0].sourceEcu = '7E9'; }]) {
  const input = pair(); change(input);
  check(after.model.buildLivePidTimelineSummary(input).comparedValueCount === 0, 'incompatible pair compared');
  check(after.chart(input).length === 0, 'incompatible pair graphed');
}
console.log(`Timeline RAW regression: ${checks} checks passed; production code, legacy samples and archive round trips retained, no vehicle I/O.`);
console.log('Numeric + numeric-shaped RAW: only numeric series compared/graphed; delta +100 retained.');

if (process.argv.includes('--browser')) {
  const path = await import('node:path');
  const os = await import('node:os');
  const { createRequire } = await import('node:module');
  const require = createRequire(import.meta.url);
  const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
  const { fileURLToPath } = await import('node:url');
  const root = fileURLToPath(new URL('../', import.meta.url));
  const output = fs.mkdtempSync(path.join(os.tmpdir(), 'timeline-raw-proposal-'));
  const browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome', headless: true });
  const errors = [], blocked = [];
  try {
    {
      const context = await browser.newContext({ serviceWorkers: 'block', viewport: { width: 390, height: 844 } });
      try {
        await context.addInitScript(() => {
          localStorage.setItem('vehicle-diagnosis-notice-accepted-v1', 'accepted');
          sessionStorage.setItem('vehicle-diagnosis-obd-access-v1', 'enabled');
          Object.defineProperty(navigator, 'serial', { value: undefined, configurable: true });
          Object.defineProperty(navigator, 'bluetooth', { value: undefined, configurable: true });
        });
        await context.route('**/*', async route => {
          const url = new URL(route.request().url());
          if (url.origin !== 'http://127.0.0.1' || route.request().method() !== 'GET') { blocked.push(url.href); return route.abort(); }
          const file = path.resolve(root, '.' + (url.pathname === '/' ? '/index.html' : decodeURIComponent(url.pathname)));
          const relative = path.relative(root, file);
          if (relative.startsWith('..') || path.isAbsolute(relative) || !fs.existsSync(file)) return route.fulfill({ status: 404, body: '' });
          const contentType = { '.js': 'text/javascript', '.json': 'application/json', '.html': 'text/html', '.css': 'text/css', '.svg': 'image/svg+xml' }[path.extname(file)] || 'text/plain';
          const body = fs.readFileSync(file);
          await route.fulfill({ contentType, body });
        });
        const page = await context.newPage(); page.on('pageerror', e => errors.push(e.message));
        await page.goto('http://127.0.0.1/');
        await page.getByText('登録済み整備データを読み込みました。', { exact: false }).waitFor();
        await page.getByRole('button', { name: '7. OBD2車両読取', exact: true }).click();
        const picker = page.waitForEvent('filechooser');
        await page.getByRole('button', { name: '保存した読取結果を開く', exact: true }).click();
        const archive = legacy.mixedArchive;
        const oldTimeline = after.model.normalizeLivePidTimeline(archive.session.live_pid_timeline);
        await (await picker).setFiles({ name: 'numeric-and-raw-timeline.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(archive)) });
        await page.waitForFunction(() => obdDevSession.lastSession?.livePidTimeline?.samples?.length === 2);
        const sessionBefore = await page.evaluate(() => JSON.stringify(obdDevSession.lastSession));
        await page.locator('.obd-results-nav').getByRole('button', { name: '追加データ', exact: true }).click();
        await page.locator('#obdReadoutDetailMenu').getByRole('button', { name: 'ライブ推移', exact: true }).click();
        const card = page.locator('#obdSessionDetailLiveTimeline');
        assert.equal(await card.locator('.obd-timeline-chart-row').count(), 1);
        const summary = await page.evaluate(() => window.ObdReadOnly.buildLivePidTimelineSummary(obdDevSession.lastSession.livePidTimeline));
        assert.equal(summary.comparedValueCount, 1);
        const rows = card.locator('.obd-timeline-chart-row');
        assert.equal(await rows.filter({ hasText: 'Raw temperature' }).count(), 0);
        const numericRow = rows.filter({ hasText: 'Engine speed' });
        assert.equal(await numericRow.locator('.obd-timeline-chart-bar').count(), 2);
        assert.match(await numericRow.innerText(), /最小 0 rpm/);
        await numericRow.locator('input[type="range"]').press('Home');
        assert.match(await numericRow.locator('.obd-timeline-selected-value').innerText(), /0 rpm/);
        for (const width of [390, 1280]) {
          await page.setViewportSize({ width, height: 844 });
          for (const dark of [false, true]) {
            await page.evaluate(dark => document.body.classList.toggle('dark', dark), dark);
            assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
            await card.screenshot({ path: path.join(output, `production-${width}-${dark}.png`) });
          }
        }
        assert.equal(await page.evaluate(() => JSON.stringify(obdDevSession.lastSession)), sessionBefore);
        const exported = await page.evaluate(() => JSON.stringify(window.ObdReadOnly.buildBridgeSessionExportPayload(obdDevSession.lastSession)));
        const restored = after.model.buildDiagnosticScanSessionFromJson(exported);
        assert.deepEqual(plain(restored.livePidTimeline.samples), plain(oldTimeline.samples));
        // Replacing a numeric chart with RAW-only records must remove stale series.
        const rawTimeline = after.model.normalizeLivePidTimeline(pair({ decoded: false }));
        const rawArchive = { ...legacy.mixedArchive, session: { live_pid_timeline: rawTimeline } };
        await page.getByRole('button', { name: '基本読取結果へ戻る', exact: true }).click();
        const replacement = page.waitForEvent('filechooser');
        page.once('dialog', dialog => dialog.accept());
        await page.getByRole('button', { name: '読取結果ファイルを開く', exact: true }).click();
        await (await replacement).setFiles({ name: 'raw-only-timeline.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(rawArchive)) });
        await page.waitForFunction(() => obdDevSession.lastSession?.livePidTimeline?.samples?.[0]?.monitorValues?.[0]?.decoded === false);
        assert.equal(await page.locator('#obdSessionDetailLiveTimeline').count(), 0);
        const rawState = await page.evaluate(() => ({ samples: obdDevSession.lastSession.livePidTimeline.samples,
          summary: window.ObdReadOnly.buildLivePidTimelineSummary(obdDevSession.lastSession.livePidTimeline) }));
        assert.deepEqual(plain(rawState.samples), plain(rawTimeline.samples));
        assert.equal(rawState.summary.comparedValueCount, 0);
        assert.equal(rawState.summary.changes.length, 0);

        // Identical PID/ECU on separate routes must remain independently selectable.
        const networkTimeline = pair();
        networkTimeline.samples.forEach((sample, step) => {
          sample.monitorValues = ['CAN-A', 'CAN-B'].map((networkBus, index) => ({
            ...sample.monitorValues[0], networkBus, networkChannel: 'channel-1', gatewayRoute: 'gateway/engine', value: index * 1000 + step * 100
          }));
        });
        const networkArchive = { ...legacy.mixedArchive, session: { live_pid_timeline: after.model.normalizeLivePidTimeline(networkTimeline) } };
        await page.getByRole('button', { name: '基本読取結果へ戻る', exact: true }).click();
        const networkPicker = page.waitForEvent('filechooser');
        page.once('dialog', dialog => dialog.accept());
        await page.getByRole('button', { name: '読取結果ファイルを開く', exact: true }).click();
        await (await networkPicker).setFiles({ name: 'network-timeline.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(networkArchive)) });
        await page.waitForFunction(() => obdDevSession.lastSession?.livePidTimeline?.samples?.[0]?.monitorValues?.length === 2);
        const networkSessionBefore = await page.evaluate(() => JSON.stringify(obdDevSession.lastSession));
        await page.locator('.obd-results-nav').getByRole('button', { name: '追加データ', exact: true }).click();
        await page.locator('#obdReadoutDetailMenu').getByRole('button', { name: 'ライブ推移', exact: true }).click();
        assert.equal(await card.locator('.obd-timeline-chart-row').count(), 2);
        for (const [bus, value] of [['CAN-A', 0], ['CAN-B', 1000]]) {
          const row = card.locator('.obd-timeline-chart-row').filter({ hasText: 'バス: ' + bus });
          assert.equal(await row.count(), 1);
          assert.equal(await row.locator('.obd-timeline-chart-bar').count(), 2);
          assert.match(await row.innerText(), /チャネル: channel-1 \/ 経路: gateway\/engine/);
          await row.getByRole('slider', { name: new RegExp(bus) }).press('Home');
          assert.ok((await row.locator('.obd-timeline-selected-value').innerText()).endsWith(value + ' rpm'));
          assert.match(await row.innerText(), /変化 \+100 rpm/);
        }
        for (const width of [390, 1280]) {
          await page.setViewportSize({ width, height: 844 });
          for (const dark of [false, true]) {
            await page.evaluate(dark => document.body.classList.toggle('dark', dark), dark);
            assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
            await card.screenshot({ path: path.join(output, 'network-' + width + '-' + dark + '.png') });
          }
        }
        assert.equal(await page.evaluate(() => JSON.stringify(obdDevSession.lastSession)), networkSessionBefore);
        const networkExport = await page.evaluate(() => JSON.stringify(window.ObdReadOnly.buildBridgeSessionExportPayload(obdDevSession.lastSession)));
        assert.deepEqual(plain(after.model.buildDiagnosticScanSessionFromJson(networkExport).livePidTimeline.samples), plain(networkArchive.session.live_pid_timeline.samples));


      } finally { await context.close(); }
    }
    assert.deepEqual(errors, []); assert.deepEqual(blocked, []);
    console.log('Production browser: separate network series and controls verified; legacy archive retains samples, numeric-only series/compared value 1, zero and slider preserved, old archive restored unchanged, 390/1280 themes. Artifacts: ' + output);
  } finally { await browser.close(); }
}
