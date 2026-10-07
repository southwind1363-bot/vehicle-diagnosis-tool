import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createMonitorPreviewBrowserSource } from "./fixtures/monitor-preview-browser-source.js";

export function createDtcClearWalkthroughHtml() {
  const script = `${createMonitorPreviewBrowserSource("workflow")}
const flow = createDtcClearWalkthrough(fixtureApi);
const order = ['prepare', 'confirm', 'reviewBlockedDispatch', 'compareFixedRecords'];
const stages = ['empty', 'prepared', 'confirmed', 'dispatch_blocked'];
const labels = {empty:'模擬記録の準備前', prepared:'固定の模擬記録と事前条件を準備しました。実際の保存や適合確認ではありません。',
confirmed:'模擬条件の確認を記録しました。車両操作の許可ではありません。',
dispatch_blocked:'実行要求は拒否されました。車両へ送信していません。次は事前に用意した模擬の前後記録を比較します。',
compared:'固定の模擬前後記録を比較しました。実際の消去成功や修理完了を示しません。', cancelled:'終了しました。記録の参照を破棄しました。', unavailable:'模擬記録を確認できません。自動再試行はしません。'};
function render() {
  const state = flow.inspect();
  document.querySelector('#status').textContent = labels[state.stage];
  document.querySelector('#comparison').textContent = state.comparison || '';
  order.forEach((action,i) => document.getElementById(action).disabled = state.stage !== stages[i]);
}
order.forEach(action => document.getElementById(action).addEventListener('click', () => {flow[action](); render();}));
document.querySelector('#cancel').addEventListener('click', () => {flow.cancel(); render();});
window.addEventListener('pagehide', () => {flow.cancel(); render();});
render();`.replace(/\r\n?/g, "\n");
  const hash = createHash("sha256").update(script).digest("base64");
  return `<!doctype html><html lang="ja"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'sha256-${hash}'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'">
<title>DTC消去前後の模擬一巡</title><style>body{font-family:system-ui;max-width:900px;margin:auto;padding:20px;line-height:1.8;background:#f4f7fa;color:#172431}button{font:inherit;min-height:48px;padding:10px;margin:5px;max-width:100%}pre{white-space:pre-wrap;overflow-wrap:anywhere}button:focus-visible{outline:3px solid #1368ac}</style>
<h1>DTC消去前後の模擬一巡</h1><p>開発用・固定サンプルです。実車通信、実際の消去、ファイル保存は行いません。前後の記録と時刻は人工入力です。</p>
<button id="prepare">1. 模擬の事前記録を準備</button><button id="confirm">2. 模擬条件を確認</button><button id="reviewBlockedDispatch">3. 送信拒否を確認</button><button id="compareFixedRecords">4. 固定の前後記録を比較</button><button id="cancel">終了して記録を破棄</button>
<p id="status" role="status"></p><pre id="comparison"></pre><script>${script}</script></html>`;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.length !== 2) throw new Error("fixed_walkthrough_only");
  process.stdout.write(createDtcClearWalkthroughHtml());
}
