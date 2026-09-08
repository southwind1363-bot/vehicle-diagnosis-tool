import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync(new URL("../script.js", import.meta.url), "utf8");
const code = source.match(/async function fetchJson\(path\) \{[\s\S]*?\r?\n\}/)[0];
let checks = 0;
for (const mode of ["success", "http", "parse", "network", "headers-stall", "body-stall"]) {
  let timer, signal, calls = 0, cleared = 0, bodyStarted = false;
  const context = vm.createContext({
    AbortController,
    setTimeout(fn, ms) { assert.equal(ms, 30000); timer = fn; return 42; },
    clearTimeout(id) { assert.equal(id, 42); cleared++; },
    async fetch(path, options) {
      calls++;
      assert.equal(path, "data/synthetic.json");
      signal = options?.signal;
      const stall = () => new Promise((_, reject) => {
        if (signal?.aborted) reject(new Error("aborted"));
        else signal?.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
      });
      if (mode === "network") throw new Error("network");
      if (mode === "headers-stall") return stall();
      return { ok: mode !== "http", async json() {
        bodyStarted = true;
        if (mode === "body-stall") return stall();
        if (mode === "parse") throw new Error("parse");
        return { valid: true };
      } };
    }
  });
  vm.runInContext(code, context);
  const pending = context.fetchJson("data/synthetic.json");
  const outcome = pending.then(value => ({ value }), error => ({ error }));
  assert.ok(timer, "Static JSON fetch needs a bounded wait");
  for (let turn = 0; turn < 4; turn++) await Promise.resolve();
  if (mode === "body-stall") assert.equal(bodyStarted, true, "Deadline must include a pending body");
  if (mode.endsWith("stall")) { assert.equal(cleared, 0); timer(); }
  const result = await outcome;
  if (mode === "success") assert.deepEqual(result.value, { valid: true });
  else assert.ok(result.error);
  assert.equal(calls, 1, "No automatic retry");
  assert.equal(cleared, 1);
  assert.equal(signal.aborted, mode.endsWith("stall"));
  checks += 5;
}
console.log(`Static JSON fetch checks: ${checks} / Errors: 0`);
