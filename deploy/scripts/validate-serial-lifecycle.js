import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import "./validate-serial-response-lines.js";
import "./validate-serial-integration.js";

const source = fs.readFileSync(new URL("../script.js", import.meta.url), "utf8");
const functions = ["connectObdDeveloperVci", "disconnectObdDeveloperVci", "lockObdDeveloperMode", "lockObdAccess", "setObdDeveloperConnectionState", "resetWebSerialConnectionAttemptMetadata", "isWebSerialPortSelectionCancelled", "getWebSerialConnectionFailureReason", "isCurrentObdSerialOperation", "continueObdSerialOperation", "throwIfObdSerialOperationCancelled", "beginObdBridgeOperation", "isObdBridgeOperationBlocked"];
function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}
let checks = 0;
const check = (condition, message) => { assert.ok(condition, message); checks += 1; };
const settle = () => new Promise(setImmediate);
function client() {
  const calls = { open: 0, close: 0, initialize: 0, identify: 0, select: 0, failure: 0 };
  const port = {
    open: async () => { calls.open += 1; }, close: async () => { calls.close += 1; },
    readable: { getReader: () => ({ cancel: async () => {}, releaseLock: () => {} }) },
    writable: { getWriter: () => ({ releaseLock: () => {}, write: async () => {} }) }
  };
  const context = vm.createContext({
    obdAccessUnlocked: true, obdDevModeUnlocked: true, obdBridgeOperation: null,
    obdSerialRevision: 0, obdSerialResultOwner: null, obdSerialConnectPending: false, obdSerialDisconnectOperation: null,
    obdDevSession: { connectionState: "disconnected", port: null, lastSession: { marker: "saved" } },
    obdDevStatus: {}, obdDevBaudRate: { value: "38400" }, obdDevPasswordInput: { value: "" }, obdAccessPasswordInput: { value: "" },
    OBD_DEV_MODE_KEY: "dev", OBD_ACCESS_MODE_KEY: "access",
    ELM327_CONNECTION_STATES: ["disconnected", "selecting", "opening", "initializing", "ready", "reading", "disconnecting"],
    sessionStorage: { removeItem: () => {} }, TextDecoder, TextEncoder, setTimeout, clearTimeout, performance,
    navigator: { serial: { requestPort: async () => { calls.select += 1; return port; } } },
    clearRequestedInterfaceSelection: () => {}, renderObdDeveloperGate: () => {}, renderObdAccessGate: () => {},
    renderObdSessionExportControls: () => {},
    renderObdReadoutVehicle: () => {},
    syncObdReadoutExitGuard: () => {},
    handleObdReadoutSessionReplacement: () => {},
    invalidateObdScannerImport: () => {}, clearObdBridgePairingToken: () => {},
    buildWebSerialAdapterInitializationSummary: (value) => value,
    buildSelectedObdVehicleProfile: () => ({}), buildSelectedObdVehicleApplicability: () => ({}), buildSelectedObdObservationContext: () => ({}),
    readElmDeveloperLoop: () => {}, initializeElmDeveloperAdapter: async () => { calls.initialize += 1; },
    identifyObdDeveloperVci: async () => { calls.identify += 1; },
    formatWebSerialConnectionFailure: () => "connection failed", retainWebSerialConnectionAttempt: () => { calls.failure += 1; }
  });
  load(context, functions);
  return { context, calls, port };
}
function load(context, names) {
  for (const name of names) {
    const match = source.match(new RegExp(`(?:async )?function ${name}\\([^)]*\\) \\{[\\s\\S]*?\\r?\\n\\}`));
    assert.ok(match, `Missing function ${name}`);
    vm.runInContext(match[0], context);
  }
}

{
  const { context: blocked, calls } = client();
  blocked.obdDevModeUnlocked = false;
  blocked.obdUiMode = "details";
  await blocked.connectObdDeveloperVci();
  check(calls.select === 0 && blocked.obdDevSession.connectionState === "disconnected", "Details mode bypassed the developer token for Web Serial");
}
{
  const { context: simple, calls } = client();
  simple.obdDevModeUnlocked = false;
  simple.obdUiMode = "simple";
  await simple.connectObdDeveloperVci();
  check(calls.select === 1 && simple.obdDevSession.connectionState === "ready", `Unlocked simple mode could not start the allowlisted read-only Web Serial route (${calls.select}/${simple.obdDevSession.connectionState})`);
  await simple.disconnectObdDeveloperVci();
}
for (const lock of ["lockObdAccess", "lockObdDeveloperMode"]) {
  const c = client();
  const selected = deferred();
  c.context.navigator.serial.requestPort = () => selected.promise;
  const pending = c.context.connectObdDeveloperVci();
  c.context[lock]();
  selected.resolve(c.port);
  await pending;
  check(c.calls.open === 0 && c.calls.initialize === 0 && c.context.obdDevSession.port === null, `${lock}: late device selection opened a port after lock`);
}
for (const lock of ["lockObdAccess", "lockObdDeveloperMode"]) {
  for (const phase of ["select", "open"]) {
    for (const fail of [false, true]) {
      const { context: c, port, calls } = client();
      const waiting = deferred();
      if (phase === "select") c.navigator.serial.requestPort = () => waiting.promise;
      else port.open = async () => { calls.open += 1; await waiting.promise; };
      const pending = c.connectObdDeveloperVci();
      await settle();
      check(c.obdDevSession.connectionState === (phase === "open" ? "opening" : "selecting"), `${phase}: fixture did not reach the intended pending stage`);
      c.sessionStorage.removeItem = () => { throw new Error("storage denied"); };
      c[lock]();
      c.obdAccessUnlocked = c.obdDevModeUnlocked = true;
      await c.disconnectObdDeveloperVci();
      check(c.obdSerialConnectPending, `${lock}/${phase}/${fail}: pending attempt ownership was lost (${c.obdDevSession.connectionState}, failures=${calls.failure})`);
      check(c.beginObdBridgeOperation() === null, `${phase}: bridge must wait for pending serial acquisition cleanup`);
      await c.connectObdDeveloperVci();
      check(c.obdSerialConnectPending && calls.select <= 1, `${phase}: reconnect must wait for old picker/open cleanup`);
      if (fail) waiting.reject(new Error("old failure"));
      else waiting.resolve(port);
      await pending;
      check(c.obdDevSession.connectionState === "disconnected" && !c.obdSerialConnectPending && calls.initialize === 0 && calls.failure === 0, `${lock}/${phase}/${fail}: stale completion changed connection metadata`);
      check(calls.close === (phase === "open" && !fail ? 1 : 0), `${phase}/${fail}: only a successfully opened local port may be closed`);
      check(c.obdDevSession.lastSession?.marker === "saved", "Cancellation must preserve the previous diagnostic result");
      c.navigator.serial.requestPort = async () => port;
      port.open = async () => { calls.open += 1; };
      await c.connectObdDeveloperVci();
      check(c.obdDevSession.connectionState === "ready" && calls.initialize === 1, "Fresh connection must work after cancelled attempt settles");
    }
  }
}

for (const cancellation of ["disconnectObdDeveloperVci", "lockObdAccess", "lockObdDeveloperMode"]) {
  const { context: c, port, calls } = client();
  const opening = deferred();
  const closing = deferred();
  const saved = c.obdDevSession.lastSession;
  const savedJson = JSON.stringify(saved);
  let readerAcquisitions = 0;
  let writerAcquisitions = 0;
  port.readable.getReader = () => { readerAcquisitions += 1; throw new Error("unexpected_reader"); };
  port.writable.getWriter = () => { writerAcquisitions += 1; throw new Error("unexpected_writer"); };
  port.open = async () => { calls.open += 1; await opening.promise; };
  port.close = async () => { calls.close += 1; await closing.promise; };
  const pending = c.connectObdDeveloperVci();
  await settle();
  check(c.obdDevSession.connectionState === "opening", `${cancellation}: late-close fixture did not reach open`);
  await c[cancellation]();
  await c.disconnectObdDeveloperVci();
  c.obdAccessUnlocked = c.obdDevModeUnlocked = true;
  opening.resolve();
  await settle();
  await c.connectObdDeveloperVci();
  check(c.obdSerialConnectPending && calls.close === 1 && calls.select === 1 && c.beginObdBridgeOperation() === null,
    `${cancellation}: late port close did not block new ownership while pending`);
  const reason = c.obdDevSession.lastDisconnectReason;
  closing.reject(new Error("late_port_close_failed"));
  await pending;
  loadDeveloperGate(c);
  c.renderObdDeveloperGate();
  await c.disconnectObdDeveloperVci();
  await c.connectObdDeveloperVci();
  check(c.obdDevSession.connectionState === "disconnecting" && c.obdSerialDisconnectOperation?.cleanupFailed
    && !c.obdSerialConnectPending && c.obdDevSession.disconnectedAt === null
    && c.obdDevConnectButton.disabled && c.obdDevConnectionState.textContent === "終了未確認",
    `${cancellation}: late port close failure was reported as disconnected`);
  check(calls.select === 1 && calls.open === 1 && calls.close === 1 && calls.initialize === 0
    && readerAcquisitions === 0 && writerAcquisitions === 0 && c.obdDevSession.lastDisconnectReason === reason
    && c.beginObdBridgeOperation() === null && c.obdDevSession.lastSession === saved && JSON.stringify(saved) === savedJson,
    `${cancellation}: late close failure retried acquisition, initialized, or lost saved results`);
}

for (const stage of ["select", "open", "initialize", "identify"]) {
  const { context: c, port, calls } = client();
  const fail = async () => { throw new Error("ordinary failure"); };
  if (stage === "select") c.navigator.serial.requestPort = fail;
  if (stage === "open") port.open = fail;
  if (stage === "initialize") c.initializeElmDeveloperAdapter = fail;
  if (stage === "identify") c.identifyObdDeveloperVci = fail;
  await c.connectObdDeveloperVci();
  check(calls.failure === 1 && c.obdDevSession.connectionState === "disconnected", `${stage}: genuine connection failure must be retained`);
  check(calls.close === (["initialize", "identify"].includes(stage) ? 1 : 0), `${stage}: failure closed an unowned port or leaked an opened port`);
}

