import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { createSignatureFixtureSupervisor } from "./signature-fixture-supervisor.js";

// Text bytes named .exe/.dll; no returned supervisor is invoked in these tests.
function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "signature-probe-"));
  const worker = Buffer.alloc(150000, 65), target = Buffer.from("abc");
  const file = path.join(root, "probe-x64.exe");
  fs.writeFileSync(file, worker); fs.writeFileSync(path.join(root, "unsigned-x64.dll"), target);
  return { file, descriptor: { root, architecture: "x64",
    worker_sha256: createHash("sha256").update(worker).digest("hex"),
    fixture_sha256: createHash("sha256").update(target).digest("hex") } };
}
test("parent hash reads bounded chunks without whole-file allocation", { skip: process.platform !== "win32" }, () => {
  const { descriptor } = fixture();
  const read = fs.readSync, whole = fs.readFileSync;
  let reads = 0, max = 0;
  try {
    fs.readSync = (fd, buffer, offset, length, position) => {
      reads++; max = Math.max(max, length);
      return read(fd, buffer, offset, length, position);
    };
    fs.readFileSync = () => { throw new Error("whole_file_read_forbidden"); };
    assert.equal(typeof createSignatureFixtureSupervisor(descriptor), "function");
    assert.ok(reads >= 4); assert.ok(max <= 65536);
  } finally { fs.readSync = read; fs.readFileSync = whole; }
});
test("truncation during hashing rejects and closes the held file", { skip: process.platform !== "win32" }, () => {
  const { file, descriptor } = fixture();
  const read = fs.readSync;
  let held;
  try {
    fs.readSync = (fd, ...args) => {
      const count = read(fd, ...args);
      if (held === undefined) { held = fd; fs.truncateSync(file, 1); }
      return count;
    };
    assert.throws(() => createSignatureFixtureSupervisor(descriptor), /signature_fixture_descriptor_invalid/);
  } finally { fs.readSync = read; }
  assert.notEqual(held, undefined);
  assert.throws(() => fs.fstatSync(held), { code: "EBADF" });
});
