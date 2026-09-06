import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync(new URL("../obd-readonly.js", import.meta.url), "utf8");
const context = vm.createContext({ window: {}, navigator: {} });
vm.runInContext(source, context);
const api = context.window.ObdReadOnly;
const evaluate = api.evaluateGenericObdDtcClearPostReadoutReceipts;
const profile = "iso15765_11bit_normal_h1_caf1_d0_s1_e0";
let checks = 0;
const check = (value, message) => { assert.ok(value, message); checks += 1; };
const typeError = (fn, message) => { assert.throws(fn, (error) => error?.name === "TypeError", message); checks += 1; };
const rangeError = (fn, message) => { assert.throws(fn, (error) => error?.name === "RangeError", message); checks += 1; };

function createTerminalClearSnapshot(expectedSourceIds = ["7E8"]) {
  const connectionToken = {};
  const receiveWindow = api.createGenericObdDtcClearReceiveWindow({ expectedSourceIds, connectionToken });
  for (const sourceId of expectedSourceIds) {
    check(receiveWindow.append(receiveWindow.attemptToken, connectionToken, { sourceId, payload: [0x44] }).ok, "Clear fixture frame was rejected");
  }
  return receiveWindow.finish(receiveWindow.attemptToken, connectionToken, "complete").snapshot;
}

const clearWindowSnapshot = createTerminalClearSnapshot();
const transcripts = {
  read_stored_dtc: "7E8 03 43 00 00 00 00 00 00\r>",
  read_pending_dtc: "7E8 03 47 00 00 00 00 00 00\r>",
  read_permanent_dtc: "7E8 03 4A 00 00 00 00 00 00\r>",
  read_readiness: "7E8 06 41 01 80 07 E1 00 00\r>"
};
const intents = [
  ["read_stored_dtc", "03"],
  ["read_pending_dtc", "07"],
  ["read_permanent_dtc", "0A"],
  ["read_readiness", "0101"]
];

function createInput(overrides = {}) {
  const postAttemptToken = {};
  const postConnectionToken = {};
  const receipts = intents.map(([intent, command], index) => ({
    ordinal: index + 1,
    intent,
    command,
    profile,
    startedAt: `2026-09-06T00:00:0${index + 2}.000Z`,
    completedAt: `2026-09-06T00:00:0${index + 3}.000Z`,
    completion: "complete",
    transcript: transcripts[intent]
  }));
  return {
    clearWindowSnapshot,
    clearCompletedAt: "2026-09-06T00:00:00.000Z",
    postReadout: {
      provenance: "simulated",
      attemptToken: postAttemptToken,
      connectionToken: postConnectionToken,
      startedAt: "2026-09-06T00:00:01.000Z",
      completedAt: "2026-09-06T00:00:07.000Z",
      receipts,
      ...(overrides.postReadout || {})
    },
    ...Object.fromEntries(Object.entries(overrides).filter(([key]) => key !== "postReadout"))
  };
}

const input = createInput();
const inputBefore = JSON.stringify(input);
const valid = evaluate(input);
check(JSON.stringify(input) === inputBefore, "Evaluator mutated its input");
check(valid.schemaVersion === "generic_obd_dtc_clear_post_readout_receipts_v1" && valid.state === "indeterminate", "Valid fixture escaped the indeterminate simulated boundary");
check(valid.provenance.status === "simulated_only" && valid.provenance.operationBound === false
  && valid.provenance.sameConnectionReferenceObserved === false && valid.provenance.sameVehicleVerified === false
  && valid.provenance.realTransportProofAvailable === false, "Provenance overstated real operation evidence");
check(valid.provenance.clearResponseExpectedSourceIds.join(",") === "7E8"
  && valid.provenance.expectedSourceScopeStatus === "unavailable", "Clear response sources became post-readout expected sources");
check(["simulated_provenance_only", "dispatcher_not_implemented", "connection_boundary_unverified", "expected_source_scope_unavailable", "vehicle_identity_not_observed", "ecu_clear_scope_not_verified"]
  .every((blocker) => valid.provenance.blockerIds.includes(blocker)), "A mandatory evidence blocker was omitted");
check(valid.ordering.status === "ordered_after_clear" && valid.receiptStructureComplete === true, "Valid receipt structure or ordering was rejected");
check(valid.readouts.map((item) => item.observation).join(",")
  === "indeterminate,indeterminate,indeterminate,source_positive_reported", "Unverified DTC semantics or readiness observations were misclassified");
