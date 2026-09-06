import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
const source = fs.readFileSync(new URL("../script.js", import.meta.url), "utf8");
const extract = (name) => source.match(new RegExp(`function ${name}\\([^)]*\\) \\{[\\s\\S]*?\\r?\\n\\}`))?.[0] || assert.fail(name);
class Element {
  constructor(tag) { this.tag = tag; this.children = []; this.dataset = {}; this.attributes = {}; this.handlers = {}; this.value = ""; this.hidden = false; this.textContent = ""; }
  append(...nodes) { this.children.push(...nodes); }
  appendChild(node) { this.append(node); }
  prepend(...nodes) { this.children.unshift(...nodes); }
  setAttribute(key, value) { this.attributes[key] = value; }
  addEventListener(name, fn) { this.handlers[name] = fn; }
  focus() { this.focused = true; }
}
const context = vm.createContext({ window: { ObdReadOnly: { getReadinessMonitors: () => [{ id: "catalyst", diagnosticUse: "参考用途", notCompleteNote: "条件を確認", serviceManualRequired: true, source: "同梱出典" }] } }, document: { createElement: (tag) => new Element(tag) }, formatObdReadoutStatus: (value, fallback) => value || fallback });
vm.runInContext(["getObdDisplayByteNumber", "createObdFreezeFrameReviewControls", "buildObdReadinessReviewGroups", "createObdReadinessReviewCard"].map(extract).join("\n"), context);
const all = (node) => [node, ...node.children.flatMap(all)];
const snapshot = { readinessEcuSnapshots: [
  { sourceEcu: "7E8", milOn: true, readinessIgnitionType: "spark", monitors: [
    { id: "catalyst", label: "触媒", supported: true, complete: false },
    { id: "fuel", label: "燃料系", supported: true, complete: true },
    { id: "air", label: "二次空気", supported: false, complete: true },
    { id: "oxygen", label: "酸素センサー", supported: true, complete: null },
    { id: "unknown", label: "不明項目", complete: true }
  ], knownMonitors: [{ id: "evap", label: "蒸発ガス", observed: false }, { id: "fuel", label: "燃料系", observed: false }] },
  { source_ecu: "7E9", milOn: false, monitors: [{ id: "catalyst", label: "触媒", supported: true, complete: true }] },
  { sourceEcu: "7EA", monitors: [] }
] };
const original = JSON.stringify(snapshot), card = context.createObdReadinessReviewCard(snapshot), nodes = all(card);
const find = (key) => nodes.find((node) => Object.hasOwn(node.dataset, key));
const search = find("readinessSearch"), filter = find("readinessFilter"), count = find("readinessCount");
const rows = nodes.filter((node) => Object.hasOwn(node.dataset, "readinessState"));
let checks = 0;
const check = (condition, message) => { assert.ok(condition, message); checks += 1; };
check(card.id === "obdSessionDetailReadiness" && rows.length === 7, "Missing or duplicate rows");
check(count.textContent.includes("7 / 7") && count.attributes["aria-live"] === "polite", "Initial count inaccessible");
filter.value = "attention"; filter.handlers.change();
check(rows.filter((row) => !row.hidden).length === 4 && rows.filter((row) => !row.hidden).every((row) => ["incomplete", "missing", "unknown"].includes(row.dataset.readinessState)), "Attention filter misclassified evidence");
search.value = "7e9"; search.handlers.input();
check(rows.every((row) => row.hidden) && !find("readinessEmpty").hidden, "Empty combination not explained");
filter.value = "complete"; filter.handlers.change();
check(rows.filter((row) => !row.hidden).length === 1, "ECU search merged statuses");
search.value = "触媒"; search.handlers.input();
check(rows.filter((row) => !row.hidden).length === 1, "Label search failed");
filter.value = "unsupported"; search.value = ""; filter.handlers.change();
check(rows.filter((row) => !row.hidden).length === 1 && rows.find((row) => !row.hidden).dataset.readinessState === "unsupported", "Unsupported became complete");
const reset = nodes.find((node) => node.tag === "button"); reset.handlers.click();
check(rows.every((row) => !row.hidden) && reset.disabled && search.focused, "Reset failed");
check(JSON.stringify(snapshot) === original, "Review mutated diagnostic evidence");
for (const [state, expected] of [["incomplete", 1], ["unknown", 2], ["missing", 1]]) {
  filter.value = state; filter.handlers.change();
  check(rows.filter((row) => !row.hidden).length === expected, `Exact ${state} filter failed`);
}
check(nodes.some((node) => node.textContent.includes("整備書確認必須")) && nodes.some((node) => node.textContent === "参考情報の出典：同梱出典"), "Trusted guidance or source missing");
check(nodes.filter((node) => node.textContent === "条件を確認").length === 1, "Incomplete guidance leaked to complete item");
check(find("readinessTotals").textContent.includes("未完了 1 / 不明 2 / 未取得 1 / 完了 1 / 非対応 1"), "ECU totals conflated statuses");
check(context.buildObdReadinessReviewGroups({ readinessEcuSnapshots: [], readiness_ecu_snapshots: [{ source_ecu: "7E9" }] })[0].source === "7E9", "Empty alias hid ECU data");
const importedGuide = context.createObdReadinessReviewCard({ monitors: [{ id: "external", supported: true, complete: false, source: "Untrusted recommendation", notCompleteNote: "Untrusted operation" }] });
check(!all(importedGuide).some((node) => node.tag === "details"), "Imported reference generated trusted guidance");
check(find("readinessTotals").textContent.includes("未完了 1 / 不明 2 / 未取得 1"), "Filtering changed evidence totals");
const malicious = context.createObdReadinessReviewCard({ monitors: [{ label: '<img src=x onerror=alert(1)>', supported: true, complete: false }] });
check(all(malicious).some((node) => node.textContent.startsWith("<img")) && !all(malicious).some((node) => node.tag === "img"), "Labels became HTML");
const empty = context.createObdReadinessReviewCard(null);
check(all(empty).find((node) => Object.hasOwn(node.dataset, "readinessEmpty")).hidden === false, "Null snapshot missing empty state");
const unknownOnly = context.buildObdReadinessReviewGroups({ knownMonitors: [{ id: "x", observed: false }] });
check(unknownOnly[0].rows[0].status === "missing", "Unobserved monitor omitted");
check(nodes.some((node) => node.textContent.includes("故障なし・修理完了・車検適合を意味しません")), "Safety distinction omitted");
console.log(`Readiness review UI checks: ${checks} / Errors: 0`);
const ffValues = [
  { label: "回転数", sourceEcu: "7E8", freezeFrameNumber: 0, value: 0 },
  { label: "回転数", sourceEcu: "7E9", freezeFrameNumber: 0, value: 1000 },
  { label: "温度", sourceEcu: "7E8", freezeFrameNumber: 1, decoded: false },
  { label: "番号不明", sourceEcu: "7E8" }
];
const ffBefore = JSON.stringify(ffValues), ffRows = ffValues.map(() => new Element("li"));
const ff = context.createObdFreezeFrameReviewControls(ffValues, ffRows), ffNodes = all(ff);
const ffSearch = ffNodes.find((node) => node.tag === "input");
const [ecu, frame, status] = ffNodes.filter((node) => node.tag === "select");
const ffCount = ffNodes.find((node) => Object.hasOwn(node.dataset, "freezeReviewCount"));
ecu.value = "7E8"; frame.value = "0"; frame.handlers.change();
assert.deepEqual(ffRows.map((row) => row.hidden), [false, true, true, true]);
frame.value = "unknown"; frame.handlers.change();
assert.deepEqual(ffRows.map((row) => row.hidden), [true, true, true, false]);
frame.value = "all"; status.value = "raw"; status.handlers.change();
assert.deepEqual(ffRows.map((row) => row.hidden), [true, true, false, true]);
ffSearch.value = "回転数"; ffSearch.handlers.input();
assert.match(ffCount.textContent, /条件に一致する記録値はありません/);
ffNodes.find((node) => node.tag === "button").handlers.click();
assert.ok(ffRows.every((row) => !row.hidden));
assert.equal(JSON.stringify(ffValues), ffBefore);
const ffEmpty = context.createObdFreezeFrameReviewControls([], []);
assert.ok(all(ffEmpty).some((node) => node.textContent.includes("記録値は未取得")));
console.log('Freeze-frame review checks: 7 / Errors: 0');
