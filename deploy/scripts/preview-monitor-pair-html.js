// Node-only, fixed fixture output. No external input or browser runtime code.
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createMonitorPairPreview } from "./preview-dtc-clear-monitor-pairs.js";

const escapeHtml = value => value.replace(/[&<>"']/g, character => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
})[character]);

export function createMonitorPairHtmlPreview() {
  const [introduction, ...groups] = createMonitorPairPreview().split(/\n(?=\[)/);
  const sections = groups.map(group => {
    const [heading, ...rows] = group.split("\n");
    return `<section><h2>${escapeHtml(heading)}</h2><ul>${rows.map(row =>
      `<li>${escapeHtml(row.trim())}</li>`).join("")}</ul></section>`;
  }).join("\n");
  return `<!doctype html>
<html lang="ja"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'">
<title>模擬の前後記録 — 固定見本</title>
<style>
:root{color-scheme:dark light;font-family:system-ui,sans-serif;background:#101821;color:#eef3f8}
*{box-sizing:border-box}body{margin:0;line-height:1.8}main{max-width:960px;margin:auto;padding:24px 16px 48px}
h1{font-size:clamp(1.5rem,5vw,2rem);margin:8px 0}h2{font-size:1.05rem;margin:0 0 12px;overflow-wrap:anywhere}
.tag{color:#a7d8ff;font-weight:700}.notice,section{padding:20px;border:1px solid #536579;border-radius:12px;margin:20px 0;background:#172431}
.notice{border-left:5px solid #e8bc67}.notice p{white-space:pre-wrap;overflow-wrap:anywhere;margin:12px 0}
ul{list-style:none;padding:0;margin:0}li{padding:12px 0;border-top:1px solid #455568;overflow-wrap:anywhere}
footer{color:#c7d3df} @media(prefers-color-scheme:light){:root{background:#f3f6fa;color:#172431}.notice,section{background:#fff;border-color:#7a8899}.tag{color:#174e7a}footer{color:#405165}li{border-color:#ccd5df}}
</style></head><body><main>
<header><div class="tag">開発用・固定サンプル</div><h1>模擬の前後記録</h1>
<p>出力時点の見本です。実車比較は未確認・車両送信なし。</p></header>
<aside class="notice" aria-label="この見本の取得元と制限"><p>${escapeHtml(introduction)}</p></aside>
${sections}
<footer>この見本には記録の再取得・有効性確認・消去操作はありません。</footer>
</main></body></html>\n`;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.length !== 2) {
    console.error("固定のHTML見本専用です。引数や実車記録は指定できません。");
    process.exitCode = 2;
  } else {
    try { process.stdout.write(createMonitorPairHtmlPreview()); }
    catch { console.error("模擬HTML見本を生成できませんでした。"); process.exitCode = 1; }
  }
}
