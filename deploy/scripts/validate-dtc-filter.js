import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync(new URL("../script.js", import.meta.url), "utf8");
const html = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
const extract = (name) => source.match(new RegExp(`function ${name}\\([^)]*\\) \\{[\\s\\S]*?\\r?\\n\\}`))?.[0] || assert.fail(`Missing ${name}`);
let checks = 0;
const check = (condition, message) => { assert.ok(condition, message); checks += 1; };
function element() {
  return { children: [], dataset: {}, value: "", hidden: false, handlers: {}, textContent: "",
    appendChild(child) { this.children.push(child); }, addEventListener(name, handler) { this.handlers[name] = handler; },
    focus() { this.focused = true; }, scrollIntoView() {} };
}
const nodes = Object.fromEntries(["obdDtcFilter", "obdDtcSearch", "obdDtcSearchClear", "obdDtcFilterCount", "obdDtcFilterEmpty", "obdCode", "resultTitle"].map((id) => [id, element()]));
const subscriptions = [];
const dtcs = [
  { code: "P0300", ecu: "7E8", subcode: "11" },
  { code: "P0300", ecu_id: "7E9", sub_code: "12", ecu_name: "Engine B" },
  { code: "P0171", ecu: "7E8", oem_detail_code: "123" }
];
const snapshot = JSON.stringify(dtcs);
const vehicle = { maker: "Toyota", model: "retained vehicle" };
const observedArguments = [];
let diagnosisInput;
const context = vm.createContext({
  document: { querySelector: (selector) => nodes[selector.slice(1)], createElement: element },
  obdDetectedCodes: element(), MutationObserver: class { constructor(callback) { this.callback = callback; } observe(target, options) { subscriptions.push({ callback: this.callback, target, options }); } },
  buildSelectedObdVehicleProfile: () => ({ maker: "different selection" }), withReportedDtcEcu: (profile) => profile,
  findDtcDefinitionCandidates: () => [], evaluateDtcDefinitionCandidatesApplicability: () => ({ status: "unverified" }),
  buildDtcDefinitionScopeSummary: () => "", buildSourceSpecificDtcContext: () => ({ hasDefinitions: false }),
  selectApplicableDtcDefinition: () => null, getModernGenericMatches: () => [], describeUnregisteredDtc: () => "Unverified",
  evaluateDtcConcurrentRequirements: (_definition, observed) => { observedArguments.push(observed); return { required: [], missing: [] }; },
  describeDtcDefinitionApplicabilityReason: (_reason, fallback) => fallback,
  formatDtcReference: (code, subcode) => `${code}:${subcode}`, activateTab: () => {},
  getInput: () => ({ retainedMarker: "input" }), buildDiagnosis: (input) => { diagnosisInput = input; return {}; }, renderDiagnosis: () => {}
});
vm.runInContext(["initializeObdReadoutFilter", "initializeObdDtcFilter", "createObdDtcCard", "handleDetectedDtcClick", "scrollToObdSection"].map(extract).join("\n"), context);
context.initializeObdDtcFilter();
check(nodes.obdDtcFilter.hidden && subscriptions.length === 1, "DTC filter must wait for cards");
const cards = dtcs.map((dtc) => context.createObdDtcCard(dtc, dtcs, vehicle));
context.obdDetectedCodes.children = cards;
subscriptions[0].callback();
check(nodes.obdDtcFilterCount.textContent === "全3件を表示" && !nodes.obdDtcFilter.hidden, "DTC filter lost ECU/subcode-distinct rows");
const search = (query) => { nodes.obdDtcSearch.value = query; nodes.obdDtcSearch.handlers.input(); return cards.filter((card) => !card.hidden); };
for (const [query, expected] of [["p0300", 2], ["Ｐ０３００　７ｅ９", 1], ["11", 1], ["Engine B", 1], ["123", 1], ["P0420", 0], ["<script>", 0], ["", 3]]) {
  check(search(query).length === expected, `Incorrect DTC search for ${query}`);
  check(nodes.obdDtcFilterEmpty.hidden === (expected !== 0), `Incorrect no-match state for ${query}`);
}
check(JSON.stringify(dtcs) === snapshot && observedArguments.length === 3 && observedArguments.every((value) => value === dtcs) && !diagnosisInput,
  "Search modified diagnostic records, repeated applicability analysis or changed concurrent DTC inputs");
const chosen = search("p0300 7e9")[0];
const button = chosen.children.find((child) => child.dataset.dtcCode);
context.handleDetectedDtcClick({ target: { closest: () => button } });
check(nodes.obdCode.value === "P0300:12" && diagnosisInput.vehicleProfile === vehicle && diagnosisInput.retainedMarker === "input",
  "Filtered detail action lost its original subcode, vehicle or existing input fields");
nodes.obdDtcSearchClear.handlers.click();
check(nodes.obdDtcSearch.focused && nodes.obdDtcSearchClear.disabled && cards.every((card) => !card.hidden), "DTC clear did not restore all cards/focus");
search("P0300");
context.obdDetectedCodes.children = [context.createObdDtcCard({ code: "P0420" }, [], vehicle)];
subscriptions[0].callback();
check(nodes.obdDtcFilterCount.textContent === "絞込中: 0 / 1件" && !nodes.obdDtcFilterEmpty.hidden, "Replacement result ignored filter state");
context.obdDetectedCodes.children = [];
subscriptions[0].callback();
check(nodes.obdDtcFilter.hidden && nodes.obdDtcSearch.value === "" && nodes.obdDtcFilterEmpty.hidden, "Empty DTC list kept stale search state");
check(source.includes("initializeObdDtcFilter();") && html.includes('aria-controls="obdDetectedCodes"') && html.includes('aria-label="DTC検索を解除"'), "Missing DTC search initialization/accessibility");
check(!extract("initializeObdReadoutFilter").includes("obdDevSession"), "Display filter must not access the saved diagnostic session");
for (const hasRows of [true, false]) {
  let scrolled;
  const target = (name, children = []) => ({ children, closest: (selector) => selector === "#obdReadoutSurface" ? {} : null, scrollIntoView: () => { scrolled = name; } });
  const targets = { obdDetectedCodes: target("cards", hasRows ? [{}] : []), obdDtcFilter: { ...target("search"), hidden: !hasRows },
    obdImportStatus: target("status"), "obd-panel": { classList: { contains: () => true } } };
  const nav = vm.createContext({ document: { getElementById: (id) => targets[id] }, obdAccessUnlocked: true, renderObdStageView: () => {} });
  vm.runInContext(extract("scrollToObdSection"), nav);
  nav.scrollToObdSection("obdDetectedCodes");
  check(scrolled === (hasRows ? "search" : "status"), "DTC navigation hid search or empty-readout status");
}
console.log(`DTC filter checks: ${checks} / Errors: 0`);
