import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {bridgeEcuAliasCases} from './bridge-ecu-alias-cases.js';
const require=createRequire(import.meta.url),root=fileURLToPath(new URL('../',import.meta.url));
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const output=fs.mkdtempSync(path.join(os.tmpdir(),'bridge-ecu-alias-production-'));
const browser=await chromium.launch({channel:'chrome',headless:true});
const control=value=>({ok:true,blocked:false,would_transmit:false,errors:[],data:{monitor_values:[{id:'control_module_voltage',pid:'42',value,unit:'V',sourceEcu:'7E8',source_ecu:'7E8'}]}});
try{
 for(const phase of ['production']){
  const context=await browser.newContext({serviceWorkers:'block'}),errors=[],blocked=[],requests=[];
  let next=control(14);
  await context.addInitScript(()=>{
   localStorage.setItem('vehicle-diagnosis-notice-accepted-v1','accepted');
   localStorage.setItem('vehicle-diagnosis-obd-ui-mode-v1','details');
   localStorage.setItem('vehicle-diagnosis-obd-dev-token-v1','synthetic-review-token');
   sessionStorage.setItem('vehicle-diagnosis-obd-access-v1','enabled');
   sessionStorage.setItem('vehicle-diagnosis-obd-dev-mode-v1','enabled');
   Object.defineProperty(navigator,'serial',{value:undefined,configurable:true});
   Object.defineProperty(navigator,'bluetooth',{value:undefined,configurable:true});
  });
  await context.route('**/*',async route=>{
   const url=new URL(route.request().url());
   if(url.origin==='http://127.0.0.1'&&url.pathname==='/local-bridge/v1/request'&&route.request().method()==='POST'){
    const req=route.request().postDataJSON();requests.push(req.intent);
    assert.ok(['bridge_status','adapter_identity','read_stored_dtc','read_pending_dtc','read_permanent_dtc','read_freeze_frame','read_supported_pids','read_ecu_info','read_onboard_monitor','read_readiness','read_live_pid_snapshot'].includes(req.intent));
    return route.fulfill({contentType:'application/json',body:JSON.stringify({...next,request_id:req.request_id})});
   }
   if(url.origin!=='http://127.0.0.1'||route.request().method()!=='GET'){blocked.push(url.href);return route.abort();}
   const file=path.resolve(root,'.'+(url.pathname==='/'?'/index.html':decodeURIComponent(url.pathname))),relative=path.relative(root,file);
   if(relative.startsWith('..')||path.isAbsolute(relative)||!fs.existsSync(file))return route.fulfill({status:404,body:''});
   let body=fs.readFileSync(file);
   await route.fulfill({contentType:{'.js':'text/javascript','.json':'application/json','.html':'text/html','.css':'text/css','.svg':'image/svg+xml'}[path.extname(file)]||'text/plain',body});
  });
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1/');await page.getByText('登録済み整備データを読み込みました。',{exact:false}).waitFor();
  await page.getByRole('button',{name:'7. OBD2車両読取',exact:true}).click();
  const select=async id=>{
   // Navigation setup only; each read is triggered by its real enabled button.
   await page.evaluate(id=>{setObdStage('details');document.getElementById(id).closest('details').open=true;},id);
   await page.locator('#'+id).click();
   await page.waitForFunction(()=>obdBridgeOperation===null);
  };
  await select('obdDevBridgeStatusButton');
  if(phase==='production'){
   const empty=await page.evaluate(()=>JSON.stringify(obdDevSession.lastSession));next=bridgeEcuAliasCases[0].response;
   await select('obdDevBridgeLiveButton');assert.equal(await page.evaluate(()=>JSON.stringify(obdDevSession.lastSession)),empty);
   assert.match(await page.locator('#obdDevStatus').innerText(),/今回の結果は採用していません/);
  }
  next=control(14);await select('obdDevBridgeLiveButton');
  assert.equal(await page.evaluate(()=>obdDevSession.lastSession.livePidSnapshot.monitorValues[0].value),14);
  const retained=await page.evaluate(()=>JSON.stringify(obdDevSession.lastSession));
  const archive=await page.evaluate(()=>{const x=window.ObdReadOnly.buildBridgeSessionExportPayload(obdDevSession.lastSession);delete x.exported_at;return JSON.stringify(x);});
  next=bridgeEcuAliasCases.find(x=>x.id==='false-trim').response;
  {
   const buttons=['obdDevBridgeDtcButton','obdDevBridgePendingDtcButton','obdDevBridgePermanentDtcButton','obdDevBridgeFreezeFrameButton','obdDevBridgeSupportedPidButton','obdDevBridgeEcuInfoButton','obdDevBridgeMonitorButton','obdDevBridgeReadinessButton','obdDevBridgeLiveButton'];
   for(const id of buttons){
    const count=requests.length;await select(id);assert.equal(requests.length,count+1,'one mock request, no endpoint retry');
    assert.equal(await page.evaluate(()=>JSON.stringify(obdDevSession.lastSession)),retained);
    assert.equal(await page.evaluate(()=>{const x=window.ObdReadOnly.buildBridgeSessionExportPayload(obdDevSession.lastSession);delete x.exported_at;return JSON.stringify(x);}),archive);
    const status=page.locator('#obdDevStatus');assert.match(await status.innerText(),/今回の結果は採用していません/);assert.ok(!(await status.innerText()).includes('source_ecu_alias_conflict'));
    assert.equal(await page.locator('#'+id).isEnabled(),true);
   }
   for(const width of [390,1280])for(const dark of [false,true]){
    await page.setViewportSize({width,height:844});await page.evaluate(d=>document.body.classList.toggle('dark',d),dark);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);
    await page.locator('#obdDevStatus').screenshot({path:path.join(output,'rejected-'+width+'-'+dark+'.png')});
   }
   next=control(13);await select('obdDevBridgeLiveButton');assert.equal(await page.evaluate(()=>obdDevSession.lastSession.livePidSnapshot.monitorValues[0].value),13);
  }
  assert.deepEqual(errors,[]);assert.deepEqual(blocked,[]);
  console.log(phase+': '+requests.length+' intercepted mock requests; no real bridge/vehicle I/O; page errors 0');
  await context.close();
 }
 console.log('Bridge ECU production browser: rejects initial + 9 read responses, keeps session/archive, Japanese reason, themes/widths, valid recovery. Artifacts: '+output);
}finally{await browser.close();}
