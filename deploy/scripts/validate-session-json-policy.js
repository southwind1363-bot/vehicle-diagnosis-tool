import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

let parseCalls = 0;
const context = vm.createContext({ window: {}, JSON: {
  parse: (...args) => { parseCalls += 1; return JSON.parse(...args); },
  stringify: JSON.stringify
} });
vm.runInContext(fs.readFileSync(new URL("../obd-readonly.js", import.meta.url), "utf8"), context);
const obd = context.window.ObdReadOnly;
assert.equal(obd.diagnosticSessionMaxBytes, 4000000);
let checks = 0;
const check = (condition, message) => { assert.ok(condition, message); checks += 1; };
const nativeArchive = JSON.parse(fs.readFileSync(new URL("./fixtures/native-elm327-scan-archive.json", import.meta.url), "utf8"));
const snapshot = { sourceEcu: "7E8", testCount: 3, passedCount: 1, failedCount: 1, unknownCount: 1 };
const saved = obd.buildBridgeSessionExportPayload(obd.buildDiagnosticScanSession({ onboardMonitorSnapshot: snapshot }));
const padJson = (payload, bytes, character = "\u3042") => {
  const empty = { ...payload, padding: "" };
  const remaining = bytes - Buffer.byteLength(JSON.stringify(empty), "utf8");
  assert.ok(remaining >= 0, "Fixture already exceeds its target");
  const width = Buffer.byteLength(character, "utf8");
  empty.padding = character.repeat(Math.floor(remaining / width)) + "x".repeat(remaining % width);
  const text = JSON.stringify(empty);
  assert.equal(Buffer.byteLength(text, "utf8"), bytes);
  return text;
};
const policyFor = (value) => {
  const result = obd.getDiagnosticSessionJsonPolicy(value);
  assert.deepEqual(Object.keys(result).sort(), ["accepted", "error", "isJson", "kind", "maxBytes"]);
  assert.equal(result.accepted, result.error === null);
  return result;
};
const assertRejected = (text, error, message) => {
  const result = policyFor(text);
  check(result.accepted === false && result.error === error, message);
  check(obd.buildDiagnosticScanSessionFromJson(text) === null, `${message}: core bypassed policy`);
};
const assertCounts = (session, message) => {
  check(session?.onboardMonitorSnapshot?.testCount === 3
    && session.onboardMonitorSnapshot.passedCount === 1
    && session.onboardMonitorSnapshot.failedCount === 1
    && session.onboardMonitorSnapshot.unknownCount === 1
    && session.onboardMonitorSnapshot.tests.length === 0
    && session.vehicleCommandEnabled === false, message);
};

for (const [kind, bytes, payload] of [
  ["session", 4000000, saved],
  ["native", 2000000, { native_connector_archive: nativeArchive }],
  ["scanner", 500000, { onboardMonitorSnapshot: snapshot }]
]) {
  for (const character of ["x", "\u3042", "\u{1F680}"]) {
    const exact = padJson(payload, bytes, character);
    const result = policyFor(exact);
    check(result.isJson && result.accepted && result.kind === kind && result.maxBytes === bytes, `${kind}: exact UTF-8 boundary rejected`);
    const imported = obd.buildDiagnosticScanSessionFromJson(exact);
    if (kind === "native") {
      check(imported?.source === "native_connector" && imported.dtcSnapshot.codes.includes("P0300")
        && imported.dtcSnapshot.codes.includes("P0420") && imported.vehicleCommandEnabled === false, "Native validator behavior changed");
    } else assertCounts(imported, `${kind}: exact-boundary import lost count-only evidence`);
    assertRejected(padJson(payload, bytes + 1, character), kind === "session" ? "input_too_large" : `${kind === "native" ? "native_archive" : "scanner_json"}_too_large`, `${kind}: plus-one boundary accepted`);
    assertRejected(` ${exact}`, kind === "session" ? "input_too_large" : `${kind === "native" ? "native_archive" : "scanner_json"}_too_large`, `${kind}: surrounding whitespace excluded from byte count`);
  }
}
for (const character of ["x", "\u3042", "\u{1F680}"]) {
  const width = Buffer.byteLength(character);
  const exact = character.repeat(Math.floor(2000000 / width)) + "x".repeat(2000000 % width);
  const result = policyFor(exact);
  check(!result.isJson && result.kind === "text" && result.accepted && result.maxBytes === 2000000, "Plain text limit changed");
  assertRejected(`${exact}x`, "text_too_large", "Oversize plain text accepted");
}
parseCalls = 0;
assertRejected(padJson(saved, 4000001), "input_too_large", "Preparse ceiling bypassed");
check(parseCalls === 0, "Oversize input reached JSON.parse");

for (const wrapper of [null, "bridge_export_payload", "bridgeExportPayload", "report", "scan_report", "scanReport"]) {
  const payload = wrapper ? { [wrapper]: saved } : saved;
  const text = padJson(payload, 2100000);
  check(policyFor(text).accepted && policyFor(text).kind === "session", `Supported wrapper rejected: ${wrapper}`);
  assertCounts(obd.buildDiagnosticScanSessionFromJson(text), `Wrapper changed count-only evidence: ${wrapper}`);
}
for (const key of ["session", "scan_session", "scanSession", "bridge_session", "bridgeSession"]) {
  const legacy = { schemaVersion: "bridge_session_export_v1", [key]: { onboard_monitor_snapshot: snapshot } };
  check(policyFor(padJson(legacy, 2100000)).accepted, `Legacy session alias rejected: ${key}`);
  assertCounts(obd.buildDiagnosticScanSessionFromJson(JSON.stringify(legacy)), `Legacy alias changed evidence: ${key}`);
}
const lateMarker = JSON.stringify({ padding: "x".repeat(5000), ...saved });
check(policyFor(lateMarker).accepted && lateMarker.indexOf('"schema_version"') > 4096, "Late schema marker rejected");
assertCounts(obd.buildDiagnosticScanSessionFromJson(lateMarker), "Late schema marker changed import");