for (const stage of ["initialize", "identify"]) {
  const { context: c, calls } = client();
  const waiting = deferred();
  if (stage === "initialize") c.initializeElmDeveloperAdapter = () => waiting.promise;
  else c.identifyObdDeveloperVci = () => waiting.promise;
  const pending = c.connectObdDeveloperVci();
  await settle();
  check(c.obdDevSession.connectionState === "initializing", `${stage}: connection was marked ready too soon`);
  c.lockObdDeveloperMode();
  await c.disconnectObdDeveloperVci();
  c.obdDevModeUnlocked = true;
  waiting.resolve();
  await pending;
  check(c.obdDevSession.connectionState === "disconnected" && calls.failure === 0 && calls.identify === 0, `${stage}: locked initialization continued or revived connection`);
}

for (const failure of ["cancel", "reader", "writer", "close", "none"]) {
  const { context: c, port } = client();
  await c.connectObdDeveloperVci();
  loadDeveloperGate(c);
  const released = [];
  const action = (name) => { released.push(name); if (name === failure) throw new Error(name); };
  c.obdDevSession.reader = { cancel: async () => action("cancel"), releaseLock: () => action("reader") };
  c.obdDevSession.writer = { releaseLock: () => action("writer") };
  port.close = async () => action("close");
  const saved = c.obdDevSession.lastSession = { marker: "saved result" };
  const first = c.disconnectObdDeveloperVci({ reason: "serial_read_failed" });
  c.lockObdAccess();
  const second = c.disconnectObdDeveloperVci();
  await first;
  await second;
  check(released.join(",") === "cancel,reader,writer,close", `${failure}: cleanup must attempt each resource exactly once`);
  check(c.obdDevSession.lastSession === saved, `${failure}: repeated disconnect/lock lost the saved session`);
  if (failure === "none") {
    check(c.obdDevSession.connectionState === "disconnected" && c.obdSerialDisconnectOperation === null,
      "none: confirmed cleanup did not finish as disconnected");
    c.obdAccessUnlocked = true;
    await c.connectObdDeveloperVci();
    check(c.obdDevSession.port && c.beginObdBridgeOperation() === null,
      "none: reconnect was unavailable or bridge started while serial remained connected");
    await c.disconnectObdDeveloperVci();
  } else {
    c.obdAccessUnlocked = true;
    c.renderObdDeveloperGate();
    await c.disconnectObdDeveloperVci();
    await c.connectObdDeveloperVci();
    check(c.obdDevSession.connectionState === "disconnecting" && c.obdSerialDisconnectOperation?.cleanupFailed
      && c.obdDevConnectButton.disabled && c.obdDevConnectionState.textContent === "終了未確認"
      && c.beginObdBridgeOperation() === null,
    `${failure}: cleanup failure was treated as disconnected or allowed reconnect/bridge`);
  }
}

async function readClient() {
  const result = client();
  const c = result.context;
  await c.connectObdDeveloperVci();
  c.obdDevSession.selectedPidList = [];
  c.recorded = []; c.retained = [];
  c.classifyWebSerialCommandResponse = () => ({ commandStatus: "completed" });
  c.buildWebSerialReadoutOutcome = (commands, responses, options) => ({ readoutCompleted: !options.transportErrorCount, responses: [...responses], ...options });
  c.recordWebSerialReadoutAttempt = (attempt) => c.recorded.push(attempt);
  c.retainObdDeveloperReadout = (responses, chunks, options) => {
    const retained = { responses: [...responses], options };
    c.retained.push(retained);
    c.obdDevSession.lastSession = retained;
    return true;
  };
  c.buildWebSerialConnectionStatus = () => ({});
  load(c, ["runObdDeveloperRead"]);
  return result;
}

for (const fail of [false, true]) {
  const { context: c } = await readClient();
  const waiting = deferred();
  let sent = 0;
  c.sendElmDeveloperCommand = () => { sent += 1; return waiting.promise; };
  const pending = c.runObdDeveloperRead("read", ["03", "07"]);
  await c.disconnectObdDeveloperVci();
  await c.connectObdDeveloperVci();
  c.obdDevSession.readInProgress = true;
  c.obdDevSession.connectionState = "reading";
  c.obdDevStatus.textContent = "new connection reading";
  if (fail) waiting.reject(new Error("elm_transport_write_failed:03"));
  else waiting.resolve("43 00");
  check(await pending === false && sent === 1 && c.recorded.length === 0 && c.retained.length === 0, `${fail}: cancelled read must not retain stale success/error or send next command`);
  check(c.obdDevSession.readInProgress && c.obdDevSession.connectionState === "reading" && c.obdDevStatus.textContent === "new connection reading", `${fail}: old catch/finally changed a replacement connection`);
}

for (const cause of ["timeout", "stream-close", "stream-error", "write"]) {
  const { context: c } = await readClient();
  const waiting = deferred();
  let sent = 0;
  c.sendElmDeveloperCommand = async () => { sent += 1; return sent === 1 ? "43 01 33" : waiting.promise; };
  const pending = c.runObdDeveloperRead("read", ["03", "07"]);
  await settle();
  if (cause.startsWith("stream")) {
    load(c, ["readElmDeveloperLoop", "isCurrentWebSerialReadLoop"]);
    c.obdDevSession.reader.read = async () => {
      if (cause === "stream-error") throw new Error("device lost");
      return { done: true };
    };
    await c.readElmDeveloperLoop();
    if (c.obdSerialDisconnectOperation) await c.obdSerialDisconnectOperation.promise;
  }
  waiting.reject(new Error(cause === "timeout" ? "elm_response_timeout:07" : "elm_transport_disconnected"));
  check(await pending === false && c.recorded.length === 1 && c.retained.length === 1, `${cause}: genuine transport failure evidence must be retained exactly once`);
  check(c.retained[0].responses.length === 1 && c.obdDevSession.connectionState === "disconnected", `${cause}: partial successful response must survive transport failure`);
}

for (const replacement of ["bridge", "import"]) {
  for (const fail of [false, true]) {
    const { context: c } = await readClient();
    const waiting = deferred();
    c.sendElmDeveloperCommand = () => waiting.promise;
    const pending = c.runObdDeveloperRead("old read", ["03", "07"]);
    await c.disconnectObdDeveloperVci({ reason: "serial_read_failed" });
    if (replacement === "bridge") check(c.beginObdBridgeOperation() !== null, "Bridge should be usable after ordinary serial transport cleanup");
    const imported = c.obdDevSession.lastSession = { source: replacement };
    c.obdDevStatus.textContent = "replacement result";
    if (fail) waiting.reject(new Error("elm_transport_disconnected"));
    else waiting.resolve("43 00");
    check(await pending === false && c.recorded.length === 0 && c.retained.length === 0, `${replacement}/${fail}: late serial result must not be retained`);
    check(c.obdDevSession.lastSession === imported && c.obdDevStatus.textContent === "replacement result", `${replacement}/${fail}: newer result or status was overwritten`);
  }
}

for (const fail of [false, true]) {
  const { context: c } = await readClient();
  load(c, ["sendElmDeveloperCommand", "readElmDeveloperResponse", "hasCompletedElmDeveloperResponse", "takeCompletedElmDeveloperResponse", "isAllowedObdDeveloperCommand"]);
  vm.runInContext(source.match(/const WEB_SERIAL_READ_ONLY_COMMANDS = [\s\S]*?;/)[0], c);
  const waiting = deferred();
  let writes = 0;
  c.obdDevSession.writer.write = () => { writes += 1; return waiting.promise; };
  await assert.rejects(c.sendElmDeveloperCommand("04"));
  check(writes === 0, "DTC erase must remain outside the read-only command allowlist");
  const pending = c.sendElmDeveloperCommand("03");
  const rejected = assert.rejects(pending);
  c.lockObdAccess();
  const closing = c.disconnectObdDeveloperVci();
  c.obdAccessUnlocked = true;
  await settle();
  await c.connectObdDeveloperVci();
  check(c.obdSerialDisconnectOperation && !c.obdDevSession.port, `${fail}: reconnect bypassed unfinished write cleanup`);
  check(c.beginObdBridgeOperation() === null, `${fail}: bridge bypassed unfinished write cleanup`);
  if (fail) waiting.reject(new Error("write failed"));
  else waiting.resolve();
  await rejected;
  await closing;
  await c.connectObdDeveloperVci();
  c.obdDevSession.textBuffer = "new response>";
  await settle();
  check(writes === 1 && c.obdDevSession.port && c.obdDevSession.textBuffer === "new response>", `${fail}: settled old write changed a new connection response`);
}

{
  const { context: c } = await readClient();
  load(c, ["readElmDeveloperResponse", "hasCompletedElmDeveloperResponse", "takeCompletedElmDeveloperResponse"]);
  c.obdDevSession.textBuffer = "43 00>";
  check(await c.readElmDeveloperResponse(100) === "43 00", "Current response must be returned");
  c.obdDevSession.textBuffer = "";
  const pending = c.readElmDeveloperResponse(100);
  c.obdSerialRevision += 1;
  c.obdDevSession.textBuffer = "new response>";
  await assert.rejects(pending, /elm_operation_cancelled/);
  check(c.obdDevSession.textBuffer === "new response>", "Response polling must not consume a replacement buffer");
}

const workflows = ["readObdDeveloperDtc", "readObdDeveloperFreezeFrame", "readObdDeveloperEcuInfo", "readObdDeveloperReadiness", "readObdDeveloperOnboardMonitor", "readObdDeveloperPermanentDtc", "readObdDeveloperLiveSnapshot", "readObdDeveloperQuickLiveSnapshot", "readObdDeveloperSupportedPidMaps", "readObdDeveloperCoreScan", "readObdDeveloperQuickCondition"];
for (const name of workflows) {
 for (const replacement of ["connection", "import"]) {
  const { context: c } = await readClient();
  const waiting = deferred();
  let reads = 0;
  const read = () => { reads += 1; return waiting.promise; };
  for (const dependency of [...workflows, "runObdDeveloperRead", "captureObdDeveloperProtocolAfterStoredDtc"]) c[dependency] = read;
  c.beginWebSerialReadoutProfile = () => true;
  load(c, [name]);
  const pending = c[name]();
  if (replacement === "connection") c.obdSerialRevision += 1;
  else c.obdDevSession.lastSession = { source: "import" };
  c.obdDevSession.coreScanInProgress = true;
  c.obdDevSession.coreScanStopReason = "new reason";
  c.obdDevStatus.textContent = "new scan";
  waiting.resolve(true);
  await pending;
  check(reads === 1, `${name}/${replacement}: old follow-up crossed result ownership`);
  if (replacement === "connection") {
    check(c.obdDevSession.coreScanInProgress && c.obdDevSession.coreScanStopReason === "new reason" && c.obdDevStatus.textContent === "new scan", `${name}: stale finally reset the new scan`);
  } else {
    if (c.obdSerialDisconnectOperation) await c.obdSerialDisconnectOperation.promise;
    check(c.obdDevSession.lastSession.source === "import" && c.obdDevSession.connectionState === "disconnected", `${name}: import replacement must end old serial work without retaining over it`);
  }
 }
}

