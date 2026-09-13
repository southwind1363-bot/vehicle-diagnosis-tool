import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import vm from "node:vm";

const source = fs.readFileSync(new URL("./j2534-native-quarantine.js", import.meta.url), "utf8")
  .replace(/^import .*;\r?\n/gm, "").replace("export function", "function");
const root = fs.mkdtempSync(path.join(os.tmpdir(), "quarantine-persistence-"));
const file = path.join(root, "j2534-native-quarantine-v1.json");
try {
  for (const operation of ["openSync", "writeFileSync", "fsyncSync", "closeSync"]) {
    let attempts = 0;
    const testFs = { ...fs, [operation](...args) {
      attempts++;
      if (operation === "closeSync") fs.closeSync(...args);
      throw Object.assign(new Error("synthetic-private-detail"), { code: "ENOSPC" });
    } };
    const create = vm.runInNewContext(`${source}\ncreateJ2534NativeQuarantineStore`, { fs: testFs, path, Buffer });
    const store = create(root);
    assert.equal(store.read().quarantined, false);
    const marked = store.mark("cleanup_unconfirmed");
    assert.equal(marked.quarantined, true);
    assert.equal(marked.reason, "state_invalid");
    // A partial/complete file cannot be relied upon after a persistence error.
    // Remove only this test-owned file to prove the in-memory failure stays set.
    if (fs.existsSync(file)) fs.unlinkSync(file);
    const before = attempts;
    assert.equal(store.read().quarantined, true);
    assert.equal(store.mark("cleanup_unconfirmed").quarantined, true);
    assert.equal(attempts, before, "Persistence failure triggered another write attempt");
    assert.ok(!JSON.stringify(marked).includes("synthetic-private-detail"));
  }
  for (const mode of ["removed_after_close", "corrupted_after_close", "exists_then_missing"]) {
    let attempts = 0;
    const testFs = { ...fs,
      openSync(...args) {
        attempts++;
        if (mode === "exists_then_missing") throw Object.assign(new Error("synthetic-race"), { code: "EEXIST" });
        return fs.openSync(...args);
      },
      closeSync(...args) {
        fs.closeSync(...args);
        if (mode === "removed_after_close") fs.unlinkSync(file);
        else if (mode === "corrupted_after_close") fs.writeFileSync(file, "{}");
      }
    };
    const create = vm.runInNewContext(`${source}\ncreateJ2534NativeQuarantineStore`, { fs: testFs, path, Buffer });
    const store = create(root);
    assert.equal(store.read().quarantined, false);
    const marked = store.mark("cleanup_unconfirmed");
    assert.equal(marked.quarantined, true);
    assert.equal(marked.reason, "state_invalid");
    if (fs.existsSync(file)) fs.unlinkSync(file);
    assert.equal(store.read().quarantined, true, `${mode}: lost failed verification state`);
    const before = attempts;
    assert.equal(store.mark("cleanup_unconfirmed").quarantined, true);
    assert.equal(attempts, before, `${mode}: retried after failed verification`);
  }
  console.log("Quarantine persistence failures: I/O and post-write verification remain blocked without retry");
} finally {
  if (fs.existsSync(file)) fs.unlinkSync(file);
  fs.rmdirSync(root);
}
