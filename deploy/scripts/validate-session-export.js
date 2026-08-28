import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import "./validate-session-json-policy.js";

const source = fs.readFileSync(new URL("../script.js", import.meta.url), "utf8");
const html = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
const core = vm.createContext({ window: {} });
vm.runInContext(fs.readFileSync(new URL("../obd-readonly.js", import.meta.url), "utf8"), core);
const obd = core.window.ObdReadOnly;
const names = ["hasActiveObdReadoutForExitWarning", "handleObdReadoutBeforeUnload", "syncObdReadoutExitGuard", "handleObdReadoutSessionReplacement", "getObdSessionExportBlockReason", "renderObdSessionExportControls", "setObdSessionExportStatus", "downloadObdSessionJson"];
const code = names.map((name) => source.match(new RegExp(`function ${name}\\([^)]*\\) \\{[\\s\\S]*?\\r?\\n\\}`))?.[0] || assert.fail(`Missing ${name}`)).join("\n");
let checks = 0;
const check = (condition, message) => { assert.ok(condition, message); checks += 1; };

function client(session = { source: "web_serial" }) {
  const calls = { blobs: [], clicks: 0, removed: 0, revoked: [], timers: [], build: 0, listeners: new Set(), attached: 0, detached: 0 };
  const options = {};
  const buttons = [{}, {}];
  const statuses = [{}, {}];
  const fail = (stage) => { if (options.failure === stage) throw new Error(stage); };
  const c = vm.createContext({
    obdDevSession: { lastSession: session, connectionState: "disconnected" },
    obdReadoutExitGuardAttached: false,
    renderObdReadoutVehicle: () => {},
    obdBridgeOperation: null, obdScannerImportOperation: null, obdSerialConnectPending: false, obdSerialDisconnectOperation: null,
    window: {
      addEventListener: (event, handler) => { assert.equal(event, "beforeunload"); calls.attached += 1; calls.listeners.add(handler); },
      removeEventListener: (event, handler) => { assert.equal(event, "beforeunload"); calls.detached += 1; calls.listeners.delete(handler); },
      ObdReadOnly: { buildBridgeSessionExportPayload: (value) => {
      calls.build += 1; fail("build");
      if (options.payload) return options.payload;
      return obd.buildBridgeSessionExportPayload(value);
    } } },
    Blob: class extends Blob { constructor(parts, settings) { fail("blob"); super(parts, settings); } },
    URL: { createObjectURL: (blob) => { fail("url"); calls.blobs.push(blob); return "blob:test"; }, revokeObjectURL: (url) => calls.revoked.push(url) },
    setTimeout: (callback) => { calls.timers.push(callback); },
    document: {
      querySelectorAll: (selector) => selector === "[data-obd-session-export]" ? buttons : statuses,
      createElement: () => { fail("element"); return {
        click() { fail("click"); calls.clicks += 1; calls.filename = this.download; },
        remove() { calls.removed += 1; }
      }; },
      body: { appendChild: () => fail("append") }
    }
  });
  vm.runInContext(code, c);
  return { c, calls, options, buttons, statuses };
}

check((html.match(/data-obd-session-export disabled/g) || []).length === 2, "Both import and OBD result surfaces need a disabled-until-ready export command");
check(source.includes('button.addEventListener("click", downloadObdSessionJson)'), "Export controls must be connected to the real handler");
const openBinding = source.split(/\r?\n/).find((line) => line.startsWith('document.querySelector("#obdSessionOpenButton")'));
check(Boolean(openBinding), "Results file-open command must be bound");
let chooseFile = null;
let filePickerCalls = 0;
vm.runInNewContext(openBinding, {
  document: { querySelector: (selector) => {
    check(selector === "#obdSessionOpenButton", "File-open binding targets the wrong command");
    return { addEventListener: (event, handler) => { check(event === "click", "File picker must require a click"); chooseFile = handler; } };
  } },
  obdImportFileInput: { click: () => { filePickerCalls += 1; } }
});
check(filePickerCalls === 0, "Initializing results must not open a file picker");
chooseFile();
check(filePickerCalls === 1, "Results file-open command must reuse the original file input");
const resultsHtml = html.split('id="obdStageResultsView"')[1].split('id="obdStageDetailsView"')[0];
check(resultsHtml.includes('id="obdSessionOpenButton"') && html.split('id="obdSessionOpenButton"').length === 2, "File-open command must occur once inside results");
check(html.split('id="obdImportFileInput"').length === 2 && source.includes('obdImportFileInput?.addEventListener("change", importObdScannerFile)'), "File-open command must retain the single existing import path");
for (const blocked of ["none", "bridge", "import", "connect", "cleanup", "read", "initialize", "scan", "opening", "preview", "missing-api", "array", "empty", "rejected"]) {
  const { c, calls, buttons, statuses } = client();
  if (blocked === "none") c.obdDevSession.lastSession = null;
  if (blocked === "bridge") c.obdBridgeOperation = {};
  if (blocked === "import") c.obdScannerImportOperation = {};
  if (blocked === "connect") c.obdSerialConnectPending = true;
  if (blocked === "cleanup") c.obdSerialDisconnectOperation = {};
  if (blocked === "read") c.obdDevSession.readInProgress = true;
  if (blocked === "initialize") c.obdDevSession.initializing = true;
  if (blocked === "scan") c.obdDevSession.coreScanInProgress = true;
  if (blocked === "opening") c.obdDevSession.connectionState = "opening";
  if (blocked === "preview") c.obdDevSession.lastSession.preview_mode = true;
  if (blocked === "missing-api") c.window.ObdReadOnly = {};
  if (blocked === "array") c.obdDevSession.lastSession = [];
  if (blocked === "empty") c.obdDevSession.lastSession = {};
  if (blocked === "rejected") c.obdDevSession.lastSession.accepted = false;
  c.renderObdSessionExportControls();
  check(calls.listeners.size === (["none", "preview", "array", "empty", "rejected"].includes(blocked) ? 0 : 1), `${blocked}: exit warning incorrectly depends on export availability`);
  check(buttons.every((button) => button.disabled && button.title), `${blocked}: blocked export control must state its reason`);
  check(c.downloadObdSessionJson() === false && calls.build === 0 && calls.clicks === 0 && statuses.every((status) => status.textContent), `${blocked}: blocked handler must not produce a file`);
}

