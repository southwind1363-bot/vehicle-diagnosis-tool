import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createMonitorPairPreview } from "./preview-dtc-clear-monitor-pairs.js";

let checks = 0;
const check = (value, message) => { assert.ok(value, message); checks++; };
const preview = createMonitorPairPreview();
const sections = preview.split(/\n(?=\[)/).slice(1);
check(sections.length === 8, "Preview omitted an ECU or monitor group");
for (const id of ["7E8", "7E9", "7EA", "7EB"]) {
  check(sections.filter(section => section.startsWith(`[${id}]`)).length === 2, "Preview mixed ECU identities");
}
check(sections.find(section => section.startsWith("[7E8] 基本")).includes("misfire: 前 完了 → 後 未完了 / 報告状態が変化"), "Changed fixture not shown");
check(sections.filter(section => section.startsWith("[7E9]")).every(section => section.includes("対応付け保留: 点火方式の報告が異なる")), "Ignition fixture not withheld");
check(sections.filter(section => section.startsWith("[7EA]")).every(section => section.includes("後 状態不明 / 対応付け保留")), "Unknown fixture became complete");
check(sections.filter(section => section.startsWith("[7EB]")).every(section => section.includes("報告状態は同じ") && !section.includes("報告状態が変化")), "Unchanged fixture misrepresented");
check(preview.includes("実車の読取結果ではありません") && preview.includes("実行・車両送信は無効") && !/Token|transcript|payload/.test(preview), "Preview lost boundaries or exposed raw evidence");
check(createMonitorPairPreview() === preview, "Repeated independent previews changed fixed input output");
const entry = fileURLToPath(new URL("./preview-dtc-clear-monitor-pairs.js", import.meta.url));
const run = args => spawnSync(process.execPath, [entry, ...args], { encoding: "utf8", timeout: 10000, maxBuffer: 131072 });
const valid = run([]);
check(valid.status === 0 && valid.stderr === "" && valid.stdout.trimEnd() === preview, "CLI did not emit the checked fixture presentation");
for (const args of [["synthetic-private-file.json"], [""], ["--help"], ["--input", "synthetic-private-file.json"]]) {
  const rejected = run(args);
  check(rejected.status === 2 && rejected.stdout === "" && rejected.stderr.includes("固定の模擬データ専用")
    && !rejected.stderr.includes("synthetic-private"), "CLI accepted input or exposed supplied arguments");
}
console.log(`Monitor pair preview checks: ${checks} / Errors: 0`);
