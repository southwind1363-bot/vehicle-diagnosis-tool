import assert from "node:assert/strict";
import { client, attachWire } from "./fixtures/serial-runtime-harness.js";
let checks = 0;
const check = (value, message) => { assert.ok(value, message); checks++; };

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
