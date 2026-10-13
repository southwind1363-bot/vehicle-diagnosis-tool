// Production regression after approval and application in 3.13.691; synthetic ports only.
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const integrationUrl = new URL("./validate-serial-integration.js", import.meta.url);
const integration = fs.readFileSync(integrationUrl, "utf8").replace(/\r\n/g, "\n");
const marker = "\n{\n  const { context } = createClient(successfulResponses);";
assert.ok(integration.includes(marker), "Integration harness boundary missing");
const prefix = integration.slice(0, integration.indexOf(marker)).replace(/^import .*;\n/gm, "");
const connect = integration.match(/async function connect\(client\) \{[\s\S]*?\n\}/)?.[0];
assert.ok(connect, "Integration connector missing");
const production = fs.readFileSync(new URL("../script.js", import.meta.url), "utf8");
async function run(source, body, label) {
  const harness = prefix.replace(/const scriptSource = [^\n]+;/, () => "const scriptSource = " + JSON.stringify(source) + ";")
    .replaceAll("import.meta.url", JSON.stringify(integrationUrl.href));
  await vm.runInNewContext("(async () => {\n" + harness + "\n" + connect + "\n" + body
    + "\nconsole.log(" + JSON.stringify(label + ": ") + ' + checks + " checks passed");\n})()',
    { assert, fs, vm, URL, TextEncoder, TextDecoder, setTimeout, clearTimeout, performance, Date, console });
}

await run(production, `
for (const command of ['07', '0A']) {
  const client = createClient({ ...successfulResponses, [command]: 'NO DATA\\r' });
  await connect(client);
  await client.context.readObdDeveloperCoreScan();
  const session = client.context.obdDevSession.lastSession;
  const status = command === '07' ? 'pending' : 'permanent';
  check(session.webSerialReadoutSummary.noDataCount === 1, 'Production no-data count missing');
  check(session.webSerialReadoutSummary.partialCount === 1 && session.webSerialReadoutSummary.expectedEmptyCommandCount === 0, 'NO DATA must remain partial');
  check(!session.dtcSnapshot.dtcStatusSummary.reportedStatuses.includes(status) && session.webSerialReadoutSummary.expectedEmptyCommandCount === 0, 'Coverage and completion must agree');
  await client.context.disconnectObdDeveloperVci();
}
`, "Current production behavior");

