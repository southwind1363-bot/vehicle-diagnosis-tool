import "./validate-parser-connection.js";
import assert from "node:assert/strict";
import fs from "node:fs";
import { buildCanSettingsReadinessReport } from "./report-can-settings-readiness.js";
const files = ["script.js", "obd-readonly.js", "service-worker.js", "offline-assets.json"];
const before = files.map(file => fs.readFileSync(new URL("../" + file, import.meta.url), "utf8"));
const report = buildCanSettingsReadinessReport();
let checks = 0;
const equal = (actual, expected) => { assert.deepEqual(actual, expected); checks++; };
equal(report.provenance, "synthetic_source_audit");
equal(report.vehicleTestPerformed, false);
equal(report.clearCommandAllowed, false);
equal(report.commands, [
  { setting: "can_auto_format", command: "ATCAF1", allowedByProduction: true },
  { setting: "dlc_display", command: "ATD0", allowedByProduction: true },
  { setting: "can_addressing", command: "ATCEA", allowedByProduction: true }
]);
equal(report.scenarios.map(row => row.protocolReport), [null, "A6", "A8", "A7", "A9", "A0"]);
for (const row of report.scenarios) {
  const supported = ["A6", "A8"].includes(row.protocolReport);
  equal(row.supported11bitReported, supported);
  equal(row.phase, row.protocolReport === null ? "awaiting_protocol" : "observed");
  equal(row.missingSettings, [
    ...(!supported ? [row.protocolReport === null ? "protocol_not_observed" : "supported_11bit_protocol_not_reported"] : [])]);
  equal([row.profile, row.profileVerified, row.executionEnabled, row.realTransportProofAvailable], [null, false, false, false]);
}
equal(report.sourceVersion, before[0].match(/const APP_VERSION = "([^"]+)";/)[1]);
equal(JSON.stringify(report).includes("Synthetic banner"), false);
equal(buildCanSettingsReadinessReport(), report);
equal(files.map(file => fs.readFileSync(new URL("../" + file, import.meta.url), "utf8")), before);
console.log(`CAN settings readiness audit: ${checks} checks passed; no transport, production unchanged`);