check(valid.readouts.every((item) => item.evidenceComplete === false && item.observedSourceIds.join(",") === "7E8"), "Observed sources became complete expected-source evidence");
check(valid.readouts.slice(1, 3).every((item) => item.positiveEmptySourceIds.length === 0 && item.positiveNonemptySourceIds.length === 0
  && item.blockerIds.includes("dtc_payload_conflict")), "Extra application bytes became valid CAN DTC evidence");
check(valid.readouts[0].positiveEmptySourceIds.length === 0 && valid.readouts[0].blockerIds.includes("dtc_payload_conflict"),
  "Count-zero payload with extra application bytes was accepted");
check(valid.readoutCoverageComplete === false && valid.comparisonAvailable === false
  && valid.operationOutcomeInferred === false && valid.clearSucceededInferred === false
  && valid.repairCompleteInferenceAllowed === false && valid.technicianReviewRequired === true
  && valid.executionEnabled === false && valid.vehicleCommandEnabled === false
  && valid.wouldTransmit === false && valid.canExecute === false, "Safety or comparison flags were enabled");
check(Object.isFrozen(valid) && Object.isFrozen(valid.provenance) && Object.isFrozen(valid.provenance.blockerIds)
  && Object.isFrozen(valid.readouts) && Object.isFrozen(valid.readouts[0]) && Object.isFrozen(valid.readouts[0].observedSourceIds), "Result is not deeply frozen");

const nonemptyInput = createInput();
nonemptyInput.postReadout.receipts[0].transcript = "7E8 03 43 01 33 00 00 00 00\r>";
const nonempty = evaluate(nonemptyInput);
check(nonempty.readouts[0].observation === "indeterminate" && nonempty.readouts[0].observedSourceIds.join(",") === "7E8"
  && nonempty.readouts[0].positiveNonemptySourceIds.length === 0, "Unverified nonempty-looking DTC payload became semantic evidence");

for (const transcript of [
  "7E8 03 43 00 00 00 00 00 00\r>",
  "7E8 04 43 02 C1 23 00 00 00\r>",
  "7E8 01 43 00 00 00 00 00 00\r>"
]) {
  const semanticsInput = createInput();
  semanticsInput.postReadout.receipts[0].transcript = transcript;
  const result = evaluate(semanticsInput).readouts[0];
  check(result.observation === "indeterminate" && result.observedSourceIds.join(",") === "7E8"
    && result.positiveEmptySourceIds.length === 0 && result.positiveNonemptySourceIds.length === 0
    && result.blockerIds.includes("dtc_payload_conflict"), "Count-mismatched or truncated DTC payload was promoted to empty/nonempty evidence");
}

function storedResult(transcript, completion = "complete") {
  const fixture = createInput();
  Object.assign(fixture.postReadout.receipts[0], { transcript, completion });
  const result = evaluate(fixture);
  check(result.state === "indeterminate" && result.provenance.status === "simulated_only"
    && result.readoutCoverageComplete === false && result.comparisonAvailable === false
    && result.clearSucceededInferred === false && result.operationOutcomeInferred === false
    && result.executionEnabled === false && result.vehicleCommandEnabled === false
    && result.wouldTransmit === false && result.canExecute === false, "Stored DTC observations opened an operation or comparison boundary");
  return result.readouts[0];
}

const storedEmptyLine = "7E8 02 43 00 AA BB CC DD EE";
const storedOneLine = "7E8 04 43 01 C1 23 AA BB CC";
const storedEmpty = storedResult(`${storedEmptyLine}\r>`);
check(storedEmpty.observation === "source_positive_empty_observed" && storedEmpty.positiveEmptySourceIds.join(",") === "7E8"
  && storedEmpty.positiveNonemptySourceIds.length === 0 && storedEmpty.evidenceComplete === false,
  "Exact Mode 03 count-zero payload did not produce source-local empty evidence");
const storedOne = storedResult(`${storedOneLine}\r>`);
check(storedOne.observation === "source_positive_nonempty_observed" && storedOne.positiveNonemptySourceIds.join(",") === "7E8"
  && storedOne.positiveEmptySourceIds.length === 0, "Mode 03 count byte was treated as a DTC byte");
const storedMixed = storedResult(`${storedEmptyLine}\r${storedOneLine.replace("7E8", "7E9")}\r>`);
check(storedMixed.observation === "source_positive_nonempty_observed" && storedMixed.positiveEmptySourceIds.join(",") === "7E8"
  && storedMixed.positiveNonemptySourceIds.join(",") === "7E9", "Independent ECU counts were merged");