for (const name of ["initializeElmDeveloperAdapter", "identifyObdDeveloperVci", "captureObdDeveloperProtocolAfterStoredDtc"]) {
  for (const fail of [false, true]) {
    const { context: c } = await readClient();
    const waiting = deferred();
    let sent = 0;
    c.sendElmDeveloperCommand = () => { sent += 1; return waiting.promise; };
    load(c, [name]);
    const pending = c[name]();
    c.obdSerialRevision += 1;
    const metadata = c.obdDevSession.adapterInitializationSummary = { marker: "new initialization" };
    c.obdDevSession.readInProgress = true;
    if (fail) waiting.reject(new Error("elm_transport_disconnected"));
    else waiting.resolve("OK");
    if (name !== "initializeElmDeveloperAdapter") check(await pending === false, "Cancelled identification or protocol capture must stop");
    else await assert.rejects(pending);
    check(sent === 1 && c.obdDevSession.adapterInitializationSummary === metadata && c.obdDevSession.readInProgress, `${name}/${fail}: stale metadata or read lock update`);
  }
}
{
  const { context: c } = client();
  const commands = [];
  load(c, ["initializeElmDeveloperAdapter", "identifyObdDeveloperVci", "captureObdDeveloperProtocolAfterStoredDtc", "readObdDeveloperDtc"]);
  c.classifyWebSerialCommandResponse = () => ({ commandStatus: "completed" });
  c.appendObdDeveloperLog = () => {};
  c.buildWebSerialAdapterIdentity = (responses) => ({ commands: responses.map((row) => row.command) });
  c.mergeWebSerialAdapterIdentity = (_old, next) => next;
  c.sendElmDeveloperCommand = async (command) => {
    check(c.obdDevSession.connectionState === (command.startsWith("ATD") ? "reading" : "initializing"), `${command}: setup/protocol read state not held`);
    commands.push(command);
    return "OK";
  };
  await c.connectObdDeveloperVci();
  check(commands.join(",") === "ATZ,ATE0,ATL0,ATS0,ATH1,ATSP0,ATI,AT@1", "Setup must finish before non-retained adapter identification");
  check(c.obdDevSession.adapterInitializationSummary.status === "completed" && !c.obdDevSession.initializing && c.obdDevSession.connectionState === "ready", "Successful initialization must release the setup gate");
  c.runObdDeveloperRead = async (_label, requests) => { commands.push(...requests); return true; };
  c.hasWebSerialDtcStatusReport = () => true;
  c.hasWebSerialDtcCoverage = () => true;
  check(await c.readObdDeveloperDtc(), "Normal DTC sequence must still complete");
  check(commands.slice(8).join(",") === "03,ATDP,ATDPN,07,0A", "Protocol capture must follow reported Mode 03 before pending/permanent DTC");
  check(!c.obdDevSession.readInProgress && c.obdDevSession.connectionState === "ready", "Protocol capture must restore the read gate");
  commands.length = 0;
  c.hasWebSerialDtcStatusReport = () => false;
  check(await c.readObdDeveloperDtc() === false && commands.join(",") === "03", "Unreported stored DTC must not trigger follow-up commands");
}
for (const imported of [false, true]) {
  const { context: c } = await readClient();
  c.obdDevSession.lastSession = { sessionId: "same id", dtcSnapshot: { dtcs: [] } };
  c.obdSerialResultOwner.expectedLastSession = c.obdDevSession.lastSession;
  const revision = c.obdSerialRevision;
  if (imported) c.obdDevSession.lastSession = { sessionId: "same id", source: "external import" };
  const snapshot = c.obdDevSession.lastSession.dtcSnapshot;
  c.window = { ObdReadOnly: { normalizeCauseCandidateLog: (log) => log } };
  load(c, ["retainCauseCandidateLogInCurrentSession"]);
  c.retainCauseCandidateLogInCurrentSession({ causeCandidateLog: { label: "annotation" } });
  check(c.continueObdSerialOperation(revision) === !imported, `${imported}: annotations must not change result ownership or legitimize external imports`);
  if (imported) {
    if (c.obdSerialDisconnectOperation) await c.obdSerialDisconnectOperation.promise;
    check(c.obdDevSession.lastSession.source === "external import" && !c.obdDevSession.port, "Annotated external replacement must stay protected from serial writes");
  } else {
    check(c.obdDevSession.port && c.obdDevSession.lastSession.dtcSnapshot === snapshot && c.obdDevSession.lastSession.causeCandidateLog.label === "annotation", "Same-session diagnosis annotations must preserve transport and DTC snapshot");
  }
}
{
  const { context: c } = client();
  const button = {};
  c.document = { querySelectorAll: () => [button] };
  c.window = { ObdReadOnly: { buildBridgeSessionExportPayload: () => ({}) } };
  c.obdScannerImportOperation = null;
  load(c, ["getObdSessionExportBlockReason", "renderObdSessionExportControls"]);
  c.renderObdDeveloperGate = c.renderObdSessionExportControls;
  c.navigator.serial.requestPort = async () => { const error = new Error("cancelled"); error.name = "NotFoundError"; throw error; };
  await c.connectObdDeveloperVci();
  check(!c.obdSerialConnectPending && c.obdDevSession.lastSession.marker === "saved" && button.disabled === false,
    "Cancelling device selection must re-enable export of the previously retained result");
}
async function streamingClient() {
  const result = await readClient();
  const c = result.context;
  load(c, ["readElmDeveloperLoop", "isCurrentWebSerialReadLoop", "readElmDeveloperResponse", "hasCompletedElmDeveloperResponse", "takeCompletedElmDeveloperResponse", "sendElmDeveloperCommand", "isAllowedObdDeveloperCommand"]);
  vm.runInContext(source.match(/const WEB_SERIAL_READ_ONLY_COMMANDS = [\s\S]*?;/)[0], c);
  let incoming = deferred();
  const reader = c.obdDevSession.reader;
  reader.read = () => incoming.promise;
  reader.cancel = async () => incoming.resolve({ done: true });
  const deliver = (text) => {
    const pending = incoming;
    incoming = deferred();
    pending.resolve({ done: false, value: new TextEncoder().encode(text) });
  };
  return { ...result, deliver, loop: c.readElmDeveloperLoop() };
}

for (const length of [11999, 12000, 12001]) {
  for (const split of [false, true]) {
    const { context: c, calls, deliver, loop } = await streamingClient();
    const saved = c.obdDevSession.lastSession = { marker: "previous valid diagnostic result" };
    c.obdSerialResultOwner.expectedLastSession = saved;
    const payload = "X".repeat(length - 1) + ">";
    const response = c.readElmDeveloperResponse(500).then((value) => ({ value }), (error) => ({ error }));
    if (split) {
      deliver(payload.slice(0, 11995));
      await settle();
      deliver(payload.slice(11995));
    } else deliver(payload);
    const result = await response;
    if (length > 12000) {
      check(result.error?.message === "elm_transport_disconnected" && !result.value, `${length}/${split}: oversized response was accepted or treated as a timeout`);
      await loop;
      if (c.obdSerialDisconnectOperation) await c.obdSerialDisconnectOperation.promise;
      check(!c.obdDevSession.port && c.obdDevSession.textBuffer === "" && calls.close === 1
        && c.obdDevSession.lastDisconnectReason === "serial_response_too_large", `${length}/${split}: overflow did not clear input and disconnect once`);
    } else {
      check(result.value === payload.slice(0, -1) && c.obdDevSession.port && calls.close === 0, `${length}/${split}: bounded response was truncated or disconnected`);
      await c.disconnectObdDeveloperVci();
      await loop;
    }
    check(c.obdDevSession.lastSession === saved, `${length}/${split}: bare transport handling changed the saved diagnostic result`);
  }
}

{
  const { context: c, deliver, loop } = await streamingClient();
  load(c, ["formatWebSerialConnectionFailure"]);
  const writes = [];
  c.obdDevSession.writer.write = async (bytes) => {
    const command = new TextDecoder().decode(bytes).trim();
    writes.push(command);
    deliver(command === "03" ? "43 01 33\r>" : "X".repeat(12000) + "\r47 02 00\r>");
  };
  check(await c.runObdDeveloperRead("read", ["03", "07", "0A"]) === false, "Overflow must fail the active read attempt");
  await loop;
  if (c.obdSerialDisconnectOperation) await c.obdSerialDisconnectOperation.promise;
  check(writes.join(",") === "03,07" && c.recorded.length === 1 && c.recorded[0].outcome.transportErrorCount,
    "Overflow sent a follow-up command or lost transport failure evidence");
  check(c.retained.length === 1 && c.retained[0].responses.length === 1
    && c.retained[0].responses[0].response === "43 01 33" && !c.obdDevSession.port,
    "Overflow retained truncated input or discarded the earlier complete response");
  check(c.obdDevStatus.textContent.includes("受信上限") && c.obdDevSession.lastDisconnectReason === "serial_response_too_large",
    "Active read failure hid the overflow reason");
}

for (const suffix of ["", ">\r\n ", "\r47 02 00\r>"]) {
  const { context: c, deliver, loop } = await streamingClient();
  const response = c.readElmDeveloperResponse(500).then((value) => ({ value }), (error) => ({ error }));
  deliver("X".repeat(12001) + suffix);
  const result = await response;
  check(result.error?.message === "elm_transport_disconnected" && !result.value, "Oversized input with missing prompt, whitespace, or valid-looking suffix was accepted");
  await loop;
  if (c.obdSerialDisconnectOperation) await c.obdSerialDisconnectOperation.promise;
  check(c.obdDevSession.textBuffer === "" && !c.obdDevSession.port, "Oversized suffix response survived cleanup");
}

{
  const { context: c, calls, deliver, loop } = await streamingClient();
  c.obdDevSession.reader.cancel = async () => {};
  await c.disconnectObdDeveloperVci();
  c.readElmDeveloperLoop = () => {};
  await c.connectObdDeveloperVci();
  const replacement = c.obdDevSession.port;
  c.obdDevSession.textBuffer = "new response>";
  deliver("X".repeat(12000) + ">");
  await loop;
  check(c.obdDevSession.port === replacement && c.obdDevSession.textBuffer === "new response>" && calls.close === 1,
    "Late oversized input from an old reader changed the new connection");
  await c.disconnectObdDeveloperVci();
}

