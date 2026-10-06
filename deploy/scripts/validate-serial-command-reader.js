import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { client as byteClient, attachWire } from "./fixtures/serial-runtime-harness.js";
const source = fs.readFileSync(new URL("../script.js", import.meta.url), "utf8");
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
let checks = 0;
const check = (value, message) => { assert.ok(value, message); checks++; };
function client() {
  const writing = deferred(), response = deferred();
  let writes = 0, reads = 0;
  const session = { port: {}, reader: {}, writer: { write() { writes++; return writing.promise; } },
    encoder: new TextEncoder(), readLoopActive: true, textBuffer: "" };
  const context = vm.createContext({ obdDevSession: session, obdSerialRevision: 1, obdSerialDisconnectOperation: null,
    // This suite checks reference ownership, not elapsed time. Other imported
    // validators may block the event loop; deadline behavior has separate tests.
    obdSerialConnectPending: false, performance: { now: () => 0 }, setTimeout: () => 0, clearTimeout() {},
    throwIfObdSerialOperationCancelled() {}, isAllowedObdDeveloperCommand: command => command === "03",
    disconnectObdDeveloperVci() { throw new Error("unexpected timeout"); },
    readElmDeveloperResponse() { reads++; return response.promise; } });
  vm.runInContext(source.match(/async function sendElmDeveloperCommand\([^\n]*\) \{[\s\S]*?\r?\n\}/)[0], context);
  return { context, session, writing, response, counts: () => ({ writes, reads }) };
}
// Exercise the actual sender with deferred writes/responses; never opens a port.
for (const replacement of [{}, null]) {
  const c = client(), pending = c.context.sendElmDeveloperCommand("03", 3000);
  const rejected = assert.rejects(pending, /elm_transport_disconnected/);
  c.session.reader = replacement; c.writing.resolve(); c.response.resolve("43 00 00");
  await rejected; checks++;
  check(c.counts().writes === 1 && c.counts().reads === 0, "reader replacement during write stops before reading or retry");
  check(!c.session.pendingCommandOperation && !c.session.pendingWriteOperation, "replacement releases only this command ownership");
}
for (const key of ["reader", "writer", "port", "pendingCommandOperation"]) {
  const c = client(), pending = c.context.sendElmDeveloperCommand("03", 3000);
  const rejected = assert.rejects(pending, /elm_transport_disconnected/);
  c.writing.resolve(); await new Promise(setImmediate);
  check(c.counts().reads === 1, "sender reached response boundary");
  const replacement = {}; c.session[key] = replacement;
  c.response.resolve("43 00 00"); await rejected; checks++;
  check(c.counts().writes === 1, "late response never retries");
  if (key === "pendingCommandOperation") check(c.session[key] === replacement, "old cleanup preserves newer command owner");
  else check(!c.session.pendingCommandOperation, "failed response releases old owner");
}
{
  const c = client(), pending = c.context.sendElmDeveloperCommand("03", 3000);
  c.writing.resolve(); c.response.resolve("43 00 00");
  check(await pending === "43 00 00", "unchanged reader preserves successful response");
  check(c.counts().writes === 1 && c.counts().reads === 1 && !c.session.pendingCommandOperation, "successful command completes once");
}
{
  const c = byteClient(), wire = attachWire(c, 32768, { "03": "43 00 00\r>" });
  c.context.setTimeout = (_callback, delay) => { assert.ok(delay > 40, "reader mismatch must stop before response polling"); return 0; };
  c.context.clearTimeout = () => {};
  const session = c.context.obdDevSession, write = session.writer.write;
  session.writer.write = async bytes => { await write(bytes); session.reader = {}; };
  try {
    await assert.rejects(c.context.sendElmDeveloperCommand("03"), /elm_transport_disconnected/); checks++;
    assert.deepEqual(wire.writes, ["03\r"]); checks++;
    check(!session.pendingCommandOperation && !session.pendingWriteOperation, "byte-backed reader replacement releases send ownership");
  } finally { await wire.close(); }
}
console.log(`Serial command reader: ${checks} checks passed; actual sender and byte loop with synthetic transport only`);
