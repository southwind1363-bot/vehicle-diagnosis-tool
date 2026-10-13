const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
(async () => {
    const root = path.resolve(__dirname, '..');
  const output = fs.mkdtempSync(path.join(os.tmpdir(), 'ecu-identity-alias-production-'));
  const browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome', headless: true });
  const context = await browser.newContext({ serviceWorkers: 'block', viewport: { width: 390, height: 844 } });
  const errors = [], blocked = [];
  let page;
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
      await route.fulfill({ contentType, body: fs.readFileSync(file) });
    });
    page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('http://127.0.0.1/');
    await page.getByText('登録済み整備データを読み込みました。', { exact: false }).waitFor();
    await page.getByRole('button', { name: '7. OBD2車両読取', exact: true }).click();
    const picker = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: '保存した読取結果を開く', exact: true }).click();
    const core = vm.createContext({ window: {} });
    vm.runInContext(fs.readFileSync(path.join(root, 'obd-readonly.js'), 'utf8'), core);
    const model = core.window.ObdReadOnly;
    const summary = model.normalizeEcuResponseSummary({ecus:[
      {id:'ecu-pair',ecuId:'',ecu_id:'7E8',status:'reported',response_count:2},
      {id:'module-pair',moduleId:'',module_id:'7E9',status:'reported',response_count:2},
      {id:'controller-pair',controllerId:'',controller_id:'7EA',status:'reported',response_count:2},
      {id:'normal-row',address:'7EB',status:'reported',response_count:1}
    ]});
    assert.equal(summary.ecus[0].ecuResponseConflict,true);
    const session=model.buildDiagnosticScanSession({session_id:'identity-alias-proposal',ecuResponseSummary:summary});
    await (await picker).setFiles({name:'synthetic-identity-alias-proposal.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(model.buildBridgeSessionExportPayload(session)))});
    await page.waitForFunction(()=>obdDevSession.lastSession?.sessionId==='identity-alias-proposal');
    await page.getByRole('button',{name:'3. 結果',exact:true}).click();
    await page.getByRole('button',{name:/7E8 .*のECU応答詳細を開く/}).click();
    const card=page.locator('#obdSessionDetailEcuResponses');await card.waitFor({state:'visible'});
    await card.getByRole('button',{name:'ECU応答検索を解除',exact:true}).click();
    const original=await page.evaluate(()=>JSON.stringify(obdDevSession.lastSession));
    const records=card.locator('.obd-ecu-response-record');
    assert.equal(await records.count(),4);
    assert.equal(await card.locator('.obd-ecu-response-record:visible').count(),4);
    assert.match(await records.nth(0).innerText(),/ECU識別情報に矛盾/);
    assert.match(await records.nth(0).innerText(),/応答取得 \(reported\)/);
    assert.ok(!(await records.nth(3).innerText()).includes('注意:'));
    for(const width of [390,1280]) for(const dark of [false,true]){
      await page.setViewportSize({width,height:844});await page.evaluate(d=>document.body.classList.toggle('dark',d),dark);
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);
      await card.screenshot({path:path.join(output,'conflict-'+width+'-'+dark+'.png')});
    }
    await card.getByLabel('ECU応答検索',{exact:true}).fill('矛盾');
    assert.equal(await card.locator('.obd-ecu-response-record:visible').count(),3);
    await card.getByRole('button',{name:'ECU応答検索を解除',exact:true}).click();
    assert.equal(await card.locator('.obd-ecu-response-record:visible').count(),4);
    assert.equal(await page.evaluate(()=>JSON.stringify(obdDevSession.lastSession)),original);
    const restored=await page.evaluate(()=>window.ObdReadOnly.buildDiagnosticScanSessionFromJson(JSON.stringify(window.ObdReadOnly.buildBridgeSessionExportPayload(obdDevSession.lastSession))));
    assert.equal(restored.ecuResponseSummary.ecus[0].ecuResponseConflict,true);
    assert.equal(restored.ecuResponseSummary.ecus[0].status,'reported');
    assert.equal(restored.ecuResponseSummary.ecus[3].address,'7EB');
    assert.deepEqual(restored.ecuResponseSummary.ecus.map(row=>row.ecuResponseConflict??false),[true,true,true,false]);
    assert.deepEqual(errors,[]);assert.deepEqual(blocked,[]);
    console.log('ECU identity alias production browser: actual JSON import, visible warning, normal row, search/reset, immutable session/archive and responsive themes passed. Artifacts: '+output);
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