const storedDuplicate = storedResult(`${storedEmptyLine}\r${storedEmptyLine}\r>`);
check(storedDuplicate.observation === "source_positive_empty_observed" && storedDuplicate.positiveEmptySourceIds.length === 1,
  "Identical source payloads were not deduplicated");
for (const transcript of [
  `${storedEmptyLine}\r${storedOneLine}\r>`,
  "7E8 04 43 01 00 00 AA BB CC\r>",
  "7E8 06 43 02 C1 23 C1 23 AA\r>",
  "7E8 06 43 01 C1 23 01 33 AA\r>",
  `${storedEmptyLine}\r7E9 04 43 02 C1 23 AA BB CC\r>`
]) {
  const result = storedResult(transcript);
  check(result.observation === "indeterminate" && result.positiveEmptySourceIds.length === 0
    && result.positiveNonemptySourceIds.length === 0 && result.blockerIds.includes("dtc_payload_conflict"),
    "Conflicting counts, zero-code slots, or duplicate codes became empty/nonempty evidence");
}
for (const [transcript, completion] of [
  [`${storedEmptyLine}\r>`, "timeout"],
  [`${storedEmptyLine}\r>`, "disconnected"],
  [`${storedEmptyLine}\r>`, "error"],
  [`${storedEmptyLine}\r`, "complete"],
  [`${storedEmptyLine}\rNO DATA\r>`, "complete"],
  [`${storedEmptyLine}\r7E9 03 7F 03 78 00 00 00 00\r>`, "complete"],
  [`${storedEmptyLine}\r7E9 02 47 00 00 00 00 00 00\r>`, "complete"],
  [`${storedEmptyLine}\r7E9 10 08 43 03 01 33 02 10\r>`, "complete"]
]) {
  const result = storedResult(transcript, completion);
  check(result.observation === "indeterminate" && result.positiveEmptySourceIds.length === 0
    && result.positiveNonemptySourceIds.length === 0, "Incomplete or mixed-error receipt retained positive count evidence");
}
const storedNoData = storedResult("NO DATA\r>");
check(storedNoData.observation === "missing_or_unproven" && storedNoData.positiveEmptySourceIds.length === 0,
  "Mode 03 NO DATA was promoted to empty");

// Generate CAN transport fixtures for count/ISO-TP boundaries, including sequence wrap.
function canTranscript(payload) {
  const hex = (byte) => byte.toString(16).toUpperCase().padStart(2, "0");
  const line = (bytes) => `7E8 ${[...bytes, ...Array(8 - bytes.length).fill(0xAA)].map(hex).join(" ")}`;
  if (payload.length <= 7) return `${line([payload.length, ...payload])}\r>`;
  const lines = [line([0x10 | (payload.length >> 8), payload.length & 0xFF, ...payload.slice(0, 6)])];
  for (let offset = 6, sequence = 1; offset < payload.length; offset += 7, sequence = (sequence + 1) & 15) {
    lines.push(line([0x20 | sequence, ...payload.slice(offset, offset + 7)]));
  }
  return `${lines.join("\r")}\r>`;
}
for (const count of [2, 3, 127, 255]) {
  const payload = [0x43, count, ...Array.from({ length: count }, (_, index) => [0x01, index]).flat()];
  const result = storedResult(canTranscript(payload));
  check(result.observation === "source_positive_nonempty_observed" && result.positiveNonemptySourceIds.join(",") === "7E8",
    `Exact ${count}-DTC CAN payload failed`);
  const truncated = storedResult(canTranscript(payload.slice(0, -1)));
  check(truncated.observation === "indeterminate" && truncated.positiveNonemptySourceIds.length === 0,
    `Truncated ${count}-DTC application payload passed`);
}