for (const stage of ["initialize", "identify"]) {
  for (const cleanupFirst of [false, true]) {
    const { context: c, calls, port } = client();
    load(c, ["readElmDeveloperLoop", "isCurrentWebSerialReadLoop", "formatWebSerialConnectionFailure"]);
    const incoming = deferred();
    const cleanup = deferred();
    const response = deferred();
    port.readable.getReader = () => ({ read: () => incoming.promise, cancel: () => cleanup.promise, releaseLock: () => {} });
    if (stage === "initialize") c.initializeElmDeveloperAdapter = () => response.promise;
    else c.identifyObdDeveloperVci = () => response.promise;
    const connecting = c.connectObdDeveloperVci();
    await settle();
    incoming.resolve({ done: false, value: new TextEncoder().encode("X".repeat(12000) + ">") });
    await settle();
    check(c.obdDevSession.port === null && c.obdDevSession.lastDisconnectReason === "serial_response_too_large",
      `${stage}/${cleanupFirst}: initialization overflow did not immediately detach transport`);
    if (cleanupFirst) { cleanup.resolve(); await settle(); }
    response.reject(new Error("elm_transport_disconnected"));
    await settle();
    if (!cleanupFirst) cleanup.resolve();
    await connecting;
    check(c.obdDevSession.lastDisconnectReason === "serial_response_too_large" && calls.close === 1 && calls.failure === 1
      && c.obdDevSession.connectionState === "disconnected" && c.obdSerialDisconnectOperation === null
      && c.obdDevStatus.textContent.includes("受信上限"), `${stage}/${cleanupFirst}: connection cleanup overwrote the overflow reason or repeated port cleanup`);
  }
}

function loadDeveloperGate(c) {
  const gate = source.match(/function renderObdDeveloperGate\([^\n]*\) \{[\s\S]*?\r?\n\}/)[0];
  for (const [, name] of gate.matchAll(/\b(obd[A-Z]\w*)\.(?:textContent|disabled|hidden|value)/g)) {
    if (!(name in c)) c[name] = { textContent: "", value: "" };
  }
  c.document = { querySelectorAll: () => [] };
  c.window = { ObdReadOnly: { getCapability: () => ({ secureContext: true, webSerialSupported: true }) } };
  c.getSelectedObdInterfaceLabel = () => "ELM327";
  c.resolveObdInterfaceId = () => "user-vci-elm327";
  c.getObdInterfaceReadoutRoute = () => ({ route: "desktop_web_serial" });
  c.getObdPrimaryActionLabel = () => "connect";
  c.getRequestedInterfaceReadyStatus = c.getRequestedInterfaceIdleStatus = () => "";
  c.getObdAutoStage = () => "setup";
  for (const name of ["renderObdBridgePairingControls", "renderObdPreviewButtons", "renderObdWorkflowGuide", "renderObdDeveloperSessionSummary", "renderObdStageView"]) c[name] = () => {};
  vm.runInContext(gate, c);
}

for (const failWrite of [false, true]) {
  for (const cleanup of ["normal", "reader-cancel", "reader-release", "writer-release", "close", "slow-close"]) {
    const { context: c, port, calls } = await readClient();
    load(c, ["sendElmDeveloperCommand", "isAllowedObdDeveloperCommand"]);
    vm.runInContext(source.match(/const WEB_SERIAL_READ_ONLY_COMMANDS = [\s\S]*?;/)[0], c);
    loadDeveloperGate(c);
    const writing = deferred();
    const closing = deferred();
    const actions = [];
    let polls = 0;
    c.readElmDeveloperResponse = async () => { polls += 1; return "43 00"; };
    const record = (name) => { actions.push(name); if (cleanup === name) throw new Error(name); };
    c.obdDevSession.reader.cancel = async () => record("reader-cancel");
    c.obdDevSession.reader.releaseLock = () => record("reader-release");
    c.obdDevSession.writer.releaseLock = () => record("writer-release");
    c.obdDevSession.writer.write = () => { actions.push("write"); return writing.promise; };
    port.close = async () => { record("close"); if (cleanup === "slow-close") await closing.promise; };
    const saved = c.obdDevSession.lastSession = { marker: "valid result" };
    c.obdSerialResultOwner.expectedLastSession = saved;
    const pending = c.sendElmDeveloperCommand("03").then((value) => ({ value }), (error) => ({ error }));
    c.obdDevSession.textBuffer = "owner buffer";
    await assert.rejects(c.sendElmDeveloperCommand("07"), /elm_write_busy/);
    check(actions.join(",") === "write" && c.obdDevSession.textBuffer === "owner buffer", "Overlapping write changed the owning buffer or sent a command");
    check(await c.runObdDeveloperRead("overlap", ["07"]) === false && c.recorded.length === 0 && c.retained.length === 0
      && c.obdDevSession.lastSession === saved && c.obdDevSession.port === port && actions.join(",") === "write",
      "Overlapping read produced a diagnostic failure or disconnected the owning write");
    const cleanupPromise = c.disconnectObdDeveloperVci();
    await settle();
    await c.connectObdDeveloperVci();
    check(c.obdSerialDisconnectOperation && c.obdDevSession.connectionState === "disconnecting" && !c.obdDevSession.port
      && !actions.includes("writer-release") && !actions.includes("close") && calls.select === 1 && polls === 0,
      `${failWrite}/${cleanup}: unfinished write was released or reused`);
    c.lockObdDeveloperMode();
    c.obdDevModeUnlocked = true;
    c.renderObdDeveloperGate();
    check(c.obdDevConnectButton.disabled && c.obdDevStatus.textContent.includes("車両側の停止は未確認")
      && c.beginObdBridgeOperation() === null, `${cleanup}: lock/unlock hid quarantine or allowed bridge requests`);
    if (failWrite) writing.reject(new Error("late write failure"));
    else writing.resolve();
    const result = await pending;
    await settle();
    check(result.error && !result.value && polls === 0 && c.obdDevSession.pendingWriteOperation === null,
      `${failWrite}/${cleanup}: late write outcome started response polling or retained pending ownership`);
    if (cleanup === "slow-close") {
      check(c.obdSerialDisconnectOperation && c.beginObdBridgeOperation() === null, "Slow close released the cleanup barrier early");
      closing.resolve();
    }
    await cleanupPromise;
    check(actions.join(",") === "write,reader-cancel,reader-release,writer-release,close" && c.obdDevSession.lastSession === saved,
      `${failWrite}/${cleanup}: cleanup repeated resources or replaced the diagnostic session`);
    if (["normal", "slow-close"].includes(cleanup)) {
      check(!c.obdSerialDisconnectOperation && !c.obdDevConnectButton.disabled, "Confirmed cleanup did not release connection controls");
      await c.connectObdDeveloperVci();
      check(c.obdDevSession.port && calls.select === 2, "Fresh connection was blocked after actual write and cleanup completed");
      await c.disconnectObdDeveloperVci();
    } else {
      await c.disconnectObdDeveloperVci();
      await c.connectObdDeveloperVci();
      c.renderObdDeveloperGate();
      check(c.obdSerialDisconnectOperation?.cleanupFailed && c.obdDevConnectButton.disabled && calls.select === 1
        && c.obdDevConnectionState.textContent === "終了未確認" && c.beginObdBridgeOperation() === null,
        `${cleanup}: unconfirmed cleanup was marked disconnected or retried`);
    }
  }
}

for (const rejectWrite of [false, true]) {
  const { context: c, port } = await readClient();
  load(c, ["sendElmDeveloperCommand", "isAllowedObdDeveloperCommand"]);
  vm.runInContext(source.match(/const WEB_SERIAL_READ_ONLY_COMMANDS = [\s\S]*?;/)[0], c);
  const writing = deferred();
  const stream = new WritableStream({ write: () => writing.promise });
  c.obdDevSession.writer = stream.getWriter();
  let closed = 0;
  port.close = async () => { assert.equal(stream.locked, false); closed += 1; };
  c.readElmDeveloperResponse = async () => { throw new Error("unexpected response polling"); };
  const result = c.sendElmDeveloperCommand("03").then((value) => ({ value }), (error) => ({ error }));
  const close = c.disconnectObdDeveloperVci();
  await settle();
  check(stream.locked && closed === 0 && c.obdSerialDisconnectOperation, "Real WritableStream lock was released before the pending write settled");
  if (rejectWrite) writing.reject(new Error("underlying sink rejected"));
  else writing.resolve();
  check(Boolean((await result).error), "Real stream late completion was accepted after disconnect");
  await close;
  check(!stream.locked && closed === 1 && !c.obdSerialDisconnectOperation, "Real WritableStream cleanup did not release the port exactly once");
}

{
  const { context: c } = await readClient();
  load(c, ["sendElmDeveloperCommand", "isAllowedObdDeveloperCommand"]);
  vm.runInContext(source.match(/const WEB_SERIAL_READ_ONLY_COMMANDS = [\s\S]*?;/)[0], c);
  c.obdDevSession.writer.write = () => { throw new Error("synchronous write failure"); };
  await assert.rejects(c.sendElmDeveloperCommand("03"), /elm_transport_write_failed:03/);
  check(c.obdDevSession.pendingWriteOperation === null, "Synchronous write failure leaked ownership");
  c.obdDevSession.writer.write = async () => {};
  c.readElmDeveloperResponse = async () => "43 00";
  check(await c.sendElmDeveloperCommand("03") === "43 00" && !c.obdDevSession.pendingWriteOperation,
    "Normal write did not continue to response polling or release ownership");
  await c.disconnectObdDeveloperVci();
}

function installWriteDeadlineHarness(c) {
  load(c, ["sendElmDeveloperCommand", "isAllowedObdDeveloperCommand"]);
  vm.runInContext(source.match(/const WEB_SERIAL_READ_ONLY_COMMANDS = [\s\S]*?;/)[0], c);
  let now = 0;
  let nextId = 0;
  const timers = new Map();
  c.performance = { now: () => now };
  c.setTimeout = (callback, delay) => { const id = ++nextId; timers.set(id, { callback, due: now + delay }); return id; };
  c.clearTimeout = (id) => timers.delete(id);
  return {
    timers,
    advance(ms, fire = true) {
      now += ms;
      if (fire) for (const [id, timer] of [...timers]) {
        if (timer.due <= now && timers.delete(id)) timer.callback();
      }
    }
  };
}

