// Development-only candidate with a synthetic port; no production mutation.
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { proposeExtendedCanDtc } from "./fixtures/dtc-can-extended-proposal.js";
const url = new URL("./validate-serial-integration.js", import.meta.url);
const source = fs.readFileSync(url, "utf8").replace(/\r\n/g, "\n");
const marker = "\n{\n  const { context } = createClient(successfulResponses);";
assert.ok(source.includes(marker));
const appUrl = new URL("../script.js", import.meta.url);
const original = fs.readFileSync(appUrl, "utf8");
const candidate = proposeExtendedCanDtc(original.replace(/\r\n/g, "\n"));
const prefix = source.slice(0, source.indexOf(marker)).replace(/^import .*;\n/gm, "")
  .replace(/const scriptSource = [^\n]+;/, () => "const scriptSource = " + JSON.stringify(candidate) + ";")
  .replaceAll("import.meta.url", JSON.stringify(url.href));
const connect = source.match(/async function connect\(client\) \{[\s\S]*?\n\}/)?.[0];
assert.ok(connect);
const body = String.raw`
for (const [ecu, multi] of [["18DAF110", false], ["7E8", true], ["18DAF110", true]]) {
  const replies = { ...successfulResponses };
  for (const [command, service] of [["03", "43"], ["07", "47"], ["0A", "4A"]]) {
    replies[command] = multi
      ? ecu + " 10 08 " + service + " 03 01 33 04 20\r" + ecu + " 21 03 00 AA AA AA AA AA"
      : ecu + " 04 " + service + " 01 03 00 AA AA AA";
  }
  if (ecu.length === 8) { replies.ATDPN = "A7"; replies.ATDP = "AUTO, ISO 15765-4 (CAN 29/500)"; }
  const client = createClient(replies, { fragmentResponses: true, fragmentSize: 1 });
  await connect(client);
  await client.context.readObdDeveloperCoreScan();
  const expected = multi ? ["P0133", "P0300", "P0420"] : ["P0300"];
  const verify = session => {
    assert.deepEqual(Array.from(session.dtcSnapshot.codes).sort(), expected); checks++;
    assert.deepEqual(Array.from(session.dtcSnapshot.dtcStatusSummary.reportedStatuses).sort(), ["pending", "permanent", "stored"]); checks++;
  };
  verify(client.context.obdDevSession.lastSession);
  await client.context.readObdDeveloperLiveSnapshot();
  const session = client.context.obdDevSession.lastSession;
  verify(session);
  const api = client.context.ObdReadOnly;
  const restored = api.buildDiagnosticScanSessionFromJson(JSON.stringify(api.buildBridgeSessionExportPayload(session)));
  verify(restored);
  check(restored.wouldTransmit === false && restored.vehicleCommandEnabled === false, "Archive granted authority");
  await client.context.disconnectObdDeveloperVci();
  check(client.port.closed && !client.port.readerLocked && !client.port.writerLocked, "Port resource leaked");
}
console.log("Extended CAN candidate integration: 3 routes / " + checks + " checks passed");
`;
await vm.runInNewContext("(async () => {\n" + prefix + "\n" + connect + "\n" + body + "\n})()",
  { assert, fs, vm, URL, TextEncoder, TextDecoder, setTimeout, clearTimeout, performance, Date, console });
assert.equal(fs.readFileSync(appUrl, "utf8"), original);