const outerMarker = { schema_version: "bridge_session_export_v1", report: { onboard_monitor_snapshot: snapshot } };
check(policyFor(padJson(outerMarker, 1900000)).accepted, "Legacy outer-marker permissiveness below 2 MB changed");
assertRejected(padJson(outerMarker, 2100000), "invalid_session_envelope", "Outer marker authorized an unmarked selected payload");
assertRejected(padJson({ schema_version: "bridge_session_export_v1", onboard_monitor_snapshot: snapshot }, 2100000), "invalid_session_envelope", "Bare marker gained larger capacity");
assertRejected(padJson({ metadata: { schema_version: "bridge_session_export_v1" }, onboardMonitorSnapshot: snapshot }, 500001), "scanner_json_too_large", "Unselected nested marker bypassed scanner ceiling");
for (const session of [null, [], "bad", 0, false]) {
  assertRejected(JSON.stringify({ schema_version: "bridge_session_export_v1", session }), "invalid_session_envelope", "Invalid declared session accepted");
}
assertRejected(JSON.stringify({ ...saved, schemaVersion: "native_connector_contract_v1" }), "invalid_native_archive", "Conflicting native schema aliases accepted");
assertRejected(JSON.stringify({ ...saved, schemaVersion: "other" }), "invalid_session_envelope", "Conflicting session schema aliases accepted");
for (const key of ["native_connector_archive", "nativeConnectorArchive"]) {
  for (const mixed of [
    { ...saved, [key]: nativeArchive },
    { [key]: nativeArchive, bridge_export_payload: saved },
    { ...saved, session: { ...saved.session, [key]: nativeArchive } },
    { ...saved, [key]: null }
  ]) {
    assertRejected(JSON.stringify(mixed), "invalid_native_archive", "Mixed native/session archive was accepted");
    assertRejected(padJson(mixed, 2000001), "native_archive_too_large", "Export wrapper expanded native ceiling");
  }
}
assertRejected(JSON.stringify({ schema_version: "native_connector_contract_v1", dtcs: ["P0300"] }), "invalid_native_archive", "Malformed declared native archive could fall back");
assertRejected(padJson({ ...saved, envelopes: [], completion_manifest: null }, 2000001), "native_archive_too_large", "Null manifest hid a native archive declaration");
assertRejected(JSON.stringify({ envelopes: [], completion_manifest: null }), "invalid_native_archive", "Null manifest could fall back");
assertRejected(JSON.stringify({ report: nativeArchive }), "invalid_native_archive", "Unsupported nested native archive could fall back");
const invalidNative = { ...nativeArchive, completion_manifest: { ...nativeArchive.completion_manifest, read_only: false } };
check(policyFor(JSON.stringify(invalidNative)).accepted, "Size policy replaced native content validation");
const nativeRejectedSession = obd.buildDiagnosticScanSessionFromJson(JSON.stringify(invalidNative));
check(nativeRejectedSession?.warnings?.includes("native_connector_import_rejected")
  && nativeRejectedSession.warnings.includes("unsafe_completion_manifest_flags")
  && nativeRejectedSession.vehicleCommandEnabled === false, "Existing native validation rejection semantics changed");

const nativeProvenance = { ...saved, source: "native_connector", source_type: "native_connector",
  session: { ...saved.session, source: "native_connector", native_connector_boundary: { scan_id: "11111111-1111-4111-8111-111111111111" } } };
const provenanceText = padJson(nativeProvenance, 2100000);
check(policyFor(provenanceText).accepted && policyFor(provenanceText).kind === "session", "Metadata-only native provenance mistaken for native archive");
assertCounts(obd.buildDiagnosticScanSessionFromJson(provenanceText), "Native provenance changed saved evidence");
assertRejected(padJson({ ...saved, vehicle_command_enabled: true }, 2100000), "invalid_session_envelope", "Unsafe export flags gained larger capacity");

for (const text of ["", "plain scanner text P0300", '{"dtcs":["P0300"', "[not JSON", `{${"x".repeat(1999999)}`]) {
  check(policyFor(text).accepted, "Ordinary malformed/empty text lost existing fallback");
}
for (const [schema, error] of [["native_connector_contract_v1", "invalid_native_archive"], ["bridge_session_export_v1", "invalid_session_envelope"]]) {
  assertRejected(`{"schema_version":"${schema}",`, error, "Truncated declared archive could fall back");
}
assertRejected('{"nativeConnectorArchive":', "invalid_native_archive", "Truncated native wrapper could fall back");
assertRejected(`{${"x".repeat(2000000)}`, "text_too_large", "Malformed JSON gained larger fallback limit");
check(policyFor("x".repeat(4000001)).maxBytes === 2000000, "Very large plain text reported the JSON ceiling");
let roundTrip = saved;
for (let cycle = 0; cycle < 3; cycle += 1) {
  const imported = obd.buildDiagnosticScanSessionFromJson(JSON.stringify(roundTrip));
  assertCounts(imported, `Round trip ${cycle} lost counts or fabricated measurements`);
  roundTrip = obd.buildBridgeSessionExportPayload(imported);
  check(roundTrip.schema_version === "bridge_session_export_v1" && roundTrip.vehicle_command_enabled === false, "Export schema or safety flags changed");
}
console.log(`Session JSON policy checks: ${checks} / Errors: 0`);