for (const failure of ["build", "blob", "url", "element", "append", "click", "serialization", "invalid", "oversize"]) {
  const { c, calls, options, statuses } = client();
  const original = c.obdDevSession.lastSession;
  const before = JSON.stringify(original);
  c.syncObdReadoutExitGuard();
  options.failure = failure;
  if (failure === "serialization") { options.payload = { schema_version: "bridge_session_export_v1", session: {} }; options.payload.self = options.payload; }
  if (failure === "invalid") options.payload = {};
  if (failure === "oversize") options.payload = { schema_version: "bridge_session_export_v1", session: { text: "x".repeat(2000000) } };
  check(c.downloadObdSessionJson() === false && calls.clicks === 0, `${failure}: a failed export must not report success`);
  check(calls.listeners.size === 1, `${failure}: failed download removed exit protection`);
  check(c.obdDevSession.lastSession === original && JSON.stringify(original) === before && statuses.every((status) => status.textContent.includes("保持") || status.textContent.includes("変更していません")), `${failure}: original result must be preserved`);
  calls.timers.forEach((callback) => callback());
  check(calls.revoked.length === calls.blobs.length, `${failure}: created object URL leaked`);
}

const sample = obd.buildDiagnosticScanSession({
  source: "web_serial", session_id: "export-roundtrip", capturedAt: "2026-08-27T00:00:00Z",
  vehicleProfile: { maker: "TEST", model: "Vehicle", modelCode: "MODEL" },
  dtcSnapshot: { source: "web_serial", dtcs: [{ code: "P0171", ecu: "7E8", status: "stored" }], codes: ["P0171"], dtcReadoutStatus: "reported" },
  livePidSnapshot: { source: "web_serial", monitorValues: [{ id: "engine_rpm", label: "Engine RPM", value: 800, unit: "rpm" }], livePidReadoutStatus: "reported" },
  freezeFrameSnapshot: { triggerDtc: "P0171", freezeFrameReadoutStatus: "reported", monitorValues: [{ id: "engine_speed", label: "Engine RPM", value: 700, unit: "rpm" }] }
});
sample.vehicleProfile.vin = "JTDBR32E720123456";
sample.rawText = "unretained raw vehicle data";
sample.pairingToken = "private-connection-token";
const { c, calls, buttons, statuses } = client(sample);
c.obdDevSession.previewMode = "previous-preview";
const before = JSON.stringify(sample);
c.renderObdSessionExportControls();
check(buttons.every((button) => !button.disabled), "Completed results must be downloadable without an active connection");
check(c.downloadObdSessionJson() === true && calls.clicks === 1, "Real session export failed");
check(calls.listeners.size === 1 && c.hasActiveObdReadoutForExitWarning(), "Download initiation or stale global preview state removed exit protection");
const text = await calls.blobs[0].text();
const payload = JSON.parse(text);
for (const size of [2500000, 4000000, 4000001]) {
  const { c, calls, options } = client(sample);
  Object.assign(c.window.ObdReadOnly, { diagnosticSessionMaxBytes: obd.diagnosticSessionMaxBytes, getDiagnosticSessionJsonPolicy: obd.getDiagnosticSessionJsonPolicy });
  const archive = obd.buildBridgeSessionExportPayload(sample);
  archive.padding = "";
  archive.padding = "x".repeat(size - Buffer.byteLength(JSON.stringify(archive), "utf8"));
  options.payload = archive;
  check(c.downloadObdSessionJson() === (size <= 4000000), "Session archive export does not match the shared byte limit");
  check(calls.clicks === Number(size <= 4000000), "Oversized session created a download, or valid session failed to download");
  calls.timers.forEach((callback) => callback());
}
{
  const { c, calls, options } = client(sample);
  Object.assign(c.window.ObdReadOnly, { diagnosticSessionMaxBytes: obd.diagnosticSessionMaxBytes, getDiagnosticSessionJsonPolicy: obd.getDiagnosticSessionJsonPolicy });
  options.payload = { schema_version: "bridge_session_export_v1", session: [] };
  check(c.downloadObdSessionJson() === false && calls.clicks === 0, "Invalid session envelope was downloadable");
}
{
  const { c, calls, options } = client(sample);
  c.window.ObdReadOnly.diagnosticSessionMaxBytes = 4000000;
  options.payload = { schema_version: "bridge_session_export_v1", session: { text: "x".repeat(2500000) } };
  check(c.downloadObdSessionJson() === false && calls.clicks === 0, "Missing shared policy allowed an archive the legacy importer cannot open");
}
const restored = obd.buildDiagnosticScanSessionFromJson(text);
check(payload.schema_version === "bridge_session_export_v1" && payload.vehicle_command_enabled === false && payload.retained_raw_text === false, "Archive must use the existing read-only export contract");
check(!text.includes("JTDBR32E720123456") && !text.includes("private-connection-token") && !text.includes("unretained raw vehicle data"), "Archive leaked identifying or raw connection data");
check(restored?.dtcSnapshot?.dtcs?.some((dtc) => dtc.code === "P0171" && dtc.ecu === "7E8" && dtc.status === "stored"), "Saved archive must retain ECU-scoped DTC state on reopening");
check(restored?.vehicleProfile?.model === "Vehicle" && restored?.livePidSnapshot?.monitorValues?.some((value) => Number(value.value) === 800), "Saved archive lost vehicle or live PID values");
check(restored?.freezeFrameSnapshot?.monitorValues?.some((value) => Number(value.value) === 700), "Saved archive lost freeze-frame values");
check(restored?.vehicleApplicability?.status === "unknown" && restored?.vehicleCommandEnabled === false, "Reopening a profile must not establish vehicle applicability or allow commands");
check(JSON.stringify(sample) === before && c.obdDevSession.lastSession === sample, "Export mutated the live session");
check(/^diagnostic-session-[0-9TZ-]+\.json$/.test(calls.filename) && !calls.filename.includes("Vehicle"), "Filename must contain no vehicle identifiers");
check(statuses.every((status) => status.textContent.includes("開始")) && calls.removed === 1, "Browser handoff must be reported accurately and its link removed");
calls.timers.forEach((callback) => callback());
check(calls.revoked.join() === "blob:test", "Successful export leaked its object URL");
for (const [profileKey, applicabilityKey] of [["vehicleProfile", "vehicleApplicability"], ["vehicle_profile", "vehicle_applicability"]]) {
  for (const mode of ["profile", "separate", "applicability", "vin-only"]) {
    const profile = mode === "applicability" ? null : mode === "vin-only" ? { vin: "JTDBR32E720123456" }
      : { maker: "Profile Maker", model: "Profile Model", engineCode: "ENGINE-A", vin: "JTDBR32E720123456" };
    const applicability = ["separate", "applicability"].includes(mode)
      ? { status: "manual", maker: "Applicability Maker", model: "Applicability Model", engineCode: "ENGINE-B" }
      : { status: "unknown" };
    const input = { schema_version: "bridge_session_export_v1", session: {
      source: "web_serial", [profileKey]: profile, [applicabilityKey]: applicability,
      dtc_snapshot: { dtcReadoutStatus: "reported", codes: [], dtcs: [] }
    } };
    const result = obd.buildDiagnosticScanSessionFromJson(JSON.stringify(input));
    check(mode === "vin-only" ? result?.vehicleProfile === null
      : result?.vehicleProfile?.model === (mode === "applicability" ? "Applicability Model" : "Profile Model"), `${profileKey}/${mode}: vehicle profile precedence changed`);
    check(result?.vehicleApplicability?.status === applicability.status && result?.vehicleCommandEnabled === false, `${mode}: profile restoration changed applicability or command permissions`);
    check(!JSON.stringify(result.vehicleProfile).includes("JTDBR32E720123456"), `${mode}: profile restoration retained VIN`);
    if (mode === "separate") check(result.vehicleApplicability.engineCode === "ENGINE-B" && result.vehicleProfile.engineCode === "ENGINE-A", "Vehicle profile must not rewrite separate applicability evidence");
  }
}
for (const session of [null, undefined, [], {}, "invalid", { accepted: false }, { ok: false }, { blocked: true },
  { previewMode: true }, { preview_mode: true }, { source: "interface_preview" }, { source_type: "interface_preview" }]) {
  const test = client(session ?? null);
  test.c.syncObdReadoutExitGuard();
  let prevented = false;
  const event = { preventDefault: () => { prevented = true; } };
  test.c.handleObdReadoutBeforeUnload(event);
  check(test.calls.listeners.size === 0 && !prevented && event.returnValue === undefined, "Empty, rejected or preview data prompted on exit");
}
for (const session of [{ source: "scanner_text", dtcSnapshot: { dtcs: [], dtcReadoutStatus: "reported" } },
  { source: "web_serial", connectionStatus: { status: "failed" } }, restored]) {
  const test = client(session);
  test.c.obdDevSession.previewMode = "stale-preview";
  test.c.syncObdReadoutExitGuard();
  test.c.syncObdReadoutExitGuard();
  const handler = [...test.calls.listeners][0];
  const event = { prevented: 0, preventDefault() { this.prevented += 1; } };
  handler(event);
  check(event.prevented === 1 && event.returnValue === true && test.calls.attached === 1, "Retained results did not prompt exactly once");
  check(test.calls.build === 0 && test.calls.blobs.length === 0 && test.calls.timers.length === 0 && test.c.obdDevSession.lastSession === session, "Exit warning exported, scheduled work, or replaced session data");
  test.c.obdDevSession.lastSession = null;
  test.c.syncObdReadoutExitGuard();
  test.c.syncObdReadoutExitGuard();
  handler({ preventDefault: () => assert.fail("Stale handler prompted after session removal") });
  check(test.calls.listeners.size === 0 && test.calls.detached === 1, "Empty state retained a browser lifecycle listener");
}
const unserializable = { source: "web_serial", toJSON: () => assert.fail("Exit warning serialized a session") };
unserializable.self = unserializable;
const circular = client(unserializable);
circular.c.syncObdReadoutExitGuard();
circular.c.handleObdReadoutBeforeUnload({ preventDefault() {} });
check(circular.calls.listeners.size === 1 && circular.calls.build === 0, "Unserializable results lost exit protection");
const assignments = [...source.matchAll(/obdDevSession\.lastSession = /g)];
check(assignments.length === 10, "Session assignment audit must be updated when producers change");
for (const assignment of assignments) {
  const end = source.indexOf(";", assignment.index);
  check(source.slice(end + 1).trimStart().startsWith("handleObdReadoutSessionReplacement();"), "Session replacement must synchronize exit protection and clear stale export status before rendering or awaiting");
}
for (const next of [{ source: "web_serial", sessionId: "same-id", value: 900 }, { source: "interface_preview" }, null, {}]) {
  const previous = { source: "web_serial", sessionId: "same-id", value: 800 };
  const test = client(previous);
  test.c.renderObdSessionExportControls();
  for (const notice of ["保存を開始しました", "JSON保存を開始できませんでした", "再取込上限を超えています"]) {
    test.c.setObdSessionExportStatus(notice);
    test.c.renderObdSessionExportControls();
    check(test.statuses.every((status) => status.textContent === notice), "Routine render removed the current session's export notification");
    test.c.obdDevSession.lastSession = next;
    const before = JSON.stringify(next);
    test.c.handleObdReadoutSessionReplacement();
    check(test.statuses.every((status) => status.textContent === "") && test.c.obdDevSession.lastSession === next && JSON.stringify(next) === before,
      "Session replacement retained stale export status or mutated the new session");
    check(test.calls.listeners.size === (next?.source === "web_serial" ? 1 : 0), "Export status cleanup changed exit protection");
    check(test.calls.build === 0 && test.calls.blobs.length === 0 && test.calls.clicks === 0 && test.calls.timers.length === 0,
      "Session presentation update initiated an export or scheduled work");
  }
}
const unchanged = client({ source: "web_serial" });
unchanged.c.setObdSessionExportStatus("current-notice");
unchanged.c.obdScannerImportOperation = {};
unchanged.c.renderObdSessionExportControls();
unchanged.c.obdScannerImportOperation = null;
unchanged.c.renderObdSessionExportControls();
check(unchanged.statuses.every((status) => status.textContent === "current-notice"), "Import busy/idle refresh removed a same-session notification");
console.log(`Session export checks: ${checks} / Errors: 0 / Fixture bytes: ${calls.blobs[0].size}`);
