// Generates a standalone offline developer demo validating fixed simulated receipts in the page.
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { createMonitorPreviewBrowserSource } from "./fixtures/monitor-preview-browser-source.js";
import { createSimulatedReviewController } from "./fixtures/monitor-preview-controller.js";
import { attachMonitorPreviewView } from "./fixtures/monitor-preview-view.js";
import { attachSingleReadoutPreviewView } from "./fixtures/single-readout-preview-view.js";

export function createInteractiveMonitorPreview(kind = "pair") {
  if (!["pair", "single"].includes(kind)) throw new TypeError("unknown_preview_kind");
  const single = kind === "single";
  const script = `(() => { "use strict";
${createMonitorPreviewBrowserSource(kind)}
const createReview = ${createSimulatedReviewController.toString()};
const attachMonitorPreviewView = ${attachMonitorPreviewView.toString()};
const attachView = ${single ? attachSingleReadoutPreviewView.toString() : "attachMonitorPreviewView"};
const scenario = document.querySelector('#scenario');
let acquired;
const review = createReview(() => {
  acquired = ${single ? "createSingleReadoutRunPreviewSession(fixtureApi, scenario.value)" : "createDtcClearBrowserPreviewSession(fixtureApi)"};
  return acquired;
}, () => {
  const fail = ${single ? "false" : "scenario.value === 'failure'"};
  return Promise.all([acquired.ready, new Promise((resolve, reject) => setTimeout(() => {
    if (fail) reject(new Error('simulated_preview_failure')); else resolve();
  }, 400))]);
});
const root = document.querySelector('#review');
const show = document.querySelector('#show');
const close = document.querySelector('#close');
const closed = document.querySelector('#closed');
let view = null;
review.subscribe(state => { show.setAttribute('aria-disabled', String(state.status === 'reading')); });
show.addEventListener('click', () => {
  if (review.inspect().status === 'reading') return;
  closed.textContent = '';
  if (!view) view = attachView(root, review);
  close.disabled = false;
  void review.read();
});
const hide = () => {
  view?.dispose(); view = null;
  review.invalidate();
  close.disabled = true;
  closed.textContent = '模擬記録の表示を閉じました。';
};
close.addEventListener('click', () => { hide(); show.focus(); });
scenario.addEventListener('change', () => {
  hide();
  closed.textContent = '模擬条件を変更しました。「模擬記録を表示」で確認してください。';
});
window.addEventListener('pagehide', hide);
})();
`.replace(/\r\n?/g, "\n");
  const hash = createHash("sha256").update(script).digest("base64");
  return `<!doctype html>
<html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'sha256-${hash}'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'">
<title>${single ? "一回分の模擬記録" : "模擬記録の表示と閉鎖"} — 開発用見本</title>
<style>
:root{color-scheme:dark light;font-family:system-ui,sans-serif;background:#101821;color:#eef3f8}
*{box-sizing:border-box}body{margin:0;line-height:1.8}main{max-width:960px;margin:auto;padding:24px 16px}
h1{font-size:1.65rem}h2{font-size:1.25rem}.notice,section{padding:16px;border:1px solid #71849a;border-radius:12px;margin:20px 0}
.controls{display:flex;flex-wrap:wrap;gap:12px}button{font:inherit;padding:12px 20px;min-height:48px;border-radius:8px;border:1px solid #8abfe8;background:#254968;color:#fff}button:disabled,button[aria-disabled="true"]{opacity:.55}button:focus-visible{outline:3px solid #e8bc67;outline-offset:3px}
select{font:inherit;max-width:100%;min-height:48px;padding:8px;border-radius:8px}label{display:block;margin-bottom:8px}
@media(prefers-color-scheme:light){:root{background:#f4f7fa;color:#172431}}
</style></head><body><main>
<h1>${single ? "一回分の模擬記録" : "模擬記録の表示と閉鎖"}</h1>
<p class="notice">開発用・固定サンプルです。実車の読取結果ではありません。表示待ちは模擬動作で、車両通信は行いません。</p>
<p>「模擬記録を表示」で${single ? "一回分の固定記録を確認できます。消去前後の比較ではありません。" : "固定の前後状態を確認できます。"}表示待ちの途中でも閉じられます。</p>
<label for="scenario">模擬条件</label><select id="scenario" aria-describedby="scenario-help"><option value="normal">記録を表示できる場合</option>${single ? '<option value="codes_present">故障コードを含む応答</option><option value="mixed_sources">複数ECUの応答が混在する場合</option><option value="compact">空白なしの応答</option><option value="no_data">NO DATAの報告</option><option value="conflict">応答が矛盾する場合</option><option value="missing_prompt">応答の終端が欠ける場合</option>' : ""}${single ? '<option value="disconnect">取得途中に接続が切れる</option><option value="settings_changed">取得途中に接続設定が変わる</option><option value="clock_failure">取得途中の時計検査に失敗</option><option value="failure">取得途中の応答待ちに失敗</option>' : '<option value="failure">確認が失敗する場合</option>'}</select>
<p id="scenario-help">条件を変えると表示を閉じます。失敗時も自動で再試行しません。</p>
<div class="controls"><button id="show" type="button">模擬記録を表示</button><button id="close" type="button" disabled>表示を閉じる</button></div>
<p id="closed" role="status" aria-live="polite"></p><div id="review"></div>
<noscript>この操作見本にはJavaScriptが必要です。静的HTML見本では操作なしで内容を確認できます。</noscript>
</main><script>${script}</script></body></html>\n`;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.length !== 2) { console.error("固定の操作見本専用です。引数は指定できません。"); process.exitCode = 2; }
  else {
    try { process.stdout.write(createInteractiveMonitorPreview()); }
    catch { console.error("模擬操作見本を生成できませんでした。"); process.exitCode = 1; }
  }
}
