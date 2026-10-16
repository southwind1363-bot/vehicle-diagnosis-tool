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
const target = "            return window.ObdReadOnly.decodeObdDtcResponse({\n              bytes: normalizedBytes,";
assert.equal(functions.split(target).length, 2);
// Proposed scope: complete, header-bearing 11-bit single-frame CAN responses only.
// Leave headerless, 29-bit, multi-frame and the general decoder outside this proposal.
const replacement = `            let dtcBytes = normalizedBytes;
            const countedSingleFrame = /^[0-7][0-9A-F]{2}$/i.test(String(packet?.ecu || ""))
              && Number.isInteger(frameLength) && frameLength >= 2 && frameLength <= 7
              && bytes[0] === frameLength && bytes.length >= frameLength + 1
              && [0x43, 0x47, 0x4A].includes(normalizedBytes[0]);
            if (countedSingleFrame) {
              const count = normalizedBytes[1];
              const codes = new Set();
              let valid = normalizedBytes.length === 2 + count * 2;
              for (let index = 2; valid && index < normalizedBytes.length; index += 2) {
                const code = (normalizedBytes[index] << 8) | normalizedBytes[index + 1];
                if (code === 0 || codes.has(code)) valid = false;
                codes.add(code);
              }
              dtcBytes = !valid ? [normalizedBytes[0]] : count === 0
                ? [normalizedBytes[0], 0, 0] : [normalizedBytes[0], ...normalizedBytes.slice(2)];
            }
            return window.ObdReadOnly.decodeObdDtcResponse({
              bytes: dtcBytes,`;
function runtime(text) {
  const context = vm.createContext({ window: {}, navigator: {} });
  vm.runInContext(core, context);
  vm.runInContext(text, context);
  return context;
}
const current = runtime(functions), proposed = runtime(functions.replace(target, replacement));
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
  for (const response of [hex([service, 1, 0x33]), "NO DATA", "7E8 03 7F " + command + " 78 AA AA AA AA"])
    equal(decode(proposed, response), JSON.parse(JSON.stringify(decode(current, response))));
}
console.log(`DTC CAN count proposal: ${cases.length * 3 * 2} cases / ${checks} checks passed; production unchanged`);
