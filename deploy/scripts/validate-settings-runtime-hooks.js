import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { createReadOnlySettingsSession } from "./fixtures/readonly-settings-session.js";
const source = fs.readFileSync(new URL("../script.js", import.meta.url), "utf8");
let checks = 0;
const check = (value, message) => { assert.ok(value, message); checks++; };
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
function client(failedCommand = null, waitingCommand = null) {
  const wait = deferred(), reached = deferred(), sent = [];
  let pagehide;
  const port = {}, reader = { cancel: () => new Promise(() => {}) }, writer = {};
  const context = vm.createContext({
    createReadOnlySettingsSession, obdSerialRevision: 1, obdAccessUnlocked: true, obdDevModeUnlocked: true, obdUiMode: "details",
    obdSerialDisconnectOperation: null, obdSerialConnectPending: false, obdSerialReadErrors: new WeakMap(),
    obdDevSession: { port, reader, writer, readLoopActive: true, connectionState: "ready", lastSession: null },
    obdSerialResultOwner: { revision: 1, expectedLastSession: null }, obdDevStatus: {},
    ELM327_CONNECTION_STATES: ["ready", "reading", "disconnecting", "disconnected"],
    obdDtcClearTargetBindingController: { invalidate() {} },
    buildWebSerialAdapterInitializationSummary: value => value, getWebSerialAdapterInitializationStopReason: () => "failed",
    renderObdDeveloperGate() {}, appendObdDeveloperLog() {}, clearObdOperationJournalComparison() {},
    mergeWebSerialAdapterIdentity: () => null, buildWebSerialAdapterIdentity: () => null,
    window: { addEventListener(name, callback) { assert.equal(name, "pagehide"); pagehide = callback; } },
    sendElmDeveloperCommand: async command => {
      sent.push(command);
      if (command === waitingCommand) { reached.resolve(); await wait.promise; }
      if (context.obdDevSession.port !== port) throw new Error("elm_transport_disconnected");
      if (command === failedCommand) return "ERROR";
      return command === "ATZ" ? "ELM327 v2.3" : command === "ATDPN" ? "A6" : command === "ATDP" ? "AUTO, ISO 15765-4 (CAN 11/500)" : "OK";
    }
  });
  for (const name of ["WEB_SERIAL_ADAPTER_ERROR_LINES", "WEB_SERIAL_VEHICLE_LINK_ERROR_LINES", "WEB_SERIAL_IGNORED_RESPONSE_LINES"]) {
    vm.runInContext(source.match(new RegExp(`const ${name} = [^;]+;`))[0], context);
  }
  for (const name of ["initializeElmDeveloperAdapter", "captureObdDeveloperProtocolAfterStoredDtc", "disconnectObdDeveloperVci",
    "resetWebSerialConnectionAttemptMetadata", "setObdDeveloperConnectionState", "isCurrentObdSerialOperation",
    "continueObdSerialOperation", "throwIfObdSerialOperationCancelled", "getWebSerialResponseLines", "classifyWebSerialCommandResponse",
    "hasWebSerialResponseError", "isWebSerialBusInitErrorLine", "isWebSerialInformationalResponseLine"]) {
    const match = source.match(new RegExp(`(?:async )?function ${name}\\([^\\n]*\\) \\{[\\s\\S]*?\\r?\\n\\}`));
    assert.ok(match, name); vm.runInContext(match[0], context);
  }
  const property = source.match(/  settingsObservation: \{[\s\S]*?\r?\n  \},/)[0].trim().slice(0, -1);
  vm.runInContext(`obdDevSession.settingsObservation = ({${property}}).settingsObservation`, context);
  vm.runInContext(source.match(/window.addEventListener\("pagehide", \(\) => \{[\s\S]*?\r?\n\}\);/)[0], context);
  const settings = context.obdDevSession.settingsObservation;
  return { context, settings, sent, wait, reached, pagehide: () => pagehide() };
}
{
  const c = client(); await c.context.initializeElmDeveloperAdapter();
  check(c.settings.owner.inspect(c.settings.ticket).summary.spacesOffAcknowledged, "actual initialization records responses");
  await c.context.captureObdDeveloperProtocolAfterStoredDtc();
  const summary = c.settings.owner.inspect(c.settings.ticket).summary;
  check(summary.protocolNumberReported === "A6" && summary.profile === null && !summary.profileVerified, "actual protocol observation stays incomplete");
  check(summary.provenance === "unverified_input" && !JSON.stringify(summary).includes("ELM327"), "no simulated provenance or raw identity retained");
  assert.deepEqual(c.sent, ["ATZ", "ATE0", "ATL0", "ATS0", "ATH1", "ATSP0", "ATDP", "ATDPN"]); checks++;
  const old = c.settings.ticket;
  await c.context.captureObdDeveloperProtocolAfterStoredDtc();
  check(c.settings.ticket === null && !c.settings.owner.inspect(old).ok, "repeated protocol query drops previous evidence");
  await c.context.initializeElmDeveloperAdapter();
  check(c.settings.ticket && c.settings.ticket !== old, "reinitialization issues new ticket");
}
for (const reason of ["operator_disconnect", "access_locked", "developer_locked", "device_disconnected", "serial_read_failed"]) {
  const c = client(); await c.context.initializeElmDeveloperAdapter();
  const ticket = c.settings.ticket;
  void c.context.disconnectObdDeveloperVci({ reason }); // cancel() intentionally never completes.
  check(c.settings.ticket === null && !c.settings.owner.inspect(ticket).ok, `${reason}: invalidate before cleanup await`);
  check(c.context.obdSerialRevision === (["device_disconnected", "serial_read_failed"].includes(reason) ? 1 : 2), "real disconnect revision policy preserved");
}
for (const event of ["reset", "pagehide", "lock", "reader_change"]) {
  const c = client(); await c.context.initializeElmDeveloperAdapter(); const ticket = c.settings.ticket;
  if (event === "reset") c.context.resetWebSerialConnectionAttemptMetadata();
  if (event === "pagehide") c.pagehide();
  if (event === "lock") c.context.obdAccessUnlocked = false;
  if (event === "reader_change") c.context.obdDevSession.reader = {};
  check(!c.settings.owner.inspect(ticket).ok, `${event}: no usable old observation`);
}
for (const command of ["ATZ", "ATE0", "ATS0", "ATH1", "ATDPN"]) {
  const c = client(command);
  if (command === "ATDPN") { await c.context.initializeElmDeveloperAdapter(); await c.context.captureObdDeveloperProtocolAfterStoredDtc(); }
  else await assert.rejects(c.context.initializeElmDeveloperAdapter());
  check(!c.settings.owner.inspect(c.settings.ticket).ok, `${command}: failure discards observations`);
}
{
  const c = client(null, "ATS0"), pending = c.context.initializeElmDeveloperAdapter();
  await c.reached.promise; const old = c.settings.ticket;
  void c.context.disconnectObdDeveloperVci({ reason: "device_disconnected" });
  check(!c.settings.owner.inspect(old).ok, "pending settings immediately invalidated");
  c.wait.resolve(); await assert.rejects(pending);
  check(c.settings.ticket === null && c.sent.at(-1) === "ATS0", "late response cannot revive or continue setup");
}
{
  const c = client(null, "ATDPN"); await c.context.initializeElmDeveloperAdapter();
  const old = c.settings.ticket, pending = c.context.captureObdDeveloperProtocolAfterStoredDtc();
  await c.reached.promise;
  await c.context.initializeElmDeveloperAdapter(); const fresh = c.settings.ticket;
  c.wait.resolve(); await pending;
  check(!c.settings.owner.inspect(old).ok && c.settings.ticket === fresh, "late protocol cannot overwrite new initialization");
  check(c.settings.owner.inspect(fresh).summary.phase === "awaiting_protocol", "old protocol not assigned to new ticket");
}
{
  const c = client("ATDP", "ATDP"); await c.context.initializeElmDeveloperAdapter();
  const old = c.settings.ticket, pending = c.context.captureObdDeveloperProtocolAfterStoredDtc();
  await c.reached.promise;
  await c.context.initializeElmDeveloperAdapter(); const fresh = c.settings.ticket;
  c.wait.resolve(); check(await pending === false, "failed protocol query remains unsuccessful");
  check(!c.settings.owner.inspect(old).ok && c.settings.ticket === fresh, "late ATDP failure preserves new initialization");
  check(c.settings.owner.inspect(fresh).summary.phase === "awaiting_protocol", "failed old query cannot supply new protocol");
}
// Run the real send/receive chain against an in-memory byte queue. No port is opened.
function attachWire(c, size, overrides = {}) {
  const session = c.context.obdDevSession, queue = [], writes = [];
  let pending, now = 0;
  session.textBuffer = "";
  session.encoder = new TextEncoder(); session.decoder = new TextDecoder();
  session.reader.read = () => queue.length ? Promise.resolve(queue.shift()) : new Promise(resolve => { pending = resolve; });
  session.reader.cancel = async () => { pending?.({ done: true }); pending = null; };
  session.reader.releaseLock = () => {};
  session.writer.releaseLock = () => {};
  session.port.close = async () => {};
  c.context.clearRequestedInterfaceSelection = () => {};
  c.context.formatWebSerialConnectionFailure = value => value;
  session.writer.write = async bytes => {
    const encoded = new TextDecoder().decode(bytes); writes.push(encoded);
    const command = encoded.slice(0, -1);
    const wire = Object.hasOwn(overrides, command) ? overrides[command]
      : command === "ATZ" ? "ELM327 v2.3\r\n>" : command === "ATE0" ? "ATE0\r\nOK\r>"
        : command === "ATDP" ? "AUTO, ISO 15765-4 (CAN 11/500)\r>" : command === "ATDPN" ? "A6\r>" : "OK\r>";
    const reply = new TextEncoder().encode(wire);
    for (let offset = 0; offset < reply.length; offset += size) queue.push({ value: reply.slice(offset, offset + size), done: false });
    if (pending && queue.length) { const resolve = pending; pending = null; resolve(queue.shift()); }
  };
  Object.assign(c.context, { performance: { now: () => now }, clearTimeout,
    setTimeout(callback, delay) {
      // Only compress the polling interval; preserve the distinct write timeout.
      if (delay <= 40) return setTimeout(() => { now += delay; callback(); }, 0);
      return setTimeout(callback, delay);
    } });
  vm.runInContext(source.match(/const WEB_SERIAL_READ_ONLY_COMMANDS = [\s\S]*?\);/)[0], c.context);
  for (const name of ["sendElmDeveloperCommand", "isAllowedObdDeveloperCommand", "isCurrentWebSerialReadLoop",
    "readElmDeveloperLoop", "hasCompletedElmDeveloperResponse", "takeCompletedElmDeveloperResponse", "readElmDeveloperResponse"]) {
    const match = source.match(new RegExp(`(?:async )?function ${name}\\([^\\n]*\\) \\{[\\s\\S]*?\\r?\\n\\}`));
    assert.ok(match, name); vm.runInContext(match[0], c.context);
  }
  const loop = c.context.readElmDeveloperLoop();
  return { writes, async close() { session.readLoopActive = false; pending?.({ done: true }); await loop; } };
}
for (const size of [1, 7, 32768]) {
  const c = client(), wire = attachWire(c, size);
  try {
    await c.context.initializeElmDeveloperAdapter();
    await c.context.captureObdDeveloperProtocolAfterStoredDtc();
    const summary = c.settings.owner.inspect(c.settings.ticket).summary;
    check(summary?.phase === "observed" && summary.protocolNumberReported === "A6", "byte stream reaches settings observation");
    check(summary.spacesOffAcknowledged && summary.profile === null && !summary.profileVerified, "byte integration does not infer missing settings");
    assert.deepEqual(wire.writes, ["ATZ\r", "ATE0\r", "ATL0\r", "ATS0\r", "ATH1\r", "ATSP0\r", "ATDP\r", "ATDPN\r"]); checks++;
    check(sessionIdle(c), "real send chain releases command/write ownership");
    c.pagehide(); check(c.settings.ticket === null, "byte-backed observation expires on pagehide");
  } finally { await wire.close(); }
}
function sessionIdle(c) { return !c.context.obdDevSession.pendingCommandOperation && !c.context.obdDevSession.pendingWriteOperation; }
for (const [command, reply] of [["ATDP", "ERROR\r>"], ["ATDP", "?\r>"], ["ATDP", "UNABLE TO CONNECT\r>"],
  ["ATS0", "OK\rOK\r>"], ["ATS0", "ERROR\r>"],
  ["ATS0", "OK\r"], ["ATS0", "x".repeat(12001)], ["ATDPN", "A6\rA8\r>"], ["ATDPN", "\r>"],
  ["ATDPN", "A6\r"], ["ATDPN", "A6\uFFFD\r>"]]) {
  const c = client(), wire = attachWire(c, 7, { [command]: reply });
  try {
    try { await c.context.initializeElmDeveloperAdapter(); await c.context.captureObdDeveloperProtocolAfterStoredDtc(); }
    catch (error) { assert.match(error.message, /elm_|failed|ERROR/); }
    check(c.settings.owner.inspect(c.settings.ticket).summary === null, `${command}: ambiguous/incomplete bytes cannot establish settings`);
    check(sessionIdle(c), "failure releases send ownership");
    check(wire.writes.filter(value => value === command + "\r").length === 1, "failed byte response causes no automatic retry");
  } finally { await wire.close(); }
}
console.log(`Settings runtime hooks: ${checks} checks passed; production send/receive and context provider with synthetic bytes/responses only`);
