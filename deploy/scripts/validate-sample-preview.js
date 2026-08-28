import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync(new URL("../script.js", import.meta.url), "utf8");
const html = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
const core = vm.createContext({ window: {} });
vm.runInContext(fs.readFileSync(new URL("../obd-readonly.js", import.meta.url), "utf8"), core);
const code = ["getObdMonitorSampleText", "loadObdMonitorSample"].map((name) =>
  source.match(new RegExp(`function ${name}\\(\\) \\{[\\s\\S]*?\\r?\\n\\}`))?.[0] || assert.fail(`Missing ${name}`)).join("\n");
let checks = 0;
const check = (condition, message) => { assert.ok(condition, message); checks += 1; };

class Element {
  constructor(tag) { this.tag = tag; this.children = []; this.open = false; this.shows = 0; this.text = ""; }
  set textContent(value) { this.text = String(value); this.children = []; }
  get textContent() { return this.text + this.children.map((child) => child.textContent).join("\n"); }
  set innerHTML(_value) { throw new Error("Preview must use safe text rendering"); }
  append(...items) { items.forEach((item) => this.appendChild(item)); }
  appendChild(item) { this.children.push(...(item.tag === "fragment" ? item.children : [item])); }
  replaceChildren(...items) { this.children = []; this.text = ""; this.append(...items); }
  showModal() { this.open = true; this.shows += 1; }
}

const nodes = Object.fromEntries(["obdSampleDialog", "obdSampleBody", "obdSampleStatus"].map((id) => [id, new Element(id)]));
const input = { value: "retained real input" };
const session = Object.freeze({ source: "web_serial", dtcs: ["P0123"] });
const pending = { cancelled: false };
let forbiddenCalls = 0;
let parserCalls = 0;
let failure = false;
const forbidden = () => { forbiddenCalls += 1; throw new Error("Forbidden session side effect"); };
const context = vm.createContext({
  obdScannerText: input, obdDevSession: { lastSession: session, readInProgress: true }, obdScannerImportOperation: pending,
  analyzeObdScannerImport: forbidden, invalidateObdScannerImport: forbidden, downloadObdSessionJson: forbidden,
  fetch: forbidden, localStorage: { setItem: forbidden },
  window: { ObdReadOnly: {
    analyzeScannerText(text) { parserCalls += 1; if (failure) throw new Error("private parser failure"); return core.window.ObdReadOnly.analyzeScannerText(text); },
    buildDiagnosticScanSession: forbidden, buildBridgeSessionExportPayload: forbidden
  } },
  document: { getElementById: (id) => nodes[id], createElement: (tag) => new Element(tag), createDocumentFragment: () => new Element("fragment") }
});
vm.runInContext(code, context);
const expected = core.window.ObdReadOnly.analyzeScannerText(context.getObdMonitorSampleText());
const unchanged = () => {
  check(input.value === "retained real input" && context.obdDevSession.lastSession === session, "Preview replaced current input/session");
  check(context.obdScannerImportOperation === pending && !pending.cancelled && context.obdDevSession.readInProgress, "Preview cancelled pending read/import work");
  check(forbiddenCalls === 0, "Preview reached session, persistence or transport operations");
};
for (let attempt = 0; attempt < 3; attempt += 1) {
  context.loadObdMonitorSample();
  const sections = nodes.obdSampleBody.children;
  check(nodes.obdSampleDialog.open && nodes.obdSampleDialog.shows === 1 && sections.length === 4, "Repeated preview duplicated content or reopened an open modal");
  check(nodes.obdSampleStatus.textContent.includes("架空") && nodes.obdSampleStatus.textContent.includes("実車未読取"), "Preview lost its synthetic-data label");
  check(sections[0].textContent.includes("P0171") && sections[0].children[1].children.length === expected.dtcSnapshot.dtcs.length, "Preview changed DTC records");
  for (const [section, values] of [[sections[1], expected.monitorValues], [sections[2], expected.freezeFrameSnapshot.monitorValues]]) {
    check(values.every((item) => section.textContent.includes(`${item.label}: ${item.value}`)), "Preview changed or mixed live and freeze-frame readings");
  }
  check(sections[3].textContent.includes("未完了") && sections[3].textContent.includes("完了"), "Preview lost readiness states");
  unchanged();
}
failure = true;
context.loadObdMonitorSample();
check(nodes.obdSampleBody.children.length === 0 && nodes.obdSampleStatus.textContent.includes("表示できません") && !nodes.obdSampleStatus.textContent.includes("private"), "Failed preview retained stale output or leaked parser details");
unchanged();
failure = false;
context.loadObdMonitorSample();
check(nodes.obdSampleBody.children.length === 4, "Preview could not recover after a parser failure");
nodes.obdSampleDialog.open = false;
context.loadObdMonitorSample();
check(nodes.obdSampleDialog.shows === 2, "Closed preview did not reopen");
const previousCalls = parserCalls;
nodes.obdSampleDialog.showModal = undefined;
context.loadObdMonitorSample();
check(parserCalls === previousCalls, "Unavailable dialog triggered parsing without an isolated surface");
unchanged();
const modal = html.match(/<dialog id="obdSampleDialog"[\s\S]*?<\/dialog>/)?.[0] || "";
check(modal.includes('method="dialog"') && modal.includes('aria-labelledby="obdSampleTitle"'), "Preview needs native close and an accessible title");
check((modal.match(/<button\b/g) || []).length === 1 && !/data-obd-session-export|data-dtc-code|<input|<a\b/.test(modal), "Preview exposes apply, diagnosis or export controls");
check(source.includes('obdSampleButton.addEventListener("click", loadObdMonitorSample)') && source.includes('document.querySelector("#obdResultsSampleButton")?.addEventListener("click", loadObdMonitorSample)'), "Both sample entry points must use the isolated preview");
console.log(`Sample preview checks: ${checks} / Errors: 0`);
