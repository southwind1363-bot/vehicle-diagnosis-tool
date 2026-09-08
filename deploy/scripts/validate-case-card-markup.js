import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync(new URL("../script.js", import.meta.url), "utf8");
const code = ["renderCaseCards", "handleCaseDelete", "escapeHtml"].map(name => source.match(new RegExp(`function ${name}\\([^)]*\\) \\{[\\s\\S]*?\\r?\\n\\}`))[0]).join("\n");
const node = () => ({ children: [], button: { dataset: {} }, querySelector() { return this.button; }, appendChild(child) { this.children.push(child); } });
let writes = 0;
const context = vm.createContext({ document: { createElement: node, createDocumentFragment: node }, caseDeleteTargets: new WeakMap(), NO_DATA: "未記録", formatDateTime: () => "日時", confirm: () => true, renderCases() {}, renderSimilarCases() {}, persistCases(records) { writes++; context.savedCases = records; return true; } });
vm.runInContext(code, context);
let checks = 0;
for (const id of ['plain', 'case" data-extra="injected', '<span data-injected>text</span>', "'&特殊\"<>"]) {
  const records = [{ id, model: "模擬車両" }];
  const before = JSON.stringify(records);
  const container = node();
  context.renderCaseCards(container, records, "empty");
  const markup = container.children[0].children[0].innerHTML;
  assert.ok(markup.includes(`data-delete-case="${context.escapeHtml(id)}"`));
  assert.equal((markup.match(/data-delete-case="/g) || []).length, 1);
  assert.equal(markup.includes('<span data-injected>'), false);
  assert.equal(JSON.stringify(records), before);
  checks += 4;
}
for (const ids of [[17, "17"], ["same", "same"], [true, "true"], [{ value: 1 }, { value: 1 }]]) {
  const records = ids.map((id, i) => ({ id, model: `record-${i}` }));
  context.savedCases = records;
  const container = node();
  context.renderCaseCards(container, records, "empty");
  const button = container.children[0].children[0].button;
  button.dataset.deleteCase = String(ids[0]);
  const event = { target: { closest: () => button } };
  context.confirm = () => false;
  const beforeCancel = writes;
  context.handleCaseDelete(event);
  assert.equal(writes, beforeCancel, "Cancelled deletion must not write storage");
  assert.equal(context.savedCases, records);
  context.confirm = () => true;
  context.handleCaseDelete(event);
  assert.deepEqual(Array.from(context.savedCases), [records[1]], "Delete only the selected record, regardless of ID type or collisions");
  const beforeWrites = writes;
  context.handleCaseDelete(event);
  assert.equal(writes, beforeWrites, "Stale button must not write storage");
  checks += 4;
}
console.log(`Case card markup checks: ${checks} / Errors: 0`);
