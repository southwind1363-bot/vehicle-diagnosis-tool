import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const scriptSource = fs.readFileSync(new URL("../script.js", import.meta.url), "utf8");
const coreSource = fs.readFileSync(new URL("../obd-readonly.js", import.meta.url), "utf8");
let checks = 0;
const check = (condition, message) => { assert.ok(condition, message); checks += 1; };
const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

function load(context, names) {
  for (const name of names) {
    const match = scriptSource.match(new RegExp(`(?:async )?function ${name}\\([^\\n]*\\) \\{[\\s\\S]*?\\r?\\n\\}`));
    assert.ok(match, `Missing script.js function ${name}`);
    vm.runInContext(match[0], context, { filename: `script.js:${name}` });
  }
}

const webSerialFunctions = [
  "renderObdPendingConnection",
  "connectObdDeveloperVci", "disconnectObdDeveloperVci", "resetWebSerialConnectionAttemptMetadata",
  "retainWebSerialConnectionAttempt", "hasBridgeDiagnosticScanSessionSupport",
  "setObdDeveloperConnectionState", "isWebSerialPortSelectionCancelled", "getWebSerialConnectionFailureReason",
  "isCurrentObdSerialOperation", "continueObdSerialOperation", "throwIfObdSerialOperationCancelled",
  "initializeElmDeveloperAdapter", "identifyObdDeveloperVci", "mergeWebSerialAdapterIdentity",
  "buildWebSerialAdapterIdentity", "getWebSerialAdapterProtocolHint", "getWebSerialAdapterProtocolNumber",
  "captureObdDeveloperProtocolAfterStoredDtc", "readObdDeveloperCoreScan", "beginWebSerialReadoutProfile",
  "readObdDeveloperDtc", "readObdDeveloperFreezeFrame", "readObdDeveloperReadiness", "readObdDeveloperEcuInfo",
  "readObdDeveloperOnboardMonitor", "readObdDeveloperLiveSnapshot", "readObdDeveloperSupportedPidMaps",
  "hasWebSerialDtcCoverage", "hasWebSerialDtcStatusReport", "hasWebSerialFreezeFrameCoverage",
  "hasWebSerialReadinessCoverage", "hasWebSerialEcuInfoTypeCoverage", "hasWebSerialOnboardMonitorCoverage",
  "hasWebSerialLivePidCoverage", "hasWebSerialSupportedPidPage", "isWebSerialReadoutReported",
  "decodeWebSerialMode09SupportedInfoTypes", "hasWebSerialFreezeFrameTriggerDtc",
  "hasWebSerialFreezeFrameCapabilityReport", "getWebSerialFreezeFrameSupportedPidsForTriggerScopes",
  "getWebSerialFreezeFrameTriggerScopeIds", "parseWebSerialFreezeFrameSupportedPidRows",
  "decodeWebSerialFreezeFrameSupportedPidBitmap", "runObdDeveloperRead", "buildWebSerialReadoutOutcome",
  "recordWebSerialReadoutAttempt", "buildWebSerialReadoutSummary", "classifyWebSerialCommandResponse",
  "getWebSerialResponseLines", "hasWebSerialResponseError", "isWebSerialBusInitErrorLine", "isWebSerialInformationalResponseLine",
  "isWebSerialExpectedEmptyResponse", "retainObdDeveloperReadout", "buildWebSerialAttemptTranscript",
  "buildWebSerialDtcResponseOverrides", "buildWebSerialSupportedPidResponseOverride", "buildWebSerialFreezeFrameResponseOverride",
  "buildWebSerialEcuInfoResponseOverride", "buildWebSerialReadinessResponseOverride", "buildWebSerialOnboardMonitorResponseOverride",
  "updateWebSerialSupportedPidReadoutResponses", "resolveWebSerialSupportedPidReadoutResponses", "isWebSerialSupportedPidCommand",
  "updateWebSerialFreezeFrameReadoutResponses", "mergeWebSerialFreezeFrameReadoutResponses", "isWebSerialFreezeFrameCommand",
  "updateWebSerialFreezeFrameCapabilityResponse", "resolveWebSerialFreezeFrameCapabilityResponse",
  "updateWebSerialEcuInfoReadoutResponses", "mergeWebSerialEcuInfoReadoutResponses", "isWebSerialEcuInfoCommand",
  "mergeObdObservationContexts",
  "buildWebSerialConnectionStatus", "buildWebSerialAdapterInitializationSummary", "getWebSerialAdapterInitializationStopReason",
  "getWebSerialDisplayBaudRate",
  "formatWebSerialConnectionFailure", "formatWebSerialAdapterInitializationFailure", "formatWebSerialAdapterInitializationSummary",
  "formatWebSerialStopReason", "appendObdDeveloperLog", "readWebSerialCaptureContext", "createWebSerialReadoutCapture", "createSerialCommandCapture", "readElmDeveloperCommandRecord", "sendElmDeveloperCommand", "readElmDeveloperLoop", "readElmDeveloperResponse",
  "isAllowedObdDeveloperCommand", "isCurrentWebSerialReadLoop", "hasCompletedElmDeveloperResponse", "takeCompletedElmDeveloperResponse"
];
const webSerialConstants = [
  "obdSerialReadErrors",
  "ELM327_CONNECTION_STATES", "WEB_SERIAL_DEFAULT_LIVE_PID_COMMANDS", "WEB_SERIAL_DEFAULT_FREEZE_FRAME_PID_COMMANDS",
  "WEB_SERIAL_READ_ONLY_COMMANDS", "WEB_SERIAL_ADAPTER_ERROR_LINES", "WEB_SERIAL_VEHICLE_LINK_ERROR_LINES",
  "WEB_SERIAL_IGNORED_RESPONSE_LINES", "WEB_SERIAL_ADAPTER_INITIALIZATION_STEPS"
];

