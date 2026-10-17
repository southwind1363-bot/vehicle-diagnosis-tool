const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
(async () => {
  const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const page = await browser.newPage();
    await page.route('http://parser-preview.test/**', route => {
      const pathname = new URL(route.request().url()).pathname;
      if (pathname === '/') return route.fulfill({contentType:'text/html',body:'<!doctype html><html lang="ja"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>模擬解析確認</title><style>body{background:#121821;color:#eef2f7;font:18px sans-serif;margin:16px}button{font:inherit;padding:12px}</style><h1>模擬検証専用</h1><div id="preview"></div><button id="expire">模擬設定を失効</button><button id="read">模擬再読取</button><script src="/obd-readonly.js"></script></html>'});
      const modules = ['parser-connection-review.js','parser-connection-preview.js','monitor-preview-controller.js','monitor-preview-view.js'];
      const file = modules.includes(pathname.slice(1)) ? 'scripts/fixtures/' + pathname.slice(1) : pathname === '/obd-readonly.js' ? 'obd-readonly.js' : null;
      return file ? route.fulfill({contentType:'text/javascript',body:fs.readFileSync(path.join(__dirname,'..',file),'utf8')}) : route.abort();
    });
    for (const width of [390,1280]) {
      await page.setViewportSize({width,height:900});
      await page.goto('http://parser-preview.test/');
      await page.evaluate(async () => {
        const {createParserConnectionReview} = await import('/parser-connection-review.js');
        const {attachMonitorPreviewView} = await import('/monitor-preview-view.js');
        let expired=false, invalidate;
        const fields=['initializationComplete','echoOffAcknowledged','spacesOffAcknowledged','protocol11bitReported','canAutoFormatAcknowledged','dlcOffAcknowledged','canExtendedAddressOffAcknowledged'];
        const commands=['03','07','0A','0101'];
        const owner={inspect:()=>({status:expired?'invalidated':'finished',formatReview:{readoutConditions:commands.map(command=>({command,...Object.fromEntries(fields.map(field=>[field,true]))}))}})};
        const lines=['7E8024400AAAAAAAAAA\r>','NO DATA\r>','7E8037F0A11AAAAAAAA\r>','7E806410100070100AA\r>'];
        owner.invalidate=()=>{expired=true;};
        const review=createParserConnectionReview(()=>{expired=false;return {owner,api:window.ObdReadOnly,records:commands.map((command,index)=>({command,transcript:lines[index]}))};},callback=>{invalidate=callback;return()=>{invalidate=null;};});
        attachMonitorPreviewView(document.querySelector('#preview'),review,{heading:'模擬の項目別照合'});
        document.querySelector('#expire').onclick=()=>{expired=true;invalidate();};
        document.querySelector('#read').onclick=()=>review.read();
        await review.read();
      });
      const text=await page.locator('#preview').innerText();
      assert.match(text,/保存DTC：応答形式・要求との対応を確認できません/);
      assert.match(text,/保留DTC：応答データなし/);
      assert.match(text,/永久DTC：負応答あり/);
      assert.match(text,/レディネス：対応する応答を観測/);
      assert.doesNotMatch(text,/7E8|AAAAAAAA/);
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
      await page.locator('#expire').focus(); await page.keyboard.press('Enter');
      const expired=await page.locator('#preview').innerText();
      assert.match(expired,/確認条件が変わりました/);assert.doesNotMatch(expired,/保存DTC：|レディネス：/);
      await page.locator('#read').focus(); await page.keyboard.press('Enter');
      await page.waitForFunction(()=>document.querySelector('#preview').textContent.includes('保存DTC：'));
      assert.match(await page.locator('#preview').innerText(),/永久DTC：負応答あり/);
    }
    console.log('Parser preview browser: 390/1280px, four distinct results, automatic invalidation, keyboard reread and raw omission passed; synthetic only');
  } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
