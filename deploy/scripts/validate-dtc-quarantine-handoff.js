import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import vm from "node:vm";
import { createHash } from "node:crypto";
import { EventEmitter } from "node:events";
import { createBoundedFixtureWorker } from "./bounded-fixture-worker.js";
import { createJ2534DtcResultConverter } from "./j2534-dtc-result-converter.js";
import { createJ2534NativeQuarantineStore } from "./j2534-native-quarantine.js";

const source = fs.readFileSync(new URL("./j2534-native-fixture-supervisor.js", import.meta.url), "utf8")
  .replace(/^import .*;\r?\n/gm, "").replace(/\bexport (?=function |const )/g, "");
for (const spawnEvent of [true, false]) {
  const root = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), "vehicle-j2534-native-"));
  const directory = path.join(root, "x64", "owned-dtc-data");
  fs.mkdirSync(directory, { recursive: true });
  const worker = path.join(directory, "owned-receive-worker.exe"), fixture = path.join(directory, "owned-receive.dll");
  // Inert bytes satisfy path/hash pinning only. The injected spawn never executes them.
  fs.writeFileSync(worker, "inert-test-only"); fs.writeFileSync(fixture, "inert-test-only");
  const child = new EventEmitter(); child.stdout = new EventEmitter(); child.stderr = new EventEmitter();
  child.pid = 123; child.exitCode = null; child.signalCode = null;
  let spawns = 0, kills = 0, decodes = 0;
  child.kill = () => { kills++; return false; };
  try {
    const factory = vm.runInNewContext(`${source}\ncreateJ2534DtcResultFixtureSupervisor`, {
      fs, os, path, createHash, createBoundedFixtureWorker, createJ2534DtcResultConverter,
      Buffer, process, AbortSignal,
      spawn() { spawns++; if (spawnEvent) queueMicrotask(() => child.emit("spawn")); return child; }
    });
    const descriptor = { temp_root: root, architecture: "x64", scenario: "owned-dtc-data",
      worker: { path: worker, sha256: createHash("sha256").update(fs.readFileSync(worker)).digest("hex") },
      fixture: { path: fixture, sha256: createHash("sha256").update(fs.readFileSync(fixture)).digest("hex") } };
    const decoder = () => { decodes++; throw new Error("must not decode"); };
    const first = factory(descriptor, decoder, { quarantineStore: createJ2534NativeQuarantineStore(directory) });
    const result = await first.run({ timeout_ms: 1000 });
    assert.equal(result.worker_exited, false);
    assert.equal(result.errors[0], "worker_termination_unconfirmed");
    const reopened = createJ2534NativeQuarantineStore(directory);
    assert.equal(reopened.read().quarantined, true, `spawn event ${spawnEvent}: quarantine was skipped`);
    const denied = await factory(descriptor, decoder, { quarantineStore: reopened }).run();
    assert.equal(denied.worker_started, false);
    assert.equal(denied.errors[0], "owned_fixture_quarantine_not_clear");
    assert.equal(spawns, 1); assert.equal(kills, 1); assert.equal(decodes, 0);
    const snapshot = JSON.stringify(result);
    child.emit("spawn"); child.emit("close", 0, null);
    assert.equal(JSON.stringify(result), snapshot);
  } finally {
    child.emit("close", null, "SIGKILL");
    for (const file of [worker, fixture, path.join(directory, "j2534-native-quarantine-v1.json")]) {
      if (fs.existsSync(file)) fs.unlinkSync(file);
    }
    fs.rmdirSync(directory); fs.rmdirSync(path.dirname(directory)); fs.rmdirSync(root);
  }
}
console.log("DTC termination-to-quarantine handoff: missing spawn/close and recreated supervisor blocked; no native execution");
