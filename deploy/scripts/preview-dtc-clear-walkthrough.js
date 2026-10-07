import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createMonitorPreviewBrowserSource } from "./fixtures/monitor-preview-browser-source.js";

export function createDtcClearWalkthroughHtml() {
  const script = `${createMonitorPreviewBrowserSource("workflow")}
let flow = createDtcClearWalkthrough(fixtureApi);
const order = ['prepare', 'confirm', 'reviewBlockedDispatch', 'compareFixedRecords'];
const stages = ['empty', 'prepared', 'confirmed', 'dispatch_blocked'];
const labels = {empty:'模擬記録の準備前', prepared:'固定の模擬記録と事前条件を準備しました。実際の保存や適合確認ではありません。',
preconditions_missing:'模擬の事前条件が不足しています。未成立の項目を確認してください。条件確認・送信要求・前後比較には進みません。',
confirmed:'模擬条件の確認を記録しました。車両操作の許可ではありません。',
dispatch_blocked:'実行要求は拒否されました。車両へ送信していません。次は事前に用意した模擬の前後記録を比較します。',
compared:'固定の模擬前後記録を比較しました。実際の消去成功や修理完了を示しません。',
result_unknown:'模擬の消去応答が時間内に得られず、結果不明です。前後比較は保留し、自動再送しません。実際の車両操作は行っていません。',
reread_failed:'模擬の再読取が完了していません。取得不足をDTCなしや消去成功と扱わず、前後比較を保留します。自動再試行はしません。',
cancelled:'終了しました。記録の参照を破棄しました。', unavailable:'模擬記録を確認できません。自動再試行はしません。'};
function render() {
  const state = flow.inspect();
  document.querySelector('#status').textContent = labels[state.stage];
  document.querySelector('#comparison').textContent = state.comparison || '';
  const readoutLabels = {read_stored_dtc:'保存DTC', read_pending_dtc:'保留DTC', read_permanent_dtc:'永久DTC', read_readiness:'レディネス'};
  document.querySelector('#followup').hidden = !state.followupPlan;
  document.querySelector('#followup-items').replaceChildren(...(state.followupPlan?.intents || []).map(intent => {
    const item = document.createElement('li'); item.textContent = readoutLabels[intent]; return item;
  }));
  document.querySelector('#requirements').replaceChildren(...(state.workflow?.readiness.checks || []).map(check => {
    const item = document.createElement('li'); item.textContent = (check.complete ? '模擬：成立 — ' : '模擬：未成立 — ') + check.label;
    item.dataset.complete = String(check.complete); return item;
  }));
  document.querySelector('#record-state').textContent = state.workflow
    ? (state.workflow.preOperationSessionId ? '模擬の事前記録参照あり（実際の保存済み証明ではありません）。' : '模擬の事前記録参照がありません。') : '';
  const historyLabels = {prepared:'模擬の事前記録・条件を準備', confirmed:'模擬条件の確認を記録',
    preconditions_missing:'模擬の事前条件不足：準備で停止',
    dispatch_blocked:'送信拒否を確認（送信なし）', compared:'固定記録の比較を表示',
    result_unknown:'模擬の消去応答なし：結果不明、比較保留', reread_failed:'模擬の再読取未完了：比較保留',
    unavailable:'模擬記録の確認に失敗', cancelled:'終了：記録の参照と比較本文を破棄'};
  document.querySelector('#history').replaceChildren(...state.history.map(entry => {
    const item = document.createElement('li'); item.textContent = historyLabels[entry.stage]; return item;
  }));
  order.forEach((action,i) => document.getElementById(action).disabled = state.stage !== stages[i]);
}
order.forEach(action => document.getElementById(action).addEventListener('click', () => {flow[action](); render();}));
document.querySelector('#cancel').addEventListener('click', () => {flow.cancel(); render();});
document.querySelector('#scenario').addEventListener('change', event => {
  flow.cancel(); flow = createDtcClearWalkthrough(fixtureApi, event.target.value); render();
});
window.addEventListener('pagehide', () => {flow.cancel(); render();});
render();`.replace(/\r\n?/g, "\n");
  const hash = createHash("sha256").update(script).digest("base64");
  return `<!doctype html><html lang="ja"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'sha256-${hash}'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'">
<title>DTC消去前後の模擬一巡</title><style>body{font-family:system-ui;max-width:900px;margin:auto;padding:20px;line-height:1.8;background:#f4f7fa;color:#172431}button{font:inherit;min-height:48px;padding:10px;margin:5px;max-width:100%}select{display:block;font:inherit;min-height:48px;max-width:100%;padding:8px}pre{white-space:pre-wrap;overflow-wrap:anywhere}button:focus-visible,select:focus-visible{outline:3px solid #1368ac}</style>
<h1>DTC消去前後の模擬一巡</h1><p>開発用・固定サンプルです。実車通信、実際の消去、ファイル保存は行いません。前後の記録と時刻は人工入力です。</p>
<label for="scenario">模擬条件</label><select id="scenario"><option value="normal">比較できる固定記録</option><option value="pre_record_missing">事前記録がない</option><option value="recovery_missing">復旧計画がない</option><option value="applicability_missing">対象適合が未確認</option><option value="result_unknown">消去応答がなく結果不明</option><option value="reread_failed">再読取が未完了</option></select><p>条件を変えると前の確認・比較を破棄します。操作は準備からやり直します。</p>
<button id="prepare">1. 模擬の事前記録を準備</button><button id="confirm">2. 模擬条件を確認</button><button id="reviewBlockedDispatch">3. 送信拒否を確認</button><button id="compareFixedRecords">4. 固定の前後記録を比較</button><button id="cancel">終了して記録を破棄</button>
<p id="status" role="status"></p><section id="followup" hidden><h2>次に必要な読取確認（模擬計画）</h2><p>模擬応答の評価が返す読取専用の確認計画です。この画面では読取や再送を実行しません。既存の前後比較だけで消去成功・修理完了を判断しません。</p><ul id="followup-items"></ul><p>実車で行う場合は接続・対象・実施条件を改めて確認する必要があります。自動再試行はしません。</p></section><details><summary>模擬の事前条件を確認</summary><p>すべて人工的な条件です。「成立」は実際の認証・保存・適合・実機確認の完了を意味しません。</p><p id="record-state"></p><ul id="requirements"></ul></details><section aria-labelledby="history-title"><h2 id="history-title">今回の模擬操作履歴</h2><p>この画面内だけの操作順です。実車の監査記録や実行時刻の証明ではありません。条件変更・再読込で消えます。</p><ol id="history"></ol></section><pre id="comparison"></pre><script>${script}</script></html>`;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.length !== 2) throw new Error("fixed_walkthrough_only");
  process.stdout.write(createDtcClearWalkthroughHtml());
}