class MockElmPort {
  constructor(responses = {}, options = {}) {
    this.responses = { ...responses };
    this.options = options;
    this.calls = { select: 0, open: 0, close: 0, cancel: 0, releaseReader: 0, releaseWriter: 0, writes: [], responseChunks: [], bindingInvalidations: [] };
    this.queue = [];
    this.waiting = null;
    this.closed = false;
    this.readerLocked = false;
    this.writerLocked = false;
    this.cleanupFailure = null;
    this.readable = { getReader: () => {
      assert.equal(this.readerLocked, false, "Reader is already locked");
      this.readerLocked = true;
      return {
        read: () => this.read(),
        cancel: async () => { this.calls.cancel += 1; this.finish(); },
        releaseLock: () => {
          this.calls.releaseReader += 1;
          if (this.cleanupFailure === "reader") throw new Error("reader_release_failed");
          this.readerLocked = false;
        }
      };
    } };
    this.writable = { getWriter: () => {
      assert.equal(this.writerLocked, false, "Writer is already locked");
      this.writerLocked = true;
      return {
        write: (value) => this.write(value),
        releaseLock: () => { this.calls.releaseWriter += 1; this.writerLocked = false; }
      };
    } };
  }

  async open() { this.calls.open += 1; }
  async close() {
    this.calls.close += 1;
    if (this.cleanupFailure === "close" || this.readerLocked || this.writerLocked) throw new Error("port_close_failed");
    this.closed = true;
    this.finish();
  }
  finish() {
    if (this.waiting) { this.waiting({ done: true }); this.waiting = null; }
  }
  read() {
    if (this.queue.length) return Promise.resolve({ value: this.queue.shift(), done: false });
    if (this.closed) return Promise.resolve({ done: true });
    return new Promise((resolve) => { this.waiting = resolve; });
  }
  enqueue(text) {
    const response = String(text);
    const fragmentSize = this.options.fragmentSize || 5;
    const segments = this.options.fragmentResponses
      ? Array.from({ length: Math.ceil(response.length / fragmentSize) }, (_, index) => response.slice(index * fragmentSize, (index + 1) * fragmentSize))
      : [response];
    for (const segment of segments) {
      this.calls.responseChunks.push(segment);
      const value = new TextEncoder().encode(segment);
      if (this.waiting) { const resolve = this.waiting; this.waiting = null; resolve({ value, done: false }); }
      else this.queue.push(value);
    }
  }
  write(value) {
    const wire = new TextDecoder().decode(value);
    check(/^[A-Z0-9@]+\r$/.test(wire), "Writer received a command without its exact single-CR terminator");
    const command = wire.slice(0, -1);
    this.calls.writes.push(command);
    const response = this.responses[command];
    if (response === undefined) return Promise.reject(new Error(`unexpected_elm_command:${command}`));
    if (response instanceof Error) return Promise.reject(response);
    if (typeof response === "function") return response(command, this);
    this.enqueue(`${response}>`);
    return Promise.resolve();
  }
}

function createClient(responses, options = {}) {
  const port = new MockElmPort(responses, options);
  const uiNode = { value: "", textContent: "", innerHTML: "", hidden: false };
  const context = vm.createContext({
    TextDecoder, TextEncoder, setTimeout, clearTimeout, performance, Date, console,
    navigator: { serial: { requestPort: async () => {
      check(port.calls.bindingInvalidations.at(-1) === "transport_connection_not_current", "Connection selection must invalidate target binding before requesting a port");
      port.calls.select += 1;
      return port;
    } } },
    obdDtcClearTargetBindingController: { invalidate: (reason) => { port.calls.bindingInvalidations.push(reason); } },
    sessionStorage: { removeItem: () => {}, setItem: () => {} },
    obdAccessUnlocked: true, obdDevModeUnlocked: false, obdUiMode: "simple",
    obdBridgeOperation: null, obdSerialRevision: 0, obdSerialResultOwner: null,
    obdSerialConnectPending: false, obdSerialDisconnectOperation: null, obdScannerImportOperation: null,
    OBD_ACCESS_MODE_KEY: "access", OBD_DEV_MODE_KEY: "developer",
    obdDevBaudRate: { value: "38400" }, obdDevStatus: uiNode, obdScannerText: uiNode, obdDetectedCodes: uiNode,
    obdLiveObservationCondition: { value: "unspecified" },
    renderObdDeveloperReadout: () => {},
    obdDevSession: {
      port: null, reader: null, writer: null, decoder: null, encoder: null, textBuffer: "", pendingCommandOperation: null,
      pendingWriteOperation: null, readLoopActive: false, readInProgress: false, initializing: false,
      coreScanInProgress: false, coreScanStopReason: null, activeCoreReadoutId: null, readoutProfile: null,
      connectionState: "disconnected", lastDisconnectReason: null, disconnectedAt: null, lastRawText: "", connectedAt: null,
      scanSessionId: null, vehicleProfile: null, vehicleApplicability: null, observationContext: null,
      supportedPidDiscoveryComplete: false, supportedPidSet: [], supportedPidReadoutResponses: [], readoutAttempts: [],
      livePidTimeline: [], freezeFrameReadoutResponses: [], freezeFrameCapabilityResponse: null, ecuInfoReadoutResponses: [],
      bridgeEndpoint: null, bridgeStatus: null, bridgeVciList: null, adapterIdentity: null, adapterInitializationSummary: null,
      lastSession: options.lastSession || null, previewMode: null, requestedInterfaceId: null,
      selectedPidList: ["010C", "0105"], freezeFramePidList: ["020C"]
    },
    clearRequestedInterfaceSelection: () => {}, renderObdDeveloperGate: () => {}, renderObdSessionExportControls: () => {},
    renderObdReadoutVehicle: () => {}, syncObdReadoutExitGuard: () => {}, handleObdReadoutSessionReplacement: () => {},
    invalidateObdScannerImport: () => {}, clearObdBridgePairingToken: () => {}, renderObdMonitorValues: () => {},
    hideResult: () => {}, renderObdDeveloperSessionSummary: () => {},
    buildSelectedObdVehicleProfile: () => ({ year: 2020, make: "test" }),
    buildSelectedObdVehicleApplicability: () => ({}), buildSelectedObdObservationContext: () => ({}),
    window: null
  });
  context.window = context;
  vm.runInContext(coreSource, context, { filename: "obd-readonly.js" });
  for (const [method, file] of [
    ["configureMonitorDefinitions", "obd-monitor-definitions.json"],
    ["configureFreezeFrameItems", "obd-freeze-frame-items-2026.json"],
    ["configureReadinessMonitors", "obd-readiness-monitors-2026.json"],
    ["configureEcuInfoItems", "obd-ecu-info-items-2026.json"]
  ]) {
    assert.equal(context.ObdReadOnly[method](JSON.parse(fs.readFileSync(new URL(`../data/${file}`, import.meta.url), "utf8"))), true, `Failed to load ${file}`);
  }
  for (const name of webSerialConstants) {
    const match = scriptSource.match(new RegExp(`const ${name} = [\\s\\S]*?;`));
    assert.ok(match, `Missing script.js constant ${name}`);
    vm.runInContext(match[0], context, { filename: `script.js:${name}` });
  }
  load(context, [...webSerialFunctions, "createReadOnlySettingsObservation", "createReadOnlySettingsSession"]);
  const property = scriptSource.match(/  settingsObservation: \{[\s\S]*?\r?\n  \},/)[0].trim().slice(0, -1);
  vm.runInContext(`obdDevSession.settingsObservation = ({${property}}).settingsObservation`, context);
  context.buildSelectedObdReadoutInterface = () => ({ id: "user-vci-elm327", route: "desktop_web_serial" });
  const formatConnectionFailure = context.formatWebSerialConnectionFailure;
  context.formatWebSerialConnectionFailure = (reason, summary, error) => {
    context.lastConnectionError = String(error?.message || error || "");
    return formatConnectionFailure(reason, summary, error);
  };
  return { context, port };
}

