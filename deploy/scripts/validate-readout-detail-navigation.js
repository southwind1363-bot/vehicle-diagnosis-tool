import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync(new URL("../script.js", import.meta.url), "utf8");
const html = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
const css = fs.readFileSync(new URL("../style.css", import.meta.url), "utf8");
const extract = (name) => source.match(new RegExp(`function ${name}\\([^)]*\\) \\{[\\s\\S]*?\\r?\\n\\}`))?.[0] || assert.fail(`Missing ${name}`);
let checks = 0;
const check = (condition, message) => { assert.ok(condition, message); checks += 1; };
class Element {
  constructor(id) {
    this.id = id; this.children = []; this.dataset = {}; this.attributes = {}; this.classes = new Set();
    this.hidden = false; this.textContent = id; this.scrolled = 0;
    this.classList = { contains: (name) => this.classes.has(name), toggle: (name, active) => active ? this.classes.add(name) : this.classes.delete(name) };
  }
  appendChild(child) { this.children.push(child); child.parentElement = this; return child; }
  closest(selector) {
    if (selector === `#${this.id}` || (selector === "details" && this.tagName === "DETAILS") || (selector.startsWith(".") && this.classes.has(selector.slice(1)))) return this;
    return this.parentElement?.closest(selector) || null;
  }
  querySelectorAll() { return this.children; }
  setAttribute(name, value) { this.attributes[name] = value; }
  scrollIntoView() { this.scrolled += 1; }
  dispatchEvent(event) { this.lastEvent = event.type; }
}
const nodes = {};
const node = (id, parent) => {
  const value = new Element(id); nodes[id] = value;
  if (parent) nodes[parent].appendChild(value);
  return value;
};
const panel = node("obd-panel"); panel.classes.add("is-active");
node("obdStageResultsView", "obd-panel");
const disclosure = node("obdReadoutDetails", "obdStageResultsView"); disclosure.tagName = "DETAILS";
const menu = node("obdReadoutDetailMenu", "obdReadoutDetails");
const details = node("obdDevSessionDetails", "obdReadoutDetails");
const empty = node("obdReadoutDetailEmpty", "obdReadoutDetails");
const menuHtml = html.match(/<nav id="obdReadoutDetailMenu"[\s\S]*?<\/nav>/)?.[0] || "";
for (const match of menuHtml.matchAll(/data-obd-scroll-target="([^"]+)" data-obd-detail-target="([^"]+)"[^>]*>([^<]+)<\/button>/g)) {
  const button = new Element(`button-${match[2]}`);
  button.dataset = { obdScrollTarget: match[1], obdDetailTarget: match[2] }; button.textContent = match[3]; menu.appendChild(button);
  if (match[2] !== "all") node(match[2], "obdDevSessionDetails");
}
assert.deepEqual(menu.children.map(button => button.dataset.obdDetailTarget), ['all', 'obdSessionDetailFreezeFrame', 'obdSessionDetailReadiness', 'obdSessionDetailEcuInfo', 'obdSessionDetailSupportedPid', 'obdSessionDetailMode06', 'obdSessionDetailLiveTimeline', 'obdSessionDetailEcuResponses']);
const context = vm.createContext({ document: { getElementById: (id) => nodes[id] || null }, obdUiMode: "simple", obdAccessUnlocked: true, Event: class { constructor(type) { this.type = type; } } });
vm.runInContext(["scrollToObdSection", "renderObdReadoutDetailSelection", "openObdSimpleEcuDetail"].map(extract).join("\n"), context);
context.renderObdStageView = (stage) => { panel.dataset.obdActiveStage = stage; context.renderObdReadoutDetailSelection(); };
const cardReferences = [...details.children];
for (const button of menu.children.filter((button) => button.dataset.obdDetailTarget !== "all")) {
  const id = button.dataset.obdDetailTarget;
  context.scrollToObdSection(id);
  check(panel.dataset.obdReadoutView === "details" && panel.dataset.obdReadoutDetail === id, "Detail shortcut opened the wrong view or lost the selected category");
  check(details.children.filter((card) => !card.classes.has("obd-detail-excluded")).map((card) => card.id).join() === id, "Individual detail view exposed other categories");
  check(empty.hidden && disclosure.open && nodes[id].scrolled === 1, "Existing detail did not open or falsely showed an empty message");
  check(menu.children.filter((item) => item.attributes["aria-pressed"] === "true").length === 1 && button.attributes["aria-pressed"] === "true", "Detail menu selection is ambiguous");
  details.children = details.children.filter((card) => card.id !== id); delete nodes[id];
  context.scrollToObdSection(id, "obdReadoutDetails");
  check(!empty.hidden && empty.textContent.startsWith(button.textContent) && panel.dataset.obdReadoutDetail === id, "Missing detail fell back to unrelated data instead of a named empty state");
  check(details.children.every((card) => card.classes.has("obd-detail-excluded")), "Missing detail displayed another category's evidence");
  const replacement = node(id, "obdDevSessionDetails"); replacement.textContent = "refreshed readout";
  context.renderObdReadoutDetailSelection();
  check(empty.hidden && !replacement.classes.has("obd-detail-excluded"), "New data did not replace the selected empty state");
}
context.scrollToObdSection("obdReadoutDetails");
check(details.children.every((card) => !card.classes.has("obd-detail-excluded")) && empty.hidden, "All-readouts view did not restore all existing detail nodes");
panel.dataset.obdReadoutDetail = "unknown";
context.renderObdReadoutDetailSelection();
check(panel.dataset.obdReadoutDetail === "all", "Unknown selection hid all available data");
const search = node("obdEcuResponseSearch", "obdSessionDetailEcuResponses");
panel.dataset.obdReadoutView = "dtc";
context.openObdSimpleEcuDetail({ address: "7E8" });
check(panel.dataset.obdReadoutView === "details" && panel.dataset.obdReadoutDetail === "obdSessionDetailEcuResponses", "ECU summary shortcut remained hidden behind the DTC view");
check(search.value === "7E8" && search.lastEvent === "input", "ECU summary shortcut lost its existing search filter");
const beforeLock = JSON.stringify(panel.dataset);
context.obdAccessUnlocked = false;
context.openObdSimpleEcuDetail({ address: "7E9" }); context.scrollToObdSection("obdSessionDetailMode06");
check(JSON.stringify(panel.dataset) === beforeLock && search.value === "7E8", "Locked detail navigation changed the view or search");
context.obdAccessUnlocked = true;
delete nodes.obdSessionDetailEcuResponses;
details.children = details.children.filter((card) => card.id !== "obdSessionDetailEcuResponses");
context.openObdSimpleEcuDetail({});
check(panel.dataset.obdReadoutView === "details" && !empty.hidden, "Missing ECU response detail did not retain an explicit empty view");
context.obdUiMode = "details";
context.scrollToObdSection("obdReadoutDetails");
check(panel.dataset.obdActiveStage === "results", "Expert mode navigation changed to a simple-only stage");
check(css.includes('#obd-panel[data-obd-ui-mode="simple"][data-obd-active-stage="readout"] .obd-detail-excluded'), "Detail filtering is not scoped to the simple readout screen");
const renderer = extract("renderObdBridgeSessionDetails");
check(renderer.indexOf("renderObdReadoutDetailSelection();") > renderer.indexOf('obdDevSessionDetails.innerHTML = "";') && renderer.lastIndexOf("renderObdReadoutDetailSelection();") > renderer.lastIndexOf("obdDevSessionDetails.hidden = false;"), "Session redraw does not refresh detail selection on empty and populated output");
check(cardReferences.every((card) => card.textContent === card.id), "Navigation modified diagnostic content");
console.log(`Readout detail navigation checks: ${checks} / Errors: 0`);
