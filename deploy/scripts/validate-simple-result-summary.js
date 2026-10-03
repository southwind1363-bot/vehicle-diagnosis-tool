import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync(new URL("../script.js", import.meta.url), "utf8");
const render = source.match(/function renderObdSimpleResultSummary\([^)]*\) \{[\s\S]*?\r?\n\}/)?.[0];
assert.ok(render, "Missing result summary renderer");
const element = () => ({ children: [], textContent: "", hidden: false,
  append(...nodes) { this.children.push(...nodes); },
  appendChild(node) { this.children.push(node); },
  setAttribute() {}, addEventListener() {} });
const context = vm.createContext({
  document: { createElement: element }, NO_DATA: "未取得", obdDevSession: {},
  obdPrintSourceWarning: element(), obdSimpleResultSummary: element(),
  obdSimpleResultBadge: element(), obdSimpleResultGrid: element(), obdSimpleResultNote: element(),
  formatObdBridgeDtcStatusSummary: () => "", formatObdDtcReadoutStatusSummary: () => "",
  formatObdSimpleFreezeFrameTriggerSummary: () => "", formatObdBridgeReadinessSummary: () => "",
  scrollToObdSection() {}
});
vm.runInContext(render, context);
let checks = 0;
const display = session => {
  const original = structuredClone(session);
  context.obdSimpleResultGrid.children = [];
  context.renderObdSimpleResultSummary(session);
  assert.deepEqual(session, original, "Rendering changed the recorded facts");
  checks++;
  return context.obdSimpleResultGrid.children.map(item => ({
    value: item.children[1].textContent, state: item.children[3].textContent
  }));
};
for (const value of [null, undefined, "", "  ", false, true, [], [0], {}, NaN, Infinity]) {
  const cards = display({ readout_coverage: { captured_percent: value }, core_session_status: { completion_percent: value },
    readiness_snapshot: { monitor_count: value, monitors: [{}, {}] },
    ecu_info_snapshot: { item_count: value, items: [{}, {}] },
    onboard_monitor_snapshot: { test_count: value, tests: [{}, {}] },
    supported_pid_matrix: { supported_pid_count: value, supported_pids: ["0C", "0D"] } });
  assert.equal(cards[7].value, "未集計", "Missing or malformed percentage became a numeric result");
  assert.equal(cards[7].state, "状態未集計");
  for (const index of [3, 4, 5, 6]) assert.ok(cards[index].value.startsWith("2"), "Invalid count hid recorded entries");
  checks += 6;
  assert.equal(display({ readout_coverage: { captured_percent: value }, core_session_status: { completion_percent: 50 } })[7].value,
    "50%", "Invalid coverage hid a recorded completion percentage");
  checks++;
}
for (const [value, expected] of [[0, "0%"], [50, "50%"], [100, "100%"], ["0", "0%"], ["50", "50%"], ["100", "100%"]]) {
  for (const session of [{ readoutCoverage: { capturedPercent: value } }, { core_session_status: { completion_percent: value } }]) {
    const cards = display(session);
    assert.equal(cards[7].value, expected, "Recorded numeric percentage changed");
    assert.equal(cards[7].state, expected === "100%" ? "完了" : "未完了");
    checks += 2;
  }
}
const zero = display({ ecuInfoSnapshot: { itemCount: 0, items: [] }, readoutCoverage: { itemById: { ecu_info_snapshot: { status: "empty" } } } });
assert.equal(zero[4].value, "0項目");
assert.equal(zero[4].state, "応答0件");
assert.equal(display({})[4].value, "未取得");
checks += 3;
for (const [index, id, field, unit] of [
  [0, "dtc_snapshot", "dtcs", "件"], [1, "freeze_frame_snapshot", "monitor_values", "項目"],
  [2, "live_pid_snapshot", "monitor_values", "項目"], [3, "readiness_snapshot", "monitors", "項目"],
  [4, "ecu_info_snapshot", "items", "項目"], [5, "supported_pid_matrix", "supported_pids", "件"],
  [6, "onboard_monitor_snapshot", "tests", "件"]
]) {
  for (const status of ["missing", "empty", "captured", "unknown"]) {
    for (const count of [0, 1]) {
      const card = display({ [id]: { [field]: Array.from({ length: count }, () => ({})) },
        readout_coverage: { item_by_id: { [id]: { status } } } })[index];
      assert.equal(card.value, count === 0 && status === "missing" ? "未取得" : `${count}${unit}`,
        `${id}: missing readout became zero, or existing entries were hidden`);
      assert.equal(card.state, status === "missing" ? "未取得" : status === "empty"
        ? index === 0 ? "コード0件" : "応答0件" : status === "captured" ? "取得済み" : "状態未集計",
      "Count presentation changed the recorded coverage classification");
      checks += 2;
    }
  }
}
console.log(`Simple result summary checks: ${checks} / Errors: 0`);