const successfulResponses = {
  ATZ: "ELM327 v1.5", ATE0: "ATE0\r\nOK", ATL0: "OK", ATS0: "OK", ATH1: "OK", ATSP0: "OK",
  ATI: "ELM327 v1.5", "AT@1": "OBDII to RS232 Interpreter", ATDP: "AUTO, ISO 15765-4 (CAN 11/500)", ATDPN: "A6",
  "03": "7E8 05 43 01 33 00 00\r\n7E9 05 43 04 20 00 00", "07": "47 00 00", "0A": "4A 00 00", "0202": "42 02 00 00 00",
  "0101": "41 01 00 07 00 00", "0900": "49 00 14 00 00 00", "0904": "49 04 01 31 32 33", "0906": "49 06 01 12 34 56 78",
  "06": "46 01 01 00 10 00 00 00 20", "0100": "41 00 00 10 00 00", "010C": "41 0C 1A F8"
};

{
  const { context } = createClient(successfulResponses);
  check(context.formatWebSerialAdapterInitializationSummary({ initializationStatus: "completed", completedSetupStepCount: 6, attemptedSetupStepCount: 6, baudRate: 38400 }) === "完了 (6/6 / 38400 bps)", "Valid numeric Web Serial baud rate was not displayed");
  check(context.formatWebSerialAdapterInitializationSummary({ initialization_status: "failed", failed_setup_step: "disable_echo", baud_rate: "115200" }) === "停止: エコー停止 / 115200 bps", "Valid decimal-string Web Serial baud rate alias was not displayed");
  for (const baudRate of [null, "", " ", false, 0, 1, -1, 38400.5, 1000001, "38400bps", [], {}]) {
    const label = context.formatWebSerialAdapterInitializationSummary({ initializationStatus: "completed", completedSetupStepCount: 0, attemptedSetupStepCount: 0, baudRate });
    check(label === "完了 (0/0)", `Missing or invalid Web Serial baud rate was presented as measured (${JSON.stringify(baudRate)} => ${label})`);
  }
}

async function connect(client) {
  await client.context.connectObdDeveloperVci();
  check(client.context.obdDevSession.connectionState === "ready", `Web Serial connection did not reach ready (${client.context.obdDevStatus.textContent}; ${client.context.lastConnectionError || "no error"})`);
  check(client.context.obdDevSession.adapterInitializationSummary?.initializationStatus === "completed", "ELM initialization summary was not completed");
  check(client.context.obdDevSession.adapterIdentity?.adapterName === "ELM327", "ELM adapter identity was not normalized from live response");
}

