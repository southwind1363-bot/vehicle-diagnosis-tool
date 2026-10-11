import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {applyInsightRetentionProposal} from './insight-retention-proposal.js';

const require = createRequire(import.meta.url);
const root = fileURLToPath(new URL('../',import.meta.url));
const fixture = JSON.parse(fs.readFileSync(new URL('./fixtures/insight-retention-legacy-3.13.673.json',import.meta.url),'utf8'));
const coreSource = applyInsightRetentionProposal(fs.readFileSync(path.join(root,'obd-readonly.js'),'utf8'));
const modelContext = vm.createContext({window:{}}); vm.runInContext(coreSource,modelContext);
const model = modelContext.window.ObdReadOnly;
model.configureMonitorDefinitions(JSON.parse(fs.readFileSync(path.join(root,'data/obd-monitor-definitions.json'),'utf8')));
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const output = fs.mkdtempSync(path.join(os.tmpdir(),'insight-retention-proposal-'));
const browser = await chromium.launch({channel:'chrome',headless:true});
const errors=[], blocked=[];
try {
  const context = await browser.newContext({serviceWorkers:'block'});
  await context.addInitScript(()=>{
    localStorage.setItem('vehicle-diagnosis-notice-accepted-v1','accepted');
    sessionStorage.setItem('vehicle-diagnosis-obd-access-v1','enabled');
    Object.defineProperty(navigator,'serial',{value:undefined,configurable:true});
    Object.defineProperty(navigator,'bluetooth',{value:undefined,configurable:true});
  });
  await context.route('**/*',async route=>{
    const url=new URL(route.request().url());
    if(url.origin!=='http://127.0.0.1'||route.request().method()!=='GET'){blocked.push(url.href);return route.abort();}
    const file=path.resolve(root,'.'+(url.pathname==='/'?'/index.html':decodeURIComponent(url.pathname)));
    const relative=path.relative(root,file);
    if(relative.startsWith('..')||path.isAbsolute(relative)||!fs.existsSync(file))return route.fulfill({status:404,body:''});
    await route.fulfill({contentType:{'.js':'text/javascript','.json':'application/json','.html':'text/html','.css':'text/css','.svg':'image/svg+xml'}[path.extname(file)]||'text/plain',body:url.pathname==='/obd-readonly.js'?coreSource:fs.readFileSync(file)});
  });
  const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
  await page.goto('http://127.0.0.1/');
  await page.getByText('登録済み整備データを読み込みました。',{exact:false}).waitFor();
  await page.getByRole('button',{name:'7. OBD2車両読取',exact:true}).click();
  const cases=fixture.cases.filter(row=>['same-title','same-id','duplicate-records','extra-metadata','crowded-same-title'].includes(row.id));
  for(const [index,test] of cases.entries()) {
    const session=model.buildDiagnosticScanSession({session_id:'retention-'+test.id,livePidSnapshot:test.input});
    const expected=JSON.parse(JSON.stringify(session.livePidSnapshot.monitorInsights));
    const picker=page.waitForEvent('filechooser');if(index)page.once('dialog',dialog=>dialog.accept());
    await page.getByRole('button',{name:index?'読取結果ファイルを開く':'保存した読取結果を開く',exact:true}).click();
    await(await picker).setFiles({name:test.id+'.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(model.buildBridgeSessionExportPayload(session)))});
    await page.waitForFunction(id=>obdDevSession.lastSession?.sessionId===id,session.sessionId);
    await page.getByRole('button',{name:'基本読取結果へ戻る',exact:true}).click();
    await page.getByRole('button',{name:'ライブデータの詳細を開く',exact:true}).click();
    const detail=page.locator('#obdMonitorInsightList');await detail.waitFor({state:'visible'});
    const originalSession=await page.evaluate(()=>JSON.stringify(obdDevSession.lastSession));
    assert.deepEqual(JSON.parse(originalSession).livePidSnapshot.monitorInsights,expected);
    const current=detail.locator('[data-insight-group="recalculated"]');
    assert.ok((await current.innerText()).includes('電源電圧を優先確認'));
    assert.ok(!(await current.innerText()).includes('保存時の原文'));
    const recorded=detail.locator('[data-insight-group="recorded"]');
    assert.equal(await recorded.locator('li').count(),Math.min(6,expected.length));
    if(test.id==='crowded-same-title')await require('./validate-readout-print.cjs')(page,output,test.id+'-initial');
    const more=detail.getByRole('button',{name:/記録内の分析文をさらに表示/});
    while(await more.isVisible())await more.click();
    assert.equal(await recorded.locator('li').count(),expected.length);
    const displayed=await recorded.locator('li > span').allTextContents();
    assert.deepEqual(displayed.slice(0,test.input.monitorInsights.length),test.input.monitorInsights.map(row=>row.detail));
    for(const width of [390,1280])for(const dark of [false,true]) {
      await page.setViewportSize({width,height:844});await page.evaluate(value=>document.body.classList.toggle('dark',value),dark);
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);
      await detail.screenshot({path:path.join(output,`${test.id}-${width}-${dark}.png`)});
    }
    await require('./validate-readout-print.cjs')(page,output,test.id+'-expanded');
    assert.equal(await page.evaluate(()=>JSON.stringify(obdDevSession.lastSession)),originalSession);
    const archive=await page.evaluate(()=>JSON.stringify(window.ObdReadOnly.buildBridgeSessionExportPayload(obdDevSession.lastSession)));
    const restored=model.buildDiagnosticScanSessionFromJson(archive);
    assert.deepEqual(JSON.parse(JSON.stringify(restored.livePidSnapshot.monitorInsights)),expected);
    await page.getByRole('button',{name:'基本読取結果へ戻る',exact:true}).click();
  }
  assert.deepEqual(errors,[]);assert.deepEqual(blocked,[]);
  console.log('Insight retention proposal browser: five real JSON imports, original text/order/metadata retained, duplicate records preserved, pagination, print, responsive themes, archive stability, zero external/vehicle requests. Artifacts: '+output);
} finally { await browser.close(); }
