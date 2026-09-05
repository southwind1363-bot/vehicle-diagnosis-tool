import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync(new URL("../script.js", import.meta.url), "utf8");
const html = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
const css = fs.readFileSync(new URL("../style.css", import.meta.url), "utf8");
let checks = 0;
const check = (condition, message) => { assert.ok(condition, message); checks += 1; };
const extract = (name) => source.match(new RegExp(`function ${name}\\([^)]*\\) \\{[\\s\\S]*?\\r?\\n\\}`))?.[0] || assert.fail(`Missing ${name}`);
function element() {
  return {
    children: [], dataset: {}, hidden: false, value: "", textContent: "", handlers: {},
    classList: { add() {} }, append(...children) { this.children.push(...children); },
    appendChild(child) { this.children.push(child); },
    set innerHTML(value) { assert.equal(value, ""); this.children = []; },
    addEventListener(name, handler) { this.handlers[name] = handler; }, focus() { this.focused = true; },
    querySelector() { return this.children.find(child => child.dataset.monitorSelect !== undefined) || this.children.map(child => child.querySelector()).find(Boolean); }
  };
}
const ids = ["obdMonitorFilter", "obdMonitorSearch", "obdMonitorSearchClear", "obdMonitorFilterCount", "obdMonitorFilterEmpty", "obdMonitorSelection", "obdMonitorSelectedOnly", "obdMonitorSelectionCount", "obdMonitorSelectionClear"];
function harness(observable = true) {
  const nodes = Object.fromEntries(ids.map((id) => [id, element()]));
  nodes.obdMonitorFilter.hidden = true;
  nodes.obdMonitorSelection.hidden = true;
  const subscriptions = [];
  const context = vm.createContext({
    document: { querySelector: (id) => nodes[id.slice(1)], createElement: element },
    obdMonitorGrid: element(), obdMonitorInsightList: element(), obdMonitorCount: element(), obdMonitorStatus: element(),
    summarizeObdMonitorValues: () => ({}), formatObdBridgeMonitorSummary: () => "summary", NO_DATA: "no-data",
    renderObdMonitorInsights: (insights) => { context.retainedInsights = insights; }
  });
  if (observable) context.MutationObserver = class {
    constructor(callback) { this.callback = callback; }
    observe(target, options) { subscriptions.push({ target, options, callback: this.callback }); }
  };
  vm.runInContext(`${extract("initializeObdReadoutFilter")}\n${extract("initializeObdMonitorFilter")}\n${extract("renderObdMonitorValues")}`, context);
  context.initializeObdMonitorFilter();
  return { context, nodes, subscriptions };
}
const { context, nodes, subscriptions } = harness();
check(nodes.obdMonitorFilter.hidden && subscriptions.length === 1, "Empty readout must hide search and install one observer");
check(subscriptions[0].target === context.obdMonitorGrid && subscriptions[0].options.childList && Object.keys(subscriptions[0].options).length === 1,
  "Observer must track replacements without observing its own visibility updates");
const values = [
  { id: "engine_speed", label: "エンジン回転数", pid: "0C", sourceEcu: "7E8", value: 780, unit: "rpm", outOfRange: true },
  { id: "coolant_temp", label: "冷却水温", pid: "05", source_ecu: "7E8", value: 88, unit: "C" },
  { id: "engine_speed", label: "エンジン回転数", pid: "0C", sourceEcu: "7E9", value: 790, unit: "rpm", undecodedRaw: true }
];
const original = JSON.stringify(values);
const insights = [{ title: "Retained caution" }];
context.renderObdMonitorValues(values, insights);
subscriptions[0].callback();
check(!nodes.obdMonitorFilter.hidden && nodes.obdMonitorFilterCount.textContent === "全3項目を表示", "New readout did not expose search and total");
const search = (text) => { nodes.obdMonitorSearch.value = text; nodes.obdMonitorSearch.handlers.input(); return context.obdMonitorGrid.children.filter((card) => !card.hidden); };
for (const [query, expected] of [["回転", 2], ["rpm 7e8", 1], ["０ｃ　７Ｅ９", 1], ["05", 1], ["coolant_temp", 1], ["冷却水温", 1], ["missing", 0], ["<script>", 0], ["  ", 3], ["", 3]]) {
  check(search(query).length === expected, `Wrong visible count for ${query}`);
  check(nodes.obdMonitorFilterEmpty.hidden === (expected > 0), `Wrong no-match state for ${query}`);
}
check(JSON.stringify(values) === original && context.retainedInsights === insights && context.obdMonitorCount.textContent === "3項目",
  "Search changed readout data, safety insights or acquired count");
