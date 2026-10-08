// Offline, fixed-data operation lab. No transport, saved records or execution authority.
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createMonitorPreviewBrowserSource } from "./fixtures/monitor-preview-browser-source.js";

export function createDevelopmentSessionPreview() {
  const script = `(() => { "use strict";
${createMonitorPreviewBrowserSource("single")}
const buttons = Object.fromEntries(['prepare','read','cancel','end','restart'].map(id => [id, document.getElementById(id)]));
const status = document.getElementById('status'), output = document.getElementById('output');
const progress = document.getElementById('progress');
const scenario = document.getElementById('scenario');
const sampleChoice = document.getElementById('sample');
const failurePosition = document.getElementById('failure-position');
const sampleNames = ['normal', 'codes_present', 'mixed_sources', 'mixed_conflict', 'compact', 'conflict', 'missing_prompt', 'negative_response', 'no_data'];
let selectedScenario = 'normal', selectedSample = 'normal', selectedPosition = '2';
const createOwner = (failure = selectedScenario) => {
  const context = { port: {}, reader: {}, writer: {}, settingsTicket: {}, revision: 1, connected: true, unlocked: true };
  const sample = createSingleReadoutSample(selectedSample);
  const failIndex = Number(selectedPosition) - 1;
  const wait = () => new Promise(resolve => setTimeout(resolve, 120));
  const report = (command, steps) => {
    if (ended || owner !== session || session.inspect().status !== 'running') return;
    const index = steps.findIndex(step => step[0] === command);
    if (index >= 0) progress.textContent = (index + 1) + '/4：' + steps[index][1] + '（模擬応答待ち）';
  };
  const session = createReadOnlyDevelopmentSession({ readContext: () => context, api: fixtureApi, profile: sample.profile,
    readClock: () => Math.floor(performance.now()),
    async readCommand(command, append) {
      report(command, [['03', '保存DTC'], ['07', '保留DTC'], ['0A', '恒久DTC'], ['0101', 'レディネス']]);
      await wait();
      if (command === ['03', '07', '0A', '0101'][failIndex] && failure === 'disconnect') context.connected = false;
      if (command === ['03', '07', '0A', '0101'][failIndex] && failure === 'settings_changed') context.settingsTicket = {};
      if (command === ['03', '07', '0A', '0101'][failIndex] && failure === 'exception') throw new Error('synthetic_private_failure');
      const transcript = sample.receipts.find(row => row.command === command).transcript;
      if (command === ['03', '07', '0A', '0101'][failIndex] && failure === 'incomplete') { append(transcript.slice(0, 7)); return 'timeout'; }
      return append(transcript) ? 'complete' : 'cancelled';
    },
    invalidateReceipts: () => true,
    beginSettingsGeneration() { context.settingsTicket = {}; return true; },
    async readResponse(command) {
      report(command, [['ATCAF1', '応答整形の設定'], ['ATD0', 'データ長表示の設定'], ['ATCEA', '拡張アドレスの設定'], ['ATDPN', '通信番号の確認']]);
      await wait();
      if (command === ['ATCAF1', 'ATD0', 'ATCEA', 'ATDPN'][failIndex] && failure === 'disconnect') context.connected = false;
      if (command === ['ATCAF1', 'ATD0', 'ATCEA', 'ATDPN'][failIndex] && failure === 'settings_changed') context.settingsTicket = {};
      if (command === ['ATCAF1', 'ATD0', 'ATCEA', 'ATDPN'][failIndex] && failure === 'exception') throw new Error('synthetic_private_failure');
      if (command === ['ATCAF1', 'ATD0', 'ATCEA', 'ATDPN'][failIndex] && failure === 'incomplete') return { completion: 'timeout', response: 'O' };
      return { completion: 'complete', response: command === 'ATDPN' ? 'A6' : 'OK' };
    }
  });
  return session;
};
let owner = createOwner(), ended = false;
const paint = message => {
  const state = owner.inspect();
  if (ended || state.status !== 'running') progress.textContent = '';
  buttons.prepare.disabled = buttons.read.disabled = ended || state.pending;
  scenario.disabled = ended || state.pending;
  sampleChoice.disabled = ended || state.pending;
  failurePosition.disabled = ended || state.pending || selectedScenario === 'normal';
  buttons.cancel.disabled = ended || !state.pending || state.status === 'cancelling';
  buttons.end.disabled = ended;
  buttons.restart.hidden = !ended;
  status.textContent = message;
};
const execute = async kind => {
  if (ended || owner.inspect().pending) return;
  syncRestoredConditions();
  const current = owner;
  output.textContent = '';
  progress.textContent = '';
  const promise = kind === 'settings' ? current.prepareSettings() : current.read();
  paint(kind === 'settings' ? '模擬設定の応答を確認中' : '模擬記録を取得中');
  const result = await promise;
  if (ended || current !== owner) return;
  if (!result.ok) {
    if (['receipt_context_changed', 'preparation_context_changed'].includes(result.reason)) {
      ended = true; current.dispose();
      paint('模擬接続または設定条件が変わったため終了しました。以前の応答は採用しません。新しい模擬セッションを開始してください。');
      buttons.restart.focus(); return;
    }
    let message = '模擬操作を完了できませんでした。';
    switch (result.reason) {
      case 'readout_cancelled': case 'settings_preparation_cancelled':
        message = '模擬操作を取り消しました。'; break;
      case 'receipt_incomplete': case 'preparation_response_incomplete': case 'preparation_protocol_incomplete':
        message = '模擬応答の取得が完了しませんでした。途中の記録は表示しません。'; break;
      case 'readout_failed': case 'settings_preparation_failed':
        message = '模擬処理でエラーが発生しました。結果は表示しません。'; break;
    }
    paint(message + ' 再試行は操作ボタンで選んでください。'); return;
  }
  output.textContent = kind === 'settings'
    ? '模擬設定の応答確認が終了しました。実機設定・復元・通信形式は未確認です。読み取りは自動開始しません。'
    : formatSingleReadoutReceiptPreview(result).text;
  paint('模擬操作が終了しました');
};
buttons.prepare.addEventListener('click', () => { void execute('settings'); });
buttons.read.addEventListener('click', () => { void execute('readout'); });
const changeConditions = () => {
  if (ended || owner.inspect().pending || !['normal', 'incomplete', 'exception', 'disconnect', 'settings_changed'].includes(scenario.value) || !sampleNames.includes(sampleChoice.value) || !['1', '2', '3', '4'].includes(failurePosition.value)) {
    scenario.value = selectedScenario; sampleChoice.value = selectedSample; failurePosition.value = selectedPosition; return;
  }
  selectedScenario = scenario.value;
  selectedSample = sampleChoice.value;
  selectedPosition = failurePosition.value;
  owner.dispose(); owner = createOwner(); output.textContent = '';
  paint('模擬条件を変更しました。操作を選んでください');
};
scenario.addEventListener('change', changeConditions);
sampleChoice.addEventListener('change', changeConditions);
failurePosition.addEventListener('change', changeConditions);
const syncRestoredConditions = () => {
  if (ended || owner.inspect().pending) return;
  if (scenario.value !== selectedScenario || sampleChoice.value !== selectedSample || failurePosition.value !== selectedPosition) changeConditions();
};
buttons.cancel.addEventListener('click', () => {
  if (owner.cancel()) { output.textContent = ''; paint('取消済み。模擬処理が戻るのを待っています。'); }
});
const end = (focusRestart = false) => {
  ended = true; owner.dispose(); output.textContent = ''; paint('この模擬セッションは終了しました');
  if (focusRestart) buttons.restart.focus();
};
buttons.end.addEventListener('click', () => end(true));
buttons.restart.addEventListener('click', () => {
  if (!ended) return;
  owner = createOwner(); ended = false; output.textContent = ''; paint('操作を選んでください'); buttons.prepare.focus();
});
window.addEventListener('pagehide', () => end());
window.addEventListener('pageshow', event => {
  if (event.persisted) end(true);
  // Browsers may restore form values after pageshow without a change event.
  else setTimeout(syncRestoredConditions, 0);
});
paint('操作を選んでください');
})();`.replace(/\r\n?/g, "\n");
  const hash = createHash("sha256").update(script).digest("base64");
  return `<!doctype html><html lang="ja"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'sha256-${hash}'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'">
<title>設定準備と読取の模擬操作 — 開発用見本</title>
<style>:root{color-scheme:dark light;font-family:system-ui,sans-serif;background:#101821;color:#eef3f8}*{box-sizing:border-box}body{margin:0;line-height:1.8}main{max-width:960px;margin:auto;padding:24px 16px}h1{font-size:1.6rem}.notice{border:1px solid #71849a;padding:16px;border-radius:12px}.controls{display:flex;flex-wrap:wrap;gap:12px}button{font:inherit;min-height:48px;padding:12px 20px;border:1px solid #8abfe8;border-radius:8px;background:#254968;color:white}button:disabled{opacity:.55}button:focus-visible{outline:3px solid #e8bc67;outline-offset:3px}pre{white-space:pre-wrap;overflow-wrap:anywhere;font:inherit}@media(prefers-color-scheme:light){:root{background:#f4f7fa;color:#172431}}</style>
<main><h1>設定準備と読取の模擬操作</h1>
<p class="notice">開発用の固定データです。車両通信は行いません。設定準備の成功は、実機の設定成立や読取許可を意味しません。読取も人工データの表示です。</p>
<p>操作中は別の操作を開始できません。取消後は処理が戻るまで待ちます。「終了」後は新しい模擬セッションを明示的に開始してください。</p>
<p><label for="scenario">模擬応答の条件</label> <select id="scenario" style="font:inherit;max-width:100%;min-height:48px"><option value="normal">正常な固定応答</option><option value="incomplete">途中で応答が未完了</option><option value="exception">途中で模擬処理が失敗</option><option value="disconnect">途中で模擬接続が切れる</option><option value="settings_changed">途中で模擬設定が変わる</option></select></p>
<p><label for="sample">読取内容の見本</label> <select id="sample" style="font:inherit;max-width:100%;min-height:48px"><option value="normal">コード0件の応答</option><option value="codes_present">故障コードあり</option><option value="mixed_sources">複数ECUの応答</option><option value="mixed_conflict">同一ECU内の応答矛盾</option><option value="compact">空白なし形式の応答</option><option value="conflict">保存DTCの応答矛盾</option><option value="missing_prompt">応答終端の欠落</option><option value="negative_response">否定応答</option><option value="no_data">NO DATAの応答</option></select></p>
<p>内容の見本は読取だけに適用します。NO DATAや応答矛盾を故障コード0件とは判定しません。</p>
<p>読取処理の終了と、応答内容を診断に使えるかの判定は別です。空白なし形式も宣言済みの模擬条件であり、設定確認から自動認定するものではありません。</p>
<p><label for="failure-position">失敗させる段階</label> <select id="failure-position" style="font:inherit;max-width:100%;min-height:48px"><option value="1">1番目</option><option value="2" selected>2番目</option><option value="3">3番目</option><option value="4">4番目</option></select></p>
<p>失敗例は選んだ段階の応答で停止します。正常な固定応答ではこの指定を使いません。条件を変えると表示済みの結果を消去します。再試行は自動では行いません。</p>
<div class="controls"><button id="prepare">模擬設定を確認</button><button id="read">模擬記録を取得</button><button id="cancel">操作を取り消す</button><button id="end">セッションを終了</button><button id="restart" hidden>新しい模擬セッション</button></div>
<p id="status" role="status" aria-live="polite"></p><p id="progress" role="status" aria-live="polite"></p><pre id="output"></pre><noscript>この模擬操作にはJavaScriptが必要です。</noscript></main><script>${script}</script></html>\n`;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.length !== 2) { console.error("固定の模擬操作専用です。引数は指定できません。"); process.exitCode = 2; }
  else process.stdout.write(createDevelopmentSessionPreview());
}
