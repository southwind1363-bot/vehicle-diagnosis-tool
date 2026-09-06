import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync(new URL("../obd-readonly.js", import.meta.url), "utf8");
const context = vm.createContext({ window: {}, navigator: {} });
vm.runInContext(source, context);
const api = context.window.ObdReadOnly;
let checks = 0;
const check = (value, message) => { assert.ok(value, message); checks += 1; };
const typeError = (fn, message) => { assert.throws(fn, (error) => error?.name === "TypeError", message); checks += 1; };
const rangeError = (fn, message) => { assert.throws(fn, (error) => error?.name === "RangeError", message); checks += 1; };
const profile = "iso15765_11bit_normal_h1_caf1_d0_s1_e0";
const parse = (transcript, completion = "complete") => api.parseElmMode04RawTranscript({ profile, transcript, completion });

const valid = parse("7E8 01 44 AA BB CC DD EE FF\r7E9 01 44 AA BB CC DD EE FF\r>");
check(valid.schemaVersion === 1 && valid.profile === profile && valid.callerCompletion === "complete" && valid.completion === "complete" && valid.promptObserved === true
  && valid.frames.length === 2 && valid.frames[0].sourceId === "7E8" && valid.frames[0].payload.join(",") === "68" && valid.frames[1].payload.join(",") === "68"
  && valid.errors.length === 0 && valid.execution.wouldTransmit === false && valid.execution.canExecute === false && valid.execution.retryAllowed === false, "Strict normal-addressing single frames were not parsed");
check(Object.isFrozen(valid) && Object.isFrozen(valid.frames) && Object.isFrozen(valid.frames[0]) && Object.isFrozen(valid.frames[0].payload) && Object.isFrozen(valid.errors) && Object.isFrozen(valid.execution), "Parser result is not deeply frozen");
check(JSON.stringify(parse("7E8 01 44 AA BB CC DD EE FF\r7E9 01 44 AA BB CC DD EE FF\r>")) === JSON.stringify(valid), "Parser is not deterministic");
check(!Object.hasOwn(valid, "transcript"), "Parser retained raw text");

const callerInput = { profile, transcript: "7E8 01 44 44 AA BB CC DD EE\r>", completion: "complete" };
const callerInputBefore = JSON.stringify(callerInput);
const padding = api.parseElmMode04RawTranscript(callerInput);
const laterPayloadByte = parse("7E8 03 62 00 44 AA BB CC DD\r>");
check(JSON.stringify(callerInput) === callerInputBefore && padding.frames[0].payload.join(",") === "68" && laterPayloadByte.frames[0].payload.join(",") === "98,0,68", "PCI payload slicing searched padding or mutated caller input");

const blankLines = parse("\r\r7E8 01 44 00 00 00 00 00 00\r\r>");
check(blankLines.completion === "complete" && blankLines.frames.length === 1, "Blank CR-delimited ELM formatting was rejected");
check(parse("7E8 01 44 00 00 00 00 00 00\r\n>").completion === "complete", "CRLF formatting was rejected");
for (const completion of ["timeout", "disconnected", "error"]) {
  const result = parse("7E8 01 44 00 00 00 00 00 00\r>", completion);
  check(result.completion === completion && result.callerCompletion === completion && result.promptObserved === true, `${completion} was promoted to complete`);
}
for (const transcript of ["7E8 01 44 00 00 00 00 00 00\n>", "7E8 01 44 00 00 00 00 00 00\r\t>", "7E8 01 44 00 00 00 00 00 00\r\u0080>"]) {
  const result = parse(transcript);
  check(result.completion === "error" && result.errors.length > 0, "Fatal transcript content was accepted");
}
const malformedBetween = parse("7E8 01 44 00 00 00 00 00 00\r04\r7E9 01 44 00 00 00 00 00 00\r>");
check(malformedBetween.completion === "error" && malformedBetween.errors.some((item) => item.code === "unexpected_command_echo" && item.lineNumber === 2)
  && malformedBetween.frames.map((item) => item.sourceId).join(",") === "7E8,7E9", "Malformed lines did not preserve unambiguous frames");
const malformedPrompt = parse("7E8 01 44 00 00 00 00 00 00\r>bad\r7E9 01 44 00 00 00 00 00 00\r>");
check(malformedPrompt.completion === "error" && malformedPrompt.errors.some((item) => item.code === "prompt_not_terminal")
  && malformedPrompt.frames.map((item) => item.sourceId).join(",") === "7E8", "Frames after the first prompt marker were parsed");
