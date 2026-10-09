// Synthetic transport harness only; no navigator, physical port, or driver access.
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { createReadOnlySettingsSession } from "./readonly-settings-session.js";
const source = fs.readFileSync(new URL("../../script.js", import.meta.url), "utf8");
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
export function client(failedCommand = null, waitingCommand = null) {
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
// Run the real send/receive chain against an in-memory byte queue. No port is opened.
export function attachWire(c, size, overrides = {}) {
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
  for (const name of ["readWebSerialCaptureContext", "createWebSerialReadoutCapture", "createSerialCommandCapture", "readElmDeveloperCommandRecord", "sendElmDeveloperCommand", "isAllowedObdDeveloperCommand", "isCurrentWebSerialReadLoop",
    "readElmDeveloperLoop", "hasCompletedElmDeveloperResponse", "takeCompletedElmDeveloperResponse", "readElmDeveloperResponse"]) {
    const match = source.match(new RegExp(`(?:async )?function ${name}\\([^\\n]*\\) \\{[\\s\\S]*?\\r?\\n\\}`));
    assert.ok(match, name); vm.runInContext(match[0], c.context);
  }
  const loop = c.context.readElmDeveloperLoop();
  return { writes, async close() { session.readLoopActive = false; pending?.({ done: true }); await loop; } };
}
