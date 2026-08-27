import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

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
    sessionStorage: { removeItem: () => {} }, TextDecoder, TextEncoder, setTimeout,
    navigator: { serial: { requestPort: async () => { calls.select += 1; return port; } } },
    clearRequestedInterfaceSelection: () => {}, renderObdDeveloperGate: () => {}, renderObdAccessGate: () => {},
    renderObdSessionExportControls: () => {},
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
  check(c.obdDevSession.connectionState === "disconnected" && c.obdSerialDisconnectOperation === null && c.obdDevSession.lastSession === saved, `${failure}: repeated disconnect/lock left a stuck or lost session`);
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
  c.lockObdAccess();
  await c.disconnectObdDeveloperVci();
  c.obdAccessUnlocked = true;
  await c.connectObdDeveloperVci();
  c.obdDevSession.textBuffer = "new response>";
  if (fail) waiting.reject(new Error("write failed"));
  else waiting.resolve();
  await assert.rejects(pending);
  check(writes === 1 && c.obdDevSession.textBuffer === "new response>", `${fail}: stale write consumed a new connection response`);
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
    if (name === "captureObdDeveloperProtocolAfterStoredDtc") check(await pending === false, "Cancelled protocol capture must stop");
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
console.log(`Serial lifecycle checks: ${checks} / Errors: 0`);
