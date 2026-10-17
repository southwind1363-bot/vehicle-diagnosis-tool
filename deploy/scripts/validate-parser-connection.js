import "./validate-parser-acquisition-integration.js";
import "./validate-parser-connection-review.js";
import "./validate-parser-connection-preview.js";
import assert from "node:assert/strict";
import fs from "node:fs";
import { buildParserConnectionReport } from "./report-parser-connection.js";
const files = ["script.js", "obd-readonly.js", "service-worker.js", "offline-assets.json"];
const read = () => files.map(file => fs.readFileSync(new URL("../" + file, import.meta.url), "utf8"));
const before = read(), report = buildParserConnectionReport();
let checks = 0;
const equal = (actual, expected) => { assert.deepEqual(actual, expected); checks++; };
equal(report.provenance, "synthetic_source_audit");
equal([report.vehicleTestPerformed, report.transportUsed], [false, false]);
equal(report.parserComparisonEvidence, "explicit_fixture_profile_only");
equal(report.scenarios.length, 11);
equal(report.connectionImpact.repeatedInspection, Array.from({length:3},()=>({status:'finished',count:4})));
equal(report.connectionImpact.firstTakeCount,4);
equal(report.connectionImpact.afterTake,{status:'invalidated',count:0,reason:'consumed'});
equal(report.connectionImpact.secondTakeAvailable,false);
equal(report.connectionImpact.viewAfterTake,'unavailable');
equal(report.connectionImpact.injectedTopLevelPrivateFieldsRetained,false);
equal(report.connectionImpact.scope,'synthetic_owner_and_top_level_export_probe_only');
const rows = Object.fromEntries(report.scenarios.map(row => [row.id, row]));
for (const row of report.scenarios) equal([row.productionProfile, row.productionParserAllowed, row.payloadSemanticsVerified, row.executionEnabled], [null, false, false, false]);
for (const [id, error] of [["unexpected_service", "unexpected_response_service"], ["invalid_pci", "unsupported_pci"]]) {
  equal(rows[id].lexicalIssues, []);
  equal(rows[id].allPreReadConditionsObserved, true);
  equal(rows[id].declaredFixtureParserStatus, "error");
  equal(rows[id].declaredFixtureParserErrors, [error]);
}
equal(rows.declared_compact_fixture.declaredFixtureParserStatus, "responses_observed");
equal(rows.no_data.declaredFixtureParserStatus, "no_response");
equal(rows.no_data.lexicalIssues, ["no_frame_evidence"]);
equal(rows.bare_lf.lexicalIssues, ["framing_mismatch"]);
equal(rows.bare_lf.declaredFixtureParserStatus, "error");
for (const [id, issue] of [["protocol_not_observed", "protocol_unconfirmed"], ["incomplete_snapshot", "settings_before_read_unavailable"],
  ...["canAutoFormatAcknowledged", "dlcOffAcknowledged", "canExtendedAddressOffAcknowledged"].map(field => [field + "_missing", "can_settings_unconfirmed"])]) {
  equal(rows[id].lexicalIssues, [issue]);
  equal(rows[id].allPreReadConditionsObserved, false);
  equal(rows[id].declaredFixtureParserStatus, "responses_observed");
}
equal([rows.generation_changed.captureStatus, rows.generation_changed.captureReason, rows.generation_changed.lexicalIssues], ["invalidated", "settings_unavailable", null]);
equal(/7E8|AAAAAAAA|transcript/.test(JSON.stringify(report)), false);
equal(buildParserConnectionReport(), report);
equal(read(), before);
console.log(`Parser connection audit: ${checks} checks / 11 synthetic cases passed; production unchanged, no transport`);
