// Standalone fixed-sample developer entry point. No files/records are accepted as input.
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createInteractiveMonitorPreview } from "./preview-monitor-review-interactive.js";

export function createSingleReadoutInteractivePreview() {
  return createInteractiveMonitorPreview("single");
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.length !== 2) { console.error("固定の操作見本専用です。引数は指定できません。"); process.exitCode = 2; }
  else {
    try { process.stdout.write(createSingleReadoutInteractivePreview()); }
    catch { console.error("一回分の模擬操作見本を生成できませんでした。"); process.exitCode = 1; }
  }
}
