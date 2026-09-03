import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync(new URL("../script.js", import.meta.url), "utf8");
const context = vm.createContext({});
let checks = 0;
const check = (condition, message) => { assert.ok(condition, message); checks += 1; };
for (const name of ["WEB_SERIAL_ADAPTER_ERROR_LINES", "WEB_SERIAL_VEHICLE_LINK_ERROR_LINES", "WEB_SERIAL_IGNORED_RESPONSE_LINES"]) {
  const definition = source.match(new RegExp(`const ${name} = [^;]+;`));
  assert.ok(definition, `Missing ${name}`);
  vm.runInContext(definition[0], context);
}
for (const name of ["hasCompletedElmDeveloperResponse", "takeCompletedElmDeveloperResponse", "getWebSerialResponseLines", "classifyWebSerialCommandResponse", "hasWebSerialResponseError", "isWebSerialBusInitErrorLine", "isWebSerialInformationalResponseLine"]) {
  const definition = source.match(new RegExp(`function ${name}\\([^)]*\\) \\{[\\s\\S]*?\\r?\\n\\}`));
  assert.ok(definition, `Missing ${name}`);
  vm.runInContext(definition[0], context);
}
const cases = [
  { command: "ATE0", lines: ["ATE0", "?"], status: "failed", reason: "adapter_error" },
  { command: "ATE0", lines: ["ATE0", "OK"], status: "completed" },
  { command: "03", lines: ["03", "SEARCHING...", "NO DATA"], status: "incomplete" },
  { command: "03", lines: ["03", "SEARCHING...", "UNABLE TO CONNECT"], status: "failed", reason: "vehicle_link_error" },
  { command: "03", lines: ["7E8 03 43 01 33", "7E9 03 43 02 00"], status: "completed" },
  { command: "03", lines: ["7E8 03 7F 03 11", "7E9 03 43 02 00"], status: "partial" },
  { command: "03", lines: ["7E8 03 7F 03 78", "7E9 03 43 02 00"], status: "completed" }
];
for (const test of cases) {
  let reference;
  for (const separator of ["\n", "\r\n", "\r"]) {
    const wire = `${test.lines.join(separator)}${separator}>\r\n `;
    const response = context.takeCompletedElmDeveloperResponse(wire);
    check(response === test.lines.join("\n"), `${test.command}: response line boundaries were lost (${JSON.stringify(separator)})`);
    const classified = context.classifyWebSerialCommandResponse(test.command, response);
    check(classified.commandStatus === test.status, `${test.command}: incorrect status (${JSON.stringify(separator)}): ${JSON.stringify(classified)}`);
    if (test.reason) check(classified.stopReason === test.reason, `${test.command}: error reason disappeared`);
    const serialized = JSON.stringify(classified);
    reference ??= serialized;
    check(serialized === reference, `${test.command}: classification depends on adapter line ending`);
    for (let split = 1; split < wire.indexOf(">") + 1; split += 1) {
      const first = wire.slice(0, split);
      check(!context.hasCompletedElmDeveloperResponse(first), "Incomplete fragment was accepted before prompt");
      const combined = first + wire.slice(split);
      check(context.hasCompletedElmDeveloperResponse(combined)
        && context.takeCompletedElmDeveloperResponse(combined) === response, "Fragmentation changed completed response");
    }
  }
}
check(context.takeCompletedElmDeveloperResponse("\r\n>\r\n") === "", "Empty prompt created response data");
console.log(`Serial response line checks: ${checks} / Errors: 0`);
