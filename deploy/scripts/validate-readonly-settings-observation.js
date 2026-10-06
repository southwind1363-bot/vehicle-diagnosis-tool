import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { createReadOnlySettingsObservation } from "./fixtures/readonly-settings-observation.js";

const source = fs.readFileSync(new URL("../script.js", import.meta.url), "utf8");
const steps = ["ATZ", "ATE0", "ATL0", "ATS0", "ATH1", "ATSP0"];
let checks = 0;
const check = (value, message) => { assert.ok(value, message); checks++; };
function initialize(model, ticket) {
  for (const command of steps) check(model.recordInitialization(ticket, command, command === "ATZ" ? "Synthetic reset banner" : "OK").ok, command);
}
for (const protocol of ["6", "8", "A6", "A8", "0", "A0", "7", "A9", "A", "B", "C"]) {
  const model = createReadOnlySettingsObservation(), ticket = model.begin();
  initialize(model, ticket);
  check(model.recordProtocol(ticket, protocol).ok, "protocol report");
  const summary = model.inspect(ticket).summary;
  check(summary.protocol11bitReported === ["6", "8", "A6", "A8"].includes(protocol), "exact supported protocol report");
  check(summary.profile === null && !summary.profileVerified && !summary.canExecute && !summary.wouldTransmit, "incomplete settings never provide profile/authority");
  check(["can_auto_format", "dlc_display", "can_addressing"].every(key => summary.missingSettings.includes(key)), "missing settings cannot use reset defaults");
  check(Object.isFrozen(summary) && Object.isFrozen(summary.acknowledgedCommands) && Object.isFrozen(summary.missingSettings), "frozen summary");
  check(!JSON.stringify(summary).includes("Synthetic"), "raw banner not retained");
}
for (let index = 1; index < steps.length; index++) {
  for (const response of ["", "NOT OK", "OK\nERROR", "OK\nOK", "ok", " OK ", "NO DATA", new String("OK"), "x".repeat(12001)]) {
    const model = createReadOnlySettingsObservation(), ticket = model.begin();
    for (let before = 0; before < index; before++) model.recordInitialization(ticket, steps[before], before ? "OK" : "banner");
    check(!model.recordInitialization(ticket, steps[index], response).ok, "ambiguous acknowledgement rejected");
    check(model.inspect(ticket).summary === null && !model.recordInitialization(ticket, steps[index], "OK").ok, "failure terminal and no partial ready result");
  }
}
for (const response of ["AUTO", "A6\n7", "ATDPN\nA6", "A6\nOK", "a6", "NO DATA", "D", "A66", null]) {
  const model = createReadOnlySettingsObservation(), ticket = model.begin();
  initialize(model, ticket);
  check(!model.recordProtocol(ticket, response).ok && model.inspect(ticket).summary === null, "ambiguous protocol rejected");
}
const model = createReadOnlySettingsObservation(), old = model.begin(), ticket = model.begin();
for (const foreign of [old, { ...ticket }, JSON.parse(JSON.stringify(ticket)), null, createReadOnlySettingsObservation().begin()]) {
  check(!model.recordInitialization(foreign, "ATZ", "banner").ok && model.inspect(ticket).summary.phase === "initializing", "foreign reference cannot change current observations");
}
check(!model.recordProtocol(ticket, "A6").ok, "early protocol refused");
check(model.recordInitialization(ticket, "ATZ", "banner").ok, "reset observation");
check(model.recordInitialization(ticket, "ATE0", "ATE0\nOK").ok, "echo-off transition acknowledgement");
check(!model.recordInitialization(ticket, "ATH1", "OK").ok && model.inspect(ticket).summary === null, "out-of-order settings rejected");
const fresh = model.begin(); initialize(model, fresh); model.recordProtocol(fresh, "A6");
check(!model.recordProtocol(fresh, "A8").ok && model.inspect(fresh).summary.protocolNumberReported === "A6", "duplicate protocol cannot replace observation");
model.invalidate();
check(model.inspect(fresh).summary === null && !model.recordProtocol(fresh, "A6").ok, "disconnect invalidation without revision");

// Run the actual initializer with an artificial command responder. No port, encoder or writer exists.
for (const failedCommand of [null, "ATE0", "ATS0", "ATH1"]) {
  const observer = createReadOnlySettingsObservation(), attempt = observer.begin(), sent = [];
  const context = vm.createContext({ obdSerialRevision: 1, obdDevSession: {}, obdDevStatus: {},
    sendElmDeveloperCommand: async command => {
      sent.push(command);
      const response = command === failedCommand ? "ERROR" : command === "ATZ" ? "ELM327 v2.3" : "OK";
      observer.recordInitialization(attempt, command, response);
      return response;
    },
    throwIfObdSerialOperationCancelled: () => {}, continueObdSerialOperation: () => true,
    buildWebSerialAdapterInitializationSummary: options => options,
    appendObdDeveloperLog: () => {}, renderObdDeveloperGate: () => {}
  });
  for (const name of ["WEB_SERIAL_ADAPTER_ERROR_LINES", "WEB_SERIAL_VEHICLE_LINK_ERROR_LINES", "WEB_SERIAL_IGNORED_RESPONSE_LINES"]) {
    vm.runInContext(source.match(new RegExp(`const ${name} = [^;]+;`))[0], context);
  }
  for (const name of ["initializeElmDeveloperAdapter", "getWebSerialResponseLines", "classifyWebSerialCommandResponse",
    "hasWebSerialResponseError", "isWebSerialBusInitErrorLine", "isWebSerialInformationalResponseLine"]) {
    const match = source.match(new RegExp(`(?:async )?function ${name}\\([^\\n]*\\) \\{[\\s\\S]*?\\r?\\n\\}`));
    assert.ok(match, name); vm.runInContext(match[0], context);
  }
  if (failedCommand) {
    await assert.rejects(context.initializeElmDeveloperAdapter()); checks++;
    check(sent.length === steps.indexOf(failedCommand) + 1 && observer.inspect(attempt).summary === null, "initializer stops at failed setting");
  } else {
    await context.initializeElmDeveloperAdapter();
    assert.deepEqual(sent, steps); checks++;
    const summary = observer.inspect(attempt).summary;
    check(summary.spacesOffAcknowledged && summary.profile === null && summary.missingSettings.includes("protocol_not_observed"), "successful initialization is still insufficient for raw profile");
  }
  observer.invalidate(); check(observer.inspect(attempt).summary === null, "fixture cleanup");
}
console.log(`Read-only settings observations: ${checks} checks passed; actual initializer with artificial responses only, no capture/profile authorization`);
