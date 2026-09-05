import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync(new URL("../script.js", import.meta.url), "utf8");
const html = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
const css = fs.readFileSync(new URL("../style.css", import.meta.url), "utf8");
assert.match(css, /#obdSetupPanel label:has\(> #obdVehicleYearManual\[hidden\]\)\s*\{\s*display: none;/, "Hidden manual year input must not leave an empty labelled row");
const disabledStyle = css.match(/#obd-panel button:disabled\s*\{([^}]+)\}/)?.[1] || "";
for (const rule of ["background: var(--panel-subtle)", "color: var(--muted)", "border-style: dashed", "box-shadow: none", "cursor: not-allowed"]) {
  assert.ok(disabledStyle.includes(rule), "Disabled OBD controls must remain visually distinct: " + rule);
}
assert.ok(!disabledStyle.includes("pointer-events"), "Disabled controls should retain hover explanations");
assert.ok(html.includes('id="obdStageTitle" class="obd-expert-only"'));
assert.ok(css.includes('#obd-panel[data-obd-ui-mode="simple"] .obd-eyebrow'));
assert.ok(css.includes('#obd-panel[data-obd-ui-mode="simple"] .obd-scan-context strong'));
assert.ok(css.includes('#obd-panel[data-obd-ui-mode="simple"][data-obd-active-stage="home"] #obdStageTabs'));
const header = html.slice(html.indexOf('id="obdStagePanel"'), html.indexOf('id="obdUiModeSwitch"'));
assert.ok(header.includes('id="obdStageBackButton"') && header.includes('id="obdStageBadge"'), "Back and location must share the stage header");
assert.equal((html.match(/id="obdStageBackButton"/g) || []).length, 1);
for (const id of ["obdSimpleStatus", "obdSimpleResultStatus"]) {
  const tag = html.match(new RegExp(`<p[^>]*id="${id}"[^>]*>`))?.[0];
  assert.ok(tag && !tag.includes("obd-expert-only") && tag.includes('role="status"'), "Operational status must remain in normal mode");
}
const element = () => ({ hidden: false, dataset: {}, classList: { toggle() {} }, setAttribute() {}, getClientRects: () => [] });
const home = element();
const panel = element();
const back = element();
const session = Object.freeze({ marker: "retained-readout" });
const context = vm.createContext({
  document: { getElementById: (id) => id === "obdHomeView" ? home : id === "obdStageBackButton" ? back : panel },
  syncObdReadoutSurface() {}, getObdAutoStage: () => "setup",
  obdAccessUnlocked: true, obdUiMode: "simple", activeObdStage: "setup",
  obdStagePanel: element(), obdPanel: panel, obdStageBadge: element(), obdStageStatus: element(),
  obdStageTabs: [], obdSetupPanel: element(), obdStageSetupView: element(),
  obdStageResultsView: element(), obdStageDetailsView: element(),
  obdDevSession: { lastSession: session }
});
vm.runInContext(source.slice(source.indexOf("function openObdSavedReadout("), source.indexOf("function setObdStage(")), context);
vm.runInContext(source.slice(source.indexOf("function setObdStage("), source.indexOf("async function hashObdAccessPassword(")), context);
for (const [automatic, mode, expected] of [
  ["setup", "simple", "home"], ["results", "simple", "results"],
  ["connect", "simple", "connect"], ["setup", "details", "setup"],
  ["details", "details", "details"]
]) {
  assert.equal(context.getObdEntryStage(automatic, mode), expected);
}
for (const [current, automatic, mode, expected] of [
  ["home", "setup", "simple", "home"],
  ["home", "connect", "simple", "home"],
  ["home", "results", "simple", "home"],
  ["readout", "results", "simple", "readout"],
  ["connect", "setup", "simple", "connect"],
  ["connect", "results", "simple", "connect"],
  ["connect", "connect", "simple", "connect"],
  ["setup", "connect", "simple", "setup"],
  ["setup", "results", "simple", "setup"],
  ["setup", "setup", "simple", "setup"],
  ["home", "details", "details", "details"]
]) {
  const stage = context.getObdRefreshStage(current, automatic, mode);
  assert.equal(stage, expected);
  context.obdUiMode = mode;
  context.renderObdStageView(stage);
  assert.equal(context.activeObdStage, expected);
  assert.equal(context.obdDevSession.lastSession, session);
}
context.obdUiMode = "simple";
let cancelled = 0, invalidated = 0, summaries = 0;
Object.assign(context, {
  cancelObdBridgeOperation: () => { cancelled += 1; },
  invalidateObdScannerImport: () => { invalidated += 1; },
  selectedVehicleValue: (select) => select.value,
  selectedObdVehicleYear: () => "2020",
  syncVehicleSelectionSummary: () => { summaries += 1; },
  renderObdConnectionGuide: () => context.renderObdStageView(context.getObdRefreshStage(context.activeObdStage, "results", "simple"))
});
for (const name of ["obdVehicleMakerSelect", "obdVehicleModelSelect", "obdVehicleModelCodeSelect", "obdVehicleEngineCodeSelect", "obdVehicleProductionDateInput", "obdVehicleMarketSelect", "obdVehicleManualInput", "obdVehicleInput", "obdVehicleSelectionSummary"]) context[name] = { value: "" };
vm.runInContext(source.match(/function syncObdVehicleInput\(\) \{[\s\S]*?\r?\n\}/)[0], context);
context.renderObdStageView("setup");
context.obdVehicleMakerSelect.value = "Toyota";
context.syncObdVehicleInput();
assert.equal(context.activeObdStage, "setup", "Vehicle sync navigated away from setup");
assert.equal(cancelled, 1, "Vehicle changes must retain bridge cancellation");
assert.equal(invalidated, 1, "Vehicle changes must invalidate pending imports");
assert.equal(summaries, 1, "Vehicle summary must still update");
for (const field of ["maker", "model", "modelCode", "year", "engine", "market", "manual"]) {
  context.renderObdStageView(context.getObdRefreshStage(context.activeObdStage, "results", "simple"));
  assert.equal(context.activeObdStage, "setup", `Vehicle field ${field} interrupted selection`);
  assert.equal(context.obdSetupPanel.hidden, false);
  assert.equal(context.obdDevSession.lastSession, session);
}
context.setObdStage("connect");
assert.equal(context.activeObdStage, "connect", "Explicit connection navigation must still work");
context.syncObdVehicleInput();
assert.equal(context.activeObdStage, "connect", "Interface refresh navigated to a retained result");
assert.equal(context.obdDevSession.lastSession, session);
// A completed readout must still move forward, independently of refresh policy.
Object.assign(context, {
  renderObdImportToolHints() {}, analyzeObdScannerImport() {}, renderObdMonitorValues() {},
  renderObdDeveloperSessionSummary() {}, obdScannerText: {}, obdDetectedCodes: {}, obdImportStatus: {}
});
vm.runInContext(source.match(/function renderObdDeveloperReadout\(session\) \{[\s\S]*?\r?\n\}/)[0], context);
context.renderObdDeveloperReadout({ dtcSnapshot: { dtcReadoutStatus: "reported", dtcs: [] } });
assert.equal(context.activeObdStage, "results", "Completed serial readout did not open results");
assert.equal(context.obdImportStatus.textContent, "車両DTCを読取りました。DTCは0件です。");
const bridgeRenderer = source.match(/function renderObdBridgeReadout\(parts = \{\}\) \{[\s\S]*?\r?\n\}/)[0];
assert.ok(bridgeRenderer.includes('renderObdStageView("results");'), "Bridge completion must explicitly show results");
let filePickerOpens = 0;
let shownImportStatus = "";
context.scrollToObdSection = (target) => { shownImportStatus = target; };
context.obdImportFileInput = { click: () => { filePickerOpens += 1; } };
context.openObdSavedReadout();
assert.equal(filePickerOpens, 1);
assert.equal(shownImportStatus, "obdImportStatus", "Import failures must be visible when opening from home");
assert.equal(context.activeObdStage, "results");
assert.equal(context.obdDevSession.lastSession, session, "Opening or cancelling the picker must not replace the current readout");
context.obdAccessUnlocked = false;
context.openObdSavedReadout();
assert.equal(filePickerOpens, 1, "Locked access must not open the picker");
context.obdAccessUnlocked = true;
context.obdImportFileInput = null;
context.openObdSavedReadout();
assert.equal(filePickerOpens, 1);
assert.ok(html.includes('id="obdHomeOpenSessionButton"'));
for (const stage of ["home", "setup", "connect", "results", "readout", "home"]) {
  context.renderObdStageView(stage);
  assert.equal(context.activeObdStage, stage);
  assert.equal(home.hidden, stage !== "home");
  assert.equal(back.disabled, stage === "home");
  assert.equal(context.obdSetupPanel.hidden, stage !== "setup");
  assert.equal(context.obdStageSetupView.hidden, stage !== "connect");
  assert.equal(context.obdStageResultsView.hidden, !["results", "readout"].includes(stage));
  assert.equal(context.obdStageDetailsView.hidden, true);
  assert.equal(context.obdDevSession.lastSession, session);
}
for (const [stage, parent] of Object.entries({ home: "home", setup: "home", connect: "setup", results: "home", readout: "results" })) {
  assert.equal(context.getObdParentStage(stage), parent);
  context.setObdStage(context.getObdParentStage(stage));
  assert.equal(context.activeObdStage, parent);
  assert.equal(context.obdDevSession.lastSession, session);
}
assert.ok(source.includes('document.querySelectorAll("button[data-obd-ui-mode]")'), "Mode events must not bind to the containing panel");
assert.ok(html.slice(html.indexOf('id="obdHomeView"'), html.indexOf('id="obdSetupPanel"')).includes('data-obd-ui-mode="details"'));
assert.ok(html.includes('id="obdUiModeSwitch" class="obd-expert-only"'));
context.writeOptionalBrowserSetting = () => {};
context.OBD_UI_MODE_KEY = "test-mode";
context.renderObdUiMode = () => {};
vm.runInContext(source.slice(source.indexOf("function setObdUiMode("), source.indexOf("function getObdSimpleConnectionLabel(")), context);
context.obdUiMode = "details";
context.setObdUiMode("simple");
assert.equal(context.activeObdStage, "home");
assert.equal(context.obdDevSession.lastSession, session);
let disconnected = 0;
context.obdDevSession.port = {};
context.obdDevModeUnlocked = false;
context.disconnectObdDeveloperVci = () => { disconnected += 1; };
context.setObdUiMode("details");
assert.equal(disconnected, 1, "Existing serial shutdown protection must remain in place");
assert.equal(context.activeObdStage, "details", "Developer entry must open details directly");
assert.equal(context.obdStageDetailsView.hidden, false);
assert.equal(context.obdDevSession.lastSession, session);
for (const origin of ["home", "setup", "connect", "results", "readout"]) {
  context.obdUiMode = "simple";
  context.obdDevSession.port = null;
  context.renderObdStageView(origin);
  context.setObdUiMode("details");
  assert.equal(context.activeObdStage, "details", `Developer entry from ${origin} opened the wrong screen`);
  assert.equal(context.obdDevModeUnlocked, false, "Navigation must not unlock developer controls");
  assert.equal(context.obdDevSession.lastSession, session);
}
context.obdAccessUnlocked = false;
context.setObdUiMode("simple");
context.setObdUiMode("details");
assert.equal(context.obdAccessUnlocked, false);
assert.equal(context.obdStagePanel.hidden, true, "Locked navigation exposed protected controls");
context.obdAccessUnlocked = true;
context.obdUiMode = "details";
context.renderObdStageView("home");
assert.equal(context.activeObdStage, "setup");
assert.equal(home.hidden, true);
context.obdAccessUnlocked = false;
context.setObdStage("readout");
assert.equal(context.activeObdStage, "setup", "Locked navigation must not change screens");
context.renderObdStageView("home");
assert.equal(home.hidden, true);
assert.equal(context.obdStagePanel.hidden, true);
Object.assign(context, {
  obdAccessModeBadge: element(), obdAccessUnlockButton: element(), obdAccessLockButton: element(),
  obdAccessProtected: element(), obdAccessGatePanel: element(), obdAccessStatus: element(),
  getObdAccessStatusMessage: () => "test status"
});
vm.runInContext(source.slice(source.indexOf("function renderObdAccessGate("), source.indexOf("function normalizeProgressPercent(")), context);
context.obdUiMode = "simple";
context.obdAccessUnlocked = true;
context.renderObdAccessGate({});
assert.equal(context.activeObdStage, "home");
assert.equal(home.hidden, false);
context.getObdAutoStage = () => "results";
context.renderObdAccessGate({});
assert.equal(context.activeObdStage, "results");
assert.equal(context.obdDevSession.lastSession, session);
const connectionGuide = source.slice(source.indexOf("function renderObdConnectionGuide("), source.indexOf("function scrollToObdSection("));
context.document.createElement = () => ({ append() {} });
context.document.createTextNode = (text) => text;
Object.assign(context, {
  window: { ObdReadOnly: { getCapability: () => ({}) } },
  obdConnectionGuide: { appendChild() {} }, obdAvailableReadoutSummary: {},
  resolveObdInterfaceId: () => "user-vci-elm327",
  getObdInterfaceReadoutRoute: () => ({ platform: "windows", route: "unconfirmed" }),
  getObdInterfaceStrategyNote: () => "", getSelectedObdInterfaceLabel: () => "ELM327",
  getObdInterfaceSelectionNote: () => "", getObdDevelopmentOperationNote: () => "",
  getObdAvailableReadoutNote: () => "", renderObdSetupActionButtons() {},
  renderObdPreviewButtons() {}, renderObdWorkflowGuide() {}
});
vm.runInContext(connectionGuide, context);
for (const mode of ["simple", "details"]) {
  context.obdUiMode = mode;
  for (const automatic of ["setup", "results", "connect"]) {
    context.getObdAutoStage = () => automatic;
    context.renderObdStageView("setup");
    context.syncObdVehicleInput();
    assert.equal(context.activeObdStage, "setup", "Vehicle sync through access gate left setup");
    assert.equal(context.obdSetupPanel.hidden, false);
    assert.equal(context.obdDevSession.lastSession, session);
  }
}
assert.ok(connectionGuide.includes("renderObdAccessGate(undefined, { preserveStage: true });"), "Connection guide must not run entry navigation on selection changes");
// Use real change handlers and option-rendering chain with synthetic vehicle data.
const vehicleRow = { maker: "Test maker", model: "Test model", model_codes: ["TEST-1"], engine_codes: ["TEST-E"] };
Object.assign(context, {
  dataStore: { vehicleInputOptions: [vehicleRow] }, MANUAL_VEHICLE_VALUE: "manual",
  collectUnique: (items) => [...new Set(items)],
  findVehicleOption: (_maker, model) => model === vehicleRow.model ? vehicleRow : null,
  findVehicleYearRanges: () => [{}], toYearOptions: () => ["2020"],
  findApplicableVehicleYearRanges: () => [{ engine_codes: vehicleRow.engine_codes }],
  replaceSelectOptions: (select, _placeholder, items) => { select.value = ""; select.options = [...items]; },
  appendSelectOption: (select, value) => select.options.push(value)
});
const fields = ["obdVehicleMakerSelect", "obdVehicleModelSelect", "obdVehicleModelCodeSelect", "obdVehicleYearSelect", "obdVehicleYearManualInput", "obdVehicleEngineCodeSelect", "obdVehicleMarketSelect", "obdVehicleProductionDateInput", "obdVehicleManualInput", "obdInterfaceSelect"];
for (const name of fields) {
  context[name] = { value: "", options: [], handlers: {}, addEventListener(event, handler) { this.handlers[event] = handler; } };
}
for (const name of ["renderObdVehicleModelOptions", "renderObdVehicleDetailOptions", "renderObdVehicleYearOptions", "updateObdVehicleYearManualVisibility", "renderObdVehicleEngineOptions"]) {
  vm.runInContext(source.match(new RegExp(`function ${name}\\(\\) \\{[\\s\\S]*?\\r?\\n\\}`))[0], context);
}
const bindingsStart = source.indexOf('obdVehicleMakerSelect?.addEventListener("change"');
const bindingsEnd = source.slice(bindingsStart).search(/\r?\n\[\r?\n  obdVehicleMakerSelect/);
assert.ok(bindingsStart >= 0 && bindingsEnd > 0, "Vehicle change bindings were not found");
vm.runInContext(source.slice(bindingsStart, bindingsStart + bindingsEnd), context);
for (const mode of ["simple", "details"]) {
  context.obdUiMode = mode;
  for (const automatic of ["setup", "results"]) {
    context.getObdAutoStage = () => automatic;
    context.renderObdStageView("setup");
    for (const [field, value] of [
      ["obdVehicleMakerSelect", vehicleRow.maker], ["obdVehicleModelSelect", vehicleRow.model],
      ["obdVehicleModelCodeSelect", "TEST-1"], ["obdVehicleYearSelect", "2020"],
      ["obdVehicleEngineCodeSelect", "TEST-E"]
    ]) {
      context[field].value = value;
      context[field].handlers.change();
      assert.equal(context.activeObdStage, "setup", `${mode}/${automatic}/${field} left the vehicle screen`);
      assert.equal(context[field].value, value, "Selected vehicle field was reset");
      assert.equal(context.obdSetupPanel.hidden, false);
      assert.equal(context.obdDevSession.lastSession, session);
    }
    assert.ok(context.obdVehicleModelSelect.options.includes(vehicleRow.model));
    assert.ok(context.obdVehicleModelCodeSelect.options.includes("TEST-1"));
    assert.equal(context.obdVehicleYearManualInput.hidden, true, "Listed year must hide manual year field");
    context.obdVehicleYearSelect.value = "manual";
    context.obdVehicleYearSelect.handlers.change();
    assert.equal(context.obdVehicleYearManualInput.hidden, false, "Manual year choice must reveal its field");
    context.obdVehicleYearManualInput.value = "20x20";
    context.obdVehicleYearManualInput.handlers.input();
    assert.equal(context.obdVehicleYearManualInput.value, "2020");
    assert.equal(context.activeObdStage, "setup", "Manual year input left the vehicle screen");
    context.obdVehicleYearSelect.disabled = true;
    context.updateObdVehicleYearManualVisibility();
    assert.equal(context.obdVehicleYearManualInput.hidden, false, "Unlisted years must allow manual entry");
    context.obdVehicleModelSelect.value = "";
    context.updateObdVehicleYearManualVisibility();
    assert.equal(context.obdVehicleYearManualInput.hidden, true, "Cleared vehicle must hide manual entry");
  }
}
context.obdUiMode = "simple";
context.obdAccessUnlocked = false;
context.renderObdAccessGate({}, { preserveStage: true });
assert.equal(home.hidden, true);
assert.equal(context.obdAccessProtected.hidden, true);
assert.match(html, /id="obdHomeView"[^>]*hidden/);
for (const stage of ["setup", "connect", "results", "readout"]) {
  assert.ok(html.slice(html.indexOf('id="obdHomeView"'), html.indexOf('id="obdSetupPanel"')).includes(`data-obd-stage="${stage}"`));
}
console.log("Scanner navigation: home, back, developer return, event scope, access lock and session retention passed");
