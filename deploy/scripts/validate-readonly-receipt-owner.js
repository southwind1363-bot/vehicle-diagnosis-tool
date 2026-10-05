import assert from "node:assert/strict";
import { createReadOnlyReceiptOwner } from "./fixtures/readonly-receipt-owner.js";

let checks = 0;
const check = (value, message) => { assert.ok(value, message); checks++; };
const receipt = (index, changes = {}) => ({ command: ["03", "07", "0A", "0101"][index],
  profile: "iso15765_11bit_normal_h1_caf1_d0_s1_e0", startedAt: index * 2, completedAt: index * 2 + 1,
  completion: "complete", transcript: "NO DATA\r>", ...changes });
const owner = createReadOnlyReceiptOwner();
const ticket = owner.begin();
check(Object.isFrozen(ticket) && Object.keys(ticket).length === 0, "opaque ticket");
for (const foreign of [{}, { ...ticket }, JSON.parse(JSON.stringify(ticket)), createReadOnlyReceiptOwner().begin(), null, 1]) {
  check(!owner.append(foreign, receipt(0)).ok, "foreign append");
  check(!owner.finish(foreign, "complete").ok, "foreign finish");
  check(!owner.inspect(foreign).ok, "foreign inspect");
}
for (let i = 0; i < 4; i++) {
  const source = receipt(i);
  check(owner.append(ticket, source).ok, "ordered append");
  source.completedAt = 999;
  source.transcript = "caller mutation";
}
const finished = owner.finish(ticket, "complete");
check(finished.ok && finished.summary.receiptStructureComplete && finished.summary.receiptCount === 4, "structure completion");
check(Object.isFrozen(finished.summary), "frozen summary");
for (const flag of ["payloadSemanticsVerified", "realTransportProofAvailable", "sameVehicleVerified", "clearBoundaryVerified",
  "readoutCoverageComplete", "comparisonAvailable", "clearSucceededInferred", "executionEnabled", "vehicleCommandEnabled", "wouldTransmit", "canExecute"]) {
  check(finished.summary[flag] === false, `no authority: ${flag}`);
}
check(!JSON.stringify(finished).includes("NO DATA") && !Object.hasOwn(finished.summary, "transcript"), "no raw export");
check(!owner.finish(ticket, "complete").ok && !owner.append(ticket, receipt(0)).ok, "double finish and late append");
check(owner.inspect(ticket).summary === finished.summary, "late operation preserves terminal summary");
const newer = owner.begin();
check(!owner.inspect(ticket).ok && owner.inspect(newer).summary.receiptCount === 0, "new generation");
owner.invalidate(); owner.invalidate();
check(!owner.inspect(newer).ok && !owner.append(newer, receipt(0)).ok, "invalidation without serial revision");

const invalid = [
  [null, "invalid_receipt"], [{ ...receipt(0), extra: 1 }, "invalid_receipt"],
  [receipt(1), "command_order_mismatch"], [receipt(0, { profile: null }), "profile_unavailable"],
  [receipt(0, { profile: "S0" }), "profile_unavailable"],
  [receipt(0, { startedAt: -1 }), "invalid_timing"], [receipt(0, { completedAt: NaN }), "invalid_timing"],
  [receipt(0, { startedAt: 2, completedAt: 1 }), "invalid_timing"],
  [receipt(0, { completion: "timeout" }), "receipt_incomplete"],
  [receipt(0, { transcript: "" }), "transcript_limit"],
  [receipt(0, { transcript: "a".repeat(32769) }), "transcript_limit"]
];
let getterCalls = 0;
invalid.push([Object.defineProperty(receipt(0), "transcript", { get() { getterCalls++; throw new Error("private"); } }), "invalid_receipt"]);
invalid.push([new Proxy({}, { ownKeys() { throw new Error("private"); } }), "invalid_receipt"]);
for (const [input, reason] of invalid) {
  const t = owner.begin();
  check(owner.append(t, input).reason === reason, reason);
  check(owner.inspect(t).summary.status === "rejected" && !owner.inspect(t).summary.receiptStructureComplete, "terminal rejection");
  check(!owner.append(t, receipt(0)).ok && !owner.finish(t, "complete").ok, "no retry after rejection");
}
check(getterCalls === 0, "accessor not invoked");
for (const completion of ["timeout", "disconnected", "cancelled", "partial", undefined]) {
  const t = owner.begin(); owner.append(t, receipt(0));
  check(owner.finish(t, completion).reason === "attempt_incomplete", "failed completion");
  check(!owner.finish(t, "complete").ok, "no completion repair");
}
for (let count = 0; count < 4; count++) {
  const t = owner.begin();
  for (let i = 0; i < count; i++) owner.append(t, receipt(i));
  check(owner.finish(t, "complete").reason === "missing_receipt", "missing receipt");
}
for (const input of [receipt(0), receipt(1, { startedAt: 0 }), receipt(1, { command: "04" })]) {
  const t = owner.begin(); owner.append(t, receipt(0));
  check(!owner.append(t, input).ok, "duplicate, overlapping or forbidden command");
}
const full = owner.begin();
for (let i = 0; i < 4; i++) check(owner.append(full, receipt(i, { transcript: "x".repeat(32768) })).ok, "exact size boundary");
check(!owner.append(full, receipt(0)).ok && !owner.finish(full, "complete").ok, "excess receipt rejects entire attempt");

// Reflective input cannot revive a ticket or overwrite another generation.
for (const throws of [false, true]) {
  const old = owner.begin(); let next;
  const input = new Proxy(receipt(0), { ownKeys(target) {
    next = owner.begin();
    if (throws) throw { get message() { throw new Error("must not read"); } };
    return Reflect.ownKeys(target);
  } });
  check(owner.append(old, input).reason === "unknown_or_expired_ticket", "reentrant generation");
  check(owner.inspect(next).summary.status === "collecting" && owner.inspect(next).summary.receiptCount === 0, "new generation unaffected");
}
owner.invalidate();
console.log(`Read-only receipt owner: ${checks} checks passed (non-communicating model only)`);
