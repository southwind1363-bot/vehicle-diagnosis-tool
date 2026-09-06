import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync(new URL("../obd-readonly.js", import.meta.url), "utf8");
const context = vm.createContext({ window: {}, navigator: {} });
vm.runInContext(source, context);
const api = context.window.ObdReadOnly;
const profile = "iso15765_11bit_normal_h1_caf1_d0_s1_e0";
let checks = 0;
const check = (condition, message) => { assert.ok(condition, message); checks += 1; };
const typeError = (fn, message) => { assert.throws(fn, (error) => error?.name === "TypeError", message); checks += 1; };
const rangeError = (fn, message) => { assert.throws(fn, (error) => error?.name === "RangeError", message); checks += 1; };
const parse = (command, transcript, completion = "complete") => api.parseElmReadOnlyRawTranscript({ profile, command, transcript, completion });

for (const [command, line, expected] of [
  ["03", "7E8 01 43 AA BB CC DD EE FF", "43"],
  ["07", "7E8 01 47 AA BB CC DD EE FF", "47"],
  ["0A", "7E8 01 4A AA BB CC DD EE FF", "4A"],
  ["0101", "7E8 02 41 01 AA BB CC DD EE", "41,1"]
]) {
  const result = parse(command, `${line}\r>`);
  check(result.completion === "complete" && result.frames.length === 1 && result.frames[0].responseKind === "matching_positive_service"
    && result.frames[0].payload.map((byte) => byte.toString(16).toUpperCase()).join(",") === expected, `Normal ${command} prefix was not classified`);
}
const padded = parse("03", "7E8 01 43 AA BB CC DD EE FF\r>");
check(padded.frames[0].payload.length === 1 && padded.frames[0].payload[0] === 0x43, "Single-frame padding was retained");
const interleaved = parse("03", "7E8 10 09 43 01 02 03 04 05\r7E9 10 09 43 11 12 13 14 15\r7E8 21 06 07 08 AA BB CC DD\r7E9 21 16 17 18 AA BB CC DD\r>");
check(interleaved.completion === "complete" && interleaved.frames.length === 2 && interleaved.frames.every((frame) => frame.payload.length === 9), "Interleaved ISO-TP chains were not assembled");
const wrapped = ["7E8 10 76 43 00 00 00 00 00"];
for (let index = 1; index <= 16; index += 1) wrapped.push(`7E8 2${(index & 15).toString(16).toUpperCase()} 00 00 00 00 00 00 00`);
check(parse("03", `${wrapped.join("\r")}\r>`).completion === "complete", "Consecutive-frame sequence wrap was rejected");
for (const [transcript, code] of [
  ["7E8 10 09 43 00 00 00 00 00\r>", "incomplete_first_frame"],
  ["7E8 21 43 00 00 00 00 00 00\r>", "orphan_consecutive_frame"],
  ["7E8 10 09 43 00 00 00 00 00\r7E8 10 09 43 00 00 00 00 00\r>", "replaced_first_frame"],
  ["7E8 10 09 43 00 00 00 00 00\r7E8 22 00 00 00 00 00 00 00\r>", "consecutive_frame_sequence_error"],
  ["7E8 10 09 43 00 00 00 00 00\r7E8 01 43 00 00 00 00 00 00\r>", "single_frame_interrupted_first_frame"]
]) check(parse("03", transcript).errors.some((error) => error.code === code), `${code} was not reported`);
const malformed = parse("03", "7e8 01 43 00 00 00 00 00 00\r7E8 01 43 00 00 00 00 00 00\n>");
check(malformed.completion === "error" && malformed.frames.length === 0 && malformed.errors.some((error) => error.code === "bare_lf"), "Malformed transcript grammar was accepted");
for (const sourceId of ["800", "FFF"]) check(parse("03", `${sourceId} 01 43 00 00 00 00 00 00\r>`).errors.some((error) => error.code === "invalid_can_id"), `Out-of-range CAN ID ${sourceId} was accepted`);
check(parse("03", "7FF 01 43 00 00 00 00 00 00\r>").completion === "complete", "Upper 11-bit CAN ID was rejected");
const malformedSingleInterrupt = parse("03", "7E8 10 09 43 00 00 00 00 00\r7E8 00 43 00 00 00 00 00 00\r7E8 21 00 00 00 00 00 00 00\r>");
const malformedFirstInterrupt = parse("03", "7E8 10 09 43 00 00 00 00 00\r7E8 10 00 43 00 00 00 00 00\r7E8 21 00 00 00 00 00 00 00\r>");
check(malformedSingleInterrupt.frames.length === 0 && malformedSingleInterrupt.errors.some((error) => error.code === "malformed_single_frame_interrupted_first_frame"), "Malformed single frame did not discard its pending chain");
check(malformedFirstInterrupt.frames.length === 0 && malformedFirstInterrupt.errors.some((error) => error.code === "malformed_first_frame_interrupted_first_frame"), "Malformed first frame did not discard its pending chain");
const conflict = parse("03", "NO DATA\r7E8 10 09 43 00 00 00 00 00\r>");
check(conflict.errors.some((error) => error.code === "no_data_frame_conflict"), "NO DATA plus partial CAN did not conflict");
check(parse("03", "SEARCHING...\rBUS INIT: OK\rNO DATA\r>").completion === "complete", "Informational statuses were not accepted");
check(parse("03", "SEARCHING\r>").completion === "error", "Undocumented SEARCHING alias was accepted");
check(parse("03", "7E8 01 43 00 00 00 00 00 00\rSEARCHING...\r>").errors.some((error) => error.code === "informational_status_after_can"), "Informational status after CAN was accepted");
const duplicateNoData = parse("03", "NO DATA\rNO DATA\r>");
check(duplicateNoData.statuses.length === 1 && duplicateNoData.errors.some((error) => error.code === "duplicate_no_data"), "Duplicate NO DATA was accepted");
check(parse("03", "NO DATA\rBUS INIT: OK\r>").errors.some((error) => error.code === "informational_status_after_no_data"), "Informational status after NO DATA was accepted");
for (const text of ["STOPPED", "ERROR", "UNABLE TO CONNECT", "CAN ERROR", "BUFFER FULL"]) check(parse("03", `${text}\r>`).completion === "error", `${text} was not terminal`);
check(parse("03", "constructor\r>").statuses.length === 0, "Inherited status key was treated as a terminal status");
const shortReadiness = parse("0101", "7E8 02 41 01 AA BB CC DD EE\r>");
const shortNegative = parse("03", "7E8 02 7F 03 AA BB CC DD EE\r>");
check(shortReadiness.frames[0].responseKind === "matching_positive_service" && shortReadiness.frames[0].payloadSemanticsVerified === false
  && shortNegative.frames[0].responseKind === "matching_negative_service" && shortNegative.frames[0].negativeResponseCode === null, "Prefix-only classification inferred semantics");
