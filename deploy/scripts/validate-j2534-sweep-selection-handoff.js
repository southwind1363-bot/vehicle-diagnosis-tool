import assert from "node:assert/strict";
import { createJ2534SweepSelectionHandoff } from "./j2534-sweep-selection-handoff.js";
import { createJ2534Mode01PairSelectionHandoff } from "./j2534-mode01-pair-selection-handoff.js";

const descriptor = Object.freeze({});
const original = { selected_device_id: "j2534-0123456789abcdef", path: "C:\\fixture\\sweep.dll",
  sha256: "A".repeat(64), size: 1024, architecture: "x64" };
let now = 100, current = original, revalidate = () => current;
const dependencies = { now: () => now, resolveDescriptor: d => d === descriptor ? current : null,
  revalidateDescriptor: () => revalidate() };
const handoff = createJ2534SweepSelectionHandoff(dependencies);
const request = () => ({ request_ecu: 0x7e0, services: [3, 7, 10], pids: [0, 5, 12] });
const input = request(), ticket = handoff.prepare(descriptor, input);
assert.deepEqual(ticket, {}); assert.ok(Object.isFrozen(ticket));
input.services.reverse(); input.pids.pop(); input.request_ecu++;
const result = handoff.consume(ticket);
assert.equal(result.request_ecu, 0x7e0);
assert.deepEqual(result.services, [3, 7, 10]); assert.deepEqual(result.pids, [0, 5, 12]);
assert.ok(Object.isFrozen(result) && Object.isFrozen(result.services) && Object.isFrozen(result.pids));
assert.equal(Object.hasOwn(result, "service"), false); assert.equal(Object.hasOwn(result, "pid"), false);
assert.equal(handoff.consume(ticket), null);
for (const mutate of [r => r.services.reverse(), r => r.services.push(4), r => r.pids.reverse(),
  r => r.pids.pop(), r => r.extra = true, r => r.request_ecu = 0x7df,
  r => delete r.services[1], r => r.pids.extra = 1]) {
  const invalid = request(); mutate(invalid); assert.equal(handoff.prepare(descriptor, invalid), null);
}
for (const key of Object.keys(original)) {
  const t = handoff.prepare(descriptor, request());
  current = { ...original, [key]: key === "size" ? 2048 : "changed" };
  assert.equal(handoff.consume(t), null); assert.equal(handoff.consume(t), null); current = original;
}
for (const change of [() => { now += 5000; }, () => { now--; },
  () => { revalidate = () => { now += 5000; return current; }; },
  () => { revalidate = () => { throw new Error("private"); }; }]) {
  const t = handoff.prepare(descriptor, request()); change();
  assert.equal(handoff.consume(t), null); assert.equal(handoff.consume(t), null);
  now = 100; revalidate = () => current;
}
const other = createJ2534SweepSelectionHandoff(dependencies);
const pair = createJ2534Mode01PairSelectionHandoff(dependencies);
const ownTicket = handoff.prepare(descriptor, request());
assert.equal(other.consume(ownTicket), null); assert.equal(pair.consume(ownTicket), null);
assert.ok(handoff.consume(ownTicket));
assert.equal(handoff.consume(pair.prepare(descriptor, { request_ecu: 0x7e0, pids: [5, 12] })), null);
assert.equal(handoff.prepare({}, request()), null);
console.log("Sweep handoff: fixed request, immutable copy, one-use, expiry, metadata and ticket isolation passed");
