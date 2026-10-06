import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { createReadOnlyReceiptCapture } from "./fixtures/readonly-receipt-capture.js";

const runtime = vm.createContext({ window: {}, navigator: {} });
vm.runInContext(fs.readFileSync(new URL("../obd-readonly.js", import.meta.url), "utf8"), runtime);
const api = runtime.window.ObdReadOnly, profile = "iso15765_11bit_normal_h1_caf1_d0_s1_e0";
const commands = ["03", "07", "0A", "0101"];
const transcripts = commands.map((_, i) => i === 3 ? "7E8 06 41 01 00 07 01 00 AA\r\n>"
  : `7E8 02 ${["43", "47", "4A"][i]} 00 AA AA AA AA AA\r>`);
let checks = 0;
const check = (value, message) => { assert.ok(value, message); checks++; };
const seen = [];
const capture = createReadOnlyReceiptCapture({
  parseElmReadOnlyRawTranscript(input) { seen.push(input.transcript); return api.parseElmReadOnlyRawTranscript(input); },
  evaluateSingleReadoutRawReceipts: api.evaluateSingleReadoutRawReceipts
});
let baseline;
// Every split point, including CR/LF and prompt, plus one character per chunk.
for (let split = 0; split <= Math.max(...transcripts.map(text => text.length)) + 1; split++) {
  seen.length = 0;
  const attempt = capture.begin(); let previous;
  transcripts.forEach((text, i) => {
    const started = capture.startCommand(attempt, commands[i], profile, i * 2);
    check(started.ok, "start");
    check(!capture.startCommand(attempt, commands[i], profile, i * 2).ok, "busy start");
    if (previous) check(!capture.append(previous, "private stale chunk").ok, "old command data rejected");
    const chunks = split > text.length ? [...text] : [text.slice(0, split), text.slice(split)];
    for (const chunk of chunks.filter(Boolean)) check(capture.append(started.ticket, chunk).ok, "chunk accepted");
    check(capture.endCommand(started.ticket, i * 2 + 1, "complete").ok, "end");
    check(!capture.endCommand(started.ticket, i * 2 + 1, "complete").ok, "duplicate end");
    previous = started.ticket;
  });
  const completed = capture.finish(attempt, "complete");
  check(completed.ok && completed.summary.rawTranscriptValidation.status === "parsed", "finished parsed");
  assert.deepEqual(seen, transcripts); checks++;
  const serialized = JSON.stringify(completed.summary);
  if (baseline) { assert.equal(serialized, baseline); checks++; } else baseline = serialized;
  check(!serialized.includes("7E8") && completed.summary.canExecute === false, "no raw or authority");
  check(!capture.finish(attempt, "complete").ok, "double finish");
}
const old = capture.begin(), oldCommand = capture.startCommand(old, "03", profile, 0).ticket;
capture.append(oldCommand, "private partial");
const fresh = capture.begin(), active = capture.startCommand(fresh, "03", profile, 0).ticket;
for (const token of [oldCommand, { ...active }, JSON.parse(JSON.stringify(active)), createReadOnlyReceiptCapture(api).begin(), null]) {
  check(!capture.append(token, "bad").ok && !capture.endCommand(token, 1, "complete").ok, "foreign command");
}
check(!capture.finish(old, "complete").ok && capture.inspect(fresh).summary.receiptCount === 0, "foreign attempt leaves current untouched");
capture.invalidate(); capture.invalidate();
check(!capture.append(active, ">").ok && !capture.inspect(fresh).ok, "disconnect invalidation");

for (const chunk of ["", 1, new String("x"), "x".repeat(32769)]) {
  const attempt = capture.begin(), cmd = capture.startCommand(attempt, "03", profile, 0).ticket;
  check(!capture.append(cmd, chunk).ok, "invalid chunk/limit");
  check(!capture.inspect(attempt).ok && !capture.append(cmd, "x").ok, "terminal rejection");
}
const bounded = capture.begin(), boundedCommand = capture.startCommand(bounded, "03", profile, 0).ticket;
check(capture.append(boundedCommand, "x".repeat(32767)).ok && capture.append(boundedCommand, "x").ok, "inclusive bound");
check(capture.append(boundedCommand, "x").reason === "transcript_limit" && !capture.finish(bounded, "complete").ok, "aggregate limit without truncation");
for (const completion of ["timeout", "disconnected", "error"]) {
  const attempt = capture.begin(), cmd = capture.startCommand(attempt, "03", profile, 0).ticket;
  capture.append(cmd, transcripts[0]);
  check(!capture.endCommand(cmd, 1, completion).ok && !capture.finish(attempt, "complete").ok, "incomplete cannot become complete");
}
const pending = capture.begin(); capture.startCommand(pending, "03", profile, 0);
check(capture.finish(pending, "complete").reason === "command_unfinished", "unfinished command");
const missing = capture.begin(); check(!capture.finish(missing, "complete").ok, "missing commands");
for (const [command, declaredProfile, time] of [["04", profile, 0], ["07", profile, 0], ["03", null, 0], ["03", profile, -1]]) {
  const attempt = capture.begin();
  check(!capture.startCommand(attempt, command, declaredProfile, time).ok && !capture.inspect(attempt).ok, "invalid command metadata");
}
// No normalization of bare LF or insertion of missing prompt at command end.
for (const malformed of [transcripts[0].replace(/\r/g, "\n"), transcripts[0].replace(">", "")]) {
  const attempt = capture.begin();
  transcripts.forEach((text, i) => {
    const cmd = capture.startCommand(attempt, commands[i], profile, i * 2).ticket;
    capture.append(cmd, i ? text : malformed); capture.endCommand(cmd, i * 2 + 1, "complete");
  });
  check(capture.finish(attempt, "complete").summary.rawTranscriptValidation.status === "rejected", "malformed input not repaired");
}
capture.invalidate();
let reentrant, replacement;
reentrant = createReadOnlyReceiptCapture({ parseElmReadOnlyRawTranscript(input) {
  replacement ||= reentrant.begin();
  return api.parseElmReadOnlyRawTranscript(input);
}, evaluateSingleReadoutRawReceipts: api.evaluateSingleReadoutRawReceipts });
const expiring = reentrant.begin();
transcripts.forEach((text, i) => {
  const cmd = reentrant.startCommand(expiring, commands[i], profile, i * 2).ticket;
  reentrant.append(cmd, text); reentrant.endCommand(cmd, i * 2 + 1, "complete");
});
check(reentrant.finish(expiring, "complete").reason === "unknown_or_expired_attempt", "validation cannot revive replaced attempt");
check(reentrant.inspect(replacement).summary.receiptCount === 0, "replacement unaffected by validation");
reentrant.invalidate();
console.log(`Read-only receipt chunk capture: ${checks} checks passed (decoded text only, no I/O)`);
