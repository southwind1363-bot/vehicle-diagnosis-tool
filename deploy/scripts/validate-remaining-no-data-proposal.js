// Production regression for the three NO DATA exceptions removed in 3.13.692.
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

const cases = String.raw`
const cases = [
  ['0202', 'freezeFrameSnapshot', 'freezeFrameReadoutStatus'],
  ['06', 'onboardMonitorSnapshot', 'onboardMonitorReadoutStatus'],
  ['0900', 'ecuInfoSnapshot', 'ecuInfoReadoutStatus']
];
`;

await run(production, cases + String.raw`
for (const [command, snapshot, status] of cases) {
  const client = createClient({ ...successfulResponses, [command]: 'NO DATA' });
  await connect(client);
  await client.context.readObdDeveloperCoreScan();
  const session = client.context.obdDevSession.lastSession;
  check(session.webSerialReadoutSummary.noDataCount === 1 && session.webSerialReadoutSummary.expectedEmptyCommandCount === 0, 'NO DATA was classified as an acquired empty result');
  check(session.webSerialReadoutSummary.incompleteCount === 1 && session.webSerialReadoutSummary.partialCount === 0, 'NO DATA must remain incomplete');
  check(session[snapshot][status] !== 'reported', 'NO DATA supplied acquired coverage');
  await client.context.disconnectObdDeveloperVci();
}
`, "Production missing readouts");

await run(production, cases + String.raw`
for (const [command, snapshot, status] of cases) {
  const client = createClient(successfulResponses, { fragmentResponses: true, fragmentSize: 1 });
  const state = client.context.obdDevSession;
  await connect(client);
  await client.context.readObdDeveloperCoreScan();
  const first = state.lastSession, firstJson = JSON.stringify(first);
  check(first[snapshot][status] === 'reported', 'Fixture needs acquired baseline data');
  await client.context.initializeElmDeveloperAdapter();
  client.port.responses[command] = 'NO DATA\r';
  const before = client.port.calls.writes.length;
  await client.context.readObdDeveloperCoreScan();
  const missing = state.lastSession, missingJson = JSON.stringify(missing);
  check(state.connectionState === 'ready' && client.port.calls.close === 0, 'NO DATA unnecessarily closed the port');
  check(missing.webSerialReadoutSummary.noDataCount === 1 && missing.webSerialReadoutSummary.expectedEmptyCommandCount === 0
    && missing.webSerialReadoutSummary.incompleteCount === 1, 'NO DATA did not remain incomplete');
  check(missing[snapshot][status] !== 'reported', 'Missing response inherited old acquisition coverage');
  if (command === '06') check(missing.onboardMonitorSnapshot.tests.length === 0, 'Missing Mode06 retained old tests');
  if (command === '0900') check(missing.ecuInfoSnapshot.items.length === 0, 'Missing ECU support retained old information');
  check(missing.dtcSnapshot.codes.includes('P0133') && missing.livePidSnapshot.monitorValues.some(row => row.id === 'engine_speed' && row.value === 1726), 'Unrelated acquired data was lost');
  const writes = client.port.calls.writes.slice(before);
  check(writes.filter(value => value === command).length === 1, 'NO DATA retried automatically');
  if (command === '0900') check(!writes.includes('0904') && !writes.includes('0906'), 'Unconfirmed support enabled later information reads');
  const saved = client.context.ObdReadOnly.buildDiagnosticScanSessionFromJson(JSON.stringify(client.context.ObdReadOnly.buildBridgeSessionExportPayload(missing)));
  check(saved[snapshot][status] !== 'reported' && saved.webSerialReadoutSummary.noDataCount === 1
    && saved.webSerialReadoutSummary.expectedEmptyCommandCount === 0, 'Archive turned missing data into acquired data');
  await client.context.initializeElmDeveloperAdapter();
  client.port.responses[command] = successfulResponses[command];
  await client.context.readObdDeveloperCoreScan();
  const recovered = state.lastSession;
  check(recovered[snapshot][status] === 'reported' && recovered.webSerialReadoutSummary.noDataCount === 0
    && recovered.webSerialReadoutSummary.incompleteCount === 0, 'Explicit recovery retained missing status');
  const restored = client.context.ObdReadOnly.buildDiagnosticScanSessionFromJson(JSON.stringify(client.context.ObdReadOnly.buildBridgeSessionExportPayload(recovered)));
  check(restored[snapshot][status] === 'reported' && restored.webSerialReadoutSummary.noDataCount === 0, 'Recovery archive lost acquired status');
  check(JSON.stringify(first) === firstJson && JSON.stringify(missing) === missingJson, 'Later read mutated prior records');
  check(recovered.vehicleCommandEnabled === false && recovered.wouldTransmit === false, 'NO DATA recovery granted vehicle authority');
  check(client.port.calls.select === 1 && client.port.calls.open === 1, 'Recovery reopened the port');
  await client.context.disconnectObdDeveloperVci();
  check(client.port.closed && !client.port.readerLocked && !client.port.writerLocked, 'Recovery leaked locks');
}
`, "Production remaining NO DATA recovery");

const controls = String.raw`
{
  const { context } = createClient(successfulResponses);
  for (const command of ['03', '07', '0A', '0101', '010C']) {
    const result = context.buildWebSerialReadoutOutcome([command], [{ command, response: 'NO DATA' }]);
    check(result.status === 'incomplete' && result.expectedEmptyCommandCount === 0, 'Out-of-scope NO DATA contract changed');
  }
  for (const [command, response] of Object.entries({ '0202': '42 02 00 00 00', '06': successfulResponses['06'], '0900': successfulResponses['0900'] })) {
    const result = context.buildWebSerialReadoutOutcome([command], [{ command, response }]);
    check(result.status === 'completed' && result.positiveResponseCount === 1 && result.noDataCount === 0, 'Positive response became incomplete');
    for (const invalid of ['', 'ERROR', 'UNABLE TO CONNECT', 'STOPPED']) {
      check(!context.buildWebSerialReadoutOutcome([command], [{ command, response: invalid }]).readoutCompleted, 'Failed response became completed');
    }
  }
}
`;
await run(production, controls, "Production unchanged controls");