// Run the same count-bearing acceptance and failure matrix for pending/permanent receipts.
for (const [receiptIndex, service] of [[1, 0x47], [2, 0x4A]]) {
  const command = intents[receiptIndex][1];
  const resultFor = (transcript, completion = "complete") => {
    const fixture = createInput();
    Object.assign(fixture.postReadout.receipts[receiptIndex], { transcript, completion });
    const result = evaluate(fixture);
    check(result.state === "indeterminate" && result.provenance.status === "simulated_only"
      && result.readoutCoverageComplete === false && result.comparisonAvailable === false
      && result.clearSucceededInferred === false && result.operationOutcomeInferred === false
      && result.executionEnabled === false && result.vehicleCommandEnabled === false
      && result.wouldTransmit === false && result.canExecute === false, `${command}: safety boundary changed`);
    return result.readouts[receiptIndex];
  };
  const empty = canTranscript([service, 0]);
  const one = canTranscript([service, 1, 0xC1, 0x23]);
  const join = (...parts) => `${parts.map((part) => part.replace(/>$/, "")).join("")}>`;
  for (const count of [0, 1, 2, 3, 127, 255]) {
    const payload = [service, count, ...Array.from({ length: count }, (_, index) => [1, index]).flat()];
    const result = resultFor(canTranscript(payload));
    check(result.observation === (count === 0 ? "source_positive_empty_observed" : "source_positive_nonempty_observed")
      && result[count === 0 ? "positiveEmptySourceIds" : "positiveNonemptySourceIds"].join(",") === "7E8"
      && result.evidenceComplete === false, `${command}: exact count ${count} failed`);
    const truncated = resultFor(canTranscript(payload.slice(0, -1)));
    check(truncated.observation === "indeterminate" && truncated.positiveEmptySourceIds.length === 0
      && truncated.positiveNonemptySourceIds.length === 0, `${command}: truncated count ${count} passed`);
  }
  const mixed = resultFor(join(empty, one.replaceAll("7E8", "7E9")));
  check(mixed.positiveEmptySourceIds.join(",") === "7E8" && mixed.positiveNonemptySourceIds.join(",") === "7E9",
    `${command}: ECU counts merged`);
  const duplicate = resultFor(join(empty, empty));
  check(duplicate.observation === "source_positive_empty_observed" && duplicate.positiveEmptySourceIds.length === 1,
    `${command}: identical duplicate failed`);
  for (const transcript of [
    join(empty, one), canTranscript([service, 0, 0]), canTranscript([service, 1, 0, 0]),
    canTranscript([service, 2, 0xC1, 0x23, 0xC1, 0x23]), canTranscript([service, 1, 1, 0, 1, 1]),
    join(empty, canTranscript([service, 2, 1, 0]).replaceAll("7E8", "7E9"))
  ]) {
    const result = resultFor(transcript);
    check(result.observation === "indeterminate" && result.positiveEmptySourceIds.length === 0
      && result.positiveNonemptySourceIds.length === 0 && result.blockerIds.includes("dtc_payload_conflict"),
      `${command}: conflicting payload retained evidence`);
  }
  for (const [transcript, completion] of [
    [empty, "timeout"], [empty, "disconnected"], [empty, "error"], [empty.replace(">", ""), "complete"],
    [join(empty, "NO DATA\r>"), "complete"],
    [join(empty, canTranscript([0x7F, parseInt(command, 16), 0x78]).replaceAll("7E8", "7E9")), "complete"],
    [join(empty, canTranscript([0x43, 0]).replaceAll("7E8", "7E9")), "complete"],
    [join(empty, `7E9 10 08 ${service.toString(16).toUpperCase()} 03 01 33 02 10\r>`), "complete"]
  ]) {
    const result = resultFor(transcript, completion);
    check(result.observation === "indeterminate" && result.positiveEmptySourceIds.length === 0
      && result.positiveNonemptySourceIds.length === 0, `${command}: incomplete receipt retained evidence`);
  }
  const missing = resultFor("NO DATA\r>");
  check(missing.observation === "missing_or_unproven" && missing.positiveEmptySourceIds.length === 0,
    `${command}: NO DATA became zero DTCs`);
}

const noDataInput = createInput();
noDataInput.postReadout.receipts[1].transcript = "NO DATA\r>";
const noData = evaluate(noDataInput);
check(noData.readouts[1].observation === "missing_or_unproven" && noData.readouts[1].observedSourceIds.length === 0
  && noData.readouts[1].blockerIds.includes("source_positive_response_unobserved"), "NO DATA became an ECU-positive empty result");

const multiReadinessInput = createInput();
multiReadinessInput.postReadout.receipts[3].transcript = "7E8 06 41 01 80 07 E1 00 00\r7E9 06 41 01 00 07 E1 00 00\r>";
const multiReadiness = evaluate(multiReadinessInput);
check(multiReadiness.readouts[3].observation === "source_positive_reported"
  && multiReadiness.readouts[3].observedSourceIds.join(",") === "7E8,7E9"
  && multiReadiness.readoutCoverageComplete === false, "Readiness sources were collapsed or promoted to coverage complete");

