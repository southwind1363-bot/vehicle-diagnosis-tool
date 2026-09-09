import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync(new URL("../script.js", import.meta.url), "utf8");
const code = source.match(/async function copyTextToClipboard\([^)]*\) \{[\s\S]*?\r?\n\}/)?.[0];
assert.ok(code);
for (const failure of ["none", "append", "focus", "select", "range", "copy", "false"]) {
  let removed = 0, copies = 0;
  const fail = stage => { if (failure === stage) throw new Error("synthetic failure"); };
  const textarea = { style: {}, setAttribute() {}, focus() { fail("focus"); }, select() { fail("select"); },
    setSelectionRange() { fail("range"); }, remove() { removed++; } };
  const context = vm.createContext({ navigator: {}, window: {}, document: {
    createElement: () => textarea, body: { appendChild() { fail("append"); } },
    execCommand() { fail("copy"); copies++; return failure !== "false"; }
  } });
  vm.runInContext(code, context);
  if (failure === "none") await context.copyTextToClipboard("synthetic consultation");
  else await assert.rejects(context.copyTextToClipboard("synthetic consultation"));
  assert.equal(removed, 1, failure + ": temporary consultation text was retained");
  assert.equal(copies, ["none", "false"].includes(failure) ? 1 : 0);
}
console.log("Legacy clipboard cleanup: append/focus/select/range/copy failure and success release temporary text; no system clipboard used");
