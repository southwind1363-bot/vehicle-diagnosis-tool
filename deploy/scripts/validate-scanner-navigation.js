import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync(new URL("../script.js", import.meta.url), "utf8");
const html = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
const css = fs.readFileSync(new URL("../style.css", import.meta.url), "utf8");
assert.ok(html.includes('id="obdStageTitle" class="obd-expert-only"'));
assert.ok(css.includes('#obd-panel[data-obd-ui-mode="simple"] .obd-eyebrow'));
assert.ok(css.includes('#obd-panel[data-obd-ui-mode="simple"] .obd-scan-context strong'));
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
vm.runInContext(source.slice(source.indexOf("function getObdParentStage("), source.indexOf("function setObdStage(")), context);
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
  ["connect", "results", "simple", "results"],
  ["setup", "connect", "simple", "connect"],
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
assert.equal(context.obdDevSession.lastSession, session);
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
context.obdAccessUnlocked = false;
context.renderObdAccessGate({});
assert.equal(home.hidden, true);
assert.equal(context.obdAccessProtected.hidden, true);
assert.match(html, /id="obdHomeView"[^>]*hidden/);
for (const stage of ["setup", "connect", "results", "readout"]) {
  assert.ok(html.slice(html.indexOf('id="obdHomeView"'), html.indexOf('id="obdSetupPanel"')).includes(`data-obd-stage="${stage}"`));
}
console.log("Scanner navigation: home, back, developer return, event scope, access lock and session retention passed");
