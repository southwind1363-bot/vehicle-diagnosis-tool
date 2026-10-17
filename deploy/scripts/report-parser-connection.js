import { createParserConnectionPreview } from "./fixtures/parser-connection-preview.js";
import fs from "node:fs";
import vm from "node:vm";
import { pathToFileURL } from "node:url";

// Node-only audit. No sender, application startup, or real transport is loaded.
export function buildParserConnectionReport() {
  const source = fs.readFileSync(new URL("../script.js", import.meta.url), "utf8");
  const current = { port: {}, reader: {}, writer: {}, settingsTicket: {}, revision: 1, connected: true, unlocked: true };
  const context = vm.createContext({ readWebSerialCaptureContext: () => ({ ...current }),
    obdDevSession: { settingsObservation: { owner: { inspect: () => ({ ok: true, summary: {} }) } } } });
  const factory = source.match(/function createWebSerialReadoutCapture\([^\n]*\) \{[\s\S]*?\r?\n\}/)?.[0];
  if (!factory) throw Error("parser_audit_source_boundary_changed");
  vm.runInContext(factory, context);
  const runtime = vm.createContext({ window: {} });
  vm.runInContext(fs.readFileSync(new URL("../obd-readonly.js", import.meta.url), "utf8"), runtime);
  const commands = ["03", "07", "0A", "0101"];
  const lines = ["7E8024300AAAAAAAAAA", "7E8024700AAAAAAAAAA", "7E8024A00AAAAAAAAAA", "7E806410100070100AA"];
  const baseline = { initializationComplete: true, echoOffAcknowledged: true, spacesOffAcknowledged: true,
    protocol11bitReported: true, canAutoFormatAcknowledged: true, dlcOffAcknowledged: true, canExtendedAddressOffAcknowledged: true };
  const cases = [
    { id: "declared_compact_fixture" },
    { id: "unexpected_service", first: "7E8024400AAAAAAAAAA\r>" },
    { id: "invalid_pci", first: "7E8F24300AAAAAAAAAA\r>" },
    { id: "no_data", first: "NO DATA\r>" },
    { id: "bare_lf", first: lines[0] + "\n>" },
    { id: "protocol_not_observed", before: { ...baseline, protocol11bitReported: false } },
    ...["canAutoFormatAcknowledged", "dlcOffAcknowledged", "canExtendedAddressOffAcknowledged"].map(field => ({ id: field + "_missing", before: { ...baseline, [field]: false } })),
    { id: "incomplete_snapshot", before: {} },
    { id: "generation_changed", expire: true }
  ];
  const scenarios = cases.map(test => {
    const owner = context.createWebSerialReadoutCapture(commands);
    const transcripts = lines.map((line, index) => index === 0 && test.first ? test.first : line + "\r>");
    commands.forEach((command, index) => {
      if (!owner.append({ command, transcript: transcripts[index], settingsBeforeRead: test.before || baseline,
        startedAt: index, completedAt: index, profile: null, profileVerified: false, realTransportProofAvailable: false, executionEnabled: false })) throw Error("parser_audit_capture_rejected");
    });
    if (!owner.finish()) throw Error("parser_audit_capture_incomplete");
    const preview = createParserConnectionPreview(owner, runtime.window.ObdReadOnly, commands.map((command, index) => ({ command, transcript: transcripts[index] })));
    if (test.expire) current.settingsTicket = {};
    const snapshot = owner.inspect();
    // Explicit fixture declaration is only for comparing existing parser behavior, never a production grant.
    const parsed = runtime.window.ObdReadOnly.parseElmReadOnlyRawTranscript({
      profile: "iso15765_11bit_normal_h1_caf1_d0_s0_e0", command: "03", transcript: transcripts[0], completion: "complete" });
    const review = snapshot.formatReview;
    const row = { preview: preview.inspect(), id: test.id, captureStatus: snapshot.status, captureReason: snapshot.reason,
      lexicalIssues: review ? Array.from(review.issues) : null,
      allPreReadConditionsObserved: review ? review.readoutConditions.every(condition => Object.entries(condition).every(([key, value]) => key === "command" || value === true)) : false,
      productionProfile: review?.profile ?? null, productionParserAllowed: review?.parserAllowed === true,
      declaredFixtureParserStatus: parsed.status, declaredFixtureParserErrors: Array.from(parsed.errors, error => error.code),
      payloadSemanticsVerified: parsed.payloadSemanticsVerified, executionEnabled: snapshot.executionEnabled };
    owner.invalidate();
    row.previewAfterInvalidation = preview.inspect();
    preview.dispose();
    return row;
  });
  return { sourceVersion: source.match(/const APP_VERSION = "([^"]+)";/)?.[1] || null,
    provenance: "synthetic_source_audit", vehicleTestPerformed: false, transportUsed: false,
    parserComparisonEvidence: "explicit_fixture_profile_only", scenarios };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  console.log(JSON.stringify(buildParserConnectionReport(), null, 2));
