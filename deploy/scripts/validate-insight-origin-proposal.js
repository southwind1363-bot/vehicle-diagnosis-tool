import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
const require=createRequire(import.meta.url), path=require('node:path'), os=require('node:os');
const root=fileURLToPath(new URL('../',import.meta.url));
const source=fs.readFileSync(path.join(root,'script.js'),'utf8');
const productionRenderer=source.match(/function renderObdMonitorInsights\([^)]*\) \{[\s\S]*?\r?\n\}/)?.[0];
assert.ok(productionRenderer,'production renderer exists');
assert.ok(source.includes('renderObdMonitorInsights(insights, values);'),'renderer receives the full record');
const core=vm.createContext({window:{}});vm.runInContext(fs.readFileSync(path.join(root,'obd-readonly.js'),'utf8'),core);
const model=core.window.ObdReadOnly;model.configureMonitorDefinitions(JSON.parse(fs.readFileSync(path.join(root,'data/obd-monitor-definitions.json'),'utf8')));
const fixture=JSON.parse(fs.readFileSync(new URL('./fixtures/insight-origin-legacy-3.13.672.json',import.meta.url),'utf8'));
let checks=0;const check=(x,m)=>{assert.ok(x,m);checks++};
for(const test of fixture.cases) {
 const actual=model.normalizeBridgeLivePidSnapshot(test.input);
 assert.deepEqual(JSON.parse(JSON.stringify(actual)),test.snapshot);checks++;
}
check(fixture.cases[0].snapshot.monitorInsights.some(x=>x.detail==='保存時は9 V'),'stale hint baseline');
check(!fixture.cases[1].snapshot.monitorInsights.some(x=>x.detail==='保存時は9 V'),'collision baseline');
check(!fixture.cases[2].visibleTitles.includes('電源電圧を優先確認'),'hidden current caution baseline');
function element(){return {children:[],dataset:{},textContent:'',hidden:false,handlers:{},append(...x){this.children.push(...x)},appendChild(x){this.children.push(x)},addEventListener(k,f){this.handlers[k]=f}}}
for(const test of fixture.cases){
 const snapshot=JSON.parse(JSON.stringify(test.snapshot)), original=JSON.stringify(snapshot);
 const c=vm.createContext({document:{createElement:element},window:{ObdReadOnly:model},obdMonitorInsightList:element()});vm.runInContext(productionRenderer,c);
 c.renderObdMonitorInsights(snapshot.monitorInsights,snapshot.monitorValues);
 const groups=c.obdMonitorInsightList.children.filter(x=>x.dataset.insightGroup);
 check(groups[0].dataset.insightGroup==='recalculated','current first');
 check(groups[0].children.some(li=>li.children[0].textContent==='電源電圧を優先確認')===['collision','crowded'].includes(test.id),'current warning eligibility');
 check(groups[1].children.length===Math.min(6,snapshot.monitorInsights.length),'recorded page size');
 const button=c.obdMonitorInsightList.children.at(-1);while(!button.hidden)button.handlers.click();
 check(groups[1].children.length===snapshot.monitorInsights.length,'all recorded rows reachable');
 check(JSON.stringify(snapshot)===original,'no mutation');
}
console.log('Insight origin production regression: '+checks+' checks passed; production renderer and unchanged normalizers');
if(process.argv.includes('--browser')){
 const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');const output=fs.mkdtempSync(path.join(os.tmpdir(),'insight-origin-production-'));
 const browser=await chromium.launch({channel:'chrome',headless:true});const errors=[],blocked=[];
 try{
 const context=await browser.newContext({serviceWorkers:'block'});await context.addInitScript(()=>{localStorage.setItem('vehicle-diagnosis-notice-accepted-v1','accepted');sessionStorage.setItem('vehicle-diagnosis-obd-access-v1','enabled');Object.defineProperty(navigator,'serial',{value:undefined,configurable:true});Object.defineProperty(navigator,'bluetooth',{value:undefined,configurable:true});});
 await context.route('**/*',async route=>{const u=new URL(route.request().url());if(u.origin!=='http://127.0.0.1'||route.request().method()!=='GET'){blocked.push(u.href);return route.abort()};const file=path.resolve(root,'.'+(u.pathname==='/'?'/index.html':decodeURIComponent(u.pathname)));const relative=path.relative(root,file);if(relative.startsWith('..')||path.isAbsolute(relative)||!fs.existsSync(file))return route.fulfill({status:404,body:''});const body=fs.readFileSync(file);await route.fulfill({contentType:{'.js':'text/javascript','.json':'application/json','.html':'text/html','.css':'text/css','.svg':'image/svg+xml'}[path.extname(file)]||'text/plain',body});});
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto('http://127.0.0.1/');await page.getByText('登録済み整備データを読み込みました。',{exact:false}).waitFor();await page.getByRole('button',{name:'7. OBD2車両読取',exact:true}).click();
 for(const [index,test] of fixture.cases.entries()){
 const session=model.buildDiagnosticScanSession({session_id:'origin-review-'+test.id,livePidSnapshot:test.snapshot});const picker=page.waitForEvent('filechooser');if(index)page.once('dialog',d=>d.accept());await page.getByRole('button',{name:index?'読取結果ファイルを開く':'保存した読取結果を開く',exact:true}).click();await(await picker).setFiles({name:test.id+'.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(model.buildBridgeSessionExportPayload(session)))});
 await page.waitForFunction(id=>obdDevSession.lastSession?.sessionId===id,session.sessionId);await page.getByRole('button',{name:'基本読取結果へ戻る',exact:true}).click();await page.getByRole('button',{name:'ライブデータの詳細を開く',exact:true}).click();const detail=page.locator('#obdMonitorInsightList');await detail.waitFor({state:'visible'});const before=await page.evaluate(()=>JSON.stringify(obdDevSession.lastSession));
 const current=detail.locator('[data-insight-group="recalculated"]'),recorded=detail.locator('[data-insight-group="recorded"]');assert.equal((await current.innerText()).includes('電源電圧を優先確認'),['collision','crowded'].includes(test.id));assert.ok((await detail.innerText()).includes('作成元・作成時点は確認できません。'));
 if(['stale','raw'].includes(test.id))assert.ok((await recorded.innerText()).includes('保存時は9 V'));
 await require('./validate-readout-print.cjs')(page,output,test.id+'-initial');
 for(const width of [390,1280])for(const dark of [false,true]){await page.setViewportSize({width,height:844});await page.evaluate(x=>document.body.classList.toggle('dark',x),dark);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);await detail.screenshot({path:path.join(output,test.id+'-'+width+'-'+dark+'.png')});}
 const more=detail.getByRole('button',{name:/記録内の分析文をさらに表示/});while(await more.isVisible())await more.click();assert.equal(await recorded.locator('li').count(),test.snapshot.monitorInsights.length);
 await require('./validate-readout-print.cjs')(page,output,test.id+'-expanded');assert.equal(await page.evaluate(()=>JSON.stringify(obdDevSession.lastSession)),before);
 const archive=await page.evaluate(()=>JSON.stringify(window.ObdReadOnly.buildBridgeSessionExportPayload(obdDevSession.lastSession)));const restored=model.buildDiagnosticScanSessionFromJson(archive);const imported=JSON.parse(before);assert.deepEqual(JSON.parse(JSON.stringify(restored.livePidSnapshot.monitorInsights)),imported.livePidSnapshot.monitorInsights);
 await page.getByRole('button',{name:'基本読取結果へ戻る',exact:true}).click();}
 assert.deepEqual(errors,[]);assert.deepEqual(blocked,[]);console.log('Production browser passed: four real JSON imports, grouped origin, caution visible before saved rows, expansion, print, responsive themes and unchanged archive. Artifacts: '+output);
 }finally{await browser.close()}
}
