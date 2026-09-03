import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync(new URL("../script.js", import.meta.url), "utf8");
const coreSource = fs.readFileSync(new URL("../obd-readonly.js", import.meta.url), "utf8");
const context = vm.createContext({ window: {}, navigator: {} });
vm.runInContext(coreSource, context);
let checks = 0;
const check = (condition, message) => { assert.ok(condition, message); checks += 1; };
const element = () => ({ children: [], append(...items) { this.children.push(...items); }, appendChild(item) { this.children.push(item); } });
context.document = { createElement: element };
context.obdOperationGrid = element();
for (const name of ["getObdOperationImplementationStatus", "renderObdOperationPlan"]) {
  const match = source.match(new RegExp(`function ${name}\\([^)]*\\) \\{[\\s\\S]*?\\r?\\n\\}`));
  assert.ok(match, `Missing ${name}`);
  vm.runInContext(match[0], context);
}
const api = context.window.ObdReadOnly;
const items = api.getVehicleOperationPlan();
const before = JSON.stringify(items);
context.renderObdOperationPlan(items);
check(context.obdOperationGrid.children.length === 7, "Operation list lost a supported operation");
for (const [index, item] of items.entries()) {
  const card = context.obdOperationGrid.children[index];
  const badge = card.children[0].children[1];
  const button = card.children.at(-1);
  const expected = item.commandClass === "state-changing"
    ? "実行通信未実装" : "PC ELM327実装済み・実機確認待ち";
  check(badge.textContent === expected && button.textContent === expected, `${item.id}: misleading implementation status`);
  check(button.disabled === true, `${item.id}: informational status enabled execution`);
  if (item.commandClass === "state-changing") {
    check(card.children[2].textContent.includes("実車送信なし"), `${item.id}: safety boundary disappeared`);
    const evidence = Object.fromEntries(api.getServiceOperationReadinessRequirements(item.id).map((check) => [check.evidenceKey, true]));
    check(api.buildServiceOperationReadiness(item.id, evidence).canExecute === false, `${item.id}: complete checklist enabled execution`);
  }
}
check(JSON.stringify(items) === before, "Rendering changed the operation contract");
const changing = items.find((item) => item.commandClass === "state-changing");
for (const value of [true, undefined, "false"]) {
  context.window.ObdReadOnly = { getServiceExperimentContract: () => ({ executionTransportImplemented: value }) };
  check(context.getObdOperationImplementationStatus(changing) === "実行未開放", "Unverified transport status implied operation availability");
}
context.window.ObdReadOnly = undefined;
check(context.getObdOperationImplementationStatus(changing) === "実行未開放", "Missing module implied operation availability");
check(context.getObdOperationImplementationStatus({ id: "future", commandClass: "read" }) === "準備状況未確認", "Unknown operation inherited ELM support");
check(!source.includes("安全検証が終わるまで車両への送信は無効にしています。"), "Blanket transmission claim contradicts existing Web Serial readout");
console.log(`Operation availability checks: ${checks} / Errors: 0`);
