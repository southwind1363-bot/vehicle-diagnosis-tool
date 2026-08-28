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

console.log(`Serial lifecycle checks: ${checks} / Errors: 0`);
