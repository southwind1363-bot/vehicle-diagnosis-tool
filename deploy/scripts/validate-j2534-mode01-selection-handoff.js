import assert from "node:assert/strict";
import { createJ2534Mode01SelectionHandoff } from "./j2534-mode01-selection-handoff.js";
import { createJ2534DtcSelectionHandoff } from "./j2534-dtc-selection-handoff.js";

const metadata = () => ({ selected_device_id: "j2534-0123456789abcdef", path: "C:\\fixture\\mode01.dll",
  sha256: "a".repeat(64), size: 4096, architecture: "x64" });
const descriptor = Object.freeze({});
let clock = 100, current = metadata(), revalidations = 0;
let revalidate = () => current;
const dependencies = { now: () => clock, resolveDescriptor: d => d === descriptor ? current : null,
  revalidateDescriptor: d => { assert.equal(d, descriptor); revalidations++; return revalidate(); } };
const handoff = createJ2534Mode01SelectionHandoff(dependencies);
for (const pid of [5, 12]) for (const ecu of [0x7e0, 0x7e7]) {
  const request = { request_ecu: ecu, pid };
  const ticket = handoff.prepare(descriptor, request);
  assert.deepEqual(Object.keys(ticket), []); assert.ok(Object.isFrozen(ticket));
  request.pid = 4;
  const selection = handoff.consume(ticket);
  assert.ok(Object.isFrozen(selection));
  assert.equal(selection.pid, pid); assert.equal(selection.service, 1); assert.equal(selection.request_ecu, ecu);
  assert.equal(selection.sha256, "A".repeat(64));
  assert.equal(handoff.consume(ticket), null);
}
for (const request of [null, {}, [], { request_ecu: 2016, pid: 0 }, { request_ecu: 2016, pid: 4 },
  { request_ecu: 2016, pid: "5" }, { request_ecu: 2015, pid: 5 }, { request_ecu: 2024, pid: 5 },
  { request_ecu: 2016, pid: 5, service: 1 }]) assert.equal(handoff.prepare(descriptor, request), null);
assert.equal(handoff.prepare({}, { request_ecu: 2016, pid: 5 }), null);
for (const [key, value] of [["path", "C:\\fixture\\other.dll"], ["sha256", "b".repeat(64)], ["size", 4097],
  ["architecture", "x86"], ["selected_device_id", "j2534-fedcba9876543210"]]) {
  current = metadata();
  const ticket = handoff.prepare(descriptor, { request_ecu: 2016, pid: 5 });
  current[key] = value;
  assert.equal(handoff.consume(ticket), null); assert.equal(handoff.consume(ticket), null);
}
current = metadata();
for (const time of [99, 5100, NaN]) {
  clock = 100;
  const ticket = handoff.prepare(descriptor, { request_ecu: 2016, pid: 5 });
  const before = revalidations; clock = time;
  assert.equal(handoff.consume(ticket), null); assert.equal(revalidations, before);
  clock = 100; assert.equal(handoff.consume(ticket), null);
}
for (const action of [() => { clock = 5100; return current; }, () => { clock = 99; return current; },
  () => { throw new Error("private path must not leak"); }, () => null]) {
  clock = 100; revalidate = action;
  const ticket = handoff.prepare(descriptor, { request_ecu: 2016, pid: 12 });
  assert.equal(handoff.consume(ticket), null); assert.equal(handoff.consume(ticket), null);
}
revalidate = () => current; clock = 100;
const foreign = createJ2534Mode01SelectionHandoff(dependencies);
const ticket = handoff.prepare(descriptor, { request_ecu: 2016, pid: 5 });
assert.equal(foreign.consume(ticket), null);
assert.equal(handoff.consume({}), null); assert.equal(handoff.consume(null), null);
assert.equal(handoff.consume(ticket).pid, 5);
const dtc = createJ2534DtcSelectionHandoff(dependencies);
assert.equal(dtc.prepare(descriptor, { request_ecu: 2016, service: 1 }), null);
for (const service of [3, 7, 10]) assert.equal(dtc.consume(dtc.prepare(descriptor, { request_ecu: 2016, service })).service, service);
console.log("Mode01 private selection: copied ECU/PID, expiry, one-use revalidation, changed metadata and DTC isolation passed; no file or vehicle I/O");