for (const eol of ["\r\n", "\r", "\n"]) {
  const client = createClient({ ...successfulResponses,
    ATE0: `ATE0${eol}OK`,
    "03": ["7E8 05 43 01 33 00 00", "7E9 05 43 04 20 00 00"].join(eol)
  }, { fragmentResponses: true });
  await connect(client);
  if (eol === "\r\n") check(client.port.calls.responseChunks.includes("ATE0\r") && client.port.calls.responseChunks.includes("\nOK>"), "Mock readable did not split the echoed ATE0 CRLF response across reader chunks");
  await client.context.readObdDeveloperCoreScan();
  const session = client.context.obdDevSession.lastSession;
  const attempts = client.context.obdDevSession.readoutAttempts;
  const scanCapture = client.context.obdDevSession.coreRawReadoutCapture;
  check(scanCapture.inspect().status === "finished" && scanCapture.inspect().count === 4, "Core scan must aggregate four same-generation records");
  const rawRecords = scanCapture.take();
  check(JSON.stringify(rawRecords.map(row => row.command)) === JSON.stringify(["03", "07", "0A", "0101"]), "Core raw records lost command order");
  check(rawRecords.every(row => row.profile === null && !row.profileVerified && !row.executionEnabled && !row.realTransportProofAvailable), "Aggregation must not infer profile or vehicle authority");
  check(scanCapture.take() === null, "Core aggregate must be consumed once");
  check(!Object.hasOwn(session, "coreRawReadoutCapture"), "Core raw aggregate leaked into saved session");
  check(attempts.length === 9 && attempts.every((attempt) => attempt.status === "completed" && attempt.transportErrorCount === 0), `Successful core scan recorded failures or duplicate attempts (${JSON.stringify(attempts)})`);
  check(session?.webSerialReadoutSummary?.source === "web_serial", "Core scan did not retain Web Serial readout provenance");
  check(JSON.stringify(session?.dtcSnapshot?.codes) === JSON.stringify(["P0133", "P0420"]), `Multi-ECU Mode 03 retention fabricated or lost DTCs (${JSON.stringify(session?.dtcSnapshot?.dtcs || [])})`);
  check(JSON.stringify(session.dtcSnapshot.dtcs.map((dtc) => [dtc.code, String(dtc.sourceEcu || dtc.source_ecu || dtc.ecu || "").toUpperCase()]).sort()) === JSON.stringify([["P0133", "7E8"], ["P0420", "7E9"]]), "Multi-ECU Mode 03 retention lost or swapped responding ECU attribution");
  check(session?.livePidSnapshot?.monitorValues?.some((value) => value.id === "engine_speed" && value.value === 1726 && value.unit === "rpm"), "Supported live RPM was not decoded exactly");
  check(!client.port.calls.writes.some((command) => /^(?:04|14|ATPC)$/i.test(command)), "A forbidden state-changing command reached the mock writer");
  check(client.port.calls.writes.includes("010C") && !client.port.calls.writes.includes("0105"), "Live scan did not restrict requests to the discovered PID set");
  check(JSON.stringify(client.port.calls.writes) === JSON.stringify(["ATZ", "ATE0", "ATL0", "ATS0", "ATH1", "ATSP0", "ATI", "AT@1", "03", "ATDP", "ATDPN", "07", "0A", "0202", "0101", "0900", "0904", "0906", "06", "0100", "010C"]), "Core scan did not consume the exact read-only Web Serial command sequence");
  check(session?.readinessSnapshot?.readinessReadoutStatus === "reported" && session?.onboardMonitorSnapshot?.onboardMonitorReadoutStatus === "reported", "Readiness or Mode06 response was not retained");
  check(session?.freezeFrameSnapshot?.freezeFrameReadoutStatus === "reported" && session?.ecuInfoSnapshot?.ecuInfoReadoutStatus === "reported", `Freeze-frame or ECU-info response was not retained (${session?.freezeFrameSnapshot?.freezeFrameReadoutStatus}/${session?.ecuInfoSnapshot?.ecuInfoReadoutStatus})`);
  await client.context.disconnectObdDeveloperVci();
  await delay(5);
  check(client.port.calls.cancel === 1 && client.port.calls.close === 1 && client.port.calls.releaseReader === 1 && client.port.calls.releaseWriter === 1, "Disconnect did not cancel, release, and close every Web Serial resource once");
  check(client.port.closed && !client.port.readerLocked && !client.port.writerLocked, "Successful disconnect left a mock resource open or locked");
}

for (const failure of ["reader", "close"]) {
  const client = createClient(successfulResponses);
  await connect(client);
  await client.context.readObdDeveloperDtc();
  const saved = client.context.obdDevSession.lastSession;
  const savedJson = JSON.stringify(saved);
  const writes = client.port.calls.writes.length;
  check(saved?.dtcSnapshot?.codes?.includes("P0133") && !client.context.obdDevSession.pendingWriteOperation,
    `${failure}: cleanup fixture needs a retained readout without a pending write`);
  client.port.cleanupFailure = failure;
  await client.context.disconnectObdDeveloperVci();
  check(!client.port.closed && client.port.readerLocked === (failure === "reader") && !client.port.writerLocked,
    `${failure}: mock did not retain the failed-close or unreleased-reader condition`);
  check(client.context.obdDevSession.connectionState === "disconnecting" && client.context.obdSerialDisconnectOperation?.cleanupFailed,
    `${failure}: failed cleanup incorrectly reported a completed disconnect`);
  await client.context.disconnectObdDeveloperVci();
  await client.context.connectObdDeveloperVci();
  check(client.port.calls.select === 1 && client.port.calls.open === 1 && client.port.calls.writes.length === writes,
    `${failure}: unresolved cleanup allowed a new picker, port open, or write`);
  check(client.port.calls.cancel === 1 && client.port.calls.releaseReader === 1 && client.port.calls.releaseWriter === 1 && client.port.calls.close === 1,
    `${failure}: repeated disconnect retried or skipped resource cleanup`);
  check(client.context.obdDevSession.lastSession === saved && JSON.stringify(saved) === savedJson,
    `${failure}: cleanup failure replaced or mutated the acquired scan`);
  const downloads = [];
  const exportStatus = {};
  let clicks = 0;
  Object.assign(client.context, {
    Blob,
    URL: { createObjectURL: (blob) => { downloads.push(blob); return "blob:rescue"; }, revokeObjectURL: () => {} },
    document: {
      querySelectorAll: () => [exportStatus],
      createElement: () => ({ click: () => { clicks += 1; }, remove: () => {} }),
      body: { appendChild: () => {} }
    }
  });
  load(client.context, ["getObdSessionExportBlockReason", "setObdSessionExportStatus", "downloadObdSessionJson"]);
  check(client.context.downloadObdSessionJson() === true && clicks === 1 && downloads.length === 1,
    `${failure}: real readout could not be exported after cleanup settled`);
  const archive = await downloads[0].text();
  const restored = client.context.ObdReadOnly.buildDiagnosticScanSessionFromJson(archive);
  check(JSON.stringify(restored?.dtcSnapshot?.codes) === JSON.stringify(["P0133", "P0420"])
    && restored?.vehicleCommandEnabled === false, `${failure}: rescue archive lost DTCs or allowed vehicle commands (${JSON.stringify({ codes: restored?.dtcSnapshot?.codes, enabled: restored?.vehicleCommandEnabled, error: restored?.error, accepted: restored?.accepted })})`);
  check(exportStatus.textContent.includes("終了未確認") && client.context.obdSerialDisconnectOperation?.cleanupFailed
    && client.port.calls.writes.length === writes && client.port.calls.select === 1
    && client.context.obdDevSession.lastSession === saved && JSON.stringify(saved) === savedJson,
    `${failure}: rescue download changed the source, quarantine, or transport state`);
}

