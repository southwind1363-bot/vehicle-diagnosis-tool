const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
(async () => {
 const root = path.resolve(__dirname, '..');
 const browser = await chromium.launch({ channel: 'chrome', headless: true });
 try {
  const context = await browser.newContext({ serviceWorkers: 'block', viewport: { width: 390, height: 844 } });
  await context.addInitScript(() => localStorage.setItem('vehicle-diagnosis-notice-accepted-v1', 'accepted'));
  await context.route('**/*', async route => {
   const url = new URL(route.request().url());
   if (url.origin !== 'http://127.0.0.1') return route.abort();
   const file = path.resolve(root, '.' + (url.pathname === '/' ? '/index.html' : decodeURIComponent(url.pathname)));
   if (path.relative(root, file).startsWith('..') || !fs.existsSync(file)) return route.fulfill({status:404,body:''});
   await route.fulfill({contentType: {'.js':'text/javascript','.json':'application/json','.html':'text/html','.css':'text/css','.svg':'image/svg+xml'}[path.extname(file)] || 'text/plain', body:fs.readFileSync(file)});
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('http://127.0.0.1/');
  await page.getByText('登録済み整備データを読み込みました。', {exact:false}).waitFor();
  async function diagnose(code, symptom = '') {
   await page.locator('#obdCode').fill(code);
   await page.locator('#symptomSelect').selectOption(symptom);
   await page.locator('#diagnosisForm').evaluate(form => form.requestSubmit());
  }
  const flow = page.locator('#flowChart');
  await page.locator('#vehicleManual').fill('DAA-ZVW30 平成22年 2ZR-3JM');
  await diagnose('P324E');
  assert.match(await flow.innerText(), /詳細コードと保存記録/);
  await flow.getByRole('button', {name:'記録を整理した：必要資料を確認',exact:true}).click();
  await flow.getByRole('button', {name:'P324E-788の数値付き参考手順を見る',exact:true}).click();
  assert.match(await flow.innerText(), /P0A94併発時にこの単独経路の交換結論を流用しません/);
  await flow.getByRole('button', {name:'参考の配線検査と判定を読む',exact:true}).click();
  assert.match(await flow.innerText(), /1 Ω未満/);
  assert.match(await flow.innerText(), /10 kΩ以上/);
  assert.match(await flow.innerText(), /A59-28/);
  assert.match(await flow.innerText(), /その相互導通を短絡と誤判定しない/);
  assert.match(await flow.innerText(), /国内適合未確認/);
  assert.equal(await flow.getByRole('button', {name:/正常|交換確定/}).count(),0);
  assert.match(await flow.innerText(), /項目別記録：0 \/ 9/);
  await flow.getByLabel('A59-10（+B）→IGCTソケット5（Ω）',{exact:true}).fill('0.3 Ω（架空の試験値）');
  await flow.getByLabel('A59-9（+B2）→IGCTソケット5（Ω）',{exact:true}).fill('OL（架空の表示）');
  await flow.getByLabel('安全処置・指定点0 V確認の記録',{exact:true}).fill('   ');
  assert.match(await flow.innerText(), /項目別記録：2 \/ 9/);
  const referenceReport = await page.evaluate(() => buildFocusedDiagnosisWorksheet(flowChart.focusedDiagnosisResult.focusedDiagnosis));
  assert.match(referenceReport,/1 Ω未満/);
  assert.match(referenceReport,/charm.li\/Toyota\/2010/);
  assert.match(referenceReport,/A59-10（\+B）→IGCTソケット5（Ω）：0.3 Ω（架空の試験値）/);
  assert.match(referenceReport,/A59-9（\+B2）→IGCTソケット5（Ω）：OL（架空の表示）/);
  assert.match(referenceReport,/安全処置・指定点0 V確認の記録：未測定／未記録/);
  assert.match(referenceReport,/A59-28（GND1）→車体アース（Ω）：未測定／未記録/);
  assert.match(referenceReport,/経路選定の根拠・適用状況/);
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),'Reference fits mobile');
  if(process.env.REFERENCE_SCREENSHOT_PATH) await flow.screenshot({path:process.env.REFERENCE_SCREENSHOT_PATH});
  await flow.getByRole('button', {name:'一つ前の確認に戻る',exact:true}).click();
  await flow.getByRole('button', {name:'一つ前の確認に戻る',exact:true}).click();
  assert.doesNotMatch(await flow.innerText(), /上記4つの断線検査/);
  assert.equal(await flow.getByRole('button',{name:'P0A94-587の保存データ比較を見る',exact:true}).count(),0);
  await diagnose('P0A94');
  await flow.getByRole('button',{name:'記録を整理した：必要資料を確認',exact:true}).click();
  assert.equal(await flow.getByRole('button',{name:'P324E-788の数値付き参考手順を見る',exact:true}).count(),0);
  await flow.getByRole('button', {name:'P0A94-587の保存データ比較を見る',exact:true}).click();
  assert.match(await flow.innerText(), /親コードP0A94からINF587を推定しません/);
  assert.match(await flow.innerText(), /P324E併発/);
  await flow.getByRole('button', {name:'併発コードとライブ記録の入口を見る',exact:true}).click();
  assert.match(await flow.innerText(), /P0A1F-129/);
  assert.match(await flow.innerText(), /P0A94-442/);
  assert.match(await flow.innerText(), /P0A94-585/);
  assert.match(await flow.innerText(), /INFや同時DTC一覧が不足：分岐未確定/);
  assert.equal(await flow.getByRole('button',{name:/交換確定|正常/}).count(),0);
  await flow.getByRole('button',{name:'ライブ項目と取得条件を見る（実施指示ではない）',exact:true}).click();
  assert.match(await flow.innerText(), /VB・VL・VHを同じ条件で記録/);
  assert.match(await flow.innerText(), /READY・Pレンジ・停車・エンジン停止/);
  assert.match(await flow.innerText(), /220 Vは前準備の指標で故障の合否値ではありません/);
  assert.match(await flow.innerText(), /数値による交換判定は登録しない/);
  assert.match(await flow.innerText(), /片側だけの低値/);
  assert.equal(await flow.getByRole('button',{name:/正常|交換確定|充電開始|消去開始/}).count(),0);
  await flow.getByLabel('実測値・単位・測定条件',{exact:true}).fill('架空の記録：VB=230 V、VL=231 V、VH=232 V、時刻TEST、READY、P、停車、エンジン停止。実車未取得');
  await flow.getByLabel('ライブVB（V）',{exact:true}).fill('0');
  await flow.getByLabel('ライブVL（V）',{exact:true}).fill('未対応（試験）');
  assert.match(await flow.innerText(), /項目別記録：2 \/ 4/);
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),'Live reference fits mobile');
  if(process.env.LIVE_SCREENSHOT_PATH) await flow.screenshot({path:process.env.LIVE_SCREENSHOT_PATH});

  await flow.getByRole('button', {name:'保存時のVB・VL判定を読む',exact:true}).click();
  assert.match(await flow.innerText(), /160 V未満または285 V超/);
  assert.match(await flow.innerText(), /両方が範囲外/);
  assert.match(await flow.innerText(), /Power Resource VB/);
  assert.match(await flow.innerText(), /VH-Voltage after Boosting/);
  assert.equal(await flow.getByRole('button', {name:/正常|交換確定/}).count(),0);
  assert.equal(await flow.getByLabel('保存時Power Resource VB（V）',{exact:true}).inputValue(),'');
  await flow.getByLabel('保存時Power Resource VB（V）',{exact:true}).fill('220（架空）');
  await flow.getByRole('button', {name:'次段のブロック電圧比較を読む（結果選択ではない）',exact:true}).click();
  assert.match(await flow.innerText(), /VB − 40 V < S < VB \+ 25 V/);
  assert.match(await flow.innerText(), /境界ちょうどは含まない/);
  assert.match(await flow.innerText(), /未取得・記録なしは判定保留/);
  const ffReport = await page.evaluate(() => buildFocusedDiagnosisWorksheet(flowChart.focusedDiagnosisResult.focusedDiagnosis));
  assert.match(ffReport,/160 V未満または285 V超/);
  assert.match(ffReport,/66014302/);
  assert.match(ffReport,/66016518/);
  assert.match(ffReport,/これは実車値ではない/);
  assert.match(ffReport,/架空の記録：VB=230 V/);
  assert.match(ffReport,/READY・Pレンジ・停車・エンジン停止/);
  assert.match(ffReport,/65999488/);
  assert.match(ffReport,/ライブVB（V）：0\n/);
  assert.match(ffReport,/ライブVH（V）：未測定／未記録/);
  assert.match(ffReport,/保存時Power Resource VB（V）：220（架空）/);
  assert.match(ffReport,/保存時VL-Voltage before Boosting（V）：未測定／未記録/);
  await flow.getByRole('button', {name:'一つ前の確認に戻る',exact:true}).click();
  assert.equal(await flow.getByLabel('保存時Power Resource VB（V）',{exact:true}).inputValue(),'220（架空）');
  await flow.getByRole('button', {name:'次段のブロック電圧比較を読む（結果選択ではない）',exact:true}).click();
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),'FF reference fits mobile');
  if(process.env.FRAME_SCREENSHOT_PATH) await flow.screenshot({path:process.env.FRAME_SCREENSHOT_PATH});
  for(let i=0;i<5;i++) await flow.getByRole('button', {name:'一つ前の確認に戻る',exact:true}).click();
  assert.doesNotMatch(await flow.innerText(), /全Battery Block電圧の合計/);
  const resetReferenceReport = await page.evaluate(()=>buildFocusedDiagnosisWorksheet(flowChart.focusedDiagnosisResult.focusedDiagnosis));
  assert.doesNotMatch(resetReferenceReport,/架空の記録：VB=230 V/);
  assert.doesNotMatch(resetReferenceReport,/220（架空）|ライブVB（V）：0/);

  await flow.getByRole('button', {name:'必要な測定情報の様式を見る',exact:true}).click();
  assert.match(await flow.innerText(), /具体的な項目名と基準値は未登録/);
  await flow.getByRole('button', {name:'高電圧点検前の安全条件を確認',exact:true}).click();
  assert.match(await flow.innerText(), /0 V確認/);
  assert.match(await flow.innerText(), /指定測定点とアクセス手順：未登録/);
  if (process.env.HV_SCREENSHOT_PATH) await flow.screenshot({path:process.env.HV_SCREENSHOT_PATH});
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'HV procedure must fit mobile width');
  await flow.getByRole('button', {name:'本体判定に必要な情報を確認（作業承認ではない）',exact:true}).click();
  assert.match(await flow.innerText(), /交換確定への分岐はありません/);
  const hvReport = await page.evaluate(() => buildFocusedDiagnosisWorksheet(flowChart.focusedDiagnosisResult.focusedDiagnosis));
  assert.match(hvReport, /中止・保留条件/);
  assert.match(hvReport, /hv_detachable_prius30.pdf/);
  await diagnose('P324E');
  assert.match(await flow.innerText(), /詳細コードと保存記録/);

  for (const [code, ff, wiring, detailed] of [
    ['P0A94-587',1,0,'P0A94:587'], ['p0a94:587',1,0,'P0A94:587'],
    ['P0A94-172',0,0,'P0A94:172'], ['P0A94-0587',0,0,'P0A94:0587'],
    ['P0A94-788',0,0,'P0A94:788'], ['P324E-788',0,1,'P324E:788'],
    ['P324E-587',0,0,'P324E:587']
  ]) {
    await diagnose(code);
    assert.match(await flow.innerText(),new RegExp(detailed));
    if(!ff && !wiring) assert.match(await flow.innerText(),/この詳細コードの具体的な手順は未登録/);
    await flow.getByRole('button',{name:'記録を整理した：必要資料を確認',exact:true}).click();
    assert.equal(await flow.getByRole('button',{name:'P0A94-587の保存データ比較を見る',exact:true}).count(),ff,code);
    assert.equal(await flow.getByRole('button',{name:'P324E-788の数値付き参考手順を見る',exact:true}).count(),wiring,code);
    const report = await page.evaluate(()=>buildFocusedDiagnosisWorksheet(flowChart.focusedDiagnosisResult.focusedDiagnosis));
    assert(report.includes('DTC：'+detailed),code);
  }
  await diagnose('P324E-788');
  const go = name => flow.getByRole('button',{name,exact:true}).click();
  await go('記録を整理した：必要資料を確認');
  await go('P324E-788の数値付き参考手順を見る');
  const back = () => go('一つ前の確認に戻る');
  for (const [choice,expected] of [
    ['U0110-159／160／656／657が併発','その通信DTCの診断表'],
    ['P0A94など他コードが併発・併発状況不明','併発時の優先診断表']
  ]) {
    await go(choice);
    assert((await flow.innerText()).includes(expected));
    assert.equal(await flow.getByLabel('A59-10（+B）→IGCTソケット5（Ω）',{exact:true}).count(),0);
    await back();
  }
  await go('P324E-788単独を保存記録で確認した');
  await flow.getByLabel('この車両の基準値・単位・出典',{exact:true}).fill('模擬適用資料');
  await flow.getByLabel('実測値・単位・測定条件',{exact:true}).fill('模擬記録：指定点0 V');
  await go('指定点の0 Vと適用資料を記録で確認した');
  await go('接続不良あり');
  assert((await flow.innerText()).includes('接続不良が見つかった箇所を優先'));
  await back();
  await go('接続は良好・指定の切離条件で得た抵抗記録あり');
  const harness = flow.getByRole('status').filter({hasText:'配線記録の参考照合'});
  const fillHarness = (name,value) => flow.getByLabel(name,{exact:true}).fill(value);
  const bLine = 'A59-10（+B）→IGCTソケット5（Ω）';
  await fillHarness(bLine,'1 Ω');
  assert.match(await harness.innerText(),/A59-10.*範囲外/);
  await fillHarness(bLine,'0.99 Ω');
  for (const label of ['A59-9（+B2）→IGCTソケット5（Ω）','A59-28（GND1）→車体アース（Ω）','A59-27（GND2）→車体アース（Ω）']) await fillHarness(label,'0.1');
  const ground='A59-10（+B）→車体アース（短絡検査）';
  await fillHarness('A59-9（+B2）→車体アース（短絡検査）','0.01 MΩ');
  for (const [value,expected] of [['OL','判定保留'],['10000','判定保留'],['10 mΩ','判定保留'],['9999 Ω','範囲外'],['10 kΩ','他回路との短絡検査の全端子対']]) {
    await fillHarness(ground,value);
    const message = await harness.innerText();
    assert(message.includes(expected),message);
    assert((await page.evaluate(()=>buildFocusedDiagnosisWorksheet(flowChart.focusedDiagnosisResult.focusedDiagnosis))).includes(message));
  }
  await back(); await back();
  await flow.getByLabel('実測値・単位・測定条件',{exact:true}).fill('   ');
  await go('指定点の0 Vと適用資料を記録で確認した');
  await go('接続は良好・指定の切離条件で得た抵抗記録あり');
  await fillHarness(bLine,'1 Ω');
  assert.match(await harness.innerText(),/照合保留。安全処置の段階/);
  await diagnose('P0A94-587');
  const [infDownload] = await Promise.all([page.waitForEvent('download'),flow.getByRole('button',{name:'診断手順書の下書きを保存',exact:true}).click()]);
  assert.match(infDownload.suggestedFilename(),/P0A94-587/);
  assert.match(fs.readFileSync(await infDownload.path(),'utf8'),/DTC：P0A94:587/);
  await flow.getByRole('button',{name:'記録を整理した：必要資料を確認',exact:true}).click();
  await flow.getByRole('button',{name:'P0A94-587の保存データ比較を見る',exact:true}).click();
  await flow.getByRole('button',{name:'保存時のVB・VL判定を読む',exact:true}).click();
  const comparison = flow.getByRole('status').filter({hasText:'手順6との参考照合'});
  const confirmFrame = flow.getByRole('checkbox',{name:/同一のP0A94-587保存記録/});
  await flow.getByLabel('フリーズフレームの識別情報',{exact:true}).fill('架空記録 TEST-A');
  const vb = flow.getByLabel('保存時Power Resource VB（V）',{exact:true});
  const vl = flow.getByLabel('保存時VL-Voltage before Boosting（V）',{exact:true});
  await vb.fill('220'); await vl.fill('159.9');
  assert.match(await comparison.innerText(),/照合保留/);
  await confirmFrame.check();
  for (const [b,l,expected] of [
    ['220','159.9','次の照合先はインバーター側'],['285.1','160','次の照合先はバッテリースマートユニット側'],
    ['１６０ Ｖ','285','次の確認は同じ発生記録の全ブロック'],['0','286','次の確認は同じ発生記録の全ブロック'],
    ['','160','照合保留'],['220','OL','照合保留'],['220 mV','160','照合保留']
  ]) {
    await vb.fill(b); await vl.fill(l);
    assert((await comparison.innerText()).includes(expected));
    assert.equal(await flow.getByRole('button',{name:/次段のブロック電圧比較/}).count(),expected.startsWith('次の確認') ? 1 : 0);
    const worksheet = await page.evaluate(()=>buildFocusedDiagnosisWorksheet(flowChart.focusedDiagnosisResult.focusedDiagnosis));
    assert(worksheet.includes(await comparison.innerText()));
  }
  await vb.fill('251.4'); await vl.fill('251.4');
  await flow.getByRole('button',{name:/次段のブロック電圧比較/}).click();
  const blockStatus = flow.getByRole('status').filter({hasText:'手順7との参考照合'});
  const battery = flow.getByLabel('保存時HV battery voltage（V）',{exact:true});
  const block = n => flow.getByLabel(`保存時ブロック${n}（V）`,{exact:true});
  await battery.fill('251.4');
  for (let n=1;n<=13;n++) await block(n).fill('15.1');
  const confirmBlocks = flow.getByRole('checkbox',{name:/全14ブロックを選択/});
  await confirmBlocks.check();
  assert.match(await blockStatus.innerText(),/ブロック番号：14/);
  for (const [last,expected] of [
    ['OL','照合保留'],['15.1 mV','照合保留'],['15.1','バッテリースマートユニット側'],
    ['15.100001','インバーター側'],['80.099999','インバーター側'],['80.1','バッテリースマートユニット側']
  ]) {
    await block(14).fill(last);
    const message = await blockStatus.innerText();
    assert(message.includes(expected) && message.includes('TEST-A'),message);
    const worksheet = await page.evaluate(()=>buildFocusedDiagnosisWorksheet(flowChart.focusedDiagnosisResult.focusedDiagnosis));
    assert(worksheet.includes(message));
  }
  await confirmBlocks.uncheck();
  assert.match(await blockStatus.innerText(),/照合保留/);
  await flow.getByRole('button',{name:'一つ前の確認に戻る',exact:true}).click();
  await flow.getByRole('button',{name:/次段のブロック電圧比較/}).click();
  assert.equal(await block(14).inputValue(),'');
  assert.equal(await confirmBlocks.isChecked(),false);
  await diagnose('P0A94-587');
  await page.locator('#obdCode').fill('P0A94-172');
  await flow.getByRole('button',{name:'記録を整理した：必要資料を確認',exact:true}).click();
  assert.match(await flow.innerText(),/診断条件が変わりました/);
  await diagnose('P0A94');
  assert.match(await flow.innerText(),/INFは未入力です/);
  const parentPlan = await page.evaluate(()=>flowChart.focusedDiagnosisResult.focusedDiagnosis);
  assert.equal(parentPlan.subcode,null);

  await page.locator('#vehicleManual').fill('ZVW50');
  await diagnose('P0A94');
  assert.doesNotMatch(await flow.innerText(), /ZVW30 インバーター診断の準備/);
  await page.locator('#vehicleManual').fill('試験用車両 型式TEST 2020年 エンジンTEST（架空）');
  await diagnose('P0420', 'idle-unstable');
  if (process.env.FOCUSED_SCREENSHOT_PATH) await flow.screenshot({path:process.env.FOCUSED_SCREENSHOT_PATH});
  assert.match(await flow.innerText(), /触媒判定を乱す関連異常/);
  assert.doesNotMatch(await flow.innerText(), /燃圧測定|圧縮測定|スターター|EGR/);
  await flow.getByRole('button', {name:'記録を確認し、関連異常は認めない',exact:true}).click();
  assert.match(await flow.innerText(), /該当バンクの排気漏れを確認/);
  assert.doesNotMatch(await flow.innerText(), /前後センサーの応答を指定条件で比較/);
  await flow.getByRole('button', {name:'指定方法で確認し、漏れは認めない',exact:true}).click();
  assert.match(await flow.innerText(), /前後センサーの応答を指定条件で比較/);
  await flow.getByRole('button', {name:'センサー応答は基準内',exact:true}).click();
  assert.match(await flow.innerText(), /触媒そのものの効率判定へ/);
  await flow.getByLabel('この車両の基準値・単位・出典', {exact:true}).fill('試験用基準 10 TEST-unit、架空資料 p.1');
  await flow.getByLabel('実測値・単位・測定条件', {exact:true}).fill('試験入力 12 TEST-unit、模擬条件');
  await flow.getByRole('button', {name:'指定試験で触媒効率の基準外を確認',exact:true}).click();
  assert.match(await flow.innerText(), /選択結果では触媒劣化の可能性が高い/);
  const [download] = await Promise.all([page.waitForEvent('download'),flow.getByRole('button',{name:'診断手順書の下書きを保存',exact:true}).click()]);
  const report = fs.readFileSync(await download.path(), 'utf8');
  assert.match(report,/試験用車両 型式TEST/);
  assert.match(report,/12 TEST-unit/);
  assert.match(report,/架空資料 p.1/);
  assert.match(report,/基準値・実測の実施は未検証/);
  assert.match(await page.evaluate(() => buildExternalGptConsultation(getInput(), flowChart.focusedDiagnosisResult)), /12 TEST-unit/);
  const handoff = await page.evaluate(async () => {
   const copy = copyTextToClipboard, open = window.open;
   let copied = '';
   copyTextToClipboard = async text => { copied = text; };
   window.open = () => null;
   try {
    await sendToExternalGpt();
    hideMobileGptModal();
    return {copied, node:flowChart.focusedDiagnosisResult.focusedDiagnosis.nodeId};
   } finally { copyTextToClipboard = copy; window.open = open; }
  });
  assert.equal(handoff.node,'likely');
  assert.match(handoff.copied,/12 TEST-unit/);
  await flow.getByRole('button', {name:'一つ前の確認に戻る',exact:true}).click();
  assert.equal(await flow.getByLabel('実測値・単位・測定条件', {exact:true}).inputValue(), '試験入力 12 TEST-unit、模擬条件');
  await flow.getByRole('button', {name:'一つ前の確認に戻る',exact:true}).click();
  await flow.getByRole('button', {name:'センサー応答に基準外を確認',exact:true}).click();
  assert.match(await flow.innerText(), /基準外になったセンサー系統へ/);
  assert.doesNotMatch(await flow.innerText(), /触媒そのものの効率判定へ/);
  assert.equal(await flow.getByLabel('実測値・単位・測定条件', {exact:true}).inputValue(), '');
  await page.locator('#vehicleManual').fill('別車両（架空）');
  await flow.getByRole('button', {name:'一つ前の確認に戻る',exact:true}).click();
  assert.match(await flow.innerText(), /診断条件が変わりました/);
  assert.match(await flow.innerText(), /基準外になったセンサー系統へ/);
  await diagnose('P0430');
  await flow.getByRole('button', {name:'関連異常が残っている',exact:true}).click();
  assert.match(await flow.innerText(), /見つかった関連異常を先に診断/);
  assert.equal(await flow.getByRole('button', {name:'指定方法で確認し、漏れは認めない',exact:true}).count(), 0);
  await diagnose('P0301');
  assert.match(await flow.innerText(), /失火している範囲/);
  assert.doesNotMatch(await flow.innerText(), /燃圧測定|リークダウン|EGR/);
  await flow.getByRole('button', {name:'一つの気筒に限定できた',exact:true}).click();
  assert.match(await flow.innerText(), /単気筒の点火系/);
  await flow.getByRole('button', {name:'失火が比較した部品に追従した',exact:true}).click();
  assert.match(await flow.innerText(), /追従した部品と接続状態に絞る/);
  await flow.getByRole('button', {name:'一つ前の確認に戻る',exact:true}).click();
  assert.doesNotMatch(await flow.innerText(), /追従した部品と接続状態に絞る/);
  await flow.getByRole('button', {name:'未測定・再現せず・判断できない',exact:true}).click();
  assert.match(await flow.innerText(), /正常として進めません/);
  await diagnose('P0171', 'idle-unstable');
  assert.match(await flow.innerText(), /燃料補正の変化/);
  assert.doesNotMatch(await flow.innerText(), /点火系を比較|失火が比較/);
  await flow.getByRole('button', {name:'アイドルで補正が大きく、回転上昇で改善',exact:true}).click();
  assert.match(await flow.innerText(), /吸気漏れに対象を絞る/);
  await flow.getByRole('button', {name:'漏れ箇所が見つかった',exact:true}).click();
  assert.match(await flow.innerText(), /見つかった漏れ箇所を整備判断へ/);
  await diagnose('P3999', 'idle-unstable');
  assert.match(await flow.innerText(), /具体的な診断手順は未登録/);
  assert.doesNotMatch(await flow.innerText(), /吸気漏れに対象|点火系を比較/);
  await diagnose('', 'engine-no-start');
  assert.match(await flow.innerText(), /スターターの回り方/);
  await flow.getByRole('button', {name:'回らない／回転が重い',exact:true}).click();
  assert.match(await flow.innerText(), /始動時の電源/);
  assert.doesNotMatch(await flow.innerText(), /燃圧測定|インジェクター信号/);
  const state = await page.evaluate(() => {
   const input = {...getInput(), obdCode:'P0301', symptomId:'idle-unstable', facts:'加速不良 警告灯'};
   const result = buildDiagnosis(input);
   const unknown = buildDiagnosis({...input,obdCode:'P3999'});
   return {prompt:buildExternalGptConsultation(input,result), ids:getDiagnosticWorkflowMatches(input,findById(dataStore.symptomFlows,input.symptomId)).map(x=>x.id), checks:result.checkOrder, measurements:result.measurements, unknown:unknown.quickView.priorityChecks, fresh:result.focusedDiagnosis.history, width:document.documentElement.scrollWidth, viewport:innerWidth};
  });
  assert(state.ids.every(id => /misfire|ignition|compression/.test(id)), JSON.stringify(state.ids));
  assert.equal(state.checks.length,1);
  assert.equal(state.measurements.length,1);
  assert.equal(state.unknown.length,1);
  assert.deepEqual(state.fresh,[]);
  assert.match(state.prompt,/車両に適合する基準値と単位・出典/);
  const graphCheck = await page.evaluate(() => {
   const results = [];
   for (const code of ['P0420','P0430','P0300','P0301','P0171','P0174','P0133','P3999']) {
    const result = buildDiagnosis({...getInput(),obdCode:code});
    const plan = result.focusedDiagnosis;
    for (const route of plan.routes) {
     plan.selected = route.id;
     const graph = getFocusedDiagnosisGraph(plan);
     for (const [id,node] of Object.entries(graph)) {
      if (!node.title || !node.text || !Array.isArray(node.measurements) || !Array.isArray(node.options)) results.push(code+':invalid:'+id);
      for (const [,target] of node.options) if (!graph[target]) results.push(code+':missing:'+target);
     }
    }
   }
   return results;
  });
  assert.deepEqual(graphCheck,[]);
  assert(state.width <= state.viewport, `overflow ${state.width}/${state.viewport}`);
  assert.deepEqual(errors,[]);
  console.log('PASS: focused DTC matching, catalyst/misfire/lean/start symptom branches, unknown stop, backtrack, input reset, actual form, mobile width, page errors. Synthetic inputs only; no vehicle I/O.');
 } finally { await browser.close(); }
})().catch(e=>{console.error(e);process.exitCode=1;});


