import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { createReadOnlyReceiptOwner } from "./fixtures/readonly-receipt-owner.js";

const runtime = vm.createContext({ window: {}, navigator: {} });
vm.runInContext(fs.readFileSync(new URL("../obd-readonly.js", import.meta.url), "utf8"), runtime);
const api = runtime.window.ObdReadOnly;
let checks = 0;
const check = (value, message) => { assert.ok(value, message); checks++; };
const fill = (owner, transcript) => {
  const ticket = owner.begin();
  ["03", "07", "0A", "0101"].forEach((command, i) => {
    check(owner.append(ticket, { command, profile: "iso15765_11bit_normal_h1_caf1_d0_s1_e0",
      startedAt: i * 2, completedAt: i * 2 + 1, completion: "complete",
      transcript: transcript(i) }).ok, "append structure");
  });
  return ticket;
};
const normal = i => i === 3 ? "7E8 06 41 01 00 07 01 00 AA\r>" : `7E8 02 ${["43", "47", "4A"][i]} 00 AA AA AA AA AA\r>`;
for (const [transcript, status, noData, frames] of [
  [normal, "parsed", false, 1],
  [() => "NO DATA\r>", "parsed", true, 0],
  [i => normal(i).replace(">", ""), "rejected", false, null],
  [i => normal(i).replace("\r", "\n"), "rejected", false, null],
  [i => "NO DATA\r" + normal(i), "rejected", true, null],
  [() => "7E8 10 09 43 00 00 00 00 00\r>", "rejected", false, null]
]) {
  const owner = createReadOnlyReceiptOwner(api), ticket = fill(owner, transcript);
  const result = owner.finish(ticket, "complete");
  check(result.ok && result.summary.receiptStructureComplete, "structure separate from grammar");
  const raw = result.summary.rawTranscriptValidation;
  check(raw.status === status && raw.readouts.length === 4, "parser status");
  check(raw.readouts.every(row => row.noDataReported === noData), "NO DATA observation");
  if (frames !== null) check(raw.readouts.every(row => row.frameCount === frames), "frame count");
  check(result.summary.payloadSemanticsVerified === false && result.summary.comparisonAvailable === false
    && result.summary.canExecute === false, "no semantic authority");
  check(Object.isFrozen(raw) && Object.isFrozen(raw.readouts) && raw.readouts.every(row => Object.isFrozen(row.errorCodes)), "immutable observations");
  check(!JSON.stringify(result).includes("7E8") && !JSON.stringify(result).includes("transcript"), "no raw/source export");
  owner.invalidate(); check(!owner.inspect(ticket).ok, "invalidation");
}
let getterCalls = 0;
assert.throws(() => createReadOnlyReceiptOwner({ get parseElmReadOnlyRawTranscript() { getterCalls++; } }), TypeError);
check(getterCalls === 0, "parser getter not invoked");
const broken = createReadOnlyReceiptOwner({ parseElmReadOnlyRawTranscript() { throw new Error("private raw"); } });
const brokenTicket = fill(broken, normal);
check(broken.finish(brokenTicket, "complete").reason === "raw_validation_failed", "exception concealed");
check(!broken.finish(brokenTicket, "complete").ok && broken.inspect(brokenTicket).summary.status === "rejected", "no retry");
let owner, fresh, nestedRejected = false;
owner = createReadOnlyReceiptOwner({ parseElmReadOnlyRawTranscript(input) {
  if (!fresh) {
    nestedRejected = !owner.finish(old, "complete").ok;
    fresh = owner.begin();
  }
  return api.parseElmReadOnlyRawTranscript(input);
} });
const old = fill(owner, normal);
check(owner.finish(old, "complete").reason === "unknown_or_expired_ticket", "late validation discarded");
check(nestedRejected && owner.inspect(fresh).summary.receiptCount === 0, "new attempt untouched");
console.log(`Read-only receipt raw validation: ${checks} checks passed (grammar only, no payload authority)`);