for (const [command, service, status, label] of [["03", "43", "stored", "保存DTC読取"], ["07", "47", "pending", "保留・永久DTC読取"], ["0A", "4A", "permanent", "保留・永久DTC読取"]]) {
  const eol = command === "03" ? "\r\n" : command === "07" ? "\r" : "\n";
  const client = createClient({ ...successfulResponses,
    [command]: `7E8 05 ${service} 01 33 00 00${eol}7E9 05 ${service} 04 20 00 00`
  });
  await connect(client);
  await client.context.runObdDeveloperRead(label, [command]);
  const session = client.context.obdDevSession.lastSession;
  const expected = [["P0133", "7E8", status], ["P0420", "7E9", status]];
  const rows = (snapshot) => (snapshot?.dtcs || []).map((dtc) => [dtc.code, dtc.ecu || dtc.sourceEcu || dtc.source_ecu, dtc.status]).sort();
  check(JSON.stringify(rows(session.dtcSnapshot)) === JSON.stringify(expected), `${command}: individual readout fabricated DTCs or lost ECU/status (${JSON.stringify(rows(session.dtcSnapshot))})`);
  const archive = client.context.ObdReadOnly.buildBridgeSessionExportPayload(session);
  const restored = client.context.ObdReadOnly.buildDiagnosticScanSessionFromJson(JSON.stringify(archive));
  check(JSON.stringify(rows(restored?.dtcSnapshot)) === JSON.stringify(expected), `${command}: individual readout archive changed ECU-scoped DTCs`);
  await client.context.disconnectObdDeveloperVci();
}

{
  const { context: c } = createClient(successfulResponses);
  const decode = (response) => c.buildWebSerialDtcResponseOverrides([{ command: "03", response }], ["03"]).storedDtcResponse;
  const rows = decode("18DAF110 05 43 01 33 00 00\r18DAF118 05 43 04 20 00 00");
  check(JSON.stringify(rows.dtcs.map((dtc) => [dtc.code, dtc.ecu]).sort()) === JSON.stringify([["P0133", "18DAF110"], ["P0420", "18DAF118"]]), "29-bit response IDs were lost while normalizing DTC overrides");
  const padded = decode("7E8 03 43 01 33 AA AA AA AA");
  check(JSON.stringify(padded.codes) === JSON.stringify(["P0133"]), "DTC override decoded bytes beyond the frame length");
  const empty = decode("7E8 03 43 00 00");
  check(empty.codes?.length === 0 || empty.dtcs?.length === 0, "Empty DTC response fabricated a code");
  check(empty.dtcReadoutStatus === "reported" && empty.reportedStatuses.join() === "stored", "Reported empty DTC state was lost");
  const noData = decode("NO DATA");
  check(noData.dtcs.length === 0 && noData.dtcReadoutStatus === "unparsed" && noData.reportedStatuses.length === 0, "Mode 03 NO DATA was incorrectly treated as a reported zero-code result");
  for (const raw of ["7E8 10 0B 43 01 33 04 20 00", "7E8 03 47 01 33", "BUS ERROR\rNO DATA"]) {
    const unknown = decode(raw);
    check(unknown.dtcs.length === 0 && unknown.dtcReadoutStatus === "unparsed", "Incomplete, wrong-service or error response was decoded as stored DTC evidence");
  }
  const negative = decode("7E8 03 7F 03 11");
  check(negative.dtcs.length === 0 && negative.dtcReadoutStatus === "unparsed" && negative.dtcNegativeResponseCode === "11",
    "DTC normalization lost matching negative-response evidence");
  for (const raw of ["430171", "NO DATA\r430171", "430171\r430420"]) {
    const compact = decode(raw);
    check(JSON.stringify(compact.codes) === JSON.stringify(raw.includes("430420") ? ["P0171", "P0420"] : ["P0171"]),
      `Compact headerless DTC response was lost or merged across lines (${raw})`);
    check(compact.dtcs.every((dtc) => !dtc.ecu) && compact.dtcReadoutStatus === "reported", "Compact headerless reply invented an ECU or lost readout status");
  }
  const compactNegative = decode("7F0311");
  check(compactNegative.dtcs.length === 0 && compactNegative.dtcNegativeResponseCode === "11", "Compact negative DTC response lost its NRC");
  for (const [command, response, key] of [["07", "470171", "pendingDtcResponse"], ["0A", "4A0171", "permanentDtcResponse"]]) {
    const compact = c.buildWebSerialDtcResponseOverrides([{ command, response }], [command])[key];
    check(compact.codes.join() === "P0171" && compact.dtcs[0].status === (command === "07" ? "pending" : "permanent"), "Compact DTC normalization changed the requested status");
  }
  check(!Object.hasOwn(rows, "raw") && !Object.hasOwn(rows, "bytes") && rows.vehicleCommandEnabled === false && rows.vehicle_command_enabled === false,
    "DTC override retained raw response bytes or unsafe flags");
}

