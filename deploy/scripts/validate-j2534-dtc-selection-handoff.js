import assert from "node:assert/strict";
import "./validate-j2534-registered-dtc-selection.js";
import { createJ2534DtcSelectionHandoff } from "./j2534-dtc-selection-handoff.js";

let checks = 0;
const descriptor = Object.freeze({});
const original = () => ({ selected_device_id: "j2534-0123456789abcdef", path: "C:\\synthetic\\driver.dll",
  sha256: "a".repeat(64), size: 4096, architecture: "x64" });
function setup() {
  const state = { time: 100, selected: original(), current: original() };
  state.handoff = createJ2534DtcSelectionHandoff({
    resolveDescriptor: key => key === descriptor ? state.selected : null,
    revalidateDescriptor: key => key === descriptor ? state.current : null,
    now: () => state.time, ttlMs: 1000
  });
  return state;
}
const request = () => ({ request_ecu: 0x7e0, service: 3 });
for (let ecu = 0x7e0; ecu <= 0x7e7; ecu++) for (const service of [3, 7, 10]) {
  const s = setup(), input = { request_ecu: ecu, service }, ticket = s.handoff.prepare(descriptor, input);
  assert.equal(JSON.stringify(ticket), "{}"); assert.equal(Object.isFrozen(ticket), true);
  input.service = 4;
  const selected = s.handoff.consume(ticket);
  assert.deepEqual(selected, { ...original(), sha256: "A".repeat(64), request_ecu: ecu, service });
  assert.equal(Object.isFrozen(selected), true); assert.equal(s.handoff.consume(ticket), null); checks += 5;
}
for (const [key, value] of [["selected_device_id", "j2534-ffffffffffffffff"], ["path", "C:\\synthetic\\other.dll"],
  ["sha256", "b".repeat(64)], ["size", 4097], ["architecture", "x86"]]) {
  const s = setup(), ticket = s.handoff.prepare(descriptor, request()); s.current[key] = value;
  assert.equal(s.handoff.consume(ticket), null); s.current = original();
  assert.equal(s.handoff.consume(ticket), null); checks += 2;
}
for (const time of [99, 1100, 1101, NaN, Infinity]) {
  const s = setup(), ticket = s.handoff.prepare(descriptor, request()); s.time = time;
  assert.equal(s.handoff.consume(ticket), null); s.time = 100;
  assert.equal(s.handoff.consume(ticket), null); checks += 2;
}
for (const input of [null, {}, { ...request(), extra: true }, { request_ecu: 0x7df, service: 3 },
  { request_ecu: 0x7e8, service: 3 }, { request_ecu: 0x7e0, service: 4 }, { request_ecu: "2016", service: 3 }]) {
  assert.equal(setup().handoff.prepare(descriptor, input), null); checks++;
}
for (const file of ["relative.dll", "C:driver.dll", "\\\\server\\driver.dll", "C:\\synthetic\\..\\driver.dll", "C:\\bad\0.dll"]) {
  const s = setup(); s.selected.path = file; assert.equal(s.handoff.prepare(descriptor, request()), null); checks++;
}
{
  const s = setup(), ticket = s.handoff.prepare(descriptor, request());
  assert.equal(s.handoff.consume({ ...ticket }), null);
  assert.equal(setup().handoff.consume(ticket), null);
  assert.equal(s.handoff.prepare({}, request()), null); checks += 3;
}
{
  const s = setup(), ticket = s.handoff.prepare(descriptor, request());
  Object.defineProperty(s.current, "path", { get() { s.time = 1100; return original().path; } });
  assert.equal(s.handoff.consume(ticket), null); checks++;
}
console.log(`J2534 private DTC selection handoff: ${checks} checks / synthetic metadata only / no registry, DLL or vehicle I/O`);
