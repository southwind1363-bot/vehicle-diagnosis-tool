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
const context = vm.createContext({ document: { querySelectorAll: () => details }, MutationObserver: Observer });
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