const pick = (index, checked) => {
  const target = context.obdMonitorGrid.children[index].querySelector();
  target.checked = checked;
  context.obdMonitorGrid.handlers.change({ target });
};
pick(0, true);
pick(1, true);
check(nodes.obdMonitorSelectionCount.textContent === "選択 2項目" && !nodes.obdMonitorSelectedOnly.disabled, "Multi-selection count incorrect");
nodes.obdMonitorSelectedOnly.checked = true;
nodes.obdMonitorSelectedOnly.handlers.change();
check(search("rpm").length === 1 && search("7e9").length === 0 && search("").length === 2, "Selection and search must intersect, preserving ECU-distinct rows");
check(context.obdMonitorGrid.children[2].querySelector().ariaLabel.includes("7E9"), "Duplicate PID accessible names must distinguish ECU");
pick(0, false);
pick(1, false);
check(!nodes.obdMonitorSelectedOnly.checked && nodes.obdMonitorSelectedOnly.disabled && search("").length === 3, "Last deselection must restore all items");
pick(2, true);
nodes.obdMonitorSelectedOnly.checked = true;
nodes.obdMonitorSelectionClear.handlers.click();
check(!nodes.obdMonitorSelectedOnly.checked && nodes.obdMonitorSelectionCount.textContent === "選択 0項目" && nodes.obdMonitorSearch.focused, "Clear must restore selection state and focus");
pick(2, true);
nodes.obdMonitorSelectedOnly.checked = true;
search("7e9");
context.renderObdMonitorValues([values[0]], insights);
check(!nodes.obdMonitorSelectedOnly.checked && nodes.obdMonitorSelectionCount.textContent === "選択 0項目" && nodes.obdMonitorSelectionClear.disabled, "Readout replacement must reset selection synchronously");
subscriptions[0].callback();
check(nodes.obdMonitorFilterCount.textContent === "絞込中: 0 / 1項目" && !nodes.obdMonitorFilterEmpty.hidden, "New readout ignored current filter or hid its no-match state");
nodes.obdMonitorSearchClear.handlers.click();
check(nodes.obdMonitorSearch.value === "" && nodes.obdMonitorSearch.focused && nodes.obdMonitorSearchClear.disabled && !context.obdMonitorGrid.children[0].hidden,
  "Clear did not restore all rows and return keyboard focus");
search("rpm");
pick(0, true);
nodes.obdMonitorSelectedOnly.checked = true;
context.renderObdMonitorValues([], []);
check(!nodes.obdMonitorSelectedOnly.checked && nodes.obdMonitorSelectionCount.textContent === "選択 0項目", "Empty readout must reset selection synchronously");
subscriptions[0].callback();
check(nodes.obdMonitorFilter.hidden && nodes.obdMonitorFilterEmpty.hidden && nodes.obdMonitorSearch.value === "", "Empty/reset readout retained stale filtering");
const unsupported = harness(false);
unsupported.context.renderObdMonitorValues(values, insights);
check(unsupported.nodes.obdMonitorFilter.hidden && unsupported.context.obdMonitorGrid.children.every((card) => !card.hidden), "Unsupported observation must leave all readouts visible");
check(unsupported.nodes.obdMonitorSelection.hidden && !unsupported.context.obdMonitorGrid.children[0].querySelector(), "Unsupported observer must not expose inert selection");
check(JSON.stringify(values) === original && context.retainedInsights === insights, "Selection must not mutate source readout or safety insights");
check(source.includes("initializeObdMonitorFilter();") && html.includes('type="search" maxlength="100"') && html.includes('aria-controls="obdMonitorGrid"')
  && html.includes('aria-label="検索を解除"'), "Search controls or initializer missing");
check(css.includes('.obd-monitor-card[hidden] { display: none; }'), "Grid card styling overrides hidden rows");
const navigation = extract("scrollToObdSection");
for (const hasRows of [true, false]) {
  let scrolled = "";
  const target = (id, children = []) => ({ children, hidden: false, closest: (selector) => selector === "#obdReadoutSurface" ? {} : null,
    scrollIntoView: () => { scrolled = id; } });
  const targets = { obdMonitorGrid: target("grid", hasRows ? [{}] : []), obdMonitorFilter: target("filter"), obdMonitorStatus: target("status"),
    "obd-panel": { classList: { contains: () => true } } };
  targets.obdMonitorFilter.hidden = !hasRows;
  const nav = vm.createContext({ document: { getElementById: (id) => targets[id] }, obdAccessUnlocked: true, renderObdStageView: () => {} });
  vm.runInContext(navigation, nav);
  nav.scrollToObdSection("obdMonitorGrid");
  check(scrolled === (hasRows ? "filter" : "status"), "Live-value navigation must expose search, or acquisition status when empty");
  nav.obdAccessUnlocked = false;
  scrolled = "";
  nav.scrollToObdSection("obdMonitorGrid");
  check(scrolled === "", "Search navigation bypassed locked readout access");
}
console.log(`Monitor filter checks: ${checks} / Errors: 0`);
