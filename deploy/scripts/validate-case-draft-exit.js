import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync(new URL("../script.js", import.meta.url), "utf8");
const names = ["hasUnsavedCaseDraft", "handleCaseDraftBeforeUnload", "syncCaseDraftExitGuard", "resetCaseDraftExitGuard"];
const fields = [{ value: "auto-id", readOnly: true }, { value: "2026-09-09" }, { value: "低" }, { value: "" }];
const listeners = new Set();
const otherGuard = () => {};
listeners.add(otherGuard);
const context = vm.createContext({ caseDraftBaseline: new Map(), caseDraftExitGuardAttached: false,
  caseForm: { querySelectorAll: () => fields },
  window: { addEventListener: (type, fn) => { assert.equal(type, "beforeunload"); listeners.add(fn); },
    removeEventListener: (type, fn) => { assert.equal(type, "beforeunload"); listeners.delete(fn); } } });
vm.runInContext(names.map(name => source.match(new RegExp(`function ${name}\\([^)]*\\) \\{[\\s\\S]*?\\r?\\n\\}`))?.[0]
  || assert.fail(`Missing ${name}`)).join("\n"), context);
context.resetCaseDraftExitGuard();
assert.equal(listeners.size, 1);
fields[0].value = "new-auto-id";
assert.equal(context.hasUnsavedCaseDraft(), false);
for (const field of fields.slice(1)) {
  const original = field.value;
  field.value += " synthetic edit";
  context.syncCaseDraftExitGuard();
  context.syncCaseDraftExitGuard();
  assert.equal(listeners.size, 2);
  const event = { prevented: false, preventDefault() { this.prevented = true; } };
  context.handleCaseDraftBeforeUnload(event);
  assert.equal(event.prevented, true);
  assert.equal(event.returnValue, true);
  field.value = original;
  context.syncCaseDraftExitGuard();
  assert.deepEqual([...listeners], [otherGuard]);
}
fields[3].value = "draft";
context.syncCaseDraftExitGuard();
fields[3].value = "";
context.resetCaseDraftExitGuard();
assert.deepEqual([...listeners], [otherGuard]);
context.handleCaseDraftBeforeUnload({ preventDefault: () => assert.fail("Reset draft warned") });
console.log("Case draft exit: edit/undo/date/select/readonly ID/reset and separate readout guard passed; no storage or I/O");