for (const completedCount of [0, 1]) {
  for (const lateReject of [false, true]) {
    for (const priorLoss of [false, true]) {
    const { context: c, port } = await readClient();
    const clock = installWriteDeadlineHarness(c);
    loadDeveloperGate(c);
    const writing = deferred();
    const sent = [];
    let polls = 0;
    c.obdDevSession.writer.write = async (bytes) => {
      sent.push(new TextDecoder().decode(bytes).trim());
      if (sent.length > completedCount) await writing.promise;
    };
    c.readElmDeveloperResponse = async () => { polls += 1; return "43 01 33"; };
    const context = {
      supportedPidDiscoveryComplete: true, supportedPidSet: ["0C"],
      supportedPidReadoutResponses: [{ command: "0100", response: "41 00 BE 3E B8 13" }],
      freezeFrameCapabilityResponse: "42 00 00 BE 3E B8 13", livePidTimeline: [{ marker: "prior sample" }],
      observationContext: { marker: "prior observation" }
    };
    Object.assign(c.obdDevSession, context);
    const retain = c.retainObdDeveloperReadout;
    let retainedContext;
    c.retainObdDeveloperReadout = (...args) => {
      retainedContext = Object.fromEntries(Object.keys(context).map((key) => [key, c.obdDevSession[key]]));
      return retain(...args);
    };
    const pending = c.runObdDeveloperRead("deadline", ["03", "07", "0A"]);
    await settle();
    if (priorLoss) {
      void c.disconnectObdDeveloperVci({ reason: "serial_read_failed" });
      check(c.obdDevSession.observationContext === null && c.obdDevSession.supportedPidSet.length === 0,
        "Ordinary receiver disconnect no longer resets live transport context");
    }
    clock.advance(3500);
    check(await pending === false && c.obdSerialDisconnectOperation && !c.obdDevSession.port,
      "Write deadline did not finish the read caller while cleanup remained pending");
    check(sent.length === completedCount + 1 && polls === completedCount && c.recorded.length === 1
      && c.recorded[0].outcome.timedOut && c.recorded[0].outcome.transportErrorCount
      && c.retained.length === 1 && c.retained[0].responses.length === completedCount,
      "Write timeout lost partial evidence, claimed success, or sent a subsequent command");
    check(Object.keys(context).every((key) => retainedContext[key] === context[key]), "Write timeout cleared diagnostic context before failure retention");
    check(c.obdDevConnectButton.disabled && (priorLoss || c.obdDevStatus.textContent.includes("送信待ち時間を超過"))
      && c.beginObdBridgeOperation() === null && clock.timers.size === 0, "Timeout quarantine or timer cleanup is missing");
    const cleanup = c.obdSerialDisconnectOperation.promise;
    if (lateReject) writing.reject(new Error("late rejection"));
    else writing.resolve();
    await cleanup;
    await settle();
    check(c.recorded.length === 1 && c.retained.length === 1 && polls === completedCount && sent.length === completedCount + 1
      && !c.obdDevSession.pendingWriteOperation && !c.obdSerialDisconnectOperation,
      "Late actual-write completion resumed a timed-out command or leaked ownership");
    check(Object.keys(context).every((key) => c.obdDevSession[key] === context[key]), "Cleanup completion discarded timeout evidence before the next connection");
    await c.connectObdDeveloperVci();
    check(c.obdDevSession.port === port && !c.obdDevSession.supportedPidDiscoveryComplete && c.obdDevSession.supportedPidSet.length === 0
      && c.obdDevSession.supportedPidReadoutResponses.length === 0 && c.obdDevSession.freezeFrameCapabilityResponse === null
      && c.obdDevSession.livePidTimeline.length === 0 && c.obdDevSession.observationContext !== context.observationContext,
      "New connection reused diagnostic context from the timed-out transport");
    await c.disconnectObdDeveloperVci();
    }
  }
}

for (const elapsed of [19, 20]) {
  for (const rejectWrite of [false, true]) {
  const { context: c } = await readClient();
  const clock = installWriteDeadlineHarness(c);
  const writing = deferred();
  c.obdDevSession.writer.write = () => writing.promise;
  let responseTimeout;
  c.readElmDeveloperResponse = async (timeout) => { responseTimeout = timeout; return "43 00"; };
  const pending = c.sendElmDeveloperCommand("03", 20).then((value) => ({ value }), (error) => ({ error }));
  clock.advance(elapsed, false);
  if (rejectWrite) writing.reject(new Error("write rejected before timer callback"));
  else writing.resolve();
  const result = await pending;
  if (elapsed === 19 && rejectWrite) check(result.error?.message === "elm_transport_write_failed:03" && responseTimeout === undefined,
    "Pre-deadline rejection was misclassified as timeout");
  else if (elapsed === 19) check(result.value === "43 00" && responseTimeout === 20, "Successful write did not receive its separate full response deadline");
  else check(result.error?.message === "elm_transport_write_timeout:03" && responseTimeout === undefined,
    "Overdue write was accepted before the delayed timer callback ran");
  if (c.obdSerialDisconnectOperation) await c.obdSerialDisconnectOperation.promise;
  check(clock.timers.size === 0 && !c.obdDevSession.pendingWriteOperation, "Completed write leaked its deadline timer or ownership");
  await c.disconnectObdDeveloperVci();
  }
}

for (const stage of ["initialize", "identify", "manual-identify", "protocol"]) {
  const result = stage.startsWith("manual") || stage === "protocol" ? await readClient() : client();
  const { context: c, calls } = result;
  const clock = installWriteDeadlineHarness(c);
  loadDeveloperGate(c);
  load(c, ["identifyObdDeveloperVci", "captureObdDeveloperProtocolAfterStoredDtc"]);
  const writing = deferred();
  let sent = 0;
  const write = () => { sent += 1; return writing.promise; };
  const saved = c.obdDevSession.lastSession = { marker: "saved diagnostic result" };
  if (c.obdSerialResultOwner) c.obdSerialResultOwner.expectedLastSession = saved;
  c.retainWebSerialConnectionAttempt = () => {
    calls.failure += 1;
    c.obdDevSession.lastSession = { reason: c.obdDevSession.lastDisconnectReason, state: c.obdDevSession.connectionState };
  };
  c.readElmDeveloperResponse = async () => { throw new Error("unexpected response polling"); };
  let pending;
  if (stage === "initialize" || stage === "identify") {
    result.port.writable.getWriter = () => ({ write, releaseLock: () => {} });
    c.initializeElmDeveloperAdapter = stage === "initialize"
      ? () => c.sendElmDeveloperCommand("ATZ", 5000)
      : async () => { c.obdDevSession.adapterInitializationSummary = { initializationStatus: "completed" }; };
    pending = c.connectObdDeveloperVci();
  } else {
    c.obdDevSession.writer.write = write;
    pending = stage === "protocol" ? c.captureObdDeveloperProtocolAfterStoredDtc() : c.identifyObdDeveloperVci();
  }
  await settle();
  clock.advance(stage === "initialize" ? 5000 : 2500);
  await pending;
  check(sent === 1 && c.obdSerialDisconnectOperation && !c.obdDevSession.port && clock.timers.size === 0,
    `${stage}: write-timeout caller hung, sent a second command, or bypassed quarantine`);
  if (stage === "initialize" || stage === "identify") {
    check(calls.failure === 1 && c.obdDevSession.lastSession.reason === (stage === "initialize" ? "adapter_initialization_failed" : "adapter_identification_failed")
      && c.obdSerialResultOwner.expectedLastSession === c.obdDevSession.lastSession, `${stage}: initial failure was not recorded before cleanup wait`);
  } else check(c.obdDevSession.lastSession === saved, `${stage}: timeout replaced an existing diagnostic session`);
  const cleanup = c.obdSerialDisconnectOperation.promise;
  writing.resolve();
  await cleanup;
  check(sent === 1 && !c.obdSerialDisconnectOperation, `${stage}: late write completion restarted identification or protocol capture`);
}

for (const failure of ["reader", "writer", "close", "slow-close"]) {
  const { context: c, port } = await readClient();
  const clock = installWriteDeadlineHarness(c);
  loadDeveloperGate(c);
  const writing = deferred();
  const closing = deferred();
  c.obdDevSession.writer.write = () => writing.promise;
  if (failure === "reader") c.obdDevSession.reader.cancel = async () => { throw new Error("reader failure"); };
  if (failure === "writer") c.obdDevSession.writer.releaseLock = () => { throw new Error("writer failure"); };
  port.close = async () => {
    if (failure === "close") throw new Error("close failure");
    if (failure === "slow-close") await closing.promise;
  };
  const pending = c.sendElmDeveloperCommand("03", 20).then((value) => ({ value }), (error) => ({ error }));
  clock.advance(20);
  check((await pending).error?.message === "elm_transport_write_timeout:03", "Cleanup failure blocked the command deadline");
  const cleanup = c.obdSerialDisconnectOperation.promise;
  writing.resolve();
  await settle();
  if (failure === "slow-close") {
    check(c.obdSerialDisconnectOperation && c.beginObdBridgeOperation() === null, "Timeout released a slow-close barrier");
    closing.resolve();
  }
  await cleanup;
  if (failure !== "slow-close") {
    c.renderObdDeveloperGate();
    check(c.obdSerialDisconnectOperation?.cleanupFailed && c.obdDevConnectButton.disabled
      && c.obdDevConnectionState.textContent === "終了未確認", "Timed-out write cleanup failure released quarantine");
  } else check(!c.obdSerialDisconnectOperation, "Confirmed timeout cleanup remained stuck");
}

{
  const { context: c } = await readClient();
  const clock = installWriteDeadlineHarness(c);
  const writing = deferred();
  c.obdDevSession.writer.write = () => writing.promise;
  const pending = c.sendElmDeveloperCommand("03", 20).then((value) => ({ value }), (error) => ({ error }));
  c.lockObdAccess();
  const cleanup = c.obdSerialDisconnectOperation.promise;
  const replacement = c.obdDevSession.lastSession = { marker: "new imported session" };
  c.obdDevStatus.textContent = "new imported status";
  clock.advance(20);
  check(Boolean((await pending).error) && c.obdDevSession.lastSession === replacement
    && c.obdDevStatus.textContent === "new imported status" && c.obdDevSession.lastDisconnectReason === "access_locked",
    "Old write deadline overwrote explicit cancellation or replacement data");
  writing.reject(new Error("cancelled writer failed late"));
  await cleanup;
  check(c.obdDevSession.lastSession === replacement && clock.timers.size === 0, "Late rejected write changed imported data or leaked a timer");
}