{
  const client = createClient({ ...successfulResponses, "03": "NO DATA" });
  await connect(client);
  const completed = await client.context.readObdDeveloperDtc();
  const session = client.context.obdDevSession.lastSession;
  const summary = session?.webSerialReadoutSummary;
  check(completed === false && summary?.noDataCount === 1 && summary?.incompleteCount === 1,
    "Mode 03 NO DATA did not remain an incomplete stored-DTC readout");
  check(client.port.calls.writes.at(-1) === "03" && !client.port.calls.writes.some((command) => ["ATDP", "ATDPN", "07", "0A"].includes(command)),
    "Mode 03 NO DATA did not stop protocol and follow-up DTC requests");
  check(session?.dtcSnapshot?.dtcStatusSummary?.reportedStatuses?.length === 0 && session?.dtcSnapshot?.dtcStatusSummary?.unreportedStatuses?.join(",") === "stored,pending,permanent",
    "Mode 03 NO DATA incorrectly supplied DTC status coverage");
  await client.context.disconnectObdDeveloperVci();
}

{
  const client = createClient({ ...successfulResponses, ATDP: new Error("protocol_query_failed") });
  await connect(client);
  await client.context.readObdDeveloperDtc();
  const session = client.context.obdDevSession.lastSession;
  check(client.context.obdDevSession.connectionState === "disconnected" && !client.port.calls.writes.includes("07"),
    "Protocol-query failure did not stop the real DTC flow before the next readout");
  check(JSON.stringify(session?.dtcSnapshot?.codes) === JSON.stringify(["P0133", "P0420"]),
    `Protocol-query failure retained phantom DTCs (${JSON.stringify(session?.dtcSnapshot?.codes)})`);
  const restored = client.context.ObdReadOnly.buildDiagnosticScanSessionFromJson(JSON.stringify(client.context.ObdReadOnly.buildBridgeSessionExportPayload(session)));
  check(JSON.stringify(restored?.dtcSnapshot?.codes) === JSON.stringify(["P0133", "P0420"]), "Interrupted DTC readout archive changed the acquired codes");
}

{
  const client = createClient({ ...successfulResponses, "010C": "NO DATA" });
  await connect(client);
  const completed = await client.context.runObdDeveloperRead("partial", ["03", "010C"]);
  const attempt = client.context.obdDevSession.readoutAttempts.at(-1);
  check(completed === false && attempt?.status === "partial" && attempt.noDataCount === 1 && attempt.readoutCompleted === false, "NO DATA was incorrectly treated as a successful mixed readout");
  check(client.context.obdDevSession.lastSession?.dtcSnapshot?.codes?.includes("P0133"), "Partial read did not retain the obtained DTC evidence");
  await client.context.disconnectObdDeveloperVci();
}

{
  const client = createClient({ ...successfulResponses, ATE0: "ATE0\r?\r" }, { lastSession: { marker: "previous" } });
  await client.context.connectObdDeveloperVci();
  check(client.context.obdDevSession.connectionState === "disconnected", "Initialization failure did not close the connection");
  check(client.context.obdDevSession.adapterInitializationSummary?.initializationStatus === "failed", "Initialization failure was not recorded by the real initializer");
  check(client.port.calls.close === 1, "Initialization failure left the mock port open");
  check(client.port.calls.writes.join(",") === "ATZ,ATE0", "Initialization continued after echoed error");
}

{
  const client = createClient(successfulResponses);
  await connect(client);
  const saved = client.context.obdDevSession.lastSession;
  client.port.responses["07"] = () => { client.port.finish(); return Promise.resolve(); };
  const completed = await client.context.runObdDeveloperRead("disconnect", ["03", "07"]);
  check(completed === false && client.context.obdDevSession.connectionState === "disconnected", "Mid-read stream loss did not fail and disconnect");
  check(client.context.obdDevSession.lastSession?.dtcSnapshot?.codes?.includes("P0133"), "Mid-read disconnect discarded already acquired data");
  check(client.context.obdDevSession.lastSession !== saved, "Mid-read disconnect did not retain the partial result");
}

{
  const client = createClient(successfulResponses);
  await connect(client);
  await assert.rejects(client.context.sendElmDeveloperCommand("04", 20), /許可していないコマンドです: 04/);
  check(!client.port.calls.writes.includes("04"), "Forbidden command passed the writer allowlist gate");
  await assert.rejects(client.context.sendElmDeveloperCommand("0105", 20), /elm_transport_write_failed:0105/);
  client.port.responses["03"] = () => Promise.resolve();
  const writesBeforeTimeout = client.port.calls.writes.length;
  await assert.rejects(client.context.sendElmDeveloperCommand("03", 20), /elm_response_timeout:03/);
  await delay(50);
  check(client.context.obdDevSession.pendingCommandOperation === null && client.context.obdDevSession.pendingWriteOperation === null, "Response timeout left pending serial operations behind");
  check(client.port.calls.writes.length === writesBeforeTimeout + 1, "Response timeout caused an unexpected follow-up write");
  await client.context.disconnectObdDeveloperVci();
}

