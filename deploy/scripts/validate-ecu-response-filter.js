import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync(new URL("../script.js", import.meta.url), "utf8");
const extract = (name) => source.match(new RegExp(`function ${name}\\([^)]*\\) \\{[\\s\\S]*?\\r?\\n\\}`))?.[0] || assert.fail(`Missing ${name}`);
let checks = 0;
const check = (condition, message) => { assert.ok(condition, message); checks += 1; };
function element(tag) {
  return { tag, children: [], attributes: {}, handlers: {}, value: "", hidden: false, textContent: "",
    append(...children) { this.children.push(...children); },
    appendChild(child) { this.children.push(child); },
    setAttribute(name, value) { this.attributes[name] = value; },
    addEventListener(name, handler) { this.handlers[name] = handler; },
    focus() { this.focused = true; }
  };
}
const context = vm.createContext({ document: { createElement: element } });
vm.runInContext(["buildObdEcuResponseDisplayLines", "createObdEcuResponseCard"].map(extract).join("\n"), context);
const summary = { ecus: [
  { name: "ECM", address: "7E8", status: "pending_response", services: ["22"], responseServices: ["7F"], readoutAttemptId: "attempt-1" },
  { name: "ECM", address: "7E8", status: "reported", services: ["22"], responseServices: ["62"], readoutAttemptId: "attempt-2" },
  { name: "ECM", address: "7E9", status: "no_response", capturedAt: "2026-08-28T01:02:03.001Z" },
  ...Array.from({ length: 7 }, (_, index) => ({ name: "Other ECU", address: `ecu-${index}`, status: "unparsed" })),
  { name: "<img src=x>", address: "7F1", status: "constructor", negativeResponseLabels: ["<script>"] }
] };
const before = JSON.stringify(summary);
const inspect = (card) => {
  const [heading, toolbar, empty, list] = card.children;
  const [label, searchRow, statusLabel, status, count] = toolbar.children;
  const [input, clear] = searchRow.children;
  return { heading, empty, list, label, count, input, clear, statusLabel, status };
};
const ui = inspect(context.createObdEcuResponseCard(summary));
check(ui.count.textContent === "全11応答記録を表示" && ui.clear.disabled && ui.empty.hidden, "Initial view must include every response record");
check(ui.label.htmlFor === ui.input.id && ui.input.attributes["aria-controls"] === ui.list.id && ui.count.attributes.role === "status", "Missing accessible search relationship");
check(ui.clear.attributes["aria-label"] === "ECU応答検索を解除" && ui.clear.type === "button", "Missing accessible clear action");
const fullText = () => ui.list.children.flatMap((item) => item.children.map((line) => line.textContent));
check(JSON.stringify(fullText()) === JSON.stringify(context.buildObdEcuResponseDisplayLines(summary).slice(1)), "Grouped display changed record order, numbers, or evidence");
const search = (query) => {
  ui.input.value = query;
  ui.input.handlers.input();
  return ui.list.children.filter((item) => !item.hidden);
};
for (const [query, expected] of [["ECM", 3], ["ｅｃｍ　７ｅ８", 2], ["7e8 応答保留", 1], ["7e8 reported", 1],
  ["attempt-2", 1], ["03.001Z", 1], ["無応答", 1], ["constructor", 1], ["<script>", 1], ["not-present", 0], ["   ", 11], ["", 11]]) {
  const matches = search(query);
  check(matches.length === expected, `Incorrect record match for ${query}`);
  check(ui.empty.hidden === (expected > 0), `Incorrect empty state for ${query}`);
  check(JSON.stringify(summary) === before, "Search mutated source records");
  check(fullText().length === context.buildObdEcuResponseDisplayLines(summary).length - 1, "Search removed evidence instead of hiding records");
}
check(search("7e9")[0].children[0].textContent.startsWith("#3 [7E9]"), "Filtered result was renumbered");
search("missing");
check(ui.count.textContent === "絞込中: 0 / 11応答記録", "No match hid the total record count");
check(ui.statusLabel.htmlFor === ui.status.id && ui.status.attributes["aria-controls"] === ui.list.id, "Missing accessible state filter");
check(ui.status.children.map((option) => option.value).join(",") === ",pending_response,reported,no_response,unparsed,constructor", "Status choices merged or omitted recorded states");
for (const [status, expected] of [["pending_response", 1], ["reported", 1], ["no_response", 1], ["unparsed", 7], ["constructor", 1]]) {
  ui.input.value = "";
  ui.status.value = status;
  ui.status.handlers.change();
  check(ui.list.children.filter((row) => !row.hidden).length === expected && !ui.clear.disabled, "State filter matched boilerplate or numeric counts");
}
ui.status.value = "pending_response";
check(search("7e9").length === 0 && ui.count.textContent === "絞込中: 0 / 11応答記録", "Search and state filters were not intersected");
check(search("7e8").length === 1, "Combined search lost pending response record");
ui.clear.handlers.click();
check(ui.input.value === "" && ui.status.value === "" && ui.input.focused && ui.clear.disabled && ui.list.children.every((row) => !row.hidden), "Clear failed to restore records and focus");
search("pending_response");
const reopened = inspect(context.createObdEcuResponseCard(JSON.parse(before)));
check(reopened.input.value === "" && reopened.status.value === "" && reopened.list.children.every((row) => !row.hidden), "Replacement session retained stale filter");
check(JSON.stringify(reopened.list.children.flatMap((item) => item.children.map((line) => line.textContent))) === JSON.stringify(fullText()), "Reopened evidence changed");
for (const empty of [null, {}, { ecus: [] }]) {
  const view = inspect(context.createObdEcuResponseCard(empty));
  check(view.list.children.length === 0 && view.count.textContent === "全0応答記録を表示", "Empty source fabricated records");
}
check(extract("renderObdBridgeSessionDetails").includes("createObdEcuResponseCard(session?.ecuResponseSummary || session?.ecu_response_summary)"), "Search card not wired to full response summary");
check(!/obdDevSession|localStorage|fetch\(|innerHTML|MutationObserver/.test(extract("createObdEcuResponseCard")), "Display filter must not access session state, storage, transport, HTML, or persistent observers");
console.log(`ECU response filter checks: ${checks} / Errors: 0`);
