import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import assert from 'node:assert/strict';import {createRequire} from 'node:module';import {fileURLToPath} from 'node:url';
import {directImportEcuCases} from './direct-import-ecu-alias-cases.js';

const require=createRequire(import.meta.url),root=fileURLToPath(new URL('../',import.meta.url));
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const output=fs.mkdtempSync(path.join(os.tmpdir(),'direct-import-ecu-alias-production-'));
const browser=await chromium.launch({channel:'chrome',headless:true}),errors=[],blocked=[];
try{
 const context=await browser.newContext({serviceWorkers:'block'});
 await context.addInitScript(()=>{localStorage.setItem('vehicle-diagnosis-notice-accepted-v1','accepted');sessionStorage.setItem('vehicle-diagnosis-obd-access-v1','enabled');Object.defineProperty(navigator,'serial',{value:undefined,configurable:true});Object.defineProperty(navigator,'bluetooth',{value:undefined,configurable:true});});
 await context.route('**/*',async route=>{
  const url=new URL(route.request().url());if(url.origin!=='http://127.0.0.1'||route.request().method()!=='GET'){blocked.push(url.href);return route.abort();}
  const file=path.resolve(root,'.'+(url.pathname==='/'?'/index.html':decodeURIComponent(url.pathname))),relative=path.relative(root,file);
  if(relative.startsWith('..')||path.isAbsolute(relative)||!fs.existsSync(file))return route.fulfill({status:404,body:''});
  const body=fs.readFileSync(file);
  await route.fulfill({contentType:{'.js':'text/javascript','.json':'application/json','.html':'text/html','.css':'text/css','.svg':'image/svg+xml'}[path.extname(file)]||'text/plain',body});
 });
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
 await page.goto('http://127.0.0.1/');await page.getByText('登録済み整備データを読み込みました。',{exact:false}).waitFor();await page.getByRole('button',{name:'7. OBD2車両読取',exact:true}).click();
 let first=true;
 for(const id of ['normal-zero','raw-header-conflict','canonical-values-conflict','mixed-dtc','same-aliases']){
  const test=directImportEcuCases.find(x=>x.id===id);
  const payload=await page.evaluate(({parts,id})=>{const api=window.ObdReadOnly;const imported=api.buildBridgeDiagnosticImport(parts);const session=api.buildDiagnosticScanSession({...imported.bridgeSession,session_id:id,sessionId:id});return api.buildBridgeSessionExportPayload(session);},{parts:test.parts,id});
  const file={name:id+'.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(payload))};
  if(first){const [chooser]=await Promise.all([page.waitForEvent('filechooser'),page.getByRole('button',{name:'保存した読取結果を開く',exact:true}).click()]);await chooser.setFiles(file);first=false;}else await page.locator('#obdImportFileInput').setInputFiles(file);
  await page.waitForFunction(id=>obdDevSession.lastSession?.sessionId===id,id);
  const result=await page.evaluate(()=>{const s=obdDevSession.lastSession.livePidSnapshot;return {status:s.livePidReadoutStatus,values:s.monitorValues,insights:s.monitorInsights,errors:s.errorCodes};});
  if(test.reject){assert.equal(result.status,'blocked');assert.deepEqual(result.values,[]);assert.deepEqual(result.insights,[]);assert.deepEqual(result.errors,['source_ecu_alias_conflict']);}
  else assert.ok(result.values.length>0);
  const restored=await page.evaluate(()=>{const api=window.ObdReadOnly;return api.buildDiagnosticScanSessionFromJson(JSON.stringify(api.buildBridgeSessionExportPayload(obdDevSession.lastSession))).livePidSnapshot;});
  assert.equal(restored.livePidReadoutStatus,result.status);assert.deepEqual(restored.monitorValues,result.values);assert.deepEqual(restored.errorCodes,result.errors);
  await page.getByRole('button',{name:'ライブ値',exact:true}).click();
  if(test.reject){
   assert.match(await page.locator('#obdMonitorStatus').innerText(),/読取拒否として記録されています/);
   assert.equal(await page.getByText('バンク1の燃料補正合計が大きい',{exact:true}).count(),0);
   for(const width of [390,1280])for(const dark of [false,true]){await page.setViewportSize({width,height:844});await page.evaluate(d=>document.body.classList.toggle('dark',d),dark);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);await page.locator('#obdMonitorStatus').screenshot({path:path.join(output,id+'-'+width+'-'+dark+'.png')});}
   fs.writeFileSync(path.join(output,id+'-visible.txt'),await page.locator('body').innerText());
  }else assert.ok(!(await page.locator('#obdMonitorStatus').innerText()).includes('読取拒否として記録されています'));
 }
 assert.deepEqual(errors,[]);assert.deepEqual(blocked,[]);
 console.log('Direct import ECU alias browser production: five API-produced archives imported; visible Japanese rejection reason/empty readings survive save; normal zero and recovery; responsive themes; no page errors or external/vehicle requests. Artifacts: '+output);
}finally{await browser.close();}