{
  const { context: c } = await readClient();
  const clock = installWriteDeadlineHarness(c);
  let writes = 0;
  c.obdDevSession.writer.write = async () => { writes += 1; };
  for (const timeout of [0, -1, NaN, Infinity, 60001]) {
    await assert.rejects(c.sendElmDeveloperCommand("03", timeout), /elm_write_timeout_invalid/);
  }
  await assert.rejects(c.sendElmDeveloperCommand("04", 20));
  check(writes === 0 && clock.timers.size === 0 && !c.obdDevSession.pendingWriteOperation,
    "Invalid deadlines or DTC erase reached the writer");
  await c.disconnectObdDeveloperVci();
}

for (const cancel of [false, true]) {
  const { context: c } = await readClient();
  const clock = installWriteDeadlineHarness(c);
  const writing = deferred();
  c.obdDevSession.writer.write = () => writing.promise;
  c.obdDevSession.observationContext = { marker: "old observation" };
  const pending = c.runObdDeveloperRead("receiver loss", ["03"]);
  void c.disconnectObdDeveloperVci({ reason: "serial_read_failed" });
  if (cancel) c.lockObdAccess();
  const replacement = c.obdDevSession.lastSession = { marker: "new result" };
  clock.advance(3500);
  check(await pending === false && c.retained.length === 0 && c.recorded.length === 0
    && c.obdDevSession.lastSession === replacement && c.obdDevSession.observationContext === null,
    "Old timeout restored context after cancellation or replacement");
  const cleanup = c.obdSerialDisconnectOperation.promise;
  writing.resolve();
  await cleanup;
}

for (const stage of ["initialize", "identify"]) {
  for (const lossReason of ["serial_read_failed", "serial_response_too_large"]) {
  const { context: c, port } = client();
  const clock = installWriteDeadlineHarness(c);
  load(c, ["identifyObdDeveloperVci", "buildWebSerialConnectionStatus", "retainWebSerialConnectionAttempt"]);
  const writing = deferred();
  port.writable.getWriter = () => ({ write: () => writing.promise, releaseLock: () => {} });
  c.hasBridgeDiagnosticScanSessionSupport = () => true;
  c.buildSelectedObdReadoutInterface = () => ({});
  c.renderObdDeveloperSessionSummary = () => {};
  c.window = { ObdReadOnly: { buildDiagnosticScanSession: (value) => value } };
  c.initializeElmDeveloperAdapter = stage === "initialize" ? async () => {
    try { await c.sendElmDeveloperCommand("ATZ", 5000); }
    catch (error) { c.obdDevSession.adapterInitializationSummary = { initializationStatus: "failed" }; throw error; }
  } : async () => { c.obdDevSession.adapterInitializationSummary = { initializationStatus: "completed" }; };
  const pending = c.connectObdDeveloperVci();
  await settle();
  const observation = c.obdDevSession.observationContext;
  void c.disconnectObdDeveloperVci({ reason: lossReason });
  clock.advance(stage === "initialize" ? 5000 : 2500);
  await pending;
  const retained = c.obdDevSession.lastSession;
  check(retained.connectionStatus.ok === false && retained.connectionStatus.status === (stage === "initialize"
    ? "adapter_initialization_failed" : "adapter_identification_failed") && retained.connectionStatus.vehicleCommandEnabled === false,
    `${stage}: receiver loss before write timeout recorded a successful connection`);
  check(retained.observationContext === observation && c.obdSerialResultOwner.expectedLastSession === retained,
    `${stage}: connection timeout lost observation context or result ownership`);
  const cleanup = c.obdSerialDisconnectOperation.promise;
  writing.reject(new Error("late sink rejection"));
  await cleanup;
  check(c.obdDevSession.lastSession === retained && !retained.connectionStatus.ok,
    `${stage}: late cleanup replaced the retained connection failure`);
  }
}

{
  const { context: c } = await readClient();
  installWriteDeadlineHarness(c);
  const response = deferred();
  const sent = [];
  c.obdDevSession.writer.write = async (bytes) => sent.push(new TextDecoder().decode(bytes).trim());
  c.readElmDeveloperResponse = () => response.promise;
  const first = c.sendElmDeveloperCommand("03");
  await settle();
  c.obdDevSession.textBuffer = "43 01";
  const second = c.sendElmDeveloperCommand("07").then((value) => ({ value }), (error) => ({ error }));
  await settle();
  check(sent.join(",") === "03" && c.obdDevSession.textBuffer === "43 01",
    "A second command overwrote the active response buffer after write completion");
  check((await second).error?.message === "elm_write_busy", "Response-wait overlap was not rejected as busy");
  response.resolve("43 01 33");
  check(await first === "43 01 33", "Overlap rejection changed the owning command result");
  await c.disconnectObdDeveloperVci();
}

for (const wallJump of [-3600000, 0, 3600000]) {
  const { context: c } = await readClient();
  const clock = installWriteDeadlineHarness(c);
  load(c, ["readElmDeveloperResponse", "hasCompletedElmDeveloperResponse", "takeCompletedElmDeveloperResponse"]);
  let wall = 10000000;
  c.Date = class extends Date { static now() { return wall; } };
  c.obdDevSession.textBuffer = "";
  const pending = c.readElmDeveloperResponse(50);
  wall += wallJump;
  clock.advance(40);
  await settle();
  check(clock.timers.size === 1, "Wall-clock correction ended the response wait early");
  c.obdDevSession.textBuffer = "43 01 33>";
  clock.advance(10);
  check(await pending === "", "Response received at the monotonic deadline was accepted");
  check(clock.timers.size === 0, "Response deadline left a polling timer active");
  await c.disconnectObdDeveloperVci();
}

for (const cause of ["lock", "import", "port", "reader", "command"]) {
  const { context: c, port } = await readClient();
  const clock = installWriteDeadlineHarness(c);
  load(c, ["readElmDeveloperResponse", "hasCompletedElmDeveloperResponse", "takeCompletedElmDeveloperResponse"]);
  const pending = c.readElmDeveloperResponse(50).then((value) => ({ value }), (error) => ({ error }));
  if (cause === "lock") c.lockObdAccess();
  if (cause === "import") c.obdDevSession.lastSession = { marker: "replacement" };
  if (cause === "port") c.obdDevSession.port = { marker: "new port" };
  if (cause === "reader") c.obdDevSession.reader = { marker: "new reader" };
  if (cause === "command") c.obdDevSession.pendingCommandOperation = { marker: "replacement command" };
  c.obdDevSession.textBuffer = "new result>";
  clock.advance(50);
  check(Boolean((await pending).error) && c.obdDevSession.textBuffer === "new result>" && clock.timers.size === 0,
    `${cause}: final deadline wake accepted a response or timeout from a replacement owner`);
  c.obdDevSession.port = port;
  c.obdDevSession.reader = null;
  await c.disconnectObdDeveloperVci();
}

for (const lateReject of [false, true]) {
  const { context: c, port } = await readClient();
  installWriteDeadlineHarness(c);
  const oldResponse = deferred();
  const newResponse = deferred();
  c.obdDevSession.writer.write = async () => {};
  c.readElmDeveloperResponse = () => oldResponse.promise;
  const old = c.sendElmDeveloperCommand("03").then((value) => ({ value }), (error) => ({ error }));
  await settle();
  await c.disconnectObdDeveloperVci({ reason: "serial_read_failed" });
  check(c.obdDevSession.pendingCommandOperation === null && c.beginObdBridgeOperation() !== null,
    "Response wait unnecessarily blocked bridge after completed transport cleanup");
  c.obdBridgeOperation = null;
  await c.connectObdDeveloperVci();
  c.obdDevSession.writer.write = async () => {};
  c.readElmDeveloperResponse = () => newResponse.promise;
  const current = c.sendElmDeveloperCommand("07");
  await settle();
  const owner = c.obdDevSession.pendingCommandOperation;
  if (lateReject) oldResponse.reject(new Error("old response failed"));
  else oldResponse.resolve("43 01 33");
  check(Boolean((await old).error) && c.obdDevSession.port === port && c.obdDevSession.pendingCommandOperation === owner,
    "Old response settlement cleared the replacement command ownership");
  newResponse.resolve("47 00");
  check(await current === "47 00" && c.obdDevSession.pendingCommandOperation === null,
    "Replacement command could not complete after old response settlement");
  await c.disconnectObdDeveloperVci();
}

for (const mode of ["success", "timeout", "transport", "overflow"]) {
  const { context: c } = await readClient();
  installWriteDeadlineHarness(c);
  load(c, ["identifyObdDeveloperVci", "captureObdDeveloperProtocolAfterStoredDtc"]);
  const response = deferred();
  const sent = [];
  c.obdDevSession.writer.write = async (bytes) => sent.push(new TextDecoder().decode(bytes).trim());
  c.readElmDeveloperResponse = () => response.promise;
  c.buildWebSerialAdapterIdentity = (rows) => ({ commands: rows.map((row) => row.command) });
  c.mergeWebSerialAdapterIdentity = (_old, next) => next;
  let logs = 0;
  c.appendObdDeveloperLog = () => { logs += 1; };
  const saved = c.obdDevSession.lastSession;
  const originalIdentity = c.obdDevSession.adapterIdentity;
  const pending = c.identifyObdDeveloperVci();
  await settle();
  c.obdDevSession.textBuffer = "ELM partial";
  check(await c.identifyObdDeveloperVci() === false && await c.runObdDeveloperRead("overlap", ["03"]) === false
    && await c.captureObdDeveloperProtocolAfterStoredDtc() === false && c.obdDevSession.readInProgress
    && sent.join(",") === "ATI" && c.obdDevSession.textBuffer === "ELM partial"
    && c.recorded.length === 0 && c.retained.length === 0, "Overlap changed manual identification ownership or created false diagnostic results");
  if (mode === "success") response.resolve("ELM327");
  if (mode === "timeout") response.resolve("");
  if (mode === "transport") response.reject(new Error("elm_transport_disconnected"));
  if (mode === "overflow") {
    await c.disconnectObdDeveloperVci({ reason: "serial_response_too_large" });
    response.reject(new Error("elm_transport_disconnected"));
  }
  await pending;
  check(!c.obdDevSession.readInProgress && !c.obdDevSession.pendingCommandOperation && c.obdDevSession.lastSession === saved,
    `${mode}: manual identification leaked busy state or replaced saved diagnosis`);
  if (mode === "success") check(sent.join(",") === "ATI,AT@1" && logs === 1 && c.obdDevSession.adapterIdentity.commands.length === 2,
    "Normal two-command adapter identification failed");
  else check(sent.join(",") === "ATI" && logs === 0 && c.obdDevSession.adapterIdentity === originalIdentity && !c.obdDevSession.port
    && c.obdDevSession.lastDisconnectReason === (mode === "overflow" ? "serial_response_too_large" : mode === "timeout" ? "response_timeout" : "transport_failed"),
    `${mode}: failed manual identification reused transport or retained partial identity`);
  await c.disconnectObdDeveloperVci();
}

