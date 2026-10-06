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
console.log(`Settings runtime hooks: ${checks} checks passed; production functions and context provider with artificial responses only`);
