import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { createBoundedFixtureWorker } from "./bounded-fixture-worker.js";

await Promise.all(["false", "throw", "true", "exit_without_close"].map(async mode => {
  const child = new EventEmitter();
  child.stdout = new EventEmitter(); child.stderr = new EventEmitter();
  child.pid = 123; child.exitCode = null; child.signalCode = null;
  let spawns = 0, kills = 0, parses = 0;
  child.kill = () => { kills++; if (mode === "throw") throw new Error("synthetic"); return mode === "true"; };
  const run = createBoundedFixtureWorker({
    spawnWorker() {
      spawns++;
      queueMicrotask(() => {
        child.emit("spawn");
        child.stdout.emit("data", Buffer.from("{}"));
        if (mode === "exit_without_close") {
          child.exitCode = 1; child.emit("exit", 1, null);
        }
      });
      return child;
    },
    parseOutput() { parses++; return {}; }
  });
  let watchdog;
  const result = await Promise.race([run({ timeout: 20 }), new Promise((_, reject) => {
    watchdog = setTimeout(() => reject(new Error("termination deadline did not settle")), 3000);
  })]).finally(() => clearTimeout(watchdog));
  assert.equal(result.worker_exited, false);
  assert.equal(result.parsed_result, null);
  assert.deepEqual(result.errors, ["worker_termination_unconfirmed"]);
  assert.equal(result.termination_signal_sent, mode === "true");
  const snapshot = JSON.stringify(result);
  child.emit("close", 0, null);
  child.stdout.emit("data", Buffer.from("{}"));
  child.stderr.emit("error", new Error("late"));
  assert.equal(JSON.stringify(result), snapshot);
  assert.deepEqual((await run({ timeout: 20 })).errors, ["worker_termination_unconfirmed"]);
  assert.equal(spawns, 1); assert.equal(parses, 0);
  assert.equal(kills, mode === "exit_without_close" ? 0 : 1);
}));
console.log("Fixture termination deadline: missing/late close rejects results and blocks reuse; synthetic events only");
