import assert from "node:assert/strict";
import http from "node:http";
import fs from "node:fs";
import vm from "node:vm";
import { startLocalWorkstation } from "./start-local-workstation.js";

let checks = 0;
const check = (condition, message) => { assert.ok(condition, message); checks += 1; };
const options = { webPort: 0, bridgePort: 0, pairingToken: "workstation-test-token", j2534RegistryText: "" };
const appSource = fs.readFileSync(new URL("../script.js", import.meta.url), "utf8");
const indexSource = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
const clientSource = appSource.slice(appSource.indexOf("async function runObdLocalBridgeRead("), appSource.indexOf("const WEB_SERIAL_ADAPTER_ERROR_LINES"));
function createClient(webUrl, token, fetchRequest = fetch) {
  const context = vm.createContext({
    location: new URL(webUrl), obdDevSession: { bridgeEndpoint: null },
    obdDevModeUnlocked: true, obdBridgePairingToken: "", obdBridgeOperation: null, obdScannerImportOperation: null,
    obdBridgePairingControls: {}, obdBridgePairingInput: { value: "" },
    obdBridgePairingApplyButton: {}, obdBridgePairingClearButton: {}, obdBridgePairingStatus: {},
    obdDevPasswordInput: { value: "" }, obdDevStatus: {},
    sessionStorage: { setItem: () => {}, removeItem: () => {} }, OBD_DEV_MODE_KEY: "test-mode",
    renderObdDeveloperGate: () => {}, clearRequestedInterfaceSelection: () => {},
    obdAccessUnlocked: true, obdAccessPasswordInput: { value: "" },
    OBD_ACCESS_MODE_KEY: "test-access", renderObdAccessGate: () => {},
    localStorage: { getItem: () => token }, generateId: () => "workstation-client-test",
    fetch: fetchRequest, AbortController, setTimeout, clearTimeout
  });
  const constants = ["OBD_DEV_TOKEN_KEY", "OBD_LOCAL_BRIDGE_PORTS", "OBD_LOCAL_BRIDGE_PATHS", "OBD_LOCAL_BRIDGE_TIMEOUT_MS"]
    .map((name) => appSource.match(new RegExp(`const ${name} = [^;]+;`))?.[0]).join("\n");
  vm.runInContext(`${constants}\n${clientSource}`, context);
  vm.runInContext(appSource.slice(appSource.indexOf("function invalidateObdScannerImport("), appSource.indexOf("async function pasteObdScannerImport(")), context);
  vm.runInContext(appSource.slice(appSource.indexOf("async function probeObdLocalBridge("), appSource.indexOf("async function listObdLocalBridgeVci(")), context);
  context.renderObdDeveloperGate = () => {
    context.obdDevStatus.textContent = "DEFAULT_GATE";
    context.renderObdBridgePairingControls();
  };
  for (const name of ["unlockObdDeveloperMode", "lockObdDeveloperMode", "lockObdAccess"]) {
    vm.runInContext(appSource.match(new RegExp(`function ${name}\\(\\) \\{[\\s\\S]*?\\r?\\n\\}`))[0], context);
  }
  for (const name of ["startInterfaceCandidateCheck", "startGeneralBridgeCheck", "previewSelectedObdInterface", "prepareSelectedObdInterface", "loadObdInterfacePreviewSample", "connectObdDeveloperVci"]) {
    vm.runInContext(appSource.match(new RegExp(`(?:async )?function ${name}\\([^)]*\\) \\{[\\s\\S]*?\\r?\\n\\}`))[0], context);
  }
  return context;
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}

function startPendingScannerAcquisition(client, kind, input = { value: "selected.json", files: [{ name: "selected.json", size: 100, type: "application/json" }] }) {
  if (kind === "file") {
    let reader;
    client.FileReader = class {
      constructor() { reader = this; }
      readAsText() {}
    };
    client.importObdScannerFile({ currentTarget: input });
    return {
      input,
      complete: async (value) => { reader.result = value; reader.onload(); },
      fail: async () => { reader.onerror(); }
    };
  }
  const clipboard = deferred();
  client.navigator = { clipboard: { readText: () => clipboard.promise } };
  const pending = client.pasteObdScannerImport();
  return {
    complete: async (value) => { clipboard.resolve(value); await pending; },
    fail: async () => { clipboard.reject(new Error("clipboard_denied")); await pending; }
  };
}

