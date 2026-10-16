// Regression comparing fixed 3.13.695 functions with production; no transport.
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
const core = fs.readFileSync(new URL("../obd-readonly.js", import.meta.url), "utf8");
const app = fs.readFileSync(new URL("../script.js", import.meta.url), "utf8").replace(/\r\n/g, "\n");
const functions = ["isWebSerialExpectedEmptyResponse", "buildWebSerialDtcResponseOverrides"].map(name => {
  const match = app.match(new RegExp(`function ${name}\\([^\\n]*\\) \\{[\\s\\S]*?\\n\\}`));
  assert.ok(match, name);
  return match[0];
}).join("\n");
const previous = fs.readFileSync(new URL("./fixtures/dtc-can-extended-before.js.txt", import.meta.url), "utf8");
function load(text) {
  const c = vm.createContext({ window: {}, navigator: {} });
  vm.runInContext(core, c); vm.runInContext(text, c); return c;
}
const current = load(previous), proposal = load(functions);
let checks = 0, cases = 0;
const plain = value => JSON.parse(JSON.stringify(value));
const eq = (a, b) => { assert.deepEqual(plain(a), b); checks++; };
const hex = bytes => bytes.map(b => b.toString(16).toUpperCase().padStart(2, "0")).join(" ");
for (const [command, service, key] of [["03", 0x43, "storedDtcResponse"], ["07", 0x47, "pendingDtcResponse"], ["0A", 0x4A, "permanentDtcResponse"]]) {
  const decode = (c, response) => c.buildWebSerialDtcResponseOverrides([{ command, response }], [command])[key];
  for (const ecu of ["7E8", "18DAF110"]) for (const compact of [false, true]) for (const eol of ["\r", "\n", "\r\n"]) {
    const frame = (id, bytes) => compact ? id + hex(bytes).replaceAll(" ", "") : id + " " + hex(bytes);
    const sf = payload => frame(ecu, [payload.length, ...payload, ...Array(7 - payload.length).fill(0xAA)]);
    const ff = frame(ecu, [0x10, 8, service, 3, 1, 0x33, 4, 0x20]);
    const cf = frame(ecu, [0x21, 3, 0, 0xAA, 0xAA, 0xAA, 0xAA, 0xAA]);
    const good = ff + eol + cf;
    const samples = [
      [sf([service, 0]), "reported", []],
      [sf([service, 1, 3, 0]), "reported", ["P0300"]],
      [sf([service, 2, 3, 0]), "unparsed", []],
      [good, "reported", ["P0133", "P0300", "P0420"]],
      [ff, "unparsed", []],
      [ff + eol + frame(ecu, [0x22, 3, 0, 0xAA, 0xAA, 0xAA, 0xAA, 0xAA]), "unparsed", []],
      [cf, "unparsed", []],
      [cf + eol + ff, "unparsed", []],
      [ff + eol + frame(ecu === "7E8" ? "7E9" : "18DAF118", [0x21, 3, 0, 0xAA, 0xAA, 0xAA, 0xAA, 0xAA]), "unparsed", []],
      [frame(ecu, [0x10, 8, service, 4, 1, 0x33, 4, 0x20]) + eol + cf, "unparsed", []],
      [ff + eol + frame(ecu, [0x21, 1, 0x33, 0xAA, 0xAA, 0xAA, 0xAA, 0xAA]), "unparsed", []],
      [frame(ecu, [0x10, 8, service, 3, 1, 0x33, 4, 0x20, 3, 0]), "unparsed", []]
    ];
    for (const [raw, status, codes] of samples) {
      const result = decode(proposal, raw); cases++;
      const unsupported = ecu === "18DAF110" && compact;
      const expectedCodes = unsupported ? [] : codes;
      eq([result.dtcReadoutStatus, [...result.codes].sort()], [unsupported ? "unparsed" : status, expectedCodes]);
      eq([result.wouldTransmit, result.vehicleCommandEnabled], [false, false]);
      if (eol !== "\n") continue;
      const api = proposal.window.ObdReadOnly;
      const session = api.buildScanSessionFromObdText(">" + command + "\n" + raw.replace(/\r\n?/g, "\n"), { [key]: result });
      const restored = api.buildDiagnosticScanSessionFromJson(JSON.stringify(api.buildBridgeSessionExportPayload(session)));
      eq([...restored.dtcSnapshot.codes].sort(), expectedCodes);
      eq(restored.wouldTransmit, false);
    }
    if (ecu === "18DAF110" && !compact) eq(decode(current, sf([service, 1, 3, 0])).codes, ["P0103"]);
    eq([...decode(current, good).codes].sort(), ecu === "18DAF110" && compact ? [] : ["P0301", "P2003", "P3304"]);
  }
  for (const raw of [hex([service, 3, 0]), "NO DATA", "7E8 03 7F " + command + " 78 AA AA AA AA"])
    eq(decode(proposal, raw), plain(decode(current, raw)));
}
eq(fs.readFileSync(new URL("../script.js", import.meta.url), "utf8").replace(/\r\n/g, "\n"), app);
console.log(`Extended CAN DTC production regression: ${cases} cases / ${checks} checks passed; production unchanged`);