const duplicateReadinessInput = createInput();
duplicateReadinessInput.postReadout.receipts[3].transcript = "7E8 06 41 01 80 07 E1 00 00\r7E8 06 41 01 80 07 E1 00 00\r>";
const duplicateReadiness = evaluate(duplicateReadinessInput).readouts[3];
check(duplicateReadiness.observation === "source_positive_reported" && duplicateReadiness.observedSourceIds.join(",") === "7E8",
  "Identical readiness duplicates were not deduplicated");

const differingReadinessInput = createInput();
differingReadinessInput.postReadout.receipts[3].transcript = "7E8 06 41 01 80 07 E1 00 00\r7E8 06 41 01 00 07 E1 00 00\r7E9 06 41 01 00 07 E1 00 00\r>";
const differingReadiness = evaluate(differingReadinessInput).readouts[3];
check(differingReadiness.observation === "indeterminate" && differingReadiness.observedSourceIds.join(",") === "7E9"
  && differingReadiness.blockerIds.includes("readiness_payload_conflict"), "Differing readiness duplicates became positive evidence");

for (const transcript of [
  "7E8 02 41 01 00 00 00 00 00\r7E9 06 41 01 00 07 E1 00 00\r>",
  "7E8 07 41 01 80 07 E1 00 AA\r7E9 06 41 01 00 07 E1 00 00\r>"
]) {
  const malformedReadinessInput = createInput();
  malformedReadinessInput.postReadout.receipts[3].transcript = transcript;
  const malformedReadiness = evaluate(malformedReadinessInput).readouts[3];
  check(malformedReadiness.observation === "indeterminate" && malformedReadiness.observedSourceIds.join(",") === "7E9"
    && malformedReadiness.blockerIds.includes("readiness_payload_conflict"), "Malformed readiness payload became positive evidence");
}

const differentSourcesInput = createInput();
differentSourcesInput.postReadout.receipts[1].transcript = "7E9 03 47 00 00 00 00 00 00\r>";
const differentSources = evaluate(differentSourcesInput);
check(differentSources.readouts[1].observedSourceIds.join(",") === "7E9"
  && !JSON.stringify(differentSources).includes("unexpectedSourceIds")
  && !JSON.stringify(differentSources).includes("missingSourceIds"), "Observed sources were treated as expected/missing/unexpected scope evidence");

const negativeInput = createInput();
negativeInput.postReadout.receipts[1].transcript = "7E8 03 7F 07 11 00 00 00 00\r>";
check(evaluate(negativeInput).readouts[1].observation === "indeterminate", "Negative response became empty or missing evidence");
const wrongServiceInput = createInput();
wrongServiceInput.postReadout.receipts[1].transcript = "7E8 03 43 00 00 00 00 00 00\r>";
const wrongService = evaluate(wrongServiceInput);
check(wrongService.readouts[1].observation === "indeterminate" && wrongService.receiptStructureComplete === false,
  "Wrong-service response became pending-DTC evidence");
const timeoutInput = createInput();
timeoutInput.postReadout.receipts[2].completion = "timeout";
check(evaluate(timeoutInput).readouts[2].observation === "indeterminate", "Timeout became positive evidence");
const badFrameInput = createInput();
badFrameInput.postReadout.receipts[0].transcript = "7E8 03 43 00\r>";
const badFrame = evaluate(badFrameInput);
check(badFrame.readouts[0].observation === "indeterminate" && badFrame.receiptStructureComplete === false, "Malformed frame was accepted");
const incompleteIsoTpInput = createInput();
incompleteIsoTpInput.postReadout.receipts[0].transcript = "7E8 10 09 43 00 00 00 00 00\r>";
check(evaluate(incompleteIsoTpInput).readouts[0].observation === "indeterminate", "Incomplete ISO-TP became positive evidence");