function installProfileHarness(c) {
  load(c, ["beginWebSerialReadoutProfile", "readObdDeveloperCoreScan", "readObdDeveloperQuickCondition"]);
  const effects = [];
  c.obdScannerText = { value: "previous readout" };
  c.obdDetectedCodes = { innerHTML: "previous DTCs" };
  c.invalidateObdScannerImport = () => effects.push("invalidate");
  c.renderObdMonitorValues = () => effects.push("monitor");
  c.hideResult = () => effects.push("hide");
  c.renderObdDeveloperSessionSummary = () => effects.push("summary");
  return effects;
}

{
  const { context: c } = await readClient();
  const effects = installProfileHarness(c);
  const saved = c.obdDevSession.lastSession = { marker: "previous diagnostic result" };
  c.obdSerialResultOwner.expectedLastSession = saved;
  const response = deferred();
  c.sendElmDeveloperCommand = () => response.promise;
  const pending = c.runObdDeveloperRead("individual read", ["03"]);
  const admitted = c.beginWebSerialReadoutProfile("initial_diagnostic");
  check(admitted === false && effects.length === 0 && c.obdDevSession.lastSession === saved
    && c.obdSerialResultOwner.expectedLastSession === saved && c.obdDevSession.readInProgress,
    "Starting a scan during an individual read reset its result or ownership");
  response.resolve("43 01 33");
  check(await pending === true && c.retained.length === 1 && c.recorded.length === 1,
    "Refused scan start prevented the owning read from completing");
  await c.disconnectObdDeveloperVci();
}

const profileBlockers = [
  ["read", (c) => { c.obdDevSession.readInProgress = true; }],
  ["initializing", (c) => { c.obdDevSession.initializing = true; }],
  ["scan", (c) => { c.obdDevSession.coreScanInProgress = true; }],
  ["command", (c) => { c.obdDevSession.pendingCommandOperation = {}; }],
  ["write", (c) => { c.obdDevSession.pendingWriteOperation = {}; }],
  ["bridge", (c) => { c.obdBridgeOperation = {}; }],
  ["connect", (c) => { c.obdSerialConnectPending = true; }],
  ["disconnect", (c) => { c.obdSerialDisconnectOperation = {}; }],
  ["port", (c) => { c.obdDevSession.port = null; }],
  ["reader", (c) => { c.obdDevSession.reader = null; }],
  ["writer", (c) => { c.obdDevSession.writer = null; }],
  ["read-loop", (c) => { c.obdDevSession.readLoopActive = false; }],
  ["access", (c) => { c.obdAccessUnlocked = false; }],
  ["developer", (c) => { c.obdDevModeUnlocked = false; }],
  ["revision", (c) => { c.obdSerialRevision += 1; }],
  ["owner", (c) => { c.obdSerialResultOwner = null; }],
  ...["disconnected", "selecting", "opening", "initializing", "reading", "disconnecting"].map((state) =>
    [state, (c) => { c.obdDevSession.connectionState = state; }])
];
for (const profile of ["initial_diagnostic", "quick_condition"]) {
  for (const [label, block] of profileBlockers) {
    const { context: c } = await readClient();
    const effects = installProfileHarness(c);
    const saved = c.obdDevSession.lastSession = { marker: "saved result" };
    c.obdSerialResultOwner.expectedLastSession = saved;
    c.obdDevSession.lastRawText = "prior log";
    c.obdDevSession.readoutAttempts = [{ marker: "prior attempt" }];
    c.obdDevSession.livePidTimeline = [{ marker: "prior sample" }];
    block(c);
    const before = { ...c.obdDevSession };
    const owner = c.obdSerialResultOwner;
    const revision = c.obdSerialRevision;
    const admitted = c.beginWebSerialReadoutProfile(profile);
    await c.readObdDeveloperCoreScan();
    await c.readObdDeveloperQuickCondition();
    check(admitted === false && effects.length === 0
      && Object.keys(before).every((key) => c.obdDevSession[key] === before[key])
      && c.obdSerialResultOwner === owner && c.obdSerialRevision === revision
      && c.obdScannerText.value === "previous readout" && c.obdDetectedCodes.innerHTML === "previous DTCs",
      `${profile}/${label}: rejected profile start mutated retained diagnostics, UI, or ownership`);
  }
}

for (const entry of ["readObdDeveloperCoreScan", "readObdDeveloperQuickCondition"]) {
  for (const busy of [false, true]) {
    const { context: c } = await readClient();
    const effects = installProfileHarness(c);
    const saved = c.obdDevSession.lastSession = { marker: "saved before scan" };
    c.obdSerialResultOwner.expectedLastSession = saved;
    c.obdDevSession.readInProgress = busy;
    const steps = [];
    for (const name of ["readObdDeveloperDtc", "readObdDeveloperFreezeFrame", "readObdDeveloperReadiness",
      "readObdDeveloperEcuInfo", "readObdDeveloperOnboardMonitor", "readObdDeveloperLiveSnapshot", "readObdDeveloperQuickLiveSnapshot"]) {
      c[name] = async () => {
        check(c.obdDevSession.coreScanInProgress && c.obdDevSession.lastSession === null
          && c.obdSerialResultOwner.expectedLastSession === null, "Admitted scan did not establish a fresh owned profile before reading");
        steps.push(name);
        return true;
      };
    }
    await c[entry]();
    if (busy) check(steps.length === 0 && effects.length === 0 && c.obdDevSession.lastSession === saved
      && c.obdDevSession.readInProgress, `${entry}: busy workflow reset the previous read before refusing commands`);
    else {
      const expected = entry === "readObdDeveloperCoreScan"
        ? ["readObdDeveloperDtc", "readObdDeveloperFreezeFrame", "readObdDeveloperReadiness", "readObdDeveloperEcuInfo", "readObdDeveloperOnboardMonitor", "readObdDeveloperLiveSnapshot"]
        : ["readObdDeveloperDtc", "readObdDeveloperReadiness", "readObdDeveloperQuickLiveSnapshot"];
      check(steps.join(",") === expected.join(",") && effects.join(",") === "invalidate,monitor,hide,summary"
        && !c.obdDevSession.coreScanInProgress && c.obdDevSession.readoutProfile === (entry === "readObdDeveloperCoreScan" ? "initial_diagnostic" : "quick_condition"),
        `${entry}: idle admission changed the profile or diagnostic read order`);
    }
    await c.disconnectObdDeveloperVci();
  }
}

for (const entry of ["direct", "readObdDeveloperCoreScan", "readObdDeveloperQuickCondition"]) {
  const { context: c } = await readClient();
  const effects = installProfileHarness(c);
  const owner = c.obdSerialResultOwner;
  const imported = c.obdDevSession.lastSession = { marker: "imported replacement" };
  if (entry === "direct") c.beginWebSerialReadoutProfile("quick_condition");
  else await c[entry]();
  check(c.obdDevSession.port === null && c.obdDevSession.lastSession === imported && c.obdSerialResultOwner === owner
    && owner.expectedLastSession !== imported && effects.length === 0 && c.obdScannerText.value === "previous readout",
    `${entry}: ownership loss must cancel old transport without resetting or adopting imported results`);
  await c.obdSerialDisconnectOperation?.promise;
}

for (const stage of ["initialize", "identify"]) {
  const result = stage === "initialize" ? client() : await readClient();
  const { context: c } = result;
  const effects = installProfileHarness(c);
  const response = deferred();
  let sends = 0;
  c.sendElmDeveloperCommand = () => { sends += 1; return response.promise; };
  let pending;
  if (stage === "initialize") {
    c.initializeElmDeveloperAdapter = () => c.sendElmDeveloperCommand("ATZ");
    pending = c.connectObdDeveloperVci();
  } else {
    load(c, ["identifyObdDeveloperVci"]);
    c.appendObdDeveloperLog = () => {};
    c.buildWebSerialAdapterIdentity = () => ({ marker: "adapter" });
    c.mergeWebSerialAdapterIdentity = (_old, value) => value;
    pending = c.identifyObdDeveloperVci();
  }
  await settle();
  const saved = c.obdDevSession.lastSession;
  const sessionId = c.obdDevSession.scanSessionId;
  await c.readObdDeveloperCoreScan();
  await c.readObdDeveloperQuickCondition();
  check(effects.length === 0 && sends === 1 && c.obdDevSession.lastSession === saved && c.obdDevSession.scanSessionId === sessionId,
    `${stage}: profile entry reset an active adapter operation`);
  response.resolve("OK");
  await pending;
  check(c.obdDevSession.port && c.obdDevSession.connectionState === "ready" && !c.obdDevSession.readInProgress,
    `${stage}: refused scan prevented the adapter operation from finishing`);
  await c.disconnectObdDeveloperVci();
}

const failedConnectionReasons = ["serial_response_too_large", "serial_read_failed", "serial_stream_closed", "device_disconnected",
  "response_timeout", "serial_write_timeout", "transport_failed", "connection_failed"];
for (const reason of failedConnectionReasons) {
  const { context: c } = client();
  load(c, ["buildWebSerialConnectionStatus"]);
  c.obdDevSession.lastDisconnectReason = reason;
  c.obdDevSession.adapterInitializationSummary = { initializationStatus: "completed" };
  const before = { ...c.obdDevSession };
  const status = c.buildWebSerialConnectionStatus();
  check(status.ok === false && status.status === "transport_error" && status.vciConnected === false
    && status.vehicleConnected === null && status.lastDisconnectReason === reason && status.last_disconnect_reason === reason,
    `${reason}: a connection failure without readout attempts was recorded as successful`);
  check(status.displayStatus === "Web Serial通信エラー" && status.display_status === status.displayStatus
    && status.vehicleCommandEnabled === false && status.wouldTransmit === false
    && Object.keys(before).every((key) => c.obdDevSession[key] === before[key]),
    `${reason}: failure status changed diagnostics, safety flags, or display aliases`);
}

