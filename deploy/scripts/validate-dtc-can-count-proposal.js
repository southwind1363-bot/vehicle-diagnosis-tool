// Development-only comparison: never loaded by the application.
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const core = fs.readFileSync(new URL("../obd-readonly.js", import.meta.url), "utf8");
const source = fs.readFileSync(new URL("../script.js", import.meta.url), "utf8").replace(/\r\n/g, "\n");
const names = ["isWebSerialExpectedEmptyResponse", "buildWebSerialDtcResponseOverrides"];
const functions = names.map(name => {
  const match = source.match(new RegExp(`function ${name}\\([^\\n]*\\) \\{[\\s\\S]*?\\n\\}`));
  assert.ok(match, name);
  return match[0];
}).join("\n");
function runtime(text) {
  const context = vm.createContext({ window: {}, navigator: {} });
  vm.runInContext(core, context);
  vm.runInContext(text, context);
  return context;
}
const current = runtime(fs.readFileSync(new URL("./fixtures/dtc-can-count-before.js.txt", import.meta.url), "utf8")), proposed = runtime(functions);
let checks = 0;
const equal = (actual, expected) => { assert.deepEqual(JSON.parse(JSON.stringify(actual)), expected); checks++; };
const cases = [
  { name: "zero", payload: [0], current: ["unparsed", []], proposed: ["reported", []] },
  { name: "P0133", payload: [1, 1, 0x33], current: ["unparsed", []], proposed: ["reported", ["P0133"]] },
  { name: "P0300", payload: [1, 3, 0], current: ["reported", ["P0103"]], proposed: ["reported", ["P0300"]] },
  { name: "missing count", payload: [0, 0], current: ["reported", []], proposed: ["unparsed", []] },
  { name: "count mismatch", payload: [2, 3, 0], current: ["reported", ["P0203"]], proposed: ["unparsed", []] },
  { name: "zero code slot", payload: [1, 0, 0], current: ["reported", ["P0100"]], proposed: ["unparsed", []] }
];
const hex = bytes => bytes.map(b => b.toString(16).toUpperCase().padStart(2, "0")).join(" ");
for (const [command, service, key] of [["03", 0x43, "storedDtcResponse"], ["07", 0x47, "pendingDtcResponse"], ["0A", 0x4A, "permanentDtcResponse"]]) {
  const decode = (context, response) => context.buildWebSerialDtcResponseOverrides([{ command, response }], [command])[key];
  for (const row of cases) {
    const payload = [service, ...row.payload];
    const bytes = [payload.length, ...payload];
    while (bytes.length < 8) bytes.push(0xAA);
    for (const compact of [false, true]) {
      const response = compact ? "7E8" + hex(bytes).replaceAll(" ", "") : "7E8 " + hex(bytes);
      for (const [label, context] of [["current", current], ["proposed", proposed]]) {
        const result = decode(context, response);
        equal([result.dtcReadoutStatus, result.codes], row[label]);
        equal([result.wouldTransmit, result.vehicleCommandEnabled], [false, false]);
      }
    }
  }
  const two = decode(proposed, "7E8 " + hex([6, service, 2, 3, 0, 4, 0x20, 0xAA]));
  equal([two.dtcReadoutStatus, two.codes], ["reported", ["P0300", "P0420"]]);
  const duplicate = decode(proposed, "7E8 " + hex([6, service, 2, 3, 0, 3, 0, 0xAA]));
  equal([duplicate.dtcReadoutStatus, duplicate.codes], ["unparsed", []]);
  const multi = decode(proposed, "7E8 " + hex([4, service, 1, 3, 0, 0xAA, 0xAA, 0xAA])
    + "\r7E9 " + hex([4, service, 1, 4, 0x20, 0xAA, 0xAA, 0xAA]));
  equal(multi.dtcs.map(row => [row.code, row.ecu]).sort(), [["P0300", "7E8"], ["P0420", "7E9"]]);
  for (const response of [hex([service, 1, 0x33]), "NO DATA", "7E8 03 7F " + command + " 78 AA AA AA AA"])
    equal(decode(proposed, response), JSON.parse(JSON.stringify(decode(current, response))));
}
console.log(`DTC CAN count proposal: ${cases.length * 3 * 2} cases / ${checks} checks passed; production correction verified`);