async function validateScannerAcquisitionOrder(webUrl) {
  for (const kind of ["file", "clipboard"]) {
    for (const action of ["clear", "analyze", "internal-merge", "access-lock", "details-lock", "new-session", "manual-input", "edit-back", "vehicle-change", "empty-scan"]) {
      for (const outcome of ["success", "error"]) {
        const client = addScannerImportHarness(createClient(webUrl, options.pairingToken));
        const previous = { source: "previous" };
        client.obdDevSession.lastSession = previous;
        if (action === "empty-scan") {
          client.obdScannerText.value = "";
          client.obdDevSession.lastSession = null;
        }
        const pending = startPendingScannerAcquisition(client, kind);
        if (action === "clear") client.clearObdScannerImport();
        if (action === "analyze") client.analyzeObdScannerImport();
        if (action === "internal-merge") client.analyzeObdScannerImport({ mergeWithCurrentSession: true });
        if (action === "access-lock") client.lockObdAccess();
        if (action === "details-lock") client.lockObdDeveloperMode();
        if (action === "new-session") client.obdDevSession.lastSession = { source: "new-readout" };
        if (["manual-input", "edit-back"].includes(action)) {
          client.editScannerText("edited input");
          if (action === "edit-back") client.editScannerText("valid import");
        }
        if (action === "vehicle-change") client.syncObdVehicleInput();
        if (action === "empty-scan") client.beginWebSerialReadoutProfile("initial_diagnostic");
        const expectedText = client.obdScannerText.value;
        const expectedSession = client.obdDevSession.lastSession;
        const expectedStatus = client.obdImportStatus.textContent;
        if (outcome === "success") await pending.complete("old input");
        else await pending.fail();
        check(client.obdScannerText.value === expectedText && client.obdDevSession.lastSession === expectedSession && client.obdImportStatus.textContent === expectedStatus && client.obdScannerImportOperation === null, `${kind} ${outcome} restored input or status after ${action}`);
      }
    }
    for (const newerKind of ["file", "clipboard"]) {
      const client = addScannerImportHarness(createClient(webUrl, options.pairingToken));
      const older = startPendingScannerAcquisition(client, kind);
      const newer = startPendingScannerAcquisition(client, newerKind, older.input);
      await older.complete("old input");
      check(client.obdScannerText.value === "valid import" && (!newer.input || newer.input.value === "selected.json"), `${kind} old completion reset the newer ${newerKind} input`);
      await newer.complete("new input");
      const imported = client.obdDevSession.lastSession;
      const status = client.obdImportStatus.textContent;
      await older.fail();
      check(client.obdScannerText.value === "new input" && imported && client.obdDevSession.lastSession === imported && client.obdImportStatus.textContent === status, `Newer ${newerKind} import was not preserved after older ${kind} failure`);
    }
    for (const selection of ["cancel", "invalid-type", "oversize"]) {
      const client = addScannerImportHarness(createClient(webUrl, options.pairingToken));
      const pending = startPendingScannerAcquisition(client, kind);
      const file = selection === "cancel" ? null : { name: selection === "invalid-type" ? "file.exe" : "large.json", size: selection === "oversize" ? 2000001 : 1 };
      client.importObdScannerFile({ currentTarget: { value: "new-file", files: file ? [file] : [] } });
      const status = client.obdImportStatus.textContent;
      await pending.complete("pending input");
      check(selection === "cancel" ? client.obdScannerText.value === "pending input" : client.obdScannerText.value === "valid import" && client.obdImportStatus.textContent === status, `${selection} mishandled a pending ${kind} acquisition`);
    }
    for (const outcome of ["empty", "error", "parser-error"]) {
      const client = addScannerImportHarness(createClient(webUrl, options.pairingToken));
      const previous = { source: "previous" };
      client.obdDevSession.lastSession = previous;
      if (outcome === "parser-error") client.window.ObdReadOnly.buildDiagnosticScanSession = () => { throw new Error("private parser detail"); };
      const pending = startPendingScannerAcquisition(client, kind);
      if (outcome === "error") await pending.fail();
      else await pending.complete(outcome === "empty" ? "  " : "new input");
      const status = client.obdImportStatus.textContent;
      check(client.obdDevSession.lastSession === previous && client.obdScannerImportOperation === null && status && !status.includes("private") && (outcome !== "parser-error" || status.includes("解析できません")), `${kind} ${outcome} lost its failure message or changed the session`);
    }
  }
  for (const failure of ["constructor", "read"]) {
    const client = addScannerImportHarness(createClient(webUrl, options.pairingToken));
    client.FileReader = class {
      constructor() { if (failure === "constructor") throw new Error("failed"); }
      readAsText() { throw new Error("failed"); }
    };
    const input = { value: "selected.json", files: [{ name: "selected.json", size: 1 }] };
    client.importObdScannerFile({ currentTarget: input });
    check(client.obdScannerImportOperation === null && input.value === "" && client.obdImportStatus.textContent.includes("ファイルを読めません"), `Synchronous FileReader ${failure} failure escaped cleanup`);
  }
}

async function validateScannerParserIntegration(webUrl) {
  const core = vm.createContext({ window: {}, console });
  vm.runInContext(fs.readFileSync(new URL("../obd-readonly.js", import.meta.url), "utf8"), core);
  const obd = core.window.ObdReadOnly;
  const session = obd.buildDiagnosticScanSession({ dtcSnapshot: { dtcs: [{ code: "P0171", status: "stored", ecu: "7E8" }] } });
  const json = JSON.stringify(obd.buildBridgeSessionExportPayload(session));
  for (const kind of ["file", "clipboard"]) {
    const client = addScannerImportHarness(createClient(webUrl, options.pairingToken));
    client.window.ObdReadOnly = obd;
    client.buildObdDtcDisplayKey = (dtc) => JSON.stringify(dtc);
    client.createObdDtcCard = (dtc) => dtc;
    client.obdDetectedCodes.appendChild = () => {};
    const pending = startPendingScannerAcquisition(client, kind);
    await pending.complete(json);
    const imported = client.obdDevSession.lastSession;
    check(imported?.dtcSnapshot?.dtcs?.some((dtc) => dtc.code === "P0171" && dtc.ecu === "7E8" && dtc.status === "stored") && imported.vehicleCommandEnabled === false && client.obdScannerImportOperation === null, `${kind} acquisition failed to preserve a real exported DTC session`);
    const stale = startPendingScannerAcquisition(client, kind);
    client.clearObdScannerImport();
    await stale.complete(json);
    check(client.obdDevSession.lastSession === imported && client.obdScannerText.value === "", `${kind} stale acquisition reparsed a real archived session after clear`);
  }
}

