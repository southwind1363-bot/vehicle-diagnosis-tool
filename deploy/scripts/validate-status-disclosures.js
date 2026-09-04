import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync(new URL("../script.js", import.meta.url), "utf8");
const html = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
const css = fs.readFileSync(new URL("../style.css", import.meta.url), "utf8");
const code = source.match(/function initializeObdStatusDisclosures\(\) \{[\s\S]*?\r?\n\}\r?\n\r?\nconst OBD_NEXT_READOUT_ACTIONS/)?.[0]
  ?.replace(/\r?\n\r?\nconst OBD_NEXT_READOUT_ACTIONS$/, "") || assert.fail("Missing status disclosure initializer");
let checks = 0;
const check = (condition, message) => { assert.ok(condition, message); checks += 1; };

const technicalCode = source.match(/function appendObdTechnicalNotes\(status, notes\) \{[\s\S]*?\r?\n\}/)?.[0];
check(technicalCode, "Missing technical note renderer");
const element = () => ({ children: [], append(...items) { this.children.push(...items); }, setAttribute(key, value) { this[key] = value; } });
const technicalContext = vm.createContext({ document: { createElement: element } });
vm.runInContext(technicalCode, technicalContext);
const status = { ...element(), id: "obdImportStatus" };
technicalContext.appendObdTechnicalNotes(status, []);
check(status.children.length === 0, "Empty technical notes created a control");
technicalContext.appendObdTechnicalNotes(status, ["<untrusted>", "Second note"]);
const [label, technicalBody] = status.children[0].children;
check(label.children[0].type === "checkbox" && label.children[0]["aria-controls"] === technicalBody.id, "Technical disclosure has no linked checkbox");
check(technicalBody.textContent === "<untrusted> / Second note", "Technical notes were lost or interpreted as HTML");
check(!technicalCode.includes("innerHTML"), "Technical renderer may interpret imported markup");
check(css.includes(".obd-technical-notes:has(input:checked) .obd-technical-notes-body { display: block; }"), "Technical expansion style missing");
for (const label of ["在庫比較", "実機サンプル", "実機応答比較", "計画差分", "次読取整合"]) {
  check(source.includes('technicalNotes.push(`' + label + ' '), "Internal note was not separated: " + label);
}
for (const label of ["保留要因", "空応答", "適用", "読取品質", "計画安全", "候補安全"]) {
  check(source.includes('notes.push(`' + label + ' '), "Operational warning left normal display: " + label);
}

const summaryCode = source.match(/function appendObdAnalysisReadoutSummary\(parts, analysis, options = \{\}\) \{[\s\S]*?\r?\n\}/)[0];
const summaryContext = vm.createContext({
  NO_DATA: "missing", getSessionNextReadoutCandidates: () => [],
  getReadoutCoverageDisplay: () => ({ totalCategories: 7, missingCategories: 6, emptyCategories: 1 }),
  formatVehicleApplicabilitySummary: () => "unconfirmed",
  formatCoreNextStepSummary: () => "next", formatCoreSessionStatusSummary: () => "internal-progress",
  formatCoreEmptyReadoutSummary: () => "empty", formatCoreBlockingWarningSummary: () => "blocked",
  formatObdBridgeReadinessSummary: (_snapshot, options) => options.includeObservedCount ? "counted" : "readiness",
  getNonBlockingWarningLabels: () => ["save-before-clear"]
});
vm.runInContext(summaryCode, summaryContext);
for (const includeReadinessCount of [false, true]) {
  const normal = [], technical = [], legacy = [];
  const input = Object.freeze({});
  summaryContext.appendObdAnalysisReadoutSummary(normal, input, { includeReadinessCount, technicalNotes: technical });
  summaryContext.appendObdAnalysisReadoutSummary(legacy, input, { includeReadinessCount });
  check(technical.length === 1 && technical[0] === "コア進捗 internal-progress", "Live internal progress was not separated");
  check(JSON.stringify([...technical, ...normal]) === JSON.stringify(legacy), "Live split changed or dropped summary content");
  for (const expected of ["空応答 empty", "保留 blocked", "次操作 next", "適用 unconfirmed", "save-before-clear", "未取得6件", "空応答1件"]) {
    check(normal.some((note) => note.includes(expected)), "Live operational warning missing: " + expected);
  }
  check(normal.includes(includeReadinessCount ? "レディネスcounted" : "レディネスreadiness"), "Readiness count option changed");
}
check(source.split("appendObdTechnicalNotes(obdMonitorStatus, liveTechnicalNotes);").length === 3, "Live value and zero-value branches must both render technical notes");

