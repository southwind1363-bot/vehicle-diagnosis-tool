import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { client, attachWire } from "./fixtures/serial-runtime-harness.js";
const source = fs.readFileSync(new URL("../script.js", import.meta.url), "utf8");
const render = source.match(/function renderObdSettingsObservation\([^\n]*\) \{[\s\S]*?\r?\n\}/)[0];
let checks = 0;
const check = (value, message) => { assert.ok(value, message); checks++; };
function view(c) {
  const panel = { hidden: true, open: false }, status = { textContent: "" };
  c.context.document = { querySelector: id => id === "#obdSettingsObservationDetails" ? panel : status };
  vm.runInContext(render, c.context);
  c.context.renderObdDeveloperGate = () => c.context.renderObdSettingsObservation();
  return { panel, status, render: c.context.renderObdSettingsObservation };
}
function cleared(v, label) {
  check(v.panel.hidden && !v.panel.open && v.status.textContent === "", `${label}: clear stale text and collapse`);
}
for (const size of [1, 7, 32768]) {
  const c = client(), v = view(c), wire = attachWire(c, size);
  try {
    v.render(); cleared(v, "no observation");
    await c.context.initializeElmDeveloperAdapter();
    check(!v.panel.hidden && v.status.textContent.includes("通信番号は未観測"), "initialization displays incomplete observation");
    v.panel.open = true;
    await c.context.captureObdDeveloperProtocolAfterStoredDtc();
    check(v.panel.open && v.status.textContent.includes("通信番号: A6"), "protocol refresh preserves expanded details");
    check(v.status.textContent.includes("CAN自動整形・DLC表示・アドレス方式が未確認") && v.status.textContent.includes("保証ではありません"), "known limitations stay visible");
    check(!v.status.textContent.includes("ELM327") && !v.status.textContent.includes("OK"), "raw responses are not displayed");
    assert.deepEqual(wire.writes, ["ATZ\r", "ATE0\r", "ATL0\r", "ATS0\r", "ATH1\r", "ATSP0\r", "ATDP\r", "ATDPN\r"]); checks++;
    c.pagehide(); cleared(v, "pagehide");
  } finally { await wire.close(); }
}
for (const event of ["reset", "disconnect", "access_lock", "developer_lock", "preview", "reader_changed", "repeat_protocol"]) {
  const c = client(), v = view(c);
  await c.context.initializeElmDeveloperAdapter(); await c.context.captureObdDeveloperProtocolAfterStoredDtc();
  v.panel.open = true;
  if (event === "reset") c.context.resetWebSerialConnectionAttemptMetadata();
  if (event === "disconnect") void c.context.disconnectObdDeveloperVci({ reason: "device_disconnected" });
  if (event === "access_lock") c.context.obdAccessUnlocked = false;
  if (event === "developer_lock") c.context.obdDevModeUnlocked = false;
  if (event === "preview") c.context.obdDevSession.previewMode = true;
  if (event === "reader_changed") c.context.obdDevSession.reader = {};
  if (event === "repeat_protocol") await c.context.captureObdDeveloperProtocolAfterStoredDtc();
  if (["access_lock", "developer_lock", "preview", "reader_changed"].includes(event)) v.render();
  cleared(v, event);
}
{
  const c = client(null, "ATZ"), v = view(c), pending = c.context.initializeElmDeveloperAdapter();
  await c.reached.promise;
  check(!v.panel.hidden && v.status.textContent.includes("初期化応答を記録中"), "pending initialization is distinct");
  c.wait.resolve(); await pending;
}
for (const command of ["ATS0", "ATDP", "ATDPN"]) {
  const c = client(command), v = view(c);
  if (command === "ATS0") await assert.rejects(c.context.initializeElmDeveloperAdapter());
  else { await c.context.initializeElmDeveloperAdapter(); await c.context.captureObdDeveloperProtocolAfterStoredDtc(); }
  cleared(v, command);
}
console.log(`Settings observation view: ${checks} checks passed; production lifecycle with synthetic transport only`);
