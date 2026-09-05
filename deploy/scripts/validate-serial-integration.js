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
  "formatWebSerialStopReason", "appendObdDeveloperLog", "sendElmDeveloperCommand", "readElmDeveloperLoop", "readElmDeveloperResponse",
  "isAllowedObdDeveloperCommand", "isCurrentWebSerialReadLoop", "hasCompletedElmDeveloperResponse", "takeCompletedElmDeveloperResponse"
];
const webSerialConstants = [
  "ELM327_CONNECTION_STATES", "WEB_SERIAL_DEFAULT_LIVE_PID_COMMANDS", "WEB_SERIAL_DEFAULT_FREEZE_FRAME_PID_COMMANDS",
  "WEB_SERIAL_READ_ONLY_COMMANDS", "WEB_SERIAL_ADAPTER_ERROR_LINES", "WEB_SERIAL_VEHICLE_LINK_ERROR_LINES",
  "WEB_SERIAL_IGNORED_RESPONSE_LINES", "WEB_SERIAL_ADAPTER_INITIALIZATION_STEPS"
];

class MockElmPort {
  constructor(responses = {}, options = {}) {
    this.responses = { ...responses };
    this.options = options;
    this.calls = { select: 0, open: 0, close: 0, cancel: 0, releaseReader: 0, releaseWriter: 0, writes: [], responseChunks: [] };
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
    navigator: { serial: { requestPort: async () => { port.calls.select += 1; return port; } } },
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
  load(context, webSerialFunctions);
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
  for (const raw of ["7E8 03 43 00 00", "NO DATA"]) {
    const empty = decode(raw);
    check(empty.codes?.length === 0 || empty.dtcs?.length === 0, "Empty DTC response fabricated a code");
    check(empty.dtcReadoutStatus === "reported" && empty.reportedStatuses.join() === "stored", "Reported empty DTC state was lost");
  }
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

console.log(`validate-serial-integration: ${checks} checks passed`);
