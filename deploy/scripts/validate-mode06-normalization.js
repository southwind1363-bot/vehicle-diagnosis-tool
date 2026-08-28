import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const context = vm.createContext({ window: {} });
vm.runInContext(fs.readFileSync(new URL("../obd-readonly.js", import.meta.url), "utf8"), context);
const obd = context.window.ObdReadOnly;
let checks = 0;
const check = (condition, message) => { assert.ok(condition, message); checks += 1; };
const cases = [
  [{ value: 20, status: "unknown" }, "unknown"],
  [{ value: 20, status: " UNKNOWN ", pass: false }, "unknown"],
  [{ value: 20, status: "unknown", passed: false }, "unknown"],
  [{ value: 20, status: "unknown", failed: true }, "fail"],
  [{ value: 20, status: "unknown", passed: true }, "pass"],
  [{ value: 20, status: "unknown", min: null, max: null }, "unknown"],
  [{ value: 20, min: "invalid", max: 10 }, "unknown"],
  [{ value: 0 }, "unknown"],
  [{ value: 20, min: 0 }, "unknown"],
  [{ value: 20, max: 10 }, "unknown"],
  [{ value: 20, passed: false }, "fail"],
  [{ value: 20, passed: true }, "pass"],
  [{ value: 20, pass: false }, "fail"],
  [{ value: 20, fail: true }, "fail"],
  [{ value: 20, isFailed: true }, "fail"],
  [{ value: 20, is_failed: true }, "fail"],
  [{ value: 20, isPassed: true }, "pass"],
  [{ value: 20, is_passed: true }, "pass"],
  [{ value: 20, failed: true }, "fail"],
  [{ value: 20, status: "fail" }, "fail"],
  [{ value: 20, status: "pass" }, "pass"],
  [{ value: 0, min: 0, max: 0 }, "pass"],
  [{ value: 10, min: 0, max: 10, failed: true }, "pass"],
  [{ value: 20, min: 0, max: 10, passed: true }, "fail"],
  [{ value: -40, min: -50, max: -30 }, "pass"],
  [{ value: 20, min: 0, max: 10 }, "fail"],
  [{ value: 20, min: 0, max: 10, status: "unknown" }, "fail"]
];
for (const [fields, expected] of cases) {
  const input = { source_ecu: "7E8", tests: [{ test_id: "01", component_id: "02", ...fields }] };
  const before = JSON.stringify(input);
  let snapshot = obd.normalizeOnboardMonitorSnapshot(input);
  for (let cycle = 0; cycle < 3; cycle += 1) {
    const row = snapshot.tests[0];
    check(row?.status === expected, `Mode06 status drift at cycle ${cycle}: ${JSON.stringify(fields)}`);
    check(row?.value === fields.value && row?.sourceEcu === "7E8" && row?.testId === "01" && row?.componentId === "02", "Mode06 identity/value changed");
    check(snapshot.unknownCount === Number(expected === "unknown") && snapshot.failedCount === Number(expected === "fail")
      && snapshot.passedCount === Number(expected === "pass"), "Mode06 aggregate counts diverged from recorded status");
    snapshot = obd.normalizeOnboardMonitorSnapshot(JSON.parse(JSON.stringify(snapshot)));
  }
  check(JSON.stringify(input) === before, "Normalizer mutated source input");
}
for (const missing of [null, undefined, "", "   ", false, true, [], [0], {}, "invalid", Infinity, NaN]) {
  for (const [minKey, maxKey] of [["min", "max"], ["minLimit", "maxLimit"]]) {
    const snapshot = obd.normalizeOnboardMonitorSnapshot({ tests: [{ test_id: "01", component_id: "01", value: 20, [minKey]: missing, [maxKey]: missing }] });
    check(snapshot.tests[0]?.min === null && snapshot.tests[0]?.max === null && snapshot.tests[0]?.status === "unknown", "Missing/malformed limits fabricated zero or a verdict");
    const repeated = obd.normalizeOnboardMonitorSnapshot(JSON.parse(JSON.stringify(snapshot)));
    check(repeated.tests[0]?.min === null && repeated.tests[0]?.max === null && repeated.tests[0]?.status === "unknown", "Malformed limits became a verdict after JSON normalization");
  }
  for (const valueKey of ["value", "rawValue"]) {
    const snapshot = obd.normalizeOnboardMonitorSnapshot({ tests: [{ test_id: "01", component_id: "01", [valueKey]: missing, min: 0, max: 10 }] });
    check(snapshot.tests.length === 0, "Missing/malformed measurement fabricated a test result");
  }
}
for (const [value, expected] of [[0, 0], ["0", 0], [" 0 ", 0], ["0x10", 16], ["-40", -40], ["1e2", 100]]) {
  const snapshot = obd.normalizeOnboardMonitorSnapshot({ tests: [{ test_id: "01", component_id: "01", value, min: value, max: value }] });
  check(snapshot.tests[0]?.value === expected && snapshot.tests[0]?.min === expected && snapshot.tests[0]?.max === expected && snapshot.tests[0]?.status === "pass", "Valid numeric encoding or inclusive boundary changed");
}
for (const invalid of ["", false, [], {}, new Number(0), Symbol("value"), 0n]) {
  const measurement = obd.normalizeOnboardMonitorSnapshot({ tests: [{ test_id: "01", component_id: "01", value: invalid, measured: 20, status: "pass" }] });
  check(measurement.tests.length === 0, "Invalid present measurement fell through to an alias or an affirmative status");
  for (const key of ["min", "max"]) {
    const snapshot = obd.normalizeOnboardMonitorSnapshot({ tests: [{ test_id: "01", component_id: "01", value: 20, min: 0, max: 10, minimum: 0, maximum: 10, [key]: invalid }] });
    check(snapshot.tests[0]?.[key] === null && snapshot.tests[0]?.status === "unknown", "Invalid present limit fell through to an alias or fabricated a verdict");
  }
}
const fallback = obd.normalizeOnboardMonitorSnapshot({ tests: [{ test_id: "01", component_id: "01", value: null, measured: "20", min: null, minimum: "0", max: null, maximum: "30" }] });
check(fallback.tests[0]?.value === 20 && fallback.tests[0]?.min === 0 && fallback.tests[0]?.max === 30 && fallback.tests[0]?.status === "pass", "Null alias fallback changed");
let session = obd.buildDiagnosticScanSession({ onboardMonitorSnapshot: { onboard_monitor_ecu_snapshots: [
  { source_ecu: "7E8", tests: [{ test_id: "01", component_id: "01", value: 20, status: "unknown" }] },
  { source_ecu: "7E9", tests: [{ test_id: "01", component_id: "01", value: 0, min: 0, max: 10 }] }
] } });
for (let cycle = 0; cycle < 3; cycle += 1) {
  const snapshot = session.onboardMonitorSnapshot;
  check(snapshot.tests.some((row) => row.sourceEcu === "7E8" && row.status === "unknown")
    && snapshot.tests.some((row) => row.sourceEcu === "7E9" && row.status === "pass"), "Session/export merged ECU results or changed unknown status");
  check(snapshot.failedCount === 0 && snapshot.unknownCount === 1 && snapshot.passedCount === 1, "Session/export introduced false failed counts");
  check(!session.warnings?.includes("onboard_monitor_test_failed"), "Unknown result generated a failure warning");
  check(session.vehicleCommandEnabled === false && session.wouldTransmit === false, "Mode06 normalization enabled vehicle commands");
  session = obd.buildDiagnosticScanSessionFromJson(JSON.stringify(obd.buildBridgeSessionExportPayload(session)));
}
console.log(`Mode06 normalization checks: ${checks} / Errors: 0`);
