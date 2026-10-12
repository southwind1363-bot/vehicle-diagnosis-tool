import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import assert from 'node:assert/strict';import {createRequire} from 'node:module';import {fileURLToPath} from 'node:url';
import {pidMatrixCases} from './pid-matrix-ecu-alias-cases.js';
import {applyPidMatrixEcuAliasProposal} from './pid-matrix-ecu-alias-proposal.js';



const require=createRequire(import.meta.url),root=fileURLToPath(new URL('../',import.meta.url));
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const output=fs.mkdtempSync(path.join(os.tmpdir(),'pid-matrix-ecu-alias-proposal-'));
const browser=await chromium.launch({channel:'chrome',headless:true}),errors=[],blocked=[];
try{
 const context=await browser.newContext({serviceWorkers:'block'});
 await context.addInitScript(()=>{localStorage.setItem('vehicle-diagnosis-notice-accepted-v1','accepted');sessionStorage.setItem('vehicle-diagnosis-obd-access-v1','enabled');Object.defineProperty(navigator,'serial',{value:undefined,configurable:true});Object.defineProperty(navigator,'bluetooth',{value:undefined,configurable:true});});
 await context.route('**/*',async route=>{
  const url=new URL(route.request().url());if(url.origin!=='http://127.0.0.1'||route.request().method()!=='GET'){blocked.push(url.href);return route.abort();}
  const file=path.resolve(root,'.'+(url.pathname==='/'?'/index.html':decodeURIComponent(url.pathname))),relative=path.relative(root,file);
  if(relative.startsWith('..')||path.isAbsolute(relative)||!fs.existsSync(file))return route.fulfill({status:404,body:''});
  const body=path.basename(file)==='obd-readonly.js'?Buffer.from(applyPidMatrixEcuAliasProposal(fs.readFileSync(file,'utf8'))):fs.readFileSync(file);
  await route.fulfill({contentType:{'.js':'text/javascript','.json':'application/json','.html':'text/html','.css':'text/css','.svg':'image/svg+xml'}[path.extname(file)]||'text/plain',body});
 });
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
 await page.goto('http://127.0.0.1/');await page.getByText('登録済み整備データを読み込みました。',{exact:false}).waitFor();await page.getByRole('button',{name:'7. OBD2車両読取',exact:true}).click();
 let first=true;
 const normal=pidMatrixCases.find(t=>t.id==='SupportedPid-normal');
 const cases=[normal,...pidMatrixCases.filter(t=>['SupportedPid-conflict','SupportedPid-array-conflict','SupportedPid-mixed-rows-conflict'].includes(t.id)),normal];
 for(let index=0;index<cases.length;index++){const test=cases[index],id=test.id+'-'+index;
 const payload=await page.evaluate(({test,id})=>{const a=window.ObdReadOnly,v=a[test.api](test.input),session=a.buildDiagnosticScanSession({session_id:id,[test.slot]:v});return a.buildBridgeSessionExportPayload(session);},{test,id});
 const file={name:id+'.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(payload))};
 if(first){const [chooser]=await Promise.all([page.waitForEvent('filechooser'),page.getByRole('button',{name:'保存した読取結果を開く',exact:true}).click()]);await chooser.setFiles(file);first=false;}else await page.locator('#obdImportFileInput').setInputFiles(file);
 await page.waitForFunction(id=>obdDevSession.lastSession?.sessionId===id,id);await page.getByRole('button',{name:'3. 結果',exact:true}).click();await page.locator('#obdSimpleResultSummary').waitFor({state:'visible'});
 const result=await page.evaluate(({slot})=>{const a=window.ObdReadOnly,s=obdDevSession.lastSession,r=a.buildDiagnosticScanSessionFromJson(JSON.stringify(a.buildBridgeSessionExportPayload(s)));return {snapshot:s[slot],restored:r[slot]};},test);
 if(test.reject){for(const v of [result.snapshot,result.restored]){assert.equal(v[test.status],'blocked');assert.deepEqual(v.errorCodes,['source_ecu_alias_conflict']);}const visible=await page.locator('#obdSimpleResultSummary').innerText();assert.match(visible,/読取拒否/);assert.match(visible,/同じ箇所のECU番号が不一致または形式不正/);
 for(const width of [390,1280])for(const dark of [false,true]){await page.setViewportSize({width,height:844});await page.evaluate(d=>document.body.classList.toggle('dark',d),dark);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);await page.locator('#obdSimpleResultSummary').screenshot({path:path.join(output,id+'-'+width+'-'+dark+'.png')});}
 fs.writeFileSync(path.join(output,id+'-visible.txt'),await page.locator('body').innerText());
 }else {assert.equal(result.snapshot.supportedPidReadoutStatus,'reported');assert.ok(result.snapshot.supportedPids.includes('01'));assert.ok(!(await page.locator('#obdSimpleResultSummary').innerText()).includes('読取拒否あり')); }
 }
 assert.deepEqual(errors,[]);assert.deepEqual(blocked,[]);console.log('PID matrix ECU browser proposal: 3 refused input shapes plus normal before/after; one API; visible refusal, archive restore, responsive themes; no page errors or external/vehicle requests. Artifacts: '+output);
}finally{await browser.close();}