{
  const client = createClient(successfulResponses);
  await connect(client);
  await client.context.readObdDeveloperDtc();
  const saved = client.context.obdDevSession.lastSession;
  const savedJson = JSON.stringify(saved);
  let finishWrite;
  let notifyWrite;
  const writeStarted = new Promise(resolve => { notifyWrite = resolve; });
  client.port.responses["03"] = () => new Promise(resolve => {
    finishWrite = resolve;
    notifyWrite();
  });
  const reading = client.context.runObdDeveloperRead("cancel pending write", ["03", "07"]);
  await writeStarted;
  const writes = client.port.calls.writes.length;
  const disconnecting = client.context.disconnectObdDeveloperVci();
  await delay(5);
  check(client.context.obdDevSession.connectionState === "disconnecting" && client.port.calls.close === 0,
    "Cancellation closed the port before its pending write settled");
  await client.context.connectObdDeveloperVci();
  check(client.port.calls.select === 1 && client.port.calls.writes.length === writes,
    "Cancellation allowed reconnection or a follow-up command before write settlement");
  finishWrite();
  await disconnecting;
  check(await reading === false, "Cancelled read was reported as completed");
  check(client.port.closed && !client.port.readerLocked && !client.port.writerLocked,
    "Cancelled read did not release and close the original port");
  check(client.context.obdDevSession.lastSession === saved && JSON.stringify(saved) === savedJson,
    "Cancelled pending write replaced or mutated the previous readout");

  const replacement = new MockElmPort({ ...successfulResponses, "03": "7E8 03 43 01 00" });
  client.context.navigator.serial.requestPort = async () => { replacement.calls.select += 1; return replacement; };
  await connect(client);
  // Old data arriving after a new connection must not enter its response buffer.
  client.port.enqueue("7E8 03 43 04 20>");
  await client.context.readObdDeveloperDtc();
  const session = client.context.obdDevSession.lastSession;
  check(session?.dtcSnapshot?.codes?.join(",") === "P0100",
    "Reconnected readout mixed cancelled-port data with the replacement port response");
  check(client.port.calls.writes.length === writes && replacement.calls.select === 1,
    "Recovery wrote to the old port or automatically selected the replacement again");
  const restored = client.context.ObdReadOnly.buildDiagnosticScanSessionFromJson(
    JSON.stringify(client.context.ObdReadOnly.buildBridgeSessionExportPayload(session)));
  check(restored?.dtcSnapshot?.codes?.join(",") === "P0100" && JSON.stringify(saved) === savedJson,
    "Recovered archive lost its new readout or changed the previous saved session");
  await client.context.disconnectObdDeveloperVci();
  check(replacement.closed && replacement.calls.close === 1 && client.port.calls.close === 1,
    "Recovery did not close each port exactly once");
}

// Raw capture belongs to one normal read operation; never to the saved session.
{
  const client = createClient(successfulResponses, { fragmentResponses: true, fragmentSize: 1 });
  await connect(client);
  for (const commands of [["03"], ["07", "0A"], ["0101"]]) {
    await client.context.runObdDeveloperRead("capture", commands);
    const owner = client.context.obdDevSession.rawReadoutCapture;
    check(owner.inspect().status === "finished" && owner.inspect().count === commands.length, "Normal read must finish its own raw group");
    const records = owner.take();
    check(JSON.stringify(records.map(row => row.command)) === JSON.stringify(commands), "Raw group command order differs");
    check(records.every((row, index) => row.transcript === successfulResponses[commands[index]] + ">"
      && row.profile === null && row.executionEnabled === false && row.realTransportProofAvailable === false), "Raw group changed text or gained authority");
    check(owner.take() === null, "Raw group can only be consumed once");
    const session = client.context.obdDevSession.lastSession;
    check(!Object.hasOwn(session, "rawReadoutCapture"), "Private capture must not enter saved session");
    const exported = client.context.ObdReadOnly.buildBridgeSessionExportPayload(session);
    check(!JSON.stringify(exported).includes('"rawReadoutCapture"'), "Private capture must not enter JSON export");
    const probe = client.context.createWebSerialReadoutCapture(commands);
    check(probe.take() === null, "Unfinished capture must not expose a partial group");
    for (const row of records) check(probe.append(row), "Bounded group must accept its expected records");
    check(!probe.append({ ...records[0], command: undefined }), "Extra record must not bypass the command limit");
    check(!probe.finish() && probe.take() === null, "Overfilled group must be discarded");
    for (const changed of [{ ...records[0], command: "04" }, { ...records[0], transcript: "x".repeat(12001) },
      { ...records[0], profileVerified: true }, { ...records[0], completedAt: -1 }]) {
      const invalid = client.context.createWebSerialReadoutCapture(commands);
      check(!invalid.append(changed) && invalid.take() === null, "Invalid record must discard the group without authority");
    }
  }
  await client.context.disconnectObdDeveloperVci();
}
for (const event of ["next_read", "protocol", "initialize", "reset", "disconnect", "revision"]) {
  const client = createClient(successfulResponses);
  await connect(client);
  await client.context.runObdDeveloperRead("capture", ["03"]);
  const owner = client.context.obdDevSession.rawReadoutCapture;
  check(owner.inspect().status === "finished", event + ": initial capture missing");
  if (event === "next_read") await client.context.runObdDeveloperRead("capture", ["07", "0A"]);
  if (event === "protocol") await client.context.captureObdDeveloperProtocolAfterStoredDtc();
  if (event === "initialize") await client.context.initializeElmDeveloperAdapter();
  if (event === "reset") client.context.resetWebSerialConnectionAttemptMetadata();
  if (event === "disconnect") await client.context.disconnectObdDeveloperVci();
  if (event === "revision") client.context.obdSerialRevision++;
  check(owner.take() === null && owner.inspect().count === 0, event + ": previous raw group survived invalidation");
  if (!client.port.closed) await client.context.disconnectObdDeveloperVci();
}
{
  const client = createClient({ ...successfulResponses, "0A": new Error("synthetic_write_failure") });
  await connect(client);
  check(await client.context.runObdDeveloperRead("partial", ["07", "0A"]) === false, "Partial raw group must preserve failed read outcome");
  check(client.context.obdDevSession.rawReadoutCapture.take() === null, "Failed read must discard already acquired raw data");
  if (!client.port.closed) await client.context.disconnectObdDeveloperVci();
}