for (const reason of [null, "operator_disconnect", "access_locked", "developer_locked", "port_selection_cancelled"]) {
  const { context: c } = client();
  load(c, ["buildWebSerialConnectionStatus"]);
  c.obdDevSession.lastDisconnectReason = reason;
  const status = c.buildWebSerialConnectionStatus();
  check(status.ok === true && status.status === "disconnected" && status.vciConnected === false && status.vehicleConnected === null,
    `${reason}: an idle or explicitly cancelled connection became a fabricated transport error`);
  c.obdDevSession.readoutAttempts = [{ status: "failed", transportErrorCount: 1, stopReason: "transport_error" }];
  check(c.buildWebSerialConnectionStatus().ok === false, `${reason}: manual cancellation erased an actual recorded failure`);
}

for (const summary of [null, { initializationStatus: "completed" }, { initialization_status: "failed" }]) {
  const { context: c } = client();
  load(c, ["buildWebSerialConnectionStatus"]);
  c.obdDevSession.lastDisconnectReason = "adapter_initialization_failed";
  c.obdDevSession.adapterInitializationSummary = summary;
  const status = c.buildWebSerialConnectionStatus();
  check(status.ok === false && status.status === "adapter_initialization_failed" && status.displayStatus.includes("初期化を完了できません")
    && status.vciConnected === false && status.adapterInitializationSummary === (summary || undefined),
    "Explicit initialization failure was lost when the initialization summary was absent or stale");
}

{
  const { context: c } = client();
  load(c, ["buildWebSerialConnectionStatus"]);
  c.obdDevSession.lastDisconnectReason = "serial_read_failed";
  for (const outcome of [{ adapterErrorCount: 1 }, { unableToConnectCount: 1 }, { transportErrorCount: 1 }]) {
    const status = c.buildWebSerialConnectionStatus(outcome);
    check(status.status === "transport_error" && status.displayStatus === "Web Serial通信エラー" && status.ok === false
      && status.nextAction === "アダプター接続と通信速度を確認してから、読取専用で再接続"
      && status.vehicleConnected === (outcome.unableToConnectCount ? false : null),
      "Retained transport classification disagrees with its explanation or next action");
  }
  c.obdDevSession.adapterInitializationSummary = { initializationStatus: "failed" };
  check(c.buildWebSerialConnectionStatus({ transportErrorCount: 1 }).status === "adapter_initialization_failed",
    "Retained transport failure overrode an initialization failure");
  await c.connectObdDeveloperVci();
  const recovered = c.buildWebSerialConnectionStatus();
  check(recovered.status === "adapter_connected" && recovered.ok === true && recovered.vciConnected === true
    && recovered.vehicleConnected === null && !recovered.lastDisconnectReason, "Fresh connection reused the prior failure reason");
  await c.disconnectObdDeveloperVci();
}

const coreContext = vm.createContext({ window: {} });
vm.runInContext(fs.readFileSync(new URL("../obd-readonly.js", import.meta.url), "utf8"), coreContext);
const core = coreContext.window.ObdReadOnly;
for (const reason of failedConnectionReasons) {
  for (const cleanupFirst of [false, true]) {
    if (!["serial_response_too_large", "serial_read_failed", "serial_stream_closed"].includes(reason)) continue;
    const { context: c, port, calls } = client();
    const clock = installWriteDeadlineHarness(c);
    load(c, ["identifyObdDeveloperVci", "readElmDeveloperLoop", "isCurrentWebSerialReadLoop", "readElmDeveloperResponse",
      "hasCompletedElmDeveloperResponse", "takeCompletedElmDeveloperResponse", "buildWebSerialConnectionStatus", "retainWebSerialConnectionAttempt"]);
    c.window = coreContext.window;
    c.hasBridgeDiagnosticScanSessionSupport = () => true;
    c.buildSelectedObdReadoutInterface = () => ({ readoutRoute: "desktop_web_serial" });
    c.renderObdDeveloperSessionSummary = () => {};
    c.initializeElmDeveloperAdapter = async () => { c.obdDevSession.adapterInitializationSummary = { initializationStatus: "completed" }; };
    const incoming = deferred();
    const cleanup = deferred();
    const sent = [];
    port.readable.getReader = () => ({ read: () => incoming.promise, cancel: () => cleanup.promise, releaseLock: () => {} });
    port.writable.getWriter = () => ({ write: async (bytes) => { sent.push(new TextDecoder().decode(bytes).trim()); }, releaseLock: () => {} });
    const connecting = c.connectObdDeveloperVci();
    await settle();
    if (reason === "serial_read_failed") incoming.reject(new Error("receive failed"));
    else incoming.resolve(reason === "serial_stream_closed" ? { done: true } : { done: false, value: new TextEncoder().encode("X".repeat(12001)) });
    await settle();
    if (cleanupFirst) { cleanup.resolve(); await settle(); }
    clock.advance(40);
    await settle();
    if (!cleanupFirst) cleanup.resolve();
    await connecting;
    const session = c.obdDevSession.lastSession;
    check(sent.join(",") === "ATI" && calls.close === 1 && session.connectionStatus.ok === false
      && session.connectionStatus.status === "transport_error" && session.connectionStatus.vehicleConnected === null,
      `${reason}/${cleanupFirst}: failed initial identity read was saved as a successful connection`);
    const recovered = core.buildDiagnosticScanSessionFromJson(JSON.stringify(core.buildBridgeSessionExportPayload(session)));
    check(recovered.connectionStatus.ok === false && recovered.connectionStatus.status === "transport_error"
      && recovered.connectionStatus.lastDisconnectReason === session.connectionStatus.lastDisconnectReason
      && recovered.connectionStatus.last_disconnect_reason === recovered.connectionStatus.lastDisconnectReason
      && recovered.vehicleCommandEnabled === false && recovered.wouldTransmit === false,
      `${reason}/${cleanupFirst}: saved/reimported failure lost its status, cause, aliases, or safety flags`);
    check((recovered.dtcSnapshot?.dtcs?.length || 0) === 0 && (recovered.livePidSnapshot?.monitorValues?.length || 0) === 0
      && !recovered.readoutCoverage?.items?.some((item) => item.id === "connection_status")
      && !recovered.warnings?.includes("local_bridge_disabled") && clock.timers.size === 0,
      `${reason}/${cleanupFirst}: failed connection fabricated diagnostic values or bridge coverage`);
  }
}

{
  const { context: c } = client();
  load(c, ["buildWebSerialConnectionStatus"]);
  const messages = {
    adapter_initialization_failed: ["Web Serialアダプター初期化を完了できません", "アダプター電源、通信速度、初期化応答を確認してから、読取専用で再接続"],
    transport_error: ["Web Serial通信エラー", "アダプター接続と通信速度を確認してから、読取専用で再接続"],
    vehicle_link_error: ["車両通信を確立できません", "イグニッション状態、OBDコネクター接続、車両プロトコル、アダプター状態を確認してから、読取専用で再試行"],
    adapter_error: ["Web Serialアダプターエラー", "アダプター電源、ファームウェア応答、シリアル設定を確認してから、読取専用で再試行"],
    port_selection_failed: ["Web Serial機器選択を開始できません", "HTTPS環境とブラウザのシリアル権限を確認してから再選択"],
    port_open_failed: ["Web Serialポートを開けません", "別アプリの使用、通信速度、接続状態を確認してから再接続"],
    adapter_identification_failed: ["Web Serialアダプターを識別できません", "アダプター電源とファームウェア応答を確認してから再接続"],
    adapter_connected: ["Web Serialアダプター接続中", "読取専用でDTCまたは対応PIDを確認"],
    disconnected: ["Web Serial未接続", "Web Serialで読取アダプターを選択"]
  };
  for (const reason of [null, "operator_disconnect", "port_selection_failed", "port_open_failed", "adapter_identification_failed", "serial_read_failed"]) {
    for (let mask = 0; mask < 16; mask += 1) {
      const initializationFailed = Boolean(mask & 1);
      const transportError = Boolean(mask & 2) || reason === "serial_read_failed";
      const vehicleLinkError = Boolean(mask & 4);
      const adapterError = Boolean(mask & 8);
      const stageFailure = ["port_selection_failed", "port_open_failed", "adapter_identification_failed"].includes(reason) ? reason : null;
      for (const connected of [false, true]) {
        const outcome = { status: "partial", stopReason: "retained_reason", transportErrorCount: mask & 2 ? 1 : 0,
          unableToConnectCount: mask & 4 ? 1 : 0, adapterErrorCount: mask & 8 ? 1 : 0 };
        Object.assign(c.obdDevSession, { port: connected ? {} : null, connectionState: connected ? "ready" : "disconnected",
          lastDisconnectReason: reason, adapterInitializationSummary: initializationFailed ? { initializationStatus: "failed" } : null,
          readoutAttempts: [outcome] });
        const before = { ...c.obdDevSession };
        const status = c.buildWebSerialConnectionStatus();
        const expectedStatus = initializationFailed ? "adapter_initialization_failed" : transportError ? "transport_error"
          : vehicleLinkError ? "vehicle_link_error" : adapterError ? "adapter_error" : stageFailure || (connected ? "adapter_connected" : "disconnected");
        const [display, action] = messages[expectedStatus];
        check(status.status === expectedStatus && status.displayStatus === display && status.display_status === display
          && status.nextAction === action && status.next_action === action,
          `${reason}/${mask}/${connected}: explanation or next action does not match the existing status precedence`);
        check(status.ok === !(initializationFailed || transportError || vehicleLinkError || adapterError || stageFailure)
          && status.vciConnected === (connected && !transportError && !initializationFailed)
          && status.vci_connected === status.vciConnected && status.vehicleConnected === (vehicleLinkError ? false : null)
          && status.vehicle_connected === status.vehicleConnected && status.latestReadoutStatus === "partial"
          && status.latestReadoutStopReason === "retained_reason" && status.lastDisconnectReason === (reason || undefined)
          && status.vehicleCommandEnabled === false && status.wouldTransmit === false
          && status.vehicle_command_enabled === false && status.would_transmit === false
          && Object.keys(before).every((key) => c.obdDevSession[key] === before[key]),
          `${reason}/${mask}/${connected}: presentation alignment changed diagnostic metadata or safety flags`);
      }
    }
  }
}

console.log(`Serial lifecycle checks: ${checks} / Errors: 0`);
