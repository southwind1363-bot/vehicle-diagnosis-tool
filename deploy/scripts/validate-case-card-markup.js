import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync(new URL("../script.js", import.meta.url), "utf8");
const code = ["renderCaseCards", "escapeHtml"].map(name => source.match(new RegExp(`function ${name}\\([^)]*\\) \\{[\\s\\S]*?\\r?\\n\\}`))[0]).join("\n");
const node = () => ({ children: [], appendChild(child) { this.children.push(child); } });
const context = vm.createContext({ document: { createElement: node, createDocumentFragment: node }, NO_DATA: "未記録", formatDateTime: () => "日時" });
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
console.log(`Case card markup checks: ${checks} / Errors: 0`);