const fatalAfterFrame = parse("7E8 01 44 00 00 00 00 00 00\r\u00017E9 01 44 00 00 00 00 00 00\r>");
check(fatalAfterFrame.completion === "error" && fatalAfterFrame.frames.map((item) => item.sourceId).join(",") === "7E8", "Fatal content discarded prior valid frames");
for (const transcript of ["7E8 01 44 00 00 00 00 00 00", "7E8 01 44 00 00 00 00 00 00\r>\r7E9 01 44 00 00 00 00 00 00", "7E8 01 44 00 00 00 00 00 00\r>tail", "7E8 01 44 00 00 00 00 00 00\r4>"]) {
  const result = parse(transcript);
  check(result.completion === "error", "Incomplete, embedded, or trailing prompt data was accepted");
}
for (const transcript of ["7E8 08 44 00 00 00 00 00 00\r>", "7E8 10 44 00 00 00 00 00 00\r>", "7E8 01 44 00 00 00 00 00\r>", "800 01 44 00 00 00 00 00 00\r>", "18DAF110 01 44 00 00 00 00 00 00\r>", "7E801440000000000\r>", "NO DATA\r>", "STOPPED\r>"]) {
  check(parse(transcript).completion === "error", "Unsupported transcript form was accepted");
}
for (const transcript of ["7e8 01 44 00 00 00 00 00 00\r>", "7E8 01 44  00 00 00 00 00 00\r>", "7E8 8 01 44 00 00 00 00 00 00\r>", "7E8 01 4G 00 00 00 00 00 00\r>", "7E8 00 44 00 00 00 00 00 00\r>", "7E8 21 44 00 00 00 00 00 00\r>", ">\r>"]) {
  check(parse(transcript).completion === "error", "Invalid exact-frame or duplicate-prompt syntax was accepted");
}
const overflowLines = parse(`${"\r".repeat(256)}>`);
const overflowFrames = parse(`${Array.from({ length: 129 }, () => "7E8 01 44 00 00 00 00 00 00").join("\r")}\r>`);
const maximumLines = parse(`${"\r".repeat(255)}>`);
const maximumFrames = parse(`${Array.from({ length: 128 }, () => "7E8 01 44 00 00 00 00 00 00").join("\r")}\r>`);
check(overflowLines.completion === "error" && overflowLines.errors.some((item) => item.code === "physical_line_overflow"), "Physical-line limit was not enforced");
check(overflowFrames.completion === "error" && overflowFrames.frames.length === 128 && overflowFrames.errors.some((item) => item.code === "frame_overflow"), "Frame limit did not preserve its valid prefix");
check(maximumLines.completion === "complete" && maximumLines.errors.length === 0 && maximumFrames.completion === "complete" && maximumFrames.frames.length === 128, "Exact line or frame capacity was rejected");
typeError(() => api.parseElmMode04RawTranscript({ profile: "inferred", transcript: "", completion: "complete" }), "Unexpected profile was accepted");
typeError(() => api.parseElmMode04RawTranscript({ profile, transcript: new String(""), completion: "complete" }), "Boxed transcript was accepted");
typeError(() => api.parseElmMode04RawTranscript({ profile, transcript: "", completion: "complete", extra: true }), "Extra parser input key was accepted");
typeError(() => api.parseElmMode04RawTranscript({ profile, transcript: "" }), "Missing parser input key was accepted");
typeError(() => api.parseElmMode04RawTranscript({ profile, transcript: "", completion: "pending" }), "Invalid parser completion was accepted");
rangeError(() => parse("x".repeat(32769)), "Transcript size limit was not enforced");
let accessorRead = false;
const accessorInput = { profile, transcript: "" };
Object.defineProperty(accessorInput, "completion", { enumerable: true, get() { accessorRead = true; return "complete"; } });
typeError(() => api.parseElmMode04RawTranscript(accessorInput), "Accessor input was accepted");
check(accessorRead === false, "Accessor input was read");

const evaluation = api.evaluateGenericObdDtcClearResponses({ expectedSourceIds: ["7E8", "7E9"], frames: valid.frames, completion: valid.completion });
check(evaluation.responseEvaluationComplete === true && evaluation.allExpectedSourcesAffirmativeObserved === true, "Parser output did not integrate with response evaluation");
const connection = {};
const receiveWindow = api.createGenericObdDtcClearReceiveWindow({ expectedSourceIds: ["7E8", "7E9"], connectionToken: connection });
for (const frame of valid.frames) check(receiveWindow.append(receiveWindow.attemptToken, connection, frame).ok, "Parser frame was rejected by receive window");
check(receiveWindow.finish(receiveWindow.attemptToken, connection, valid.completion).snapshot.evaluation.responseEvaluationComplete === true, "Receive window did not evaluate parser frames");
const mixedService = parse("7E8 01 44 00 00 00 00 00 00\r7E9 03 62 A1 91 AA BB CC DD\r>");
const mixedServiceEvaluation = api.evaluateGenericObdDtcClearResponses({ expectedSourceIds: ["7E8", "7E9"], frames: mixedService.frames, completion: mixedService.completion });
check(mixedServiceEvaluation.responseEvaluationComplete === false && mixedServiceEvaluation.expectedSources[1].observation === "response_uncertain", "Mixed service payload became an affirmative aggregate");
const partialUnexpected = parse("7E8 01 44 00 00 00 00 00 00\r7EA 01 44 00 00 00 00 00 00\r>");
const partialUnexpectedEvaluation = api.evaluateGenericObdDtcClearResponses({ expectedSourceIds: ["7E8", "7E9"], frames: partialUnexpected.frames, completion: partialUnexpected.completion });
check(partialUnexpectedEvaluation.responseEvaluationComplete === false && partialUnexpectedEvaluation.expectedSources[1].observation === "no_response_observed"
  && partialUnexpectedEvaluation.unexpectedSources[0].sourceId === "7EA", "Partial or unexpected parser observations became affirmative");
const mixed = parse("7E8 01 44 00 00 00 00 00 00\r04\r>");
const mixedEvaluation = api.evaluateGenericObdDtcClearResponses({ expectedSourceIds: ["7E8"], frames: mixed.frames, completion: mixed.completion });
check(mixedEvaluation.responseEvaluationComplete === false, "Parse errors became an affirmative aggregate");
for (const completion of ["timeout", "disconnected"]) {
  const incomplete = parse("7E8 01 44 00 00 00 00 00 00\r>", completion);
  const connectionToken = {};
  const scopedWindow = api.createGenericObdDtcClearReceiveWindow({ expectedSourceIds: ["7E8"], connectionToken });
  check(scopedWindow.append(scopedWindow.attemptToken, connectionToken, incomplete.frames[0]).ok
    && scopedWindow.finish(scopedWindow.attemptToken, connectionToken, incomplete.completion).snapshot.evaluation.responseEvaluationComplete === false, `${completion} receive-window completion became affirmative`);
}

console.log(`ELM Mode 04 transcript checks: ${checks} / Errors: 0`);