const contents = [{ id: "dtc-status" }, { id: "dtc-hints" }, { id: "live-status" }];
const details = [
  { open: false, targets: contents.slice(0, 2), querySelectorAll: () => contents.slice(0, 2), querySelector: () => null },
  { open: false, targets: contents.slice(2), querySelectorAll: () => contents.slice(2), querySelector: () => null }
];
const subscriptions = [];
for (const item of details) {
  item.body = { scrollTop: 100 };
  item.querySelector = (selector) => selector === ".obd-status-body" ? item.body : null;
}
class Observer {
  constructor(callback) { this.callback = callback; }
  observe(target, options) { subscriptions.push({ observer: this, target, options }); }
}
const printListeners = { beforeprint: [], afterprint: [] };
const firePrintEvent = (event) => printListeners[event].forEach((handler) => handler());
const context = vm.createContext({
  document: { querySelectorAll: () => details }, MutationObserver: Observer,
  window: { addEventListener: (event, handler) => printListeners[event].push(handler) }
});
vm.runInContext(code, context);
context.initializeObdStatusDisclosures();
check(details.every((item) => item.open), "Status disclosures must start open");
check(subscriptions.length === 3, "Every status and hint surface must reopen its disclosure");
check(subscriptions.every(({ options }) => options.childList && options.characterData && options.subtree && options.attributes && options.attributeFilter.includes("hidden")), "Status observer missed a content or visibility change");
for (const disclosure of details) {
  disclosure.open = false;
  subscriptions.find(({ target }) => disclosure.targets.includes(target)).observer.callback();
  check(disclosure.open, "Updated results stayed hidden after a manual collapse");
  check(disclosure.body.scrollTop === 0, "New status was left below the current scroll position");
  disclosure.body.scrollTop = 80;
  const callback = subscriptions.find(({ target }) => disclosure.targets.includes(target)).observer.callback;
  callback();
  check(disclosure.body.scrollTop === 80, "Identical rendering interrupted reading");
  disclosure.targets[0].textContent = "Updated warning";
  callback();
  check(disclosure.body.scrollTop === 0, "Changed warning did not reset scroll");
  disclosure.body.scrollTop = 80;
  disclosure.targets[0].hidden = true;
  callback();
  check(disclosure.body.scrollTop === 0, "Visibility change did not reset scroll");
}
details[0].open = false;
details[1].open = true;
details[1].body.scrollTop = 60;
firePrintEvent("afterprint");
check(!details[0].open, "Unpaired afterprint changed disclosure state");
firePrintEvent("beforeprint");
firePrintEvent("beforeprint");
check(details.every((item) => item.open), "Collapsed warnings were omitted from print");
details[1].body.scrollTop = 0;
firePrintEvent("afterprint");
check(!details[0].open && details[1].open, "Print did not restore original disclosure states");
check(details[1].body.scrollTop === 60, "Print did not restore reading position");
firePrintEvent("beforeprint");
contents[0].textContent = "Warning received during print";
subscriptions[0].observer.callback();
firePrintEvent("afterprint");
check(details[0].open, "Print restoration hid a new warning");
for (const id of ["obdDtcStatusBody", "obdLiveStatusBody"]) {
  check(html.includes(`aria-controls="${id}"`) && html.includes(`id="${id}" class="obd-status-body" role="region"`), "Missing labelled status expansion region");
  check(html.match(new RegExp(`id="${id}"[^>]*tabindex="0"`)), "Status region cannot be reached with the keyboard");
}
check(css.includes(".obd-status-details:has(.obd-status-expand input:checked) .obd-status-body"), "Full text expansion rule is missing");
check(css.includes(".obd-status-body { max-height: none; overflow: visible; }"), "Printed status text may be clipped");
check(html.split('class="obd-status-details"').length === 3, "DTC and live status disclosures are missing or duplicated");
check(html.includes('id="obdDtcStatusDetails"') && html.includes('id="obdLiveStatusDetails"') && html.match(/obdDtcStatusDetails[\s\S]*?obdImportStatus[\s\S]*?obdDetectedCodes/) && html.match(/obdLiveStatusDetails[\s\S]*?obdMonitorStatus[\s\S]*?obdMonitorGrid/), "Status content moved outside its result section");
check(source.includes("initializeObdStatusDisclosures();"), "Status disclosure safety initializer is not called");
for (const id of ["obdDtcStatusDetails", "obdLiveStatusDetails"]) {
  const block = html.match(new RegExp(`<details id="${id}"[^>]*>[\\s\\S]*?<\\/details>`))?.[0] || "";
  check(block.includes('class="obd-status-details" open>'), "Initial warnings must not be collapsed");
  check(!/id="obd(?:DetectedCodes|MonitorGrid|MonitorInsightList)"/.test(block), "Readout values or safety insights were hidden inside a disclosure");
}
let preventCollapse;
const unsupported = { open: false, querySelector: () => ({ addEventListener: (event, handler) => { preventCollapse = handler; } }) };
const fallback = vm.createContext({ document: { querySelectorAll: () => [unsupported] } });
vm.runInContext(code, fallback);
fallback.initializeObdStatusDisclosures();
let prevented = false;
preventCollapse({ preventDefault: () => { prevented = true; } });
check(unsupported.open && prevented, "Without observation support, status text must remain open");
console.log(`Status disclosure checks: ${checks} / Errors: 0`);
