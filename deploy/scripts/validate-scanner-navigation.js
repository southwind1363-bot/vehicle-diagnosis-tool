import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync(new URL("../script.js", import.meta.url), "utf8");
const html = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
const css = fs.readFileSync(new URL("../style.css", import.meta.url), "utf8");
assert.equal((html.match(/name="obd-readout-task"/g) || []).length, 5, "Only the five readout groups share exclusive expansion");
assert.match(html, /<details class="obd-dev-task" name="obd-readout-task" open>\s*<summary>接続・アダプター確認<\/summary>/);
assert.match(html, /<details class="obd-dev-task" id="obdMeasurementConditions">/, "Nested measurement conditions must remain independent");
let navigatedMode = "";
let focusedControl = "";
const navigationTarget = name => ({ focus() { focusedControl = name; }, scrollIntoView() {}, click() { assert.fail("Navigation must not execute a readout"); } });
const navigationContext = vm.createContext({
  setObdUiMode(mode) { navigatedMode = mode; }, revealObdControlGroup() {},
  obdAccessUnlocked: false, obdDevModeUnlocked: false,
  obdAccessPasswordInput: navigationTarget("access"), obdDevPasswordInput: navigationTarget("developer"),
  obdDevControls: navigationTarget("controls"), obdDevSessionSummary: null
});
vm.runInContext(source.slice(source.indexOf("function navigateToObdReadoutControl("), source.indexOf("function revealObdControlGroup(")), navigationContext);
const readoutTarget = navigationTarget("readout");
for (const [access, developer, expected] of [[false, false, "access"], [true, false, "developer"], [true, true, "readout"]]) {
  navigationContext.obdAccessUnlocked = access;
  navigationContext.obdDevModeUnlocked = developer;
  navigationContext.navigateToObdReadoutControl(readoutTarget);
  assert.equal(navigatedMode, "details");
  assert.equal(focusedControl, expected);
}
readoutTarget.disabled = true;
readoutTarget.closest = () => ({ querySelector: () => navigationTarget("group") });
navigationContext.navigateToObdReadoutControl(readoutTarget);
assert.equal(focusedControl, "group", "Disabled controls should focus their visible group heading");
assert.ok(source.includes("navigateToObdReadoutControl(targetButton);"));
assert.match(css, /#obdDevControls > \.obd-dev-task > \.obd-dev-controls\s*\{\s*display: grid;\s*grid-template-columns: repeat\(auto-fit, minmax\(min\(100%, 240px\), 1fr\)\);/);
const developerButtonStyle = css.match(/#obdDevControls \.obd-dev-controls > button\s*\{([^}]+)\}/)?.[1] || "";
for (const rule of ["min-width: 0", "min-height: 48px", "white-space: normal", "overflow-wrap: anywhere"]) {
  assert.ok(developerButtonStyle.includes(rule), "Developer touch controls must fit narrow screens: " + rule);
}
assert.equal((html.match(/id="obdDevStatus"/g) || []).length, 1, "Keep one authoritative developer status region");
assert.equal((html.match(/id="obdDevLockButton"/g) || []).length, 1);
assert.ok(html.indexOf('id="obdDevLockButton"') < html.indexOf('id="obdDevPasswordInput"'), "Developer lock must remain outside password entry");
assert.match(css, /#obdDeveloperGatePanel:has\(#obdDevLockButton:enabled\) \.obd-dev-gate:has\(> #obdDevUnlockButton:disabled\)\s*\{\s*display: none;/);
assert.ok(html.indexOf('id="obdDevStatus"') < html.indexOf('id="obdDevPasswordInput"'), "Status must appear before password entry and readout controls");
assert.match(html, /<p id="obdDevStatus" class="data-status" role="status" aria-atomic="true">/);
const conditionSummary = { textContent: "" };
const conditionControl = (value = "unspecified", textContent = "未指定") => ({ value, selectedOptions: [{ textContent }] });
const conditionsContext = vm.createContext({
  document: { querySelector: () => conditionSummary },
  obdLiveObservationCondition: conditionControl(), obdLiveThermalState: conditionControl(),
  obdVehicleMotionState: conditionControl(), obdTransmissionPosition: conditionControl(),
  obdAccessoryLoadState: conditionControl(), obdSameVehicleConfirmed: { checked: false }
});
vm.runInContext(source.slice(source.indexOf("function renderObdMeasurementConditionSummary("), source.indexOf("function handleObdUnlockKeydown(")), conditionsContext);
conditionsContext.renderObdMeasurementConditionSummary();
assert.equal(conditionSummary.textContent, "未指定");
conditionsContext.obdLiveThermalState = conditionControl("warmed_up", "暖機後");
conditionsContext.obdTransmissionPosition = conditionControl("park", "P");
conditionsContext.obdSameVehicleConfirmed.checked = true;
conditionsContext.renderObdMeasurementConditionSummary();
assert.equal(conditionSummary.textContent, "暖機後 / P / 同一車両確認済み");
assert.equal(conditionsContext.obdLiveThermalState.value, "warmed_up", "Summary rendering must not change comparison inputs");
conditionsContext.obdSameVehicleConfirmed.checked = false;
conditionsContext.renderObdMeasurementConditionSummary();
assert.equal(conditionSummary.textContent, "暖機後 / P");
const unlockKeys = vm.createContext({});
vm.runInContext(source.slice(source.indexOf("function handleObdUnlockKeydown("), source.indexOf("function renderObdDeveloperPasswordState(")), unlockKeys);
for (const [properties, disabled, expectedClicks, expectedPrevented] of [
  [{ key: "Enter" }, false, 1, 1], [{ key: "Enter" }, true, 0, 1],
  [{ key: "Enter", repeat: true }, false, 0, 1],
  [{ key: "Enter", isComposing: true }, false, 0, 0],
  [{ key: "Enter", keyCode: 229 }, false, 0, 0], [{ key: "a" }, false, 0, 0]
]) {
  let clicks = 0;
  let prevented = 0;
  unlockKeys.handleObdUnlockKeydown({ ...properties, preventDefault() { prevented += 1; } }, { disabled, click() { clicks += 1; } });
  assert.equal(clicks, expectedClicks);
  assert.equal(prevented, expectedPrevented);
}
for (const kind of ["Access", "Dev"]) {
  assert.ok(source.replaceAll("\r\n", "\n").includes(`obd${kind}PasswordInput.addEventListener("keydown", (event) => {\n  handleObdUnlockKeydown(event, obd${kind}UnlockButton);`), "Both password fields must use guarded button dispatch");
}
for (const [id, route] of Object.entries({
  obdDevBridgeStatusButton: "ローカルブリッジ", obdDevIdentifyButton: "Web Serial",
  obdDevBridgeVciButton: "ローカルブリッジ", obdDevReadDtcButton: "Web Serial",
  obdDevSnapshotButton: "Web Serial", obdDevBridgeFreezeFrameButton: "ローカルブリッジ",
  obdDevBridgeMonitorButton: "ローカルブリッジ"
})) {
  const label = html.match(new RegExp(`<button[^>]+id="${id}"[^>]*>([^<]+)</button>`))?.[1];
  assert.ok(label?.includes(`(${route})`), "Readout button must identify its actual transport: " + id);
}
const accessMarkup = html.slice(html.indexOf('<section id="obdAccessGatePanel"'), html.indexOf('<div id="obdAccessProtected"'));
assert.ok(accessMarkup.indexOf('id="obdAccessLockButton"') < accessMarkup.indexOf('class="obd-dev-gate"'), "Lock must remain outside collapsed password entry");
assert.equal((html.match(/id="obdAccessLockButton"/g) || []).length, 1);
assert.match(css, /#obdAccessGatePanel:has\(#obdAccessLockButton:enabled\) \.obd-dev-gate:has\(> #obdAccessUnlockButton:disabled\)\s*\{\s*display: none;/, "Password entry must remain visible while password verification is pending");
const serialSettings = html.slice(html.indexOf('<details class="obd-dev-task" id="obdSerialSettings">'), html.indexOf('id="obdBridgePairingControls"'));
assert.ok(serialSettings.includes('id="obdDevBaudRate"'), "Serial speed belongs to collapsed communication settings");
assert.ok(!serialSettings.includes('id="obdDevPasswordInput"') && !serialSettings.includes('id="obdDevUnlockButton"'), "Password entry must stay outside communication settings");
assert.equal((html.match(/id="obdDevBaudRate"/g) || []).length, 1);
assert.match(css, /#obdMeasurementConditions > \.obd-dev-controls\s*\{\s*display: grid;/);
const revealContext = vm.createContext({});
vm.runInContext(source.slice(source.indexOf("function revealObdControlGroup("), source.indexOf("function triggerObdNextReadoutCandidate(")), revealContext);
const lockedContainer = { tagName: "DIV", hidden: true, parentElement: null };
const outerGroup = { tagName: "DETAILS", open: false, parentElement: lockedContainer };
const innerGroup = { tagName: "DETAILS", open: false, parentElement: outerGroup };
const disabledControl = { disabled: true, parentElement: innerGroup, click() { assert.fail("Revealing a group must not execute a command"); } };
revealContext.revealObdControlGroup(disabledControl);
assert.equal(innerGroup.open, true);
assert.equal(outerGroup.open, true);
assert.equal(lockedContainer.hidden, true, "Revealing a group must not bypass access visibility");
assert.equal(disabledControl.disabled, true);
assert.doesNotThrow(() => revealContext.revealObdControlGroup(null));
assert.doesNotThrow(() => revealContext.revealObdControlGroup(disabledControl));
assert.match(source, /revealObdControlGroup\(targetButton\);\s*targetButton\.scrollIntoView/);
assert.match(source, /revealObdControlGroup\(target\);\s*target\?\.scrollIntoView/);
let readoutClicks = 0;
const candidateControl = {
  disabled: true, parentElement: innerGroup,
  scrollIntoView() { assert.equal(innerGroup.open, true, "Open the target group before scrolling"); },
  focus() {}, click() { readoutClicks += 1; }
};
Object.assign(revealContext, {
  OBD_NEXT_READOUT_ACTIONS: { test: { button: () => candidateControl, label: "test" } },
  obdDevStatus: {}, renderObdStageView() {}
});
vm.runInContext(source.slice(source.indexOf("function triggerObdNextReadoutCandidate("), source.indexOf("function formatObdNextReadoutCandidateReason(")), revealContext);
innerGroup.open = false;
revealContext.triggerObdNextReadoutCandidate({ id: "test" });
assert.equal(readoutClicks, 0, "Disabled readout remains blocked after revealing its group");
candidateControl.disabled = false;
revealContext.triggerObdNextReadoutCandidate({ id: "test", savedFromRequest: true, executionEnabled: false });
assert.equal(readoutClicks, 0, "Saved non-executable requests remain blocked");
revealContext.triggerObdNextReadoutCandidate({ id: "test" });
assert.equal(readoutClicks, 1, "Existing enabled readout dispatch remains unchanged");
const measurements = html.slice(html.indexOf("<summary>計測データ・発生時の記録を読む</summary>"), html.indexOf("<summary>排ガス監視の実施状況・テスト結果</summary>"));
for (const id of ["obdDevSnapshotButton", "obdDevBridgeLiveButton", "obdDevBridgeFreezeFrameButton", "obdDevReadFreezeFrameButton"]) {
  assert.ok(measurements.indexOf(`id="${id}"`) >= 0 && measurements.indexOf(`id="${id}"`) < measurements.indexOf('id="obdMeasurementConditions"'), "Readout commands must precede optional comparison conditions");
}
assert.match(measurements, /<details class="obd-dev-task" id="obdMeasurementConditions">/);
for (const id of ["obdLiveObservationCondition", "obdLiveThermalState", "obdVehicleMotionState", "obdTransmissionPosition", "obdAccessoryLoadState", "obdSameVehicleConfirmed"]) {
  assert.equal((html.match(new RegExp(`id="${id}"`, "g")) || []).length, 1);
  assert.ok(measurements.indexOf(`id="${id}"`) > measurements.indexOf('id="obdMeasurementConditions"'), "Comparison fields must remain in the measurement group");
}
const basicReadout = html.slice(html.indexOf("<summary>車両情報・基本読取</summary>"), html.indexOf("<summary>故障コードを読む</summary>"));
assert.ok(basicReadout.includes('id="obdDevReadEcuInfoButton"'));
assert.ok(basicReadout.includes('id="obdDevBridgeEcuInfoButton"'));
const passwordState = vm.createContext({
  OBD_DEV_TOKEN_KEY: "test", obdDevModeUnlocked: false,
  localStorage: { getItem: () => "" },
  obdDevUnlockButton: {}, obdDevPasswordInput: {}
});
vm.runInContext(source.slice(source.indexOf("function renderObdDeveloperPasswordState("), source.indexOf("function renderObdDeveloperGate(")), passwordState);
for (const [token, unlocked, label] of [["", false, "設定して開く"], ["short", false, "設定して開く"], ["configured-test-token", false, "詳細画面を開く"], ["configured-test-token", true, "解除済み"], ["configured-test-token", false, "詳細画面を開く"]]) {
  passwordState.localStorage.getItem = () => token;
  passwordState.obdDevModeUnlocked = unlocked;
  passwordState.renderObdDeveloperPasswordState();
  assert.equal(passwordState.obdDevUnlockButton.textContent, label);
  assert.equal(passwordState.obdDevUnlockButton.disabled, unlocked);
  assert.equal(passwordState.obdDevPasswordInput.disabled, unlocked);
}
passwordState.localStorage.getItem = () => { throw new Error("Storage unavailable"); };
assert.doesNotThrow(() => passwordState.renderObdDeveloperPasswordState());
for (const label of ["接続・アダプター確認", "車両情報・基本読取", "故障コードを読む", "計測データ・発生時の記録を読む", "読取セッションの技術情報", "開発資料・対応予定・通信仕様"]) {
  assert.ok(html.includes(`<summary>${label}</summary>`), "Developer tools must be grouped by task: " + label);
}
assert.match(html, /<details class="obd-dev-task" id="obdDevelopmentReference">/, "Development reference must start collapsed");
assert.match(html, /<\/details>\s*<button id="obdDevDisconnectButton"/, "Disconnect must remain outside collapsed readout groups");
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
assert.match(html, /id="obdSimpleResultNote"[^>]*><\/p>\s*<\/section>\s*<p id="obdResultsEmptyState" class="obd-results-empty obd-simple-only" role="status">/);
assert.ok(css.includes('#obdSimpleResultSummary:not([hidden]) + #obdResultsEmptyState'), "Acquired results, including zero DTCs, must hide the no-session notice");
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
let refreshedMode = "";
context.renderObdDeveloperGate = () => {
  refreshedMode = context.obdUiMode;
  context.renderObdStageView("setup");
};
vm.runInContext(source.slice(source.indexOf("function setObdUiMode("), source.indexOf("function getObdSimpleConnectionLabel(")), context);
context.obdUiMode = "details";
context.setObdUiMode("simple");
assert.equal(context.activeObdStage, "home");
assert.equal(refreshedMode, "simple", "Mode switch must refresh readout availability and status");
assert.equal(context.obdDevSession.lastSession, session);
let disconnected = 0;
context.obdDevSession.port = {};
context.obdDevModeUnlocked = false;
context.disconnectObdDeveloperVci = () => { disconnected += 1; };
context.setObdUiMode("details");
assert.equal(disconnected, 1, "Existing serial shutdown protection must remain in place");
assert.equal(refreshedMode, "details", "Developer entry must refresh its lock and control state");
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
