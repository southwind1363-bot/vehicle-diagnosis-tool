import fs from "node:fs";
import vm from "node:vm";
import assert from "node:assert/strict";

const source = fs.readFileSync(new URL("../script.js", import.meta.url), "utf8");
const html = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
const render = source.match(/function renderObdSerialSettings\(\) \{[\s\S]*?\r?\n\}/)?.[0];
assert.ok(render);
assert.equal((html.match(/id="obdDevBaudRate"/g) || []).length, 1);
assert.ok(html.indexOf('id="obdSerialSettingsPanel"') > html.indexOf('id="obdStageSetupView"'));
assert.ok(html.indexOf('id="obdSerialSettingsPanel"') < html.indexOf('id="obdDeveloperGatePanel"'));
let checks = 4;
for (const mode of ["simple", "details"]) for (const state of ["disconnected", "selecting", "opening", "initializing", "ready", "reading", "disconnecting", "unknown"]) {
  const context = {
    obdSerialSettingsPanel: { hidden: true }, obdDevBaudRate: { disabled: true, value: "115200" },
    resolveObdInterfaceId: () => "user-vci-elm327", getObdInterfaceReadoutRoute: () => ({ route: "desktop_web_serial" }),
    obdAccessUnlocked: true, obdUiMode: mode, obdDevModeUnlocked: true,
    obdBridgeOperation: null, obdSerialConnectPending: false, obdSerialDisconnectOperation: null,
    obdDevSession: { connectionState: state, port: null }
  };
  vm.createContext(context);
  vm.runInContext(render, context);
  context.renderObdSerialSettings();
  assert.equal(context.obdSerialSettingsPanel.hidden, false);
  assert.equal(context.obdDevBaudRate.disabled, state !== "disconnected");
  assert.equal(context.obdDevBaudRate.value, "115200");
  checks += 3;
  if (state !== "disconnected") continue;
  for (const field of ["obdBridgeOperation", "obdSerialConnectPending", "obdSerialDisconnectOperation"]) {
    const previous = context[field];
    context[field] = true;
    context.renderObdSerialSettings();
    assert.equal(context.obdDevBaudRate.disabled, true);
    context[field] = previous;
    checks++;
  }
  context.obdDevSession.port = {};
  context.renderObdSerialSettings();
  assert.equal(context.obdDevBaudRate.disabled, true);
  context.obdDevSession.port = null;
  context.obdDevModeUnlocked = false;
  context.renderObdSerialSettings();
  assert.equal(context.obdDevBaudRate.disabled, mode !== "simple");
  context.obdAccessUnlocked = false;
  context.renderObdSerialSettings();
  assert.equal(context.obdDevBaudRate.disabled, true);
  context.obdAccessUnlocked = true;
  context.getObdInterfaceReadoutRoute = () => ({ route: "native_connector_required" });
  context.renderObdSerialSettings();
  assert.equal(context.obdSerialSettingsPanel.hidden, true);
  assert.equal(context.obdDevBaudRate.disabled, true);
  checks += 5;
}
console.log(`Serial settings checks: ${checks} / Errors: 0`);
