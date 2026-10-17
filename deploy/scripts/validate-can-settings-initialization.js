// Production initialization against synthetic byte queues. No physical port access.
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
const url = new URL("./validate-serial-integration.js", import.meta.url);
const source = fs.readFileSync(url, "utf8").replace(/\r\n/g, "\n");
const marker = "\n{\n  const { context } = createClient(successfulResponses);";
assert.ok(source.includes(marker));
const prefix = source.slice(0, source.indexOf(marker)).replace(/^import .*;\n/gm, "")
  .replaceAll("import.meta.url", JSON.stringify(url.href));
const body = String.raw`
const initial = ["ATZ", "ATE0", "ATL0", "ATS0", "ATH1", "ATSP0", "ATCAF1", "ATD0", "ATCEA"];
const settingsCommands = initial.slice(6);
{
  const { context: c } = createClient(successfulResponses);
  const owner = c.createReadOnlySettingsObservation(), ticket = owner.begin();
  for (const command of initial.slice(0, 6)) owner.recordInitialization(ticket, command, command === "ATZ" ? "banner" : "OK");
  const names = ["can_auto_format", "dlc_display", "can_addressing"];
  check(names.every(name => owner.inspect(ticket).summary.missingSettings.includes(name)), "Reset/defaults inferred unobserved CAN settings");
  for (let i = 0; i < settingsCommands.length; i++) {
    owner.recordInitialization(ticket, settingsCommands[i], "OK");
    const summary = owner.inspect(ticket).summary;
    assert.deepEqual(Array.from(summary.missingSettings).filter(name => names.includes(name)), names.slice(i + 1)); checks++;
    check(summary.profile === null && !summary.profileVerified, "Partial/full ACKs granted profile");
  }
  owner.invalidate(); check(owner.inspect(ticket).summary === null, "Invalidated acknowledgements remained available");
}
for (const command of settingsCommands) for (const failure of ["?", "OK\rOK", "echo", "write", "timeout", "cancel", "late_write"]) {
  let finishWrite, reached;
  const started = new Promise(resolve => { reached = resolve; });
  const response = failure === "echo" ? command + "\rOK" : failure === "write" ? new Error("synthetic failure")
    : failure === "timeout" ? (_command, port) => { port.enqueue("OK"); }
    : ["cancel", "late_write"].includes(failure) ? () => { reached(); return new Promise(resolve => { finishWrite = resolve; }); }
    : failure;
  const client = createClient({ ...successfulResponses, [command]: response }, { fragmentResponses: true, fragmentSize: 1 });
  const c = client.context, send = c.sendElmDeveloperCommand;
  c.sendElmDeveloperCommand = (cmd, timeout, capture) => send(cmd, cmd === command && ["timeout", "late_write"].includes(failure) ? 30 : timeout, capture);
  const connecting = c.connectObdDeveloperVci();
  if (["cancel", "late_write"].includes(failure)) {
    await started;
    let closing;
    if (failure === "cancel") closing = c.disconnectObdDeveloperVci();
    else await delay(60);
    check(c.obdDevSession.connectionState === "disconnecting" && client.port.calls.close === 0, "Pending setting write was closed prematurely");
    const count = client.port.calls.writes.length;
    await c.connectObdDeveloperVci();
    check(client.port.calls.select === 1 && client.port.calls.writes.length === count, "Unsettled write allowed retry");
    client.port.enqueue("OK>"); finishWrite();
    if (closing) await closing;
  }
  await connecting;
  if (c.obdSerialDisconnectOperation?.promise) await c.obdSerialDisconnectOperation.promise;
  for (let i = 0; i < 50 && !client.port.closed; i++) await delay(5);
  assert.deepEqual(client.port.calls.writes, initial.slice(0, initial.indexOf(command) + 1)); checks++;
  check(client.port.closed && !client.port.readerLocked && !client.port.writerLocked, "Failed initialization leaked transport");
  check(c.obdDevSession.settingsObservation.ticket === null, "Failed initialization retained settings");
  if (!["cancel", "late_write"].includes(failure)) check(c.obdDevSession.adapterInitializationSummary.failedSetupStep === {
    ATCAF1: "enable_can_auto_format", ATD0: "disable_dlc_display", ATCEA: "disable_can_extended_address"
  }[command], "Failure summary lost the setting step");
  check(!c.obdDevSession.lastSession?.dtcSnapshot?.codes?.length && !client.port.calls.writes.includes("03"), "Failed initialization published acquired DTCs");
  // Explicit reconnection starts all initialization steps with a new port and ticket.
  c.sendElmDeveloperCommand = send;
  const next = new MockElmPort(successfulResponses, { fragmentResponses: true, fragmentSize: 1 });
  c.navigator.serial.requestPort = async () => next;
  await c.connectObdDeveloperVci();
  check(c.obdDevSession.connectionState === "ready", "Explicit reconnect failed");
  assert.deepEqual(next.calls.writes, [...initial, "ATI", "AT@1"]); checks++;
  const state = c.obdDevSession.settingsObservation;
  const summary = state.owner.inspect(state.ticket).summary;
  assert.deepEqual(Array.from(summary.missingSettings), ["protocol_not_observed"]); checks++;
  check(summary.profile === null && !summary.profileVerified && !summary.executionEnabled && !summary.realTransportProofAvailable,
    "Initialization promoted settings to profile or vehicle proof");
  check(c.obdDevSession.adapterInitializationSummary.completedSetupStepCount === 9, "Initialization step count incorrect");
  for (const denied of ["ATCAF0", "ATD1", "ATCEA01", "ATCEA 01", "04"]) check(!c.isAllowedObdDeveloperCommand(denied), "Command scope expanded");
  await c.disconnectObdDeveloperVci();
  check(next.closed && !next.readerLocked && !next.writerLocked, "Recovered port cleanup failed");
}
console.log("CAN initialization production: 21 failure/recovery cases / " + checks + " checks passed");
`;
await vm.runInNewContext("(async () => {\n" + prefix + "\n" + body + "\n})()",
  { assert, fs, vm, URL, TextEncoder, TextDecoder, setTimeout, clearTimeout, performance, Date, console });