const nrc = parse("03", "7E8 03 7F 03 78 00 00 00 00\r>");
check(nrc.frames[0].negativeResponseCode === "78", "Exact three-byte NRC was not retained");
const unexpected = parse("03", "7E8 01 00 00 00 00 00 00 00\r>");
check(unexpected.frames[0].responseKind === "unexpected_response" && unexpected.errors.some((error) => error.code === "unexpected_response_service"), "Unexpected response was discarded or accepted");
check(unexpected.errors.find((error) => error.code === "unexpected_response_service")?.lineNumber === 1, "Unexpected single-frame response lost physical-line provenance");
const unexpectedMulti = parse("03", "7E8 10 09 00 00 00 00 00 00\r7E8 21 00 00 00 00 00 00 00\r>");
check(unexpectedMulti.errors.find((error) => error.code === "unexpected_response_service")?.lineNumber === 1, "Unexpected multi-frame response lost first-frame provenance");
const countBearing = parse("03", "7E8 04 43 02 C1 23 00 00 00\r>");
check(countBearing.frames[0].payload.join(",") === "67,2,193,35", "DTC payload bytes were changed");
const prompt = parse("03", "7E8 01 43 00 00 00 00 00 00\r\n>");
check(prompt.promptObserved && prompt.completion === "complete" && !Object.hasOwn(prompt, "transcript"), "CRLF prompt grammar or raw-text policy failed");
check(parse("03", "7E8 01 43 00 00 00 00 00 00\r>", "timeout").completion === "timeout", "Caller completion was promoted");
for (const command of ["04", "3", "0100", 3, new String("03")]) typeError(() => parse(command, ""), "Invalid command was accepted");
typeError(() => api.parseElmReadOnlyRawTranscript({ profile, command: "03", transcript: "", completion: "complete", extra: true }), "Extra input key was accepted");
rangeError(() => parse("03", "x".repeat(32769)), "Transcript size bound was not enforced");
const overflow = parse("03", `${Array.from({ length: 129 }, () => "7E8 01 43 00 00 00 00 00 00").join("\r")}\r>`);
check(overflow.frames.length === 128 && overflow.errors.some((error) => error.code === "can_line_overflow"), "CAN line bound was not enforced");
const exactCanLimit = parse("03", `${Array.from({ length: 128 }, () => "7E8 01 43 00 00 00 00 00 00").join("\r")}\r>`);
check(exactCanLimit.completion === "complete" && exactCanLimit.frames.length === 128, "Exact CAN line bound was rejected");
const physicalOverflow = parse("03", `${"\r".repeat(256)}>`);
check(physicalOverflow.errors.some((error) => error.code === "physical_line_overflow"), "Physical line bound was not enforced");
const exactPhysicalLimit = parse("03", `${"\r".repeat(255)}>`);
check(exactPhysicalLimit.completion === "complete", "Exact physical line bound was rejected");
let getterRead = false;
const getterInput = { profile, command: "03", transcript: "" };
Object.defineProperty(getterInput, "completion", { enumerable: true, get() { getterRead = true; return "complete"; } });
typeError(() => api.parseElmReadOnlyRawTranscript(getterInput), "Getter input was accepted");
check(!getterRead, "Getter input was read");
const stableInput = { profile, command: "03", transcript: "7E8 01 43 00 00 00 00 00 00\r>", completion: "complete" };
const stableInputBefore = JSON.stringify(stableInput);
const stableFirst = api.parseElmReadOnlyRawTranscript(stableInput);
check(JSON.stringify(stableInput) === stableInputBefore && JSON.stringify(api.parseElmReadOnlyRawTranscript(stableInput)) === JSON.stringify(stableFirst), "Parser mutated input or was non-deterministic");
check(Object.isFrozen(prompt) && Object.isFrozen(prompt.frames) && Object.isFrozen(prompt.frames[0]) && Object.isFrozen(prompt.frames[0].payload)
  && Object.isFrozen(prompt.statuses) && Object.isFrozen(prompt.errors) && Object.isFrozen(prompt.execution), "Output was not deeply frozen");
console.log(`ELM read-only transcript checks: ${checks} / Errors: 0`);
