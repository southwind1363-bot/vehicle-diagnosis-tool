import fs from 'node:fs';
import {ecuAliasCases} from './ecu-alias-import-cases.js';
import path from 'node:path';
import os from 'node:os';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';

const require = createRequire(import.meta.url);
const root = fileURLToPath(new URL('../',import.meta.url));
const coreSource = fs.readFileSync(path.join(root,'obd-readonly.js'),'utf8');
const modelContext = vm.createContext({window:{}}); vm.runInContext(coreSource,modelContext);
const model = modelContext.window.ObdReadOnly;
model.configureMonitorDefinitions(JSON.parse(fs.readFileSync(path.join(root,'data/obd-monitor-definitions.json'),'utf8')));
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const output = fs.mkdtempSync(path.join(os.tmpdir(),'ecu-alias-import-production-'));
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
    await route.fulfill({contentType:{'.js':'text/javascript','.json':'application/json','.html':'text/html','.css':'text/css','.svg':'image/svg+xml'}[path.extname(file)]||'text/plain',body:fs.readFileSync(file)});
  });
  const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
  await page.goto('http://127.0.0.1/');
  await page.getByText('登録済み整備データを読み込みました。',{exact:false}).waitFor();
  await page.getByRole('button',{name:'7. OBD2車両読取',exact:true}).click();

  page.on('dialog',dialog=>dialog.accept());
  const upload=async(input,name,initial=false)=>{
    const payload={name:name+'.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(input))};
    if(initial){
      const [picker]=await Promise.all([page.waitForEvent('filechooser'),page.getByRole('button',{name:'保存した読取結果を開く',exact:true}).click()]);
      await picker.setFiles(payload);
    } else {
      await page.locator('#obdImportFileInput').setInputFiles(payload);
    }
  };
  const emptySession=await page.evaluate(()=>JSON.stringify(obdDevSession.lastSession));
  await upload(ecuAliasCases.find(row=>row.id==='row-conflict').input,'initial-conflict',true);
  await page.locator('#obdImportStatus').filter({hasText:'このJSONは取り込めません'}).waitFor();
  assert.equal(await page.evaluate(()=>JSON.stringify(obdDevSession.lastSession)),emptySession);
  const baseline=model.buildDiagnosticScanSession({session_id:'alias-guard-control',livePidSnapshot:model.normalizeBridgeLivePidSnapshot({monitorValues:[{id:'control_module_voltage',pid:'42',value:14,unit:'V',sourceEcu:'7E8',source_ecu:'7E8'}]})});
  await upload(model.buildBridgeSessionExportPayload(baseline),'valid-control');
  await page.waitForFunction(()=>obdDevSession.lastSession?.sessionId==='alias-guard-control');
  await page.getByRole('button',{name:'基本読取結果へ戻る',exact:true}).click();
  const retained=await page.evaluate(()=>JSON.stringify(obdDevSession.lastSession));
  const archived=await page.evaluate(()=>{const payload=window.ObdReadOnly.buildBridgeSessionExportPayload(obdDevSession.lastSession);delete payload.exported_at;return JSON.stringify(payload);});
  for(const test of ecuAliasCases.filter(row=>['row-conflict','false-trim','header-conflict','freeze-frame'].includes(row.id))){
    // Reset only the previous notice, so waiting verifies this file was handled.
    await page.evaluate(()=>{document.getElementById('obdImportStatus').textContent='';});
    await upload(test.input,test.id);
    const status=page.locator('#obdImportStatus');
    await status.filter({hasText:'このJSONは取り込めません'}).waitFor();
    assert.equal(await page.evaluate(()=>JSON.stringify(obdDevSession.lastSession)),retained);
    assert.equal(await page.evaluate(()=>{const payload=window.ObdReadOnly.buildBridgeSessionExportPayload(obdDevSession.lastSession);delete payload.exported_at;return JSON.stringify(payload);}),archived);
    assert.ok(!(await status.innerText()).includes('source_ecu_alias_conflict'));
    for(const width of [390,1280])for(const dark of [false,true]){
      await page.setViewportSize({width,height:844});await page.evaluate(value=>document.body.classList.toggle('dark',value),dark);
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);
      await status.screenshot({path:path.join(output,test.id+'-'+width+'-'+dark+'.png')});
    }
  }
  // A valid file can still replace the retained session after a rejection.
  const next=model.buildDiagnosticScanSession({...baseline,session_id:'alias-guard-recovery',sessionId:'alias-guard-recovery'});
  await upload(model.buildBridgeSessionExportPayload(next),'valid-after-rejection');
  await page.waitForFunction(()=>obdDevSession.lastSession?.sessionId==='alias-guard-recovery');
  assert.deepEqual(errors,[]);assert.deepEqual(blocked,[]);
  console.log('ECU alias import browser production: five rejected JSON imports, previous session/archive unchanged, Japanese reason, 390/1280 themes, valid import recovery, zero external/vehicle requests. Artifacts: '+output);
} finally {await browser.close();}