// Explicit scan ownership across protocol inquiry and intervening reads.
for (const interference of ["settings", "manual_read", "copied_owner", "cancel"]) {
  const client = createClient(successfulResponses);
  await connect(client);
  const read = client.context.readObdDeveloperReadiness;
  client.context.readObdDeveloperReadiness = async owner => {
    if (interference === "settings") client.context.obdDevSession.settingsObservation.owner.invalidate();
    if (interference === "manual_read") await client.context.runObdDeveloperRead("other", ["03"]);
    if (interference === "cancel") client.context.obdAccessUnlocked = false;
    return read(interference === "copied_owner" ? { ...owner } : owner);
  };
  await client.context.readObdDeveloperCoreScan();
  const owner = client.context.obdDevSession.coreRawReadoutCapture;
  check(owner.take() === null && owner.inspect().count === 0, interference + ": partial or foreign scan records survived");
  if (interference !== "cancel") check(client.context.obdDevSession.lastSession.dtcSnapshot.codes.includes("P0133"), "Raw rejection must preserve ordinary diagnostic result");
  client.context.obdAccessUnlocked = true;
  await client.context.disconnectObdDeveloperVci();
}
{
  const client = createClient(successfulResponses);
  await connect(client);
  await client.context.readObdDeveloperCoreScan();
  const old = client.context.obdDevSession.coreRawReadoutCapture;
  check(old.inspect().count === 4, "First scan raw records missing");
  // Existing protocol requery expires the settings ticket; do not relax it for aggregation.
  await client.context.readObdDeveloperCoreScan();
  check(old.take() === null, "New scan must discard the previous aggregate");
  check(client.context.obdDevSession.coreRawReadoutCapture.take() === null, "Protocol requery must not splice settings generations");
  check(client.context.obdDevSession.coreRawReadoutCapture.inspect().reason === "settings_unavailable", "Protocol requery must explain settings expiration");
  await client.context.initializeElmDeveloperAdapter();
  await client.context.readObdDeveloperCoreScan();
  check(client.context.obdDevSession.coreRawReadoutCapture.take()?.length === 4, "Explicit new initialization permits a fresh same-generation scan");
  check(old.take() === null, "Recovery must not revive old aggregate");
  await client.context.disconnectObdDeveloperVci();
}

{
  // Inspect must explain rejection without consuming or exposing raw records.
  const current = { port: {}, reader: {}, writer: {}, settingsTicket: {}, revision: 1, connected: true, unlocked: true };
  const panel = {}, status = {};
  const context = vm.createContext({ readWebSerialCaptureContext: () => ({ ...current }),
    document: { querySelector: selector => selector === "#obdCoreRawReadoutDetails" ? panel : status },
    obdAccessUnlocked: true, obdDevModeUnlocked: true, obdDevSession: {} });
  load(context, ["createWebSerialReadoutCapture", "renderObdCoreRawReadoutStatus"]);
  const commands = ["03", "07", "0A", "0101"];
  const raw = command => ({ command, transcript: "PRIVATE_RAW_SENTINEL>", startedAt: 1, completedAt: 1,
    profile: null, profileVerified: false, realTransportProofAvailable: false, executionEnabled: false });
  const render = () => { context.renderObdCoreRawReadoutStatus(); return status.textContent; };
  check(render().includes("未取得"), "Missing capture must display not acquired");
  for (const scenario of ["complete", "settings", "context", "incomplete", "record", "discard", "unsupported"]) {
    const owner = context.createWebSerialReadoutCapture(scenario === "unsupported" ? [] : commands);
    context.obdDevSession.coreRawReadoutCapture = owner;
    if (scenario !== "unsupported") { owner.append(raw("03")); check(render().includes("1/4件"), "Partial capture must remain collecting"); }
    if (scenario === "complete") {
      for (const command of commands.slice(1)) owner.append(raw(command));
      check(owner.finish(), "Complete raw capture must finish");
      check(render().includes("4件を取得済み") && render().includes("解析は未接続"), "Finished raw capture must retain parsing boundary");
      check(owner.inspect().count === 4 && owner.take().length === 4, "Rendering must not consume raw records");
    }
    if (scenario === "settings") current.settingsTicket = {};
    if (scenario === "context") current.revision++;
    if (scenario === "incomplete") owner.finish();
    if (scenario === "record") owner.append(raw("04"));
    if (scenario === "discard") owner.invalidate();
    const expected = { complete: "consumed", settings: "settings_unavailable", context: "context_changed", incomplete: "incomplete",
      record: "invalid_record", discard: "discarded", unsupported: "unsupported_commands" }[scenario];
    check(render().includes("利用不可") && !render().includes("PRIVATE_RAW_SENTINEL"), "Unavailable UI must not leak raw records");
    check(owner.inspect().reason === expected && owner.inspect().count === 0, scenario + ": missing rejection reason or retained raw data");
    owner.invalidate(); owner.finish(); owner.take();
    check(owner.inspect().reason === expected, "Cleanup must preserve the first rejection reason");
    check(!JSON.stringify(owner.inspect()).includes("PRIVATE_RAW_SENTINEL"), "Inspect exposed raw text");
  }
  for (const field of ["obdAccessUnlocked", "obdDevModeUnlocked"]) {
    context[field] = false; render();
    check(panel.hidden && panel.open === false && status.textContent === "", "Locked UI must clear observations");
    context[field] = true;
  }
  context.obdDevSession.previewMode = "fixture"; render();
  check(panel.hidden && status.textContent === "", "Preview must not show runtime raw observations");
}

console.log(`validate-serial-integration: ${checks} checks passed`);