await run(production, String.raw`
// A completed response containing NO DATA is not an acquired empty diagnostic result.
// Keep the port connected across success, no-data, and recovery scans.
for (const missingCommand of ["03", "07", "0A", "0101"]) {
  const replies = { ...successfulResponses, "07": "47 02 00", "0A": "4A 03 00" };
  const client = createClient(replies, { fragmentResponses: true, fragmentSize: 1 });
  const state = client.context.obdDevSession;
  await connect(client);
  await client.context.readObdDeveloperCoreScan();
  const initial = state.lastSession, initialJson = JSON.stringify(initial);
  const initialCapture = state.coreRawReadoutCapture;
  check(initial.dtcSnapshot.codes.includes("P0200") && initial.dtcSnapshot.codes.includes("P0300"), "No-data fixture needs previous pending and permanent codes");
  // Explicit initialization creates a new observation generation; no automatic retry is added.
  await client.context.initializeElmDeveloperAdapter();
  client.port.responses[missingCommand] = "NO DATA\r";
  const beforeMissing = client.port.calls.writes.length;
  await client.context.readObdDeveloperCoreScan();
  const missing = state.lastSession, missingJson = JSON.stringify(missing);
  const missingCapture = state.coreRawReadoutCapture;
  const summary = missing.webSerialReadoutSummary;
  check(state.connectionState === "ready" && client.port.calls.close === 0, "NO DATA unnecessarily disconnected the port");
  check(summary.noDataCount === 1 && summary.incompleteCount + summary.partialCount > 0, "NO DATA became a completed readout");
  check(client.port.calls.writes.slice(beforeMissing).filter(command => command === missingCommand).length === 1, "NO DATA triggered an automatic retry");
  if (missingCommand === "0101") check(missing.readinessSnapshot.readinessReadoutStatus !== "reported", "NO DATA retained old readiness coverage");
  else {
    const status = { "03": "stored", "07": "pending", "0A": "permanent" }[missingCommand];
    check(!missing.dtcSnapshot.dtcStatusSummary.reportedStatuses.includes(status), "NO DATA supplied acquired DTC coverage");
    const oldCode = { "03": "P0133", "07": "P0200", "0A": "P0300" }[missingCommand];
    check(!missing.dtcSnapshot.codes.includes(oldCode), "NO DATA retained the previous scan's code");
  }
  check(initialCapture.take() === null, "No-data scan reused the initial raw aggregate");
  const restoredMissing = client.context.ObdReadOnly.buildDiagnosticScanSessionFromJson(
    JSON.stringify(client.context.ObdReadOnly.buildBridgeSessionExportPayload(missing)));
  check(restoredMissing.webSerialReadoutSummary.noDataCount === 1, "Archive lost the no-data observation");
  await client.context.initializeElmDeveloperAdapter();
  Object.assign(client.port.responses, replies, { "03": "7E8 03 43 01 00", "07": "47 04 00", "0A": "4A 05 00" });
  await client.context.readObdDeveloperCoreScan();
  const recovered = state.lastSession;
  check(recovered.webSerialReadoutSummary.noDataCount === 0 && recovered.webSerialReadoutSummary.incompleteCount === 0
    && recovered.webSerialReadoutSummary.partialCount === 0, "Recovered scan retained prior failure counts");
  assert.deepEqual(Array.from(recovered.dtcSnapshot.codes).sort(), ["P0100", "P0400", "P0500"]); checks++;
  check(recovered.readinessSnapshot.readinessReadoutStatus === "reported", "Recovery failed to acquire readiness again");
  check(state.coreRawReadoutCapture.inspect().count === 4 && missingCapture.take() === null, "Recovery reused the no-data aggregate");
  const restored = client.context.ObdReadOnly.buildDiagnosticScanSessionFromJson(
    JSON.stringify(client.context.ObdReadOnly.buildBridgeSessionExportPayload(recovered)));
  assert.deepEqual(Array.from(restored.dtcSnapshot.codes).sort(), ["P0100", "P0400", "P0500"]); checks++;
  check(restored.webSerialReadoutSummary.noDataCount === 0 && JSON.stringify(initial) === initialJson
    && JSON.stringify(missing) === missingJson, "Recovery modified earlier evidence or exported stale failure counts");
  check(client.port.calls.select === 1 && client.port.calls.open === 1, "Same-port recovery reopened the connection");
  await client.context.disconnectObdDeveloperVci();
  check(client.port.closed && client.port.calls.close === 1 && !client.port.readerLocked && !client.port.writerLocked, "No-data recovery leaked transport resources");
}

`, "Production no-data recovery");

const unchangedCases = String.raw`
{
  const client = createClient(successfulResponses);
  for (const command of ['0202', '06', '0900']) {
    const outcome = client.context.buildWebSerialReadoutOutcome([command], [{ command, response: 'NO DATA' }]);
    check(outcome.expectedEmptyCommandCount === 0 && !outcome.readoutCompleted, 'Remaining NO DATA exception was restored');
  }
  for (const [command, response] of [['03', '43 00 00'], ['07', '47 00 00'], ['0A', '4A 00 00']]) {
    const outcome = client.context.buildWebSerialReadoutOutcome([command], [{ command, response }]);
    check(outcome.readoutCompleted && outcome.positiveResponseCount === 1 && outcome.expectedEmptyCommandCount === 0, 'Positive zero-code response became incomplete');
    for (const failure of ['ERROR', 'UNABLE TO CONNECT', '']) {
      check(!client.context.buildWebSerialReadoutOutcome([command], [{ command, response: failure }]).readoutCompleted, 'Failure became completed');
    }
  }
  await connect(client);
  await client.context.readObdDeveloperCoreScan();
  const session = client.context.obdDevSession.lastSession;
  check(session.dtcSnapshot.dtcStatusSummary.emptyStatuses.includes('pending')
    && session.dtcSnapshot.dtcStatusSummary.emptyStatuses.includes('permanent'), 'Positive zero-code coverage was lost');
  check(session.webSerialReadoutSummary.noDataCount === 0 && session.webSerialReadoutSummary.partialCount === 0
    && session.webSerialReadoutSummary.incompleteCount === 0, 'Normal scan became incomplete');
  await client.context.disconnectObdDeveloperVci();
}
`;
await run(production, unchangedCases, "Unchanged production controls");
