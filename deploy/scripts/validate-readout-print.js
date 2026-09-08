import fs from "node:fs";
import vm from "node:vm";
import assert from "node:assert/strict";

const source = fs.readFileSync(new URL("../script.js", import.meta.url), "utf8");
const fn = source.match(/function printObdReadout\(\) \{[\s\S]*?\r?\n\}/)?.[0];
assert.ok(fn);
let checks = 1;
for (const scenario of ["ok", "locked", "busy", "hidden", "missing", "duplicate", "unavailable", "throws"]) {
  const classes = () => {
    const values = new Set();
    return { add: value => values.add(value), remove: value => values.delete(value), contains: value => values.has(value) };
  };
  const body = { classList: classes(), parentElement: null };
  const parent = { classList: classes(), parentElement: body };
  const listeners = new Set();
  let calls = 0, status = "";
  const context = {
    obdAccessUnlocked: scenario !== "locked", getObdSessionExportBlockReason: () => scenario === "busy" ? "busy" : "",
    obdStageResultsView: scenario === "missing" ? null : { parentElement: parent, getClientRects: () => scenario === "hidden" ? [] : [{}] },
    document: { body }, setObdSessionExportStatus: value => { status = value; },
    window: {
      addEventListener: (_, fn) => listeners.add(fn), removeEventListener: (_, fn) => listeners.delete(fn),
      print: scenario === "unavailable" ? undefined : () => {
        calls++;
        assert.equal(body.classList.contains("obd-print-readout"), true);
        assert.equal(parent.classList.contains("obd-print-ancestor"), true);
        checks += 2;
        if (scenario === "throws") throw new Error("synthetic");
        for (const fn of listeners) fn();
      }
    }
  };
  if (scenario === "duplicate") body.classList.add("obd-print-readout");
  vm.createContext(context);
  vm.runInContext(fn, context);
  assert.equal(context.printObdReadout(), scenario === "ok");
  assert.equal(calls, ["ok", "throws"].includes(scenario) ? 1 : 0);
  assert.equal(Boolean(status), ["unavailable", "throws"].includes(scenario));
  assert.equal(parent.classList.contains("obd-print-ancestor"), false);
  assert.equal(body.classList.contains("obd-print-readout"), scenario === "duplicate");
  assert.equal(listeners.size, 0);
  checks += 6;
}
console.log(`Readout print checks: ${checks} / Errors: 0`);
