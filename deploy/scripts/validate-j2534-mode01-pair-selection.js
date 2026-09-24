import assert from "node:assert/strict";
import { createJ2534Mode01PairSelectionHandoff } from "./j2534-mode01-pair-selection-handoff.js";
import { createJ2534Mode01SelectionHandoff } from "./j2534-mode01-selection-handoff.js";
import { createJ2534RegisteredMode01PairSelectionHandoff } from "../local-bridge-readonly.js";

const metadata = () => ({ selected_device_id: "j2534-0123456789abcdef", path: "C:\\synthetic\\mode01.dll",
  sha256: "a".repeat(64), size: 4096, architecture: "x64" });
const descriptor = Object.freeze({});
let time = 100, current = metadata(), calls = 0, revalidate = () => current;
const dependencies = { now: () => time, resolveDescriptor: d => d === descriptor ? current : null,
  revalidateDescriptor: d => { calls++; assert.equal(d, descriptor); return revalidate(); } };
const pair = createJ2534Mode01PairSelectionHandoff(dependencies);
const single = createJ2534Mode01SelectionHandoff(dependencies);
const intent = () => ({ request_ecu: 0x7e0, pids: [5, 12] });
for (const ecu of [0x7e0, 0x7e7]) {
  const request = { request_ecu: ecu, pids: [5, 12] };
  const ticket = pair.prepare(descriptor, request);
  assert.equal(JSON.stringify(ticket), "{}"); assert.ok(Object.isFrozen(ticket));
  request.pids.reverse(); request.request_ecu = 0;
  assert.equal(single.consume(ticket), null);
  const result = pair.consume(ticket);
  assert.equal(result.request_ecu, ecu); assert.equal(result.service, 1);
  assert.deepEqual(result.pids, [5, 12]); assert.equal(Object.hasOwn(result, "pid"), false);
  assert.ok(Object.isFrozen(result)); assert.ok(Object.isFrozen(result.pids));
  assert.equal(result.sha256, "A".repeat(64)); assert.equal(pair.consume(ticket), null);
}
for (const pids of [[], [5], [12, 5], [5, 5], [5, 12, 0], ["5", 12], [5, "12"], null,
  Object.assign([5, 12], { extra: true }), { 0: 5, 1: 12, length: 2 }]) {
  assert.equal(pair.prepare(descriptor, { request_ecu: 2016, pids }), null);
}
for (const request of [null, {}, [], { ...intent(), pid: 5 }, { ...intent(), request_ecu: 2015 },
  { ...intent(), request_ecu: 2024 }]) assert.equal(pair.prepare(descriptor, request), null);
assert.equal(pair.prepare({}, intent()), null);
const singleTicket = single.prepare(descriptor, { request_ecu: 2016, pid: 5 });
assert.equal(pair.consume(singleTicket), null); assert.equal(single.consume(singleTicket).pid, 5);
for (const [key, value] of [["path", "C:\\synthetic\\other.dll"], ["sha256", "b".repeat(64)],
  ["size", 4097], ["architecture", "x86"], ["selected_device_id", "j2534-fedcba9876543210"]]) {
  current = metadata(); const ticket = pair.prepare(descriptor, intent()); current[key] = value;
  assert.equal(pair.consume(ticket), null); current = metadata(); assert.equal(pair.consume(ticket), null);
}
for (const clock of [99, 5100, NaN]) {
  time = 100; const ticket = pair.prepare(descriptor, intent()); const before = calls; time = clock;
  assert.equal(pair.consume(ticket), null); assert.equal(calls, before);
  time = 100; assert.equal(pair.consume(ticket), null);
}
for (const action of [() => { time = 5100; return current; }, () => { time = 99; return current; },
  () => null, () => { throw new Error("private detail"); }]) {
  time = 100; revalidate = action; const ticket = pair.prepare(descriptor, intent());
  assert.equal(pair.consume(ticket), null); assert.equal(pair.consume(ticket), null);
}
// Actual host factory: unissued descriptor is refused before registry/file work.
assert.equal(createJ2534RegisteredMode01PairSelectionHandoff().prepare({}, intent()), null);
console.log("Mode01 pair metadata handoff: PASS (no process, DLL or vehicle execution)");