const invalidOrderInput = createInput();
invalidOrderInput.postReadout.receipts[1].startedAt = "2026-09-06T00:00:01.000Z";
const invalidOrder = evaluate(invalidOrderInput);
check(invalidOrder.state === "rejected" && invalidOrder.ordering.status === "invalid" && invalidOrder.comparisonAvailable === false, "Out-of-order receipts were accepted");
const sameAttemptInput = createInput({ postReadout: { attemptToken: clearWindowSnapshot.attemptToken } });
check(evaluate(sameAttemptInput).state === "rejected", "Reused clear attempt token was accepted");
const collectingConnection = {};
const collecting = api.createGenericObdDtcClearReceiveWindow({ expectedSourceIds: ["7E8"], connectionToken: collectingConnection }).getSnapshot();
const collectingResult = evaluate(createInput({ clearWindowSnapshot: collecting }));
check(collectingResult.state === "indeterminate" && collectingResult.provenance.blockerIds.includes("clear_window_not_terminal"), "Collecting clear window was treated as terminal");
const incompleteConnection = {};
const incompleteWindow = api.createGenericObdDtcClearReceiveWindow({ expectedSourceIds: ["7E8"], connectionToken: incompleteConnection });
const incompleteClear = incompleteWindow.finish(incompleteWindow.attemptToken, incompleteConnection, "timeout").snapshot;
const incompleteClearResult = evaluate(createInput({ clearWindowSnapshot: incompleteClear }));
check(incompleteClearResult.state === "indeterminate" && incompleteClearResult.provenance.blockerIds.includes("clear_evaluation_incomplete")
  && incompleteClearResult.comparisonAvailable === false, "Incomplete terminal clear evaluation was not blocked");
const completionMismatchSnapshot = { ...clearWindowSnapshot, completion: "timeout", evaluation: { ...clearWindowSnapshot.evaluation } };
const completionMismatch = evaluate(createInput({ clearWindowSnapshot: completionMismatchSnapshot }));
check(completionMismatch.provenance.blockerIds.includes("clear_snapshot_evaluation_mismatch")
  && completionMismatch.provenance.blockerIds.includes("clear_evaluation_incomplete"), "Contradictory clear completion was not blocked");
const nonCompleteClearSnapshot = { ...clearWindowSnapshot, completion: "timeout", evaluation: { ...clearWindowSnapshot.evaluation, completion: "timeout" } };
const nonCompleteClear = evaluate(createInput({ clearWindowSnapshot: nonCompleteClearSnapshot }));
check(nonCompleteClear.provenance.blockerIds.includes("clear_evaluation_incomplete")
  && !nonCompleteClear.provenance.blockerIds.includes("clear_snapshot_evaluation_mismatch"), "Matching non-complete clear receipts were treated as complete");

typeError(() => evaluate(), "Missing evaluator input was accepted");
typeError(() => evaluate({ ...createInput(), extra: true }), "Extra evaluator input field was accepted");
typeError(() => evaluate(createInput({ postReadout: { provenance: "vehicle" } })), "Non-simulated provenance was accepted");
typeError(() => evaluate(createInput({ postReadout: { receipts: createInput().postReadout.receipts.slice(0, 3) } })), "Missing receipt was accepted");
const sparseReceipts = createInput().postReadout.receipts;
delete sparseReceipts[2];
typeError(() => evaluate(createInput({ postReadout: { receipts: sparseReceipts } })), "Sparse receipts were accepted");
const extraReceiptInput = createInput();
extraReceiptInput.postReadout.receipts[0].extra = true;
typeError(() => evaluate(extraReceiptInput), "Extra receipt field was accepted");
typeError(() => evaluate(createInput({ postReadout: { receipts: createInput().postReadout.receipts.map((item, index) => index === 0 ? { ...item, profile: "inferred" } : item) } })), "Unsupported profile was accepted");
typeError(() => evaluate(createInput({ postReadout: { receipts: createInput().postReadout.receipts.map((item, index) => index === 0 ? { ...item, transcript: new String(item.transcript) } : item) } })), "Boxed transcript was accepted");
rangeError(() => evaluate(createInput({ postReadout: { receipts: createInput().postReadout.receipts.map((item, index) => index === 0 ? { ...item, transcript: "x".repeat(32769) } : item) } })), "Transcript limit was not enforced");
let accessorRead = false;
const accessorInput = createInput();
Object.defineProperty(accessorInput.postReadout.receipts[0], "transcript", { enumerable: true, get() { accessorRead = true; return transcripts.read_stored_dtc; } });
typeError(() => evaluate(accessorInput), "Receipt accessor was accepted");
check(accessorRead === false, "Receipt accessor was invoked");

check(!source.match(/function evaluateGenericObdDtcClearPostReadoutReceipts[\s\S]*?\n  }/)?.[0].includes("navigator."), "Pure evaluator references Web Serial");
console.log(`DTC clear post-readout receipt checks: ${checks} / Errors: 0`);
