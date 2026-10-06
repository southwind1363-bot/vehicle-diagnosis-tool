// Synthetic byte source only. Exercise production receive functions without a port or writes.
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { createReadOnlyReceiptCapture } from "./fixtures/readonly-receipt-capture.js";

const source = fs.readFileSync(new URL("../script.js", import.meta.url), "utf8");
const runtime = vm.createContext({ window: {}, navigator: {} });
vm.runInContext(fs.readFileSync(new URL("../obd-readonly.js", import.meta.url), "utf8"), runtime);
const api = runtime.window.ObdReadOnly;
const profile = "iso15765_11bit_normal_h1_caf1_d0_s1_e0";
const commands = ["03", "07", "0A", "0101"];
const wires = ["7E8 02 43 00 AA AA AA AA AA\r>", "7E8 02 47 00 AA AA AA AA AA\r>",
  "7E8 02 4A 00 AA AA AA AA AA\r>", "7E8 06 41 01 00 07 01 00 AA\r\n>"];
let checks = 0;
const check = (value, message) => { assert.ok(value, message); checks++; };

async function receive(bytes, size, onDecoded) {
  let offset = 0, release, now = 0;
  const lost = [];
  const reader = { read: async () => {
    if (offset < bytes.length) {
      const value = bytes.slice(offset, offset + size); offset += size;
      return { value, done: false };
    }
    return new Promise(resolve => { release = resolve; });
  } };
  const decoder = new TextDecoder();
  const session = { reader, port: {}, readLoopActive: true, textBuffer: "", pendingCommandOperation: {},
    decoder: { decode(value, options) {
      const decoded = decoder.decode(value, options);
      // Test-only observation of the decoder boundary; production has no capture hook.
      if (decoded) onDecoded(decoded);
      return decoded;
    } } };
  const context = vm.createContext({ obdDevSession: session, obdSerialRevision: 1,
    obdSerialReadErrors: new WeakMap(), obdDevStatus: {},
    performance: { now: () => now }, setTimeout: callback => { now += 40; return setTimeout(callback, 0); },
    throwIfObdSerialOperationCancelled: () => {},
    disconnectObdDeveloperVci: async ({ reason }) => { lost.push(reason); session.readLoopActive = false; }
  });
  for (const name of ["isCurrentWebSerialReadLoop", "readElmDeveloperLoop", "hasCompletedElmDeveloperResponse",
    "takeCompletedElmDeveloperResponse", "readElmDeveloperResponse"]) {
    const match = source.match(new RegExp(`(?:async )?function ${name}\\([^\\n]*\\) \\{[\\s\\S]*?\\r?\\n\\}`));
    assert.ok(match, `Missing receive function ${name}`);
    vm.runInContext(match[0], context);
  }
  const loop = context.readElmDeveloperLoop();
  // Drain the finite synthetic byte queue before asking the real completion checker.
  await new Promise(setImmediate);
  let response = null, error = null;
  try { response = await context.readElmDeveloperResponse(80); }
  catch (failure) { error = failure.message; }
  finally {
    session.readLoopActive = false;
    release?.({ done: true });
    await loop;
  }
  return { raw: session.textBuffer, response, error, lost };
}

for (const size of [1, 7, 32768]) {
  const capture = createReadOnlyReceiptCapture(api), attempt = capture.begin();
  for (let index = 0; index < commands.length; index++) {
    const started = capture.startCommand(attempt, commands[index], profile, index * 2);
    const received = await receive(new TextEncoder().encode(wires[index]), size,
      chunk => check(capture.append(started.ticket, chunk).ok, "decoded chunk refused"));
    check(received.raw === wires[index], "production buffer lost raw separators/prompt");
    check(received.response === wires[index].slice(0, -1).replace(/\r\n?/g, "\n").trim(), "legacy display result changed");
    check(!received.error && received.lost.length === 0, "synthetic normal input disconnected");
    check(capture.endCommand(started.ticket, index * 2 + 1, "complete").ok, "command end failed");
  }
  check(capture.finish(attempt, "complete").summary.rawTranscriptValidation.status === "parsed", "raw handoff rejected");
  capture.invalidate();
  check(capture.inspect(attempt).summary === null, "finished raw handoff survived invalidation");
}

// A display result with a reattached prompt cannot restore the original CR grammar.
const normalized = await receive(new TextEncoder().encode(wires[0]), 1, () => {});
check(api.parseElmReadOnlyRawTranscript({ command: "03", profile, completion: "complete",
  transcript: normalized.response + ">" }).errors.length > 0, "normalized display text became raw evidence");
for (const wire of [wires[0].replaceAll(" ", ""), wires[0].replace("\r", "\n")]) {
  const received = await receive(new TextEncoder().encode(wire), 1, () => {});
  check(!!received.response, "legacy completion should remain separate from raw validation");
  check(api.parseElmReadOnlyRawTranscript({ command: "03", profile, completion: "complete",
    transcript: received.raw }).errors.length > 0, "S0 or bare LF accepted under fixed S1/CR profile");
}
for (const wire of [wires[0].replace(">", ""), "\r>" , "x".repeat(12001)]) {
  const capture = createReadOnlyReceiptCapture(api), attempt = capture.begin();
  const command = capture.startCommand(attempt, "03", profile, 0).ticket;
  const received = await receive(new TextEncoder().encode(wire), 7, chunk => capture.append(command, chunk));
  check(!received.response, "incomplete/empty/oversized response became successful");
  capture.invalidate();
  check(!capture.append(command, ">").ok && capture.inspect(attempt).summary === null, "failed reception retained usable receipt");
  if (wire.length > 12000) check(received.lost[0] === "serial_response_too_large" && received.raw === "", "transport limit did not erase buffer");
}
const unsupported = createReadOnlyReceiptCapture(api), attempt = unsupported.begin();
check(unsupported.startCommand(attempt, "03", "iso15765_11bit_normal_h1_caf1_d0_s0_e0", 0).reason === "profile_unavailable",
  "current space-off setting silently promoted to the fixed space-on profile");
console.log(`Serial/raw receipt handoff: ${checks} checks passed (synthetic bytes; production capture hook not installed)`);
