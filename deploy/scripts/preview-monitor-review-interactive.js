// Generates a standalone, offline developer demo using fixed text, never vehicle input.
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { createMonitorPairPreview } from "./preview-dtc-clear-monitor-pairs.js";
import { createSimulatedReviewController } from "./fixtures/monitor-preview-controller.js";
import { attachMonitorPreviewView } from "./fixtures/monitor-preview-view.js";

export function createInteractiveMonitorPreview() {
  const sample = JSON.stringify(createMonitorPairPreview()).replace(/</g, "\\u003c");
  // Both functions are self-contained local modules; no imports execute in the generated browser page.
  const script = `"use strict";
const createReview = ${createSimulatedReviewController.toString()};
const attachView = ${attachMonitorPreviewView.toString()};
const fixedText = ${sample};
const review = createReview(() => {
  let active = true;
  return Object.freeze({ inspect: () => Object.freeze({ ok: active, text: active ? fixedText : null }), dispose() { active = false; } });
}, () => new Promise(resolve => setTimeout(resolve, 400)));
const root = document.querySelector('#review');
const show = document.querySelector('#show');
const close = document.querySelector('#close');
const closed = document.querySelector('#closed');
let view = null;
review.subscribe(state => { show.disabled = state.status === 'reading'; });
show.addEventListener('click', () => {
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
window.addEventListener('pagehide', hide);
`.replace(/\r\n?/g, "\n");
  const hash = createHash("sha256").update(script).digest("base64");
  return `<!doctype html>
<html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'sha256-${hash}'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'">
<title>模擬記録の表示と閉鎖 — 開発用見本</title>
<style>
:root{color-scheme:dark light;font-family:system-ui,sans-serif;background:#101821;color:#eef3f8}
*{box-sizing:border-box}body{margin:0;line-height:1.8}main{max-width:960px;margin:auto;padding:24px 16px}
h1{font-size:1.65rem}h2{font-size:1.25rem}.notice,section{padding:16px;border:1px solid #71849a;border-radius:12px;margin:20px 0}
.controls{display:flex;flex-wrap:wrap;gap:12px}button{font:inherit;padding:12px 20px;min-height:48px;border-radius:8px;border:1px solid #8abfe8;background:#254968;color:#fff}button:disabled{opacity:.55}button:focus-visible{outline:3px solid #e8bc67;outline-offset:3px}
@media(prefers-color-scheme:light){:root{background:#f4f7fa;color:#172431}}
</style></head><body><main>
<h1>模擬記録の表示と閉鎖</h1>
<p class="notice">開発用・固定サンプルです。実車の読取結果ではありません。表示待ちは模擬動作で、車両通信は行いません。</p>
<p>「模擬記録を表示」で固定の前後状態を確認できます。表示待ちの途中でも閉じられます。</p>
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
