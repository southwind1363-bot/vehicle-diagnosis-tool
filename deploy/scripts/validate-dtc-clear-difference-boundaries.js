import assert from "node:assert/strict";
import { createDtcClearReadoutFixtureScope } from "./fixtures/dtc-clear-readout-scope.js";
import { createDtcClearFixtureReceiveWindow, createDtcClearDtcEvidencePairFixture } from "./fixtures/dtc-clear-scoped-before-readout.js";
let checks = 0;
const check = (value, message) => { assert.ok(value, message); checks += 1; };
const intents = ["read_stored_dtc", "read_pending_dtc", "read_permanent_dtc", "read_readiness"];
const services = [0x43, 0x47, 0x4A], commands = ["03", "07", "0A", "0101"];
const profile = "iso15765_11bit_normal_h1_caf1_d0_s1_e0";
const stamp = (second) => `2026-09-06T00:00:${String(second).padStart(2, "0")}.000Z`;
function frames(source, payload) {
  const line = (bytes) => `${source} ${[...bytes, ...Array(8 - bytes.length).fill(0xAA)].map((byte) => byte.toString(16).padStart(2, "0").toUpperCase()).join(" ")}\r`;
  if (payload.length <= 7) return line([payload.length, ...payload]);
  let text = line([0x10 | (payload.length >> 8), payload.length & 255, ...payload.slice(0, 6)]);
  for (let offset = 6, sequence = 1; offset < payload.length; offset += 7, sequence = (sequence + 1) & 15) {
    text += line([0x20 | sequence, ...payload.slice(offset, offset + 7)]);
  }
  return text;
}
const dtcFrames = (source, service, codes) => frames(source, [service, codes.length, ...codes.flatMap((code) => [code >> 8, code & 255])]);
function fixture(ids = ["7E8"]) {
  const connectionToken = {}, targetToken = {};
  const scope = createDtcClearReadoutFixtureScope({ provenance: "simulated", profile, connectionToken, targetToken,
    byIntent: intents.map((intent) => ({ intent, sourceIds: ids })) });
  const clear = createDtcClearFixtureReceiveWindow({ expectedSourceIds: ["7EA"], connectionToken });
  clear.append(clear.attemptToken, connectionToken, { sourceId: "7EA", payload: [0x44] });
  const readout = (start) => ({ provenance: "simulated", connectionToken, attemptToken: {}, startedAt: stamp(start), completedAt: stamp(start + 5),
    receipts: intents.map((intent, index) => ({ ordinal: index + 1, intent, command: commands[index], profile,
      startedAt: stamp(start + index), completedAt: stamp(start + index + 1), completion: "complete",
      transcript: ids.map((id) => index === 3 ? frames(id, [0x41, 1, 0x80, 7, 0xE1, 0]) : dtcFrames(id, services[index], [])).join("") + ">" })) });
  return { scope, context: { scopeToken: scope.scopeToken, connectionToken, targetToken }, beforeReadout: readout(1),
    clearStartedAt: stamp(7), clearCompletedAt: stamp(8), clearWindowSnapshot: clear.finish(clear.attemptToken, connectionToken, "complete").snapshot,
    postReadout: readout(9) };
}
const codeText = (code) => `P${code.toString(16).padStart(4, "0").toUpperCase()}`;
function verify(before, after, index) {
  const value = fixture();
  value.beforeReadout.receipts[index].transcript = dtcFrames("7E8", services[index], before) + ">";
  value.postReadout.receipts[index].transcript = dtcFrames("7E8", services[index], after) + ">";
  const created = createDtcClearDtcEvidencePairFixture(value);
  check(created.ok, "Valid set fixture rejected");
  const out = created.handle.inspectDifference(value.context).summary, row = out.differences[index].sources[0];
  assert.deepEqual(row, { sourceId: "7E8", added: after.filter((n) => !before.includes(n)).map(codeText).sort(),
    removed: before.filter((n) => !after.includes(n)).map(codeText).sort(), retained: before.filter((n) => after.includes(n)).map(codeText).sort() }); checks += 1;
  check(row.removed.length + row.retained.length === before.length && row.added.length + row.retained.length === after.length,
    "Difference violated set conservation");
  check(!out.comparisonAvailable && !out.clearSucceededInferred && !out.wouldTransmit, "Set difference became vehicle authority");
  created.handle.dispose();
}
// Exhaust all pairs of subsets of four distinct codes, with reversed input ordering.
const subset = (mask) => [1, 2, 3, 4].filter((_, index) => mask & (1 << index));
for (let before = 0; before < 16; before += 1) {
  for (let after = 0; after < 16; after += 1) verify(subset(before).reverse(), subset(after), (before + after) % 3);
}
const maximum = Array.from({ length: 255 }, (_, index) => index + 1);
for (let index = 0; index < 3; index += 1) {
  verify(maximum, [], index); verify([], maximum, index); verify(maximum, [...maximum].reverse(), index);
  verify(maximum, maximum.map((code) => code + 128).reverse(), index);
}
const ids = Array.from({ length: 32 }, (_, index) => (0x7E0 + index).toString(16).toUpperCase());
const many = fixture(ids);
for (let index = 0; index < 3; index += 1) {
  many.beforeReadout.receipts[index].transcript = ids.map((id) => dtcFrames(id, services[index], [1])).join("") + ">";
  many.postReadout.receipts[index].transcript = [...ids].reverse().map((id) => dtcFrames(id, services[index], [2])).join("") + ">";
}
const manyHandle = createDtcClearDtcEvidencePairFixture(many).handle;
for (const row of manyHandle.inspectDifference(many.context).summary.differences) {
  check(row.sources.length === 32 && row.sources.every((source, index) => source.sourceId === ids[index]
    && source.added.join() === "P0002" && source.removed.join() === "P0001" && source.retained.length === 0), "ECU order or capacity lost evidence");
}
manyHandle.dispose();
for (const side of ["beforeReadout", "postReadout"]) {
  for (let index = 0; index < 4; index += 1) {
    const value = fixture(["7E8", "7E9"]);
    value[side].receipts[index].transcript = index === 3 ? frames("7E8", [0x41, 1, 0x80, 7, 0xE1, 0]) + ">"
      : dtcFrames("7E8", services[index], [1]) + ">";
    check(createDtcClearDtcEvidencePairFixture(value).handle === null, "Missing ECU became added/removed evidence");
  }
}
// Two maximum-sized ISO-TP messages exceed the parser's existing CAN frame budget.
const overBudget = fixture(["7E8", "7E9"]);
overBudget.postReadout.receipts[0].transcript = ["7E8", "7E9"].map((id) => dtcFrames(id, 0x43, maximum)).join("") + ">";
check(createDtcClearDtcEvidencePairFixture(overBudget).handle === null, "Over-budget receipt yielded a partial difference");
// Untrusted frozen objects must be rejected within a bounded, stack-safe walk.
for (const shape of ["deep", "wide"]) {
  const value = fixture();
  let oversized = Object.freeze({});
  if (shape === "deep") {
    for (let index = 0; index < 5000; index += 1) oversized = Object.freeze({ child: oversized });
  } else oversized = Object.freeze(Object.fromEntries(Array.from({ length: 5000 }, (_, index) => [`field${index}`, index])));
  value.clearWindowSnapshot = Object.freeze({ ...value.clearWindowSnapshot, execution: oversized });
  assert.throws(() => createDtcClearDtcEvidencePairFixture(value),
    (error) => error instanceof TypeError && error.message === "pair_clear_snapshot_budget_exceeded"); checks += 1;
}
const cyclic = fixture(), cycle = {}; cycle.self = cycle; Object.freeze(cycle);
cyclic.clearWindowSnapshot = Object.freeze({ ...cyclic.clearWindowSnapshot, execution: cycle });
assert.throws(() => createDtcClearDtcEvidencePairFixture(cyclic), (error) => error.name === "TypeError"); checks += 1;
const wideClear = fixture();
const wideConnection = {}, wideWindow = createDtcClearFixtureReceiveWindow({ expectedSourceIds: ids, connectionToken: wideConnection });
for (const sourceId of ids) wideWindow.append(wideWindow.attemptToken, wideConnection, { sourceId, payload: [0x44] });
wideClear.clearWindowSnapshot = wideWindow.finish(wideWindow.attemptToken, wideConnection, "complete").snapshot;
const wideHandle = createDtcClearDtcEvidencePairFixture(wideClear).handle;
check(wideHandle.inspectDifference(wideClear.context).ok, "Valid 32-source clear snapshot exceeded inspection budget");
wideHandle.dispose();
let tokenReads = 0;
const tokenOnly = fixture();
const opaqueToken = new Proxy({}, { ownKeys() { tokenReads += 1; throw new Error("Opaque token inspected"); } });
tokenOnly.clearWindowSnapshot = Object.freeze({ ...tokenOnly.clearWindowSnapshot, attemptToken: opaqueToken });
const tokenHandle = createDtcClearDtcEvidencePairFixture(tokenOnly).handle;
check(tokenHandle.inspectDifference(tokenOnly.context).ok && tokenReads === 0, "Identity token contents traversed");
tokenHandle.dispose();
console.log(`DTC clear difference boundary checks: ${checks} / Errors: 0`);