function addScannerImportHarness(client, format = "json") {
  const source = appSource.match(/function analyzeObdScannerImport\(options = \{\}\) \{[\s\S]*?\r?\n\}/)[0];
  vm.runInContext(source, client);
  for (const name of ["clearObdScannerImport", "importObdScannerFile", "pasteObdScannerImport", "normalizeObdScannerImportFileText", "beginWebSerialReadoutProfile", "syncObdVehicleInput"]) {
    vm.runInContext(appSource.match(new RegExp(`(?:async )?function ${name}\\([^)]*\\) \\{[\\s\\S]*?\\r?\\n\\}`))[0], client);
  }
  // Stub parser results and display helpers; exercise the complete handler's session ownership and bridge lifecycle.
  for (const name of new Set([...source.matchAll(/\b(format\w+)\(/g)].map((match) => match[1]))) client[name] = () => "";
  for (const name of ["getSessionNextReadoutCandidates", "getObdFreezeFrameTriggerEntries", "getNonBlockingWarningLabels", "readCoreSessionAliasArray"]) client[name] = () => [];
  for (const name of ["renderObdImportToolHints", "renderObdMonitorValues", "renderObdWorkflowGuide", "renderObdDeveloperSessionSummary", "appendObdAnalysisReadoutSummary"]) client[name] = () => {};
  for (const name of ["buildSelectedObdReadoutInterface", "buildSelectedObdVehicleProfile", "buildSelectedObdVehicleApplicability", "getReadoutCoverageDisplay"]) client[name] = () => null;
  client.buildCoreReadinessHeadline = () => "";
  client.buildCoreAnalysisPendingStatus = () => "PENDING";
  client.hasBridgeDiagnosticImportPipelineSupport = () => true;
  client.hasBridgeMergeDiagnosticInputsSupport = () => true;
  client.hasBridgeDiagnosticScanSessionSupport = () => true;
  client.NO_DATA = "";
  client.OEM_SCANNER_TOOL_HINTS = new Set();
  client.obdScannerText = { value: "valid import", focus: () => {} };
  const handlers = {};
  client.obdScannerText.addEventListener = (name, handler) => { handlers[name] = handler; };
  vm.runInContext(appSource.match(/^obdScannerText\.addEventListener\("input",[^\r\n]+/m)[0], client);
  client.editScannerText = (text) => { client.obdScannerText.value = text; handlers.input(); };
  client.buildSelectedObdObservationContext = () => null;
  client.hideResult = () => {};
  client.selectedVehicleValue = () => "";
  client.selectedObdVehicleYear = () => "";
  client.syncVehicleSelectionSummary = () => {};
  client.renderObdConnectionGuide = () => {};
  for (const name of ["obdVehicleMakerSelect", "obdVehicleModelSelect", "obdVehicleModelCodeSelect", "obdVehicleProductionDateInput", "obdVehicleEngineCodeSelect", "obdVehicleManualInput", "obdVehicleInput", "obdVehicleSelectionSummary"]) client[name] = { value: "" };
  for (const name of ["obdDetectedCodes", "obdMonitorGrid", "obdMonitorInsightList", "obdImportStatus", "obdMonitorStatus", "obdMonitorCount"]) client[name] = {};
  const analysis = { source: "imported", codes: [], monitorValues: [], monitorInsights: [] };
  client.window = { ObdReadOnly: {
    buildDiagnosticScanSessionFromJson: () => format === "json" ? analysis : null,
    buildDiagnosticScanSessionFromCsv: () => format === "csv" ? analysis : null,
    analyzeScannerText: () => analysis,
    buildBridgeDiagnosticImport: () => ({}),
    mergeDiagnosticInputs: () => analysis,
    buildDiagnosticScanSession: (input) => ({ ...analysis, ...(input.scan_session || input) })
  } };
  return client;
}

async function validateScannerImportOwnership(webUrl) {
  const response = () => new Response(JSON.stringify({ ok: true, data: {}, errors: [] }));
  for (const format of ["json", "csv", "text"]) {
    const ready = deferred();
    const client = addScannerImportHarness(createClient(webUrl, options.pairingToken, async () => {
      await ready.promise;
      return response();
    }), format);
    let accepted = 0;
    const pending = client.runObdLocalBridgeRead("Old read", "read_stored_dtc", {}, () => {
      accepted += 1;
      client.obdDevSession.lastSession = { source: "old-response" };
    });
    let imported;
    try {
      client.analyzeObdScannerImport();
      imported = client.obdDevSession.lastSession;
    } finally {
      ready.resolve();
      await pending;
    }
    check(imported && client.obdDevSession.lastSession === imported && accepted === 0 && client.obdBridgeOperation === null, `${format} import was overwritten by an older bridge response`);
  }
  for (const scenario of ["rejected", "empty", "builder-error", "internal-merge"]) {
    const ready = deferred();
    const client = addScannerImportHarness(createClient(webUrl, options.pairingToken, async () => {
      await ready.promise;
      return response();
    }), scenario === "internal-merge" ? "text" : "json");
    const previous = { source: "previous" };
    client.obdDevSession.lastSession = previous;
    if (scenario === "rejected") client.window.ObdReadOnly.buildDiagnosticScanSessionFromJson = () => ({ accepted: false, errors: ["invalid_file"] });
    if (scenario === "empty") client.obdScannerText.value = "";
    if (scenario === "builder-error") client.window.ObdReadOnly.buildDiagnosticScanSession = () => { throw new Error("invalid_session"); };
    let accepted = 0;
    const pending = client.runObdLocalBridgeRead("Preserved read", "read_stored_dtc", {}, () => { accepted += 1; });
    try {
      if (scenario === "builder-error") assert.throws(() => client.analyzeObdScannerImport(), /invalid_session/);
      else client.analyzeObdScannerImport({ mergeWithCurrentSession: scenario === "internal-merge" });
      check(client.obdBridgeOperation?.cancelled === false, `${scenario} unnecessarily cancelled the pending bridge read`);
      if (scenario !== "internal-merge") check(client.obdDevSession.lastSession === previous, `${scenario} replaced the current session`);
    } finally {
      ready.resolve();
      await pending;
    }
    check(accepted === 1 && client.obdBridgeOperation === null, `${scenario} prevented the pending read from completing`);
  }
  for (const entry of ["file", "clipboard", "clear"]) {
    const ready = deferred();
    const client = addScannerImportHarness(createClient(webUrl, options.pairingToken, async () => {
      await ready.promise;
      return response();
    }));
    const previous = { source: "previous" };
    client.obdDevSession.lastSession = previous;
    let accepted = 0;
    const pending = client.runObdLocalBridgeRead("Old read", "read_stored_dtc", {}, () => {
      accepted += 1;
      client.obdImportStatus.textContent = "OLD_RESULT";
    });
    let expectedStatus;
    let expectedSession;
    try {
      if (entry === "file") {
        let reader;
        client.FileReader = class {
          constructor() { reader = this; }
          readAsText() {}
        };
        const input = { value: "selected.json", files: [{ name: "selected.json", size: 100, type: "application/json" }] };
        client.importObdScannerFile({ currentTarget: input });
        check(client.obdBridgeOperation?.cancelled === false && client.obdDevSession.lastSession === previous, "Starting file acquisition cancelled the read before validation");
        reader.result = "valid import";
        reader.onload();
        check(input.value === "", "Completed file import retained its file input");
      } else if (entry === "clipboard") {
        const clipboard = deferred();
        client.navigator = { clipboard: { readText: () => clipboard.promise } };
        const pasting = client.pasteObdScannerImport();
        check(client.obdBridgeOperation?.cancelled === false, "Clipboard permission wait cancelled the bridge read");
        clipboard.resolve("valid import");
        await pasting;
      } else {
        client.clearObdScannerImport();
        check(client.obdScannerText.value === "" && client.obdDevSession.lastSession === previous, "Clear removed the retained session or failed to clear the input");
      }
      expectedStatus = client.obdImportStatus.textContent;
      expectedSession = client.obdDevSession.lastSession;
      check(client.obdBridgeOperation?.cancelled === true, `${entry} did not cancel the older bridge operation`);
    } finally {
      ready.resolve();
      await pending;
    }
    check(accepted === 0 && client.obdDevSession.lastSession === expectedSession && client.obdImportStatus.textContent === expectedStatus, `${entry} result was changed by a late bridge response`);
  }
}

async function validateBridgeOperationLifecycle(webUrl) {
  const successResponse = () => new Response(JSON.stringify({ ok: true, data: {}, errors: [], would_transmit: false }));
  const ready = deferred();
  let sent = 0;
  let accepted = 0;
  const client = createClient(webUrl, options.pairingToken, async () => {
    sent += 1;
    await ready.promise;
    return successResponse();
  });
  const first = client.runObdLocalBridgeRead("First", "list_vci", {}, () => { accepted += 1; });
  const progressMessage = client.obdDevStatus.textContent;
  client.obdDevSession.requestedInterfaceId = "original-interface";
  client.startInterfaceCandidateCheck({ id: "different-interface" });
  client.startGeneralBridgeCheck();
  client.previewSelectedObdInterface();
  client.prepareSelectedObdInterface();
  client.loadObdInterfacePreviewSample("user-vci-elm327");
  await client.connectObdDeveloperVci();
  check(client.obdDevSession.requestedInterfaceId === "original-interface" && client.obdDevStatus.textContent === progressMessage, "Busy caller changed interface, preview, or status before the operation guard");
  const duplicate = client.runObdLocalBridgeRead("Duplicate", "list_vci", {}, () => { accepted += 1; });
  const duplicateProbe = client.probeObdLocalBridge();
  client.obdBridgePairingInput.value = "replacement-pairing-key";
  client.applyObdBridgePairingToken();
  try {
    check(sent === 1 && client.obdBridgePairingToken === "" && client.obdBridgePairingApplyButton.disabled, "Duplicate operation or pairing change was accepted during a bridge request");
  } finally {
    ready.resolve();
    await first;
    await duplicate;
    await duplicateProbe;
  }
  check(accepted === 1 && client.obdBridgeOperation === null && !client.obdBridgePairingApplyButton.disabled, "Successful operation did not release its busy slot");
  await client.runObdLocalBridgeRead("Retry", "list_vci", {}, () => { accepted += 1; });
  check(sent === 2 && accepted === 2, "A finished operation prevented the next read");

  let aborted = false;
  let abortRequests = 0;
  const abortClient = createClient(webUrl, options.pairingToken, (url, init) => {
    abortRequests += 1;
    return new Promise((resolve, reject) => {
      init.signal.addEventListener("abort", () => { aborted = true; reject(new Error("aborted")); }, { once: true });
    });
  });
  const abortedRead = abortClient.runObdLocalBridgeRead("Cancel", "list_vci", {}, () => { accepted += 1; });
  abortClient.lockObdDeveloperMode();
  await abortedRead;
  check(aborted && abortRequests === 1 && accepted === 2 && abortClient.obdDevSession.bridgeEndpoint === null && abortClient.obdBridgeOperation === null, "Lock did not abort waiting, retried another endpoint, or applied a late result");

  const late = deferred();
  let lateRequests = 0;
  const lateClient = createClient(webUrl, options.pairingToken, async () => {
    lateRequests += 1;
    await late.promise;
    return successResponse();
  });
  const lateRead = lateClient.runObdLocalBridgeRead("Late", "list_vci", {}, () => { accepted += 1; });
  lateClient.lockObdAccess();
  lateClient.obdAccessUnlocked = true;
  const tooSoon = lateClient.runObdLocalBridgeRead("Too soon", "list_vci", {}, () => { accepted += 1; });
  try {
    check(lateRequests === 1 && lateClient.obdBridgeOperation !== null, "Cancellation released the busy slot before the old request settled");
  } finally {
    late.resolve();
    await lateRead;
    await tooSoon;
  }
  check(accepted === 2 && lateClient.obdDevSession.bridgeEndpoint === null && lateClient.obdBridgeOperation === null && lateClient.obdDevStatus.textContent === "DEFAULT_GATE", "A cancelled response was restored after unlocking");

  const noAbortReady = deferred();
  const noAbortClient = createClient(webUrl, options.pairingToken, async () => { await noAbortReady.promise; return successResponse(); });
  noAbortClient.AbortController = undefined;
  const noAbortRead = noAbortClient.runObdLocalBridgeRead("Logical cancel", "list_vci", {}, () => { accepted += 1; });
  noAbortClient.clearObdBridgePairingToken();
  check(noAbortClient.obdBridgeOperation?.cancelled === true, "Missing AbortController released ownership before settlement");
  noAbortReady.resolve();
  await noAbortRead;
  check(accepted === 2 && noAbortClient.obdDevSession.bridgeEndpoint === null && noAbortClient.obdBridgeOperation === null, "Logical cancellation accepted a late response without AbortController");

  const bodyStarted = deferred();
  const bodyReady = deferred();
  let bodyTimer;
  let bodyTimerCleared = false;
  const bodyClient = createClient(webUrl, options.pairingToken, async () => ({ ok: true, json: async () => { bodyStarted.resolve(); return bodyReady.promise; } }));
  bodyClient.setTimeout = (callback) => { bodyTimer = callback; return 1; };
  bodyClient.clearTimeout = () => { bodyTimerCleared = true; };
  const bodyRead = bodyClient.fetchObdLocalBridgeEndpoint(`${webUrl}/local-bridge/v1/request`, {});
  const timedOut = assert.rejects(bodyRead, /local_bridge_timeout/);
  await bodyStarted.promise;
  check(!bodyTimerCleared, "Response headers ended the timeout before the body was parsed");
  bodyTimer();
  bodyReady.resolve({ ok: true });
  await timedOut;
  check(bodyTimerCleared, "Body timeout left a timer behind");

  let fallbackTimer;
  const fallbackSignals = [];
  const fallbackClient = createClient(webUrl, options.pairingToken, async (url, init) => {
    fallbackSignals.push(init.signal);
    const request = JSON.parse(init.body);
    assert.equal(Object.hasOwn(request, "operation"), false);
    if (fallbackSignals.length === 1) { fallbackTimer(); throw new Error("timed out"); }
    return successResponse();
  });
  fallbackClient.setTimeout = (callback) => { fallbackTimer = callback; return 1; };
  fallbackClient.clearTimeout = () => {};
  await fallbackClient.runObdLocalBridgeRead("Fallback", "list_vci", {}, () => { accepted += 1; });
  check(accepted === 3 && fallbackSignals.length === 2 && fallbackSignals[0].aborted && !fallbackSignals[1].aborted && fallbackSignals[0] !== fallbackSignals[1], "Normal timeout fallback reused an aborted controller or lost the successful result");

  const serialClient = createClient(webUrl, options.pairingToken, async () => { throw new Error("Must not call bridge while serial is active"); });
  serialClient.obdDevSession.connectionState = "selecting";
  check(serialClient.beginObdBridgeOperation() === null, "Bridge operation overlapped the Web Serial device picker");
  serialClient.obdDevSession.connectionState = "disconnected";
  const owner = serialClient.beginObdBridgeOperation();
  serialClient.finishObdBridgeOperation({}, "Wrong owner");
  check(serialClient.obdBridgeOperation === owner, "A stale completion released another operation's busy slot");
  serialClient.finishObdBridgeOperation(owner, "Done");
  serialClient.obdDevSession.connectionState = "ready";
  serialClient.obdDevSession.previewMode = "previous-preview";
  serialClient.ensureObdVehicleSelection = () => true;
  serialClient.resolveObdInterfaceId = () => "user-vci-elm327";
  serialClient.obdVehicleInput = { value: "Test vehicle" };
  serialClient.window = { ObdReadOnly: { getVehicleInterfaceCatalog: () => [] } };
  serialClient.getObdInterfaceReadoutRoute = () => ({ route: "native_connector_required" });
  serialClient.getSelectedObdInterfaceLabel = () => "Test interface";
  serialClient.prepareSelectedObdInterface();
  check(serialClient.obdDevSession.previewMode === null, "Serial connection unnecessarily blocked non-bridge preparation guidance");

  const adapterStarted = deferred();
  const adapterReady = deferred();
  let probeRequests = 0;
  const probeEndpoints = [];
  const probeClient = createClient(webUrl, options.pairingToken, async (url) => {
    probeRequests += 1;
    probeEndpoints.push(url);
    if (probeRequests === 2) { adapterStarted.resolve(); await adapterReady.promise; }
    return successResponse();
  });
  probeClient.window = { ObdReadOnly: {
    normalizeBridgeConnectionStatus: () => ({ displayStatus: "NEW_STATUS" }),
    normalizeBridgeAdapterIdentity: () => ({ adapterName: "NEW_ADAPTER" })
  } };
  probeClient.obdDevSession.bridgeStatus = "previous-status";
  probeClient.obdDevSession.adapterIdentity = "previous-adapter";
  probeClient.obdDevSession.bridgeEndpoint = "http://127.0.0.1:9999/v1/bridge";
  probeClient.renderObdDeveloperSessionSummary = () => {};
  probeClient.appendObdDeveloperLog = () => {};
  const probing = probeClient.probeObdLocalBridge();
  await adapterStarted.promise;
  await probeClient.runObdLocalBridgeRead("Concurrent", "list_vci", {}, () => { accepted += 1; });
  check(probeRequests === 2 && accepted === 3, "Read operation overlapped adapter identification");
  probeClient.lockObdDeveloperMode();
  adapterReady.resolve();
  await probing;
  check(probeEndpoints.length === 2 && probeEndpoints.every((url) => url === `${webUrl}/local-bridge/v1/request`), "Adapter identification used the old endpoint instead of the newly discovered endpoint");
  check(probeClient.obdDevSession.bridgeStatus === "previous-status" && probeClient.obdDevSession.adapterIdentity === "previous-adapter" && probeClient.obdDevSession.bridgeEndpoint === "http://127.0.0.1:9999/v1/bridge" && probeClient.obdBridgeOperation === null, "Cancelled multi-step probe mixed the new endpoint with previous connection metadata");
  check(appSource.replace(/\r\n/g, "\n").includes('function syncObdVehicleInput() {\n  cancelObdBridgeOperation();') && appSource.includes('document.querySelectorAll("[data-obd-bridge-request]")'), "Vehicle changes or public bridge controls lost operation protection");
}
const previousReplay = process.env.LOCAL_BRIDGE_REPLAY_LOG;
const previousPairing = process.env.LOCAL_BRIDGE_PAIRING_TOKEN;
delete process.env.LOCAL_BRIDGE_REPLAY_LOG;
delete process.env.LOCAL_BRIDGE_PAIRING_TOKEN;
try {
  const workstation = await startLocalWorkstation(options);
  const webPort = workstation.webServer.address().port;
  try {
    check(workstation.webServer.address().address === "127.0.0.1" && workstation.bridgeServer.address().address === "127.0.0.1", "Workstation must bind both servers to loopback");
    const page = await fetch(workstation.webUrl);
    check(page.status === 200 && (await page.text()).includes("obdDiagnosticFlowPanel"), "Workstation did not serve the diagnostic screen");
    const asset = await fetch(`${workstation.webUrl}/offline-assets.json`);
    const manifest = await asset.json();
    check(asset.status === 200 && manifest.asset_count > 0, "Workstation did not serve the offline manifest");
    let servedAssets = 0;
    for (const assetPath of manifest.assets) {
      const url = new URL(assetPath, `${workstation.webUrl}/`);
      assert.equal(url.origin, workstation.webUrl, "Offline asset points outside the local workstation");
      const response = await fetch(url);
      assert.equal(response.status, 200, `Unavailable local asset: ${assetPath}`);
      await response.arrayBuffer();
      servedAssets += 1;
    }
    check(servedAssets === manifest.asset_count, "Workstation did not serve every declared offline asset");
    const health = await (await fetch(`${workstation.bridgeUrl}/health`)).json();
    check(health.j2534_discovery_requested === true && health.sample_mode === false && health.replay_mode === false && health.sample_readouts_enabled === false && health.vehicle_command_enabled === false, "Workstation enabled replay, sample readouts, or vehicle commands");
    const request = async (intent, token) => (await fetch(`${workstation.bridgeUrl}/v1/request`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ api_version: "v1", request_id: "workstation-test", intent, timestamp: new Date().toISOString(), pairing_token: token })
    })).json();
    const readout = await request("read_stored_dtc", options.pairingToken);
    check(readout.ok === false && readout.errors.includes("vci_not_detected") && readout.would_transmit === false && !Object.hasOwn(readout.data, "dtcs"), "Missing VCI was replaced with sample DTC data");
    const denied = await request("read_stored_dtc", "wrong-token");
    check(denied.blocked === true && denied.errors.includes("pairing_token_mismatch"), "Workstation accepted an unpaired readout request");
    const write = await request("clear_dtc", options.pairingToken);
    check(write.blocked === true && write.errors.includes("write_intent_blocked") && write.would_transmit === false, "Workstation accepted a state-changing intent");
    check(!JSON.stringify(health).includes(options.pairingToken) && !JSON.stringify(readout).includes(options.pairingToken), "Workstation exposed its pairing token in bridge responses");
    const localEndpoint = `${workstation.webUrl}/local-bridge/v1/request`;
    const requests = [];
    const client = createClient(workstation.webUrl, options.pairingToken, (url, init) => {
      requests.push(url);
      return fetch(url, init);
    });
    const status = await client.sendObdLocalBridgeStatusIntent("bridge_status");
    check(status.ok === true && requests.length === 1 && requests[0] === localEndpoint && client.obdDevSession.bridgeEndpoint === localEndpoint, "UI did not discover its own workstation bridge first on custom ports");
    const localReadout = await client.sendObdLocalBridgeIntent("read_stored_dtc");
    check(localReadout.ok === false && localReadout.errors.includes("vci_not_detected") && localReadout.would_transmit === false && requests[1] === localEndpoint, "UI paired readout bypassed the local bridge safety checks");
    const wrongClient = createClient(workstation.webUrl, "wrong-pairing-token");
    const wrongReadout = await wrongClient.sendObdLocalBridgeIntent("read_stored_dtc");
    check(wrongReadout.blocked === true && wrongReadout.errors.includes("pairing_token_mismatch"), "Same-origin routing bypassed pairing");
    let successCalls = 0;
    await wrongClient.runObdLocalBridgeRead("DTC", "read_stored_dtc", {}, () => { successCalls += 1; });
    check(wrongClient.obdDevStatus.textContent.includes("接続キーが一致しません") && successCalls === 0, "Pairing failure was hidden by the gate render or reached success handling");
    await client.runObdLocalBridgeRead("DTC", "read_stored_dtc", {}, () => { successCalls += 1; });
    check(client.obdDevStatus.textContent.includes("VCI未検出") && client.obdDevStatus.textContent.includes("未取得") && successCalls === 0, "Missing VCI was shown as a successful read or its reason was overwritten");
    await client.runObdLocalBridgeRead("VCI一覧", "list_vci", {}, () => { successCalls += 1; });
    check(client.obdDevStatus.textContent === "VCI一覧が完了しました。" && successCalls === 1, "Successful status operation lost its completion message");
    const displayClient = createClient(workstation.webUrl, options.pairingToken);
    for (const [code, label] of [
      ["vci_not_connected", "VCIは未接続"], ["bridge_pairing_token_not_configured", "接続キーが未設定"],
      ["local_bridge_timeout", "時間切れ"], ["sample_mode_no_vehicle_readout", "サンプルモード"],
      ["write_intent_blocked", "要求は無効"], ["詳細トークンが未設定です。", "未設定"]
    ]) {
      displayClient.sendObdLocalBridgeIntent = async () => { throw new Error(code); };
      await displayClient.runObdLocalBridgeRead("確認", "read_stored_dtc", {}, () => { successCalls += 1; });
      check(displayClient.obdDevStatus.textContent.includes(label) && successCalls === 1, `Bridge failure lost its distinct reason: ${code}`);
    }
    displayClient.sendObdLocalBridgeIntent = async () => { throw new Error(`unrecognized ${options.pairingToken} C:/private/driver.dll`); };
    await displayClient.runObdLocalBridgeRead("確認", "read_stored_dtc", {}, () => { successCalls += 1; });
    check(displayClient.obdDevStatus.textContent.includes("応答を確認できません") && !displayClient.obdDevStatus.textContent.includes(options.pairingToken) && !displayClient.obdDevStatus.textContent.includes("private"), "Unknown transport error exposed raw credentials or paths");
    displayClient.sendObdLocalBridgeStatusIntent = async () => { throw new Error("local_bridge_timeout"); };
    await displayClient.probeObdLocalBridge();
    check(displayClient.obdDevStatus.textContent.includes("時間切れ"), "Bridge discovery failure was overwritten by the gate");
    client.window = { ObdReadOnly: {
      normalizeBridgeConnectionStatus: () => ({ displayStatus: "TEST_STATUS" }),
      normalizeBridgeAdapterIdentity: () => ({ adapterName: "TEST_ADAPTER" })
    } };
    client.renderObdDeveloperSessionSummary = () => {};
    client.appendObdDeveloperLog = () => {};
    await client.probeObdLocalBridge();
    check(client.obdDevStatus.textContent.includes("TEST_STATUS / TEST_ADAPTER"), "Bridge discovery result was replaced with a generic ready message");
    displayClient.sendObdLocalBridgeIntent = async () => { displayClient.obdDevModeUnlocked = false; throw new Error("pairing_token_mismatch"); };
    await displayClient.runObdLocalBridgeRead("確認", "read_stored_dtc", {}, () => { successCalls += 1; });
    check(displayClient.obdDevStatus.textContent === "DEFAULT_GATE", "Late failure overwrote the newly locked gate");
    const renewedClient = createClient(workstation.webUrl, "saved-details-token");
    renewedClient.obdBridgePairingInput.value = options.pairingToken;
    renewedClient.applyObdBridgePairingToken();
    check(renewedClient.obdBridgePairingInput.value === "" && renewedClient.obdBridgePairingToken === options.pairingToken && renewedClient.localStorage.getItem() === "saved-details-token", "Runtime pairing changed the saved unlock token or retained the input value");
    const renewedReadout = await renewedClient.sendObdLocalBridgeIntent("read_stored_dtc");
    check(renewedReadout.errors.includes("vci_not_detected") && !renewedReadout.errors.includes("pairing_token_mismatch"), "Restarted bridge did not accept the separately supplied runtime key");
    renewedClient.obdBridgePairingInput.value = "short";
    renewedClient.applyObdBridgePairingToken();
    check(renewedClient.obdBridgePairingToken === options.pairingToken && renewedClient.obdBridgePairingStatus.textContent.includes("12"), "Invalid runtime key replaced a configured key");
    renewedClient.renderObdBridgePairingControls();
    check(!JSON.stringify(renewedClient.obdDevSession).includes(options.pairingToken) && !renewedClient.obdBridgePairingStatus.textContent.includes(options.pairingToken), "Runtime key leaked into diagnostic state or status text");
    renewedClient.clearObdBridgePairingToken();
    const clearedReadout = await renewedClient.sendObdLocalBridgeIntent("read_stored_dtc");
    check(clearedReadout.errors.includes("pairing_token_mismatch") && renewedClient.obdBridgePairingClearButton.disabled, "Clearing runtime pairing failed to restore the saved-token behavior");
    renewedClient.obdBridgePairingInput.value = options.pairingToken;
    renewedClient.applyObdBridgePairingToken();
    renewedClient.lockObdDeveloperMode();
    check(renewedClient.obdBridgePairingToken === "" && renewedClient.obdBridgePairingInput.value === "" && renewedClient.obdBridgePairingControls.hidden && renewedClient.obdBridgePairingApplyButton.disabled, "Locking left runtime pairing credentials or controls active");
    renewedClient.obdBridgePairingInput.value = options.pairingToken;
    renewedClient.applyObdBridgePairingToken();
    check(renewedClient.obdBridgePairingToken === "", "Locked details accepted a runtime key");
    renewedClient.obdDevPasswordInput.value = options.pairingToken;
    renewedClient.unlockObdDeveloperMode();
    check(renewedClient.obdDevModeUnlocked === false, "Bridge pairing key bypassed the saved details lock");
    renewedClient.obdDevPasswordInput.value = "saved-details-token";
    renewedClient.unlockObdDeveloperMode();
    check(renewedClient.obdDevModeUnlocked === true && renewedClient.obdBridgePairingToken === "", "Existing details token no longer unlocks or restored a discarded runtime key");
    check(createClient(workstation.webUrl, "saved-details-token").obdBridgePairingToken === "", "Reloaded UI retained a runtime key");
    renewedClient.obdBridgePairingInput.value = options.pairingToken;
    renewedClient.applyObdBridgePairingToken();
    renewedClient.lockObdAccess();
    check(renewedClient.obdAccessUnlocked === false && renewedClient.obdBridgePairingToken === "" && renewedClient.obdBridgePairingInput.value === "", "Top-level access lock retained the runtime pairing key");
    check(indexSource.includes('id="obdBridgePairingControls" hidden') && indexSource.includes('id="obdBridgePairingInput" type="password" autocomplete="off" minlength="12"') && indexSource.includes('id="obdBridgePairingStatus" class="data-status" role="status"'), "Pairing UI lost initial hiding, password input, or accessible status");
    check(appSource.includes('obdBridgePairingApplyButton.addEventListener("click", applyObdBridgePairingToken)') && appSource.includes('obdBridgePairingClearButton.addEventListener("click", clearObdBridgePairingToken)'), "Pairing UI buttons are not connected to the tested handlers");
    const requestCountBeforeWrite = requests.length;
    await assert.rejects(client.sendObdLocalBridgeIntent("clear_dtc"));
    check(requests.length === requestCountBeforeWrite, "UI sent a forbidden write intent");
    const localRequest = (body) => fetch(localEndpoint, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body)
    });
    const blockedResponse = await localRequest({ api_version: "v1", request_id: "local-write-test", intent: "clear_dtc", timestamp: new Date().toISOString(), pairing_token: options.pairingToken });
    const localWrite = await blockedResponse.json();
    check(localWrite.blocked === true && localWrite.errors.includes("write_intent_blocked") && localWrite.would_transmit === false && blockedResponse.headers.get("cache-control") === "no-store", "Same-origin bridge accepted a write or allowed caching");
    const invalid = await (await localRequest({})).json();
    check(invalid.blocked === true && !JSON.stringify([status, localReadout, localWrite]).includes(options.pairingToken), "Local route skipped validation or exposed pairing credentials");
    check((await fetch(localEndpoint)).status === 404 && (await fetch(`${workstation.webUrl}/local-bridge/other`, { method: "POST" })).status === 404, "Local bridge route exposed an unintended method or path");
    const publicClient = createClient("https://tool.mukiguri.com", options.pairingToken);
    const publicEndpoints = Array.from(publicClient.getObdLocalBridgeEndpoints());
    check(publicEndpoints.length === 6 && publicEndpoints.every((url) => /^http:\/\/127\.0\.0\.1:(8765|17653)\/v1/.test(url)), "Public UI discovery changed or sent pairing credentials to the public origin");
    client.obdDevSession.bridgeEndpoint = "http://127.0.0.1:17653/v1";
    check(client.getObdLocalBridgeEndpoints()[0] === client.obdDevSession.bridgeEndpoint && client.getObdLocalBridgeEndpoints({ discover: true })[0] === localEndpoint, "Cached endpoint or explicit rediscovery regressed");
    const fallbackRequests = [];
    const legacyClient = createClient(workstation.webUrl, options.pairingToken, (url, init) => {
      fallbackRequests.push(url);
      return url === localEndpoint ? Promise.resolve(new Response(null, { status: 404 })) : fetch(`${workstation.bridgeUrl}/v1/request`, init);
    });
    const fallbackStatus = await legacyClient.sendObdLocalBridgeStatusIntent("bridge_status");
    check(fallbackStatus.ok === true && fallbackRequests.length === 2 && fallbackRequests[1] === publicEndpoints[0], "Legacy static UI did not fall back to the existing separate bridge");
    await validateBridgeOperationLifecycle(workstation.webUrl);
    await validateScannerImportOwnership(workstation.webUrl);
    await validateScannerAcquisitionOrder(workstation.webUrl);
    await validateScannerParserIntegration(workstation.webUrl);
    await assert.rejects(startLocalWorkstation({ ...options, webPort }), { code: "EADDRINUSE" });
    check((await fetch(workstation.webUrl)).status === 200, "A competing launcher stopped the existing workstation");
  } finally {
    await workstation.close();
    await workstation.close();
  }
  check(!workstation.webServer.listening && !workstation.bridgeServer.listening, "Workstation shutdown left a listener behind");
  const occupied = http.createServer((request, response) => response.end("occupied"));
  await new Promise((resolve) => occupied.listen(0, "127.0.0.1", resolve));
  try {
    await assert.rejects(startLocalWorkstation({ ...options, webPort, bridgePort: occupied.address().port }), { code: "EADDRINUSE" });
    const retry = await startLocalWorkstation({ ...options, webPort, pairingToken: undefined });
    try {
      check(retry.webServer.listening && occupied.listening, "Failed bridge startup leaked the UI port or stopped the occupied server");
      check(/^[0-9a-f]{48}$/.test(retry.pairingToken) && retry.pairingToken !== options.pairingToken, "Workstation did not generate a runtime pairing token when none was configured");
    } finally {
      await retry.close();
    }
  } finally {
    await new Promise((resolve) => occupied.close(resolve));
  }
  await assert.rejects(startLocalWorkstation({ ...options, webPort: -1 }), /invalid_workstation_port/);
  await assert.rejects(startLocalWorkstation({ ...options, pairingToken: "short" }), /workstation_pairing_token_too_short/);
  check(true, "Invalid settings rejected");
  process.env.LOCAL_BRIDGE_REPLAY_LOG = "must-not-be-read.log";
  await assert.rejects(startLocalWorkstation(options), /workstation_replay_not_allowed/);
  check(true, "Inherited replay rejected");
} finally {
  if (previousReplay === undefined) delete process.env.LOCAL_BRIDGE_REPLAY_LOG;
  else process.env.LOCAL_BRIDGE_REPLAY_LOG = previousReplay;
  if (previousPairing === undefined) delete process.env.LOCAL_BRIDGE_PAIRING_TOKEN;
  else process.env.LOCAL_BRIDGE_PAIRING_TOKEN = previousPairing;
}
console.log(`Local workstation checks: ${checks}\nErrors: 0`);
