import assert from "node:assert/strict";
import http from "node:http";
import fs from "node:fs";
import vm from "node:vm";
import { startLocalWorkstation } from "./start-local-workstation.js";

let checks = 0;
const check = (condition, message) => { assert.ok(condition, message); checks += 1; };
const options = { webPort: 0, bridgePort: 0, pairingToken: "workstation-test-token", j2534RegistryText: "" };
const appSource = fs.readFileSync(new URL("../script.js", import.meta.url), "utf8");
const indexSource = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
const clientSource = appSource.slice(appSource.indexOf("async function runObdLocalBridgeRead("), appSource.indexOf("const WEB_SERIAL_ADAPTER_ERROR_LINES"));
function createClient(webUrl, token, fetchRequest = fetch) {
  const context = vm.createContext({
    location: new URL(webUrl), obdDevSession: { bridgeEndpoint: null },
    obdDevModeUnlocked: true, obdBridgePairingToken: "",
    obdBridgePairingControls: {}, obdBridgePairingInput: { value: "" },
    obdBridgePairingApplyButton: {}, obdBridgePairingClearButton: {}, obdBridgePairingStatus: {},
    obdDevPasswordInput: { value: "" }, obdDevStatus: {},
    sessionStorage: { setItem: () => {}, removeItem: () => {} }, OBD_DEV_MODE_KEY: "test-mode",
    renderObdDeveloperGate: () => {}, clearRequestedInterfaceSelection: () => {},
    obdAccessUnlocked: true, obdAccessPasswordInput: { value: "" },
    OBD_ACCESS_MODE_KEY: "test-access", renderObdAccessGate: () => {},
    localStorage: { getItem: () => token }, generateId: () => "workstation-client-test",
    fetch: fetchRequest, AbortController, setTimeout, clearTimeout
  });
  const constants = ["OBD_DEV_TOKEN_KEY", "OBD_LOCAL_BRIDGE_PORTS", "OBD_LOCAL_BRIDGE_PATHS", "OBD_LOCAL_BRIDGE_TIMEOUT_MS"]
    .map((name) => appSource.match(new RegExp(`const ${name} = [^;]+;`))?.[0]).join("\n");
  vm.runInContext(`${constants}\n${clientSource}`, context);
  vm.runInContext(appSource.slice(appSource.indexOf("async function probeObdLocalBridge("), appSource.indexOf("async function listObdLocalBridgeVci(")), context);
  context.renderObdDeveloperGate = () => {
    context.obdDevStatus.textContent = "DEFAULT_GATE";
    context.renderObdBridgePairingControls();
  };
  for (const name of ["unlockObdDeveloperMode", "lockObdDeveloperMode", "lockObdAccess"]) {
    vm.runInContext(appSource.match(new RegExp(`function ${name}\\(\\) \\{[\\s\\S]*?\\r?\\n\\}`))[0], context);
  }
  return context;
}
const previousReplay = process.env.LOCAL_BRIDGE_REPLAY_LOG;
const previousPairing = process.env.LOCAL_BRIDGE_PAIRING_TOKEN;
delete process.env.LOCAL_BRIDGE_REPLAY_LOG;
delete process.env.LOCAL_BRIDGE_PAIRING_TOKEN;
try {
  const workstation = await startLocalWorkstation(options);
  const webPort = workstation.webServer.address().port;
  try {
    check(workstation.webServer.address().address === "127.0.0.1" && workstation.bridgeServer.address().address === "127.0.0.1", "Workstation must bind both servers to loopback");
    const page = await fetch(workstation.webUrl);
    check(page.status === 200 && (await page.text()).includes("obdDiagnosticFlowPanel"), "Workstation did not serve the diagnostic screen");
    const asset = await fetch(`${workstation.webUrl}/offline-assets.json`);
    const manifest = await asset.json();
    check(asset.status === 200 && manifest.asset_count > 0, "Workstation did not serve the offline manifest");
    let servedAssets = 0;
    for (const assetPath of manifest.assets) {
      const url = new URL(assetPath, `${workstation.webUrl}/`);
      assert.equal(url.origin, workstation.webUrl, "Offline asset points outside the local workstation");
      const response = await fetch(url);
      assert.equal(response.status, 200, `Unavailable local asset: ${assetPath}`);
      await response.arrayBuffer();
      servedAssets += 1;
    }
    check(servedAssets === manifest.asset_count, "Workstation did not serve every declared offline asset");
    const health = await (await fetch(`${workstation.bridgeUrl}/health`)).json();
    check(health.j2534_discovery_requested === true && health.sample_mode === false && health.replay_mode === false && health.sample_readouts_enabled === false && health.vehicle_command_enabled === false, "Workstation enabled replay, sample readouts, or vehicle commands");
    const request = async (intent, token) => (await fetch(`${workstation.bridgeUrl}/v1/request`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ api_version: "v1", request_id: "workstation-test", intent, timestamp: new Date().toISOString(), pairing_token: token })
    })).json();
    const readout = await request("read_stored_dtc", options.pairingToken);
    check(readout.ok === false && readout.errors.includes("vci_not_detected") && readout.would_transmit === false && !Object.hasOwn(readout.data, "dtcs"), "Missing VCI was replaced with sample DTC data");
    const denied = await request("read_stored_dtc", "wrong-token");
    check(denied.blocked === true && denied.errors.includes("pairing_token_mismatch"), "Workstation accepted an unpaired readout request");
    const write = await request("clear_dtc", options.pairingToken);
    check(write.blocked === true && write.errors.includes("write_intent_blocked") && write.would_transmit === false, "Workstation accepted a state-changing intent");
    check(!JSON.stringify(health).includes(options.pairingToken) && !JSON.stringify(readout).includes(options.pairingToken), "Workstation exposed its pairing token in bridge responses");
    const localEndpoint = `${workstation.webUrl}/local-bridge/v1/request`;
    const requests = [];
    const client = createClient(workstation.webUrl, options.pairingToken, (url, init) => {
      requests.push(url);
      return fetch(url, init);
    });
    const status = await client.sendObdLocalBridgeStatusIntent("bridge_status");
    check(status.ok === true && requests.length === 1 && requests[0] === localEndpoint && client.obdDevSession.bridgeEndpoint === localEndpoint, "UI did not discover its own workstation bridge first on custom ports");
    const localReadout = await client.sendObdLocalBridgeIntent("read_stored_dtc");
    check(localReadout.ok === false && localReadout.errors.includes("vci_not_detected") && localReadout.would_transmit === false && requests[1] === localEndpoint, "UI paired readout bypassed the local bridge safety checks");
    const wrongClient = createClient(workstation.webUrl, "wrong-pairing-token");
    const wrongReadout = await wrongClient.sendObdLocalBridgeIntent("read_stored_dtc");
    check(wrongReadout.blocked === true && wrongReadout.errors.includes("pairing_token_mismatch"), "Same-origin routing bypassed pairing");
    let successCalls = 0;
    await wrongClient.runObdLocalBridgeRead("DTC", "read_stored_dtc", {}, () => { successCalls += 1; });
    check(wrongClient.obdDevStatus.textContent.includes("接続キーが一致しません") && successCalls === 0, "Pairing failure was hidden by the gate render or reached success handling");
    await client.runObdLocalBridgeRead("DTC", "read_stored_dtc", {}, () => { successCalls += 1; });
    check(client.obdDevStatus.textContent.includes("VCI未検出") && client.obdDevStatus.textContent.includes("未取得") && successCalls === 0, "Missing VCI was shown as a successful read or its reason was overwritten");
    await client.runObdLocalBridgeRead("VCI一覧", "list_vci", {}, () => { successCalls += 1; });
    check(client.obdDevStatus.textContent === "VCI一覧が完了しました。" && successCalls === 1, "Successful status operation lost its completion message");
    const displayClient = createClient(workstation.webUrl, options.pairingToken);
    for (const [code, label] of [
      ["vci_not_connected", "VCIは未接続"], ["bridge_pairing_token_not_configured", "接続キーが未設定"],
      ["local_bridge_timeout", "時間切れ"], ["sample_mode_no_vehicle_readout", "サンプルモード"],
      ["write_intent_blocked", "要求は無効"], ["詳細トークンが未設定です。", "未設定"]
    ]) {
      displayClient.sendObdLocalBridgeIntent = async () => { throw new Error(code); };
      await displayClient.runObdLocalBridgeRead("確認", "read_stored_dtc", {}, () => { successCalls += 1; });
      check(displayClient.obdDevStatus.textContent.includes(label) && successCalls === 1, `Bridge failure lost its distinct reason: ${code}`);
    }
    displayClient.sendObdLocalBridgeIntent = async () => { throw new Error(`unrecognized ${options.pairingToken} C:/private/driver.dll`); };
    await displayClient.runObdLocalBridgeRead("確認", "read_stored_dtc", {}, () => { successCalls += 1; });
    check(displayClient.obdDevStatus.textContent.includes("応答を確認できません") && !displayClient.obdDevStatus.textContent.includes(options.pairingToken) && !displayClient.obdDevStatus.textContent.includes("private"), "Unknown transport error exposed raw credentials or paths");
    displayClient.sendObdLocalBridgeStatusIntent = async () => { throw new Error("local_bridge_timeout"); };
    await displayClient.probeObdLocalBridge();
    check(displayClient.obdDevStatus.textContent.includes("時間切れ"), "Bridge discovery failure was overwritten by the gate");
    client.window = { ObdReadOnly: {
      normalizeBridgeConnectionStatus: () => ({ displayStatus: "TEST_STATUS" }),
      normalizeBridgeAdapterIdentity: () => ({ adapterName: "TEST_ADAPTER" })
    } };
    client.renderObdDeveloperSessionSummary = () => {};
    client.appendObdDeveloperLog = () => {};
    await client.probeObdLocalBridge();
    check(client.obdDevStatus.textContent.includes("TEST_STATUS / TEST_ADAPTER"), "Bridge discovery result was replaced with a generic ready message");
    displayClient.sendObdLocalBridgeIntent = async () => { displayClient.obdDevModeUnlocked = false; throw new Error("pairing_token_mismatch"); };
    await displayClient.runObdLocalBridgeRead("確認", "read_stored_dtc", {}, () => { successCalls += 1; });
    check(displayClient.obdDevStatus.textContent === "DEFAULT_GATE", "Late failure overwrote the newly locked gate");
    const renewedClient = createClient(workstation.webUrl, "saved-details-token");
    renewedClient.obdBridgePairingInput.value = options.pairingToken;
    renewedClient.applyObdBridgePairingToken();
    check(renewedClient.obdBridgePairingInput.value === "" && renewedClient.obdBridgePairingToken === options.pairingToken && renewedClient.localStorage.getItem() === "saved-details-token", "Runtime pairing changed the saved unlock token or retained the input value");
    const renewedReadout = await renewedClient.sendObdLocalBridgeIntent("read_stored_dtc");
    check(renewedReadout.errors.includes("vci_not_detected") && !renewedReadout.errors.includes("pairing_token_mismatch"), "Restarted bridge did not accept the separately supplied runtime key");
    renewedClient.obdBridgePairingInput.value = "short";
    renewedClient.applyObdBridgePairingToken();
    check(renewedClient.obdBridgePairingToken === options.pairingToken && renewedClient.obdBridgePairingStatus.textContent.includes("12"), "Invalid runtime key replaced a configured key");
    renewedClient.renderObdBridgePairingControls();
    check(!JSON.stringify(renewedClient.obdDevSession).includes(options.pairingToken) && !renewedClient.obdBridgePairingStatus.textContent.includes(options.pairingToken), "Runtime key leaked into diagnostic state or status text");
    renewedClient.clearObdBridgePairingToken();
    const clearedReadout = await renewedClient.sendObdLocalBridgeIntent("read_stored_dtc");
    check(clearedReadout.errors.includes("pairing_token_mismatch") && renewedClient.obdBridgePairingClearButton.disabled, "Clearing runtime pairing failed to restore the saved-token behavior");
    renewedClient.obdBridgePairingInput.value = options.pairingToken;
    renewedClient.applyObdBridgePairingToken();
    renewedClient.lockObdDeveloperMode();
    check(renewedClient.obdBridgePairingToken === "" && renewedClient.obdBridgePairingInput.value === "" && renewedClient.obdBridgePairingControls.hidden && renewedClient.obdBridgePairingApplyButton.disabled, "Locking left runtime pairing credentials or controls active");
    renewedClient.obdBridgePairingInput.value = options.pairingToken;
    renewedClient.applyObdBridgePairingToken();
    check(renewedClient.obdBridgePairingToken === "", "Locked details accepted a runtime key");
    renewedClient.obdDevPasswordInput.value = options.pairingToken;
    renewedClient.unlockObdDeveloperMode();
    check(renewedClient.obdDevModeUnlocked === false, "Bridge pairing key bypassed the saved details lock");
    renewedClient.obdDevPasswordInput.value = "saved-details-token";
    renewedClient.unlockObdDeveloperMode();
    check(renewedClient.obdDevModeUnlocked === true && renewedClient.obdBridgePairingToken === "", "Existing details token no longer unlocks or restored a discarded runtime key");
    check(createClient(workstation.webUrl, "saved-details-token").obdBridgePairingToken === "", "Reloaded UI retained a runtime key");
    renewedClient.obdBridgePairingInput.value = options.pairingToken;
    renewedClient.applyObdBridgePairingToken();
    renewedClient.lockObdAccess();
    check(renewedClient.obdAccessUnlocked === false && renewedClient.obdBridgePairingToken === "" && renewedClient.obdBridgePairingInput.value === "", "Top-level access lock retained the runtime pairing key");
    check(indexSource.includes('id="obdBridgePairingControls" hidden') && indexSource.includes('id="obdBridgePairingInput" type="password" autocomplete="off" minlength="12"') && indexSource.includes('id="obdBridgePairingStatus" class="data-status" role="status"'), "Pairing UI lost initial hiding, password input, or accessible status");
    check(appSource.includes('obdBridgePairingApplyButton.addEventListener("click", applyObdBridgePairingToken)') && appSource.includes('obdBridgePairingClearButton.addEventListener("click", clearObdBridgePairingToken)'), "Pairing UI buttons are not connected to the tested handlers");
    const requestCountBeforeWrite = requests.length;
    await assert.rejects(client.sendObdLocalBridgeIntent("clear_dtc"));
    check(requests.length === requestCountBeforeWrite, "UI sent a forbidden write intent");
    const localRequest = (body) => fetch(localEndpoint, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body)
    });
    const blockedResponse = await localRequest({ api_version: "v1", request_id: "local-write-test", intent: "clear_dtc", timestamp: new Date().toISOString(), pairing_token: options.pairingToken });
    const localWrite = await blockedResponse.json();
    check(localWrite.blocked === true && localWrite.errors.includes("write_intent_blocked") && localWrite.would_transmit === false && blockedResponse.headers.get("cache-control") === "no-store", "Same-origin bridge accepted a write or allowed caching");
    const invalid = await (await localRequest({})).json();
    check(invalid.blocked === true && !JSON.stringify([status, localReadout, localWrite]).includes(options.pairingToken), "Local route skipped validation or exposed pairing credentials");
    check((await fetch(localEndpoint)).status === 404 && (await fetch(`${workstation.webUrl}/local-bridge/other`, { method: "POST" })).status === 404, "Local bridge route exposed an unintended method or path");
    const publicClient = createClient("https://tool.mukiguri.com", options.pairingToken);
    const publicEndpoints = Array.from(publicClient.getObdLocalBridgeEndpoints());
    check(publicEndpoints.length === 6 && publicEndpoints.every((url) => /^http:\/\/127\.0\.0\.1:(8765|17653)\/v1/.test(url)), "Public UI discovery changed or sent pairing credentials to the public origin");
    client.obdDevSession.bridgeEndpoint = "http://127.0.0.1:17653/v1";
    check(client.getObdLocalBridgeEndpoints()[0] === client.obdDevSession.bridgeEndpoint && client.getObdLocalBridgeEndpoints({ discover: true })[0] === localEndpoint, "Cached endpoint or explicit rediscovery regressed");
    const fallbackRequests = [];
    const legacyClient = createClient(workstation.webUrl, options.pairingToken, (url, init) => {
      fallbackRequests.push(url);
      return url === localEndpoint ? Promise.resolve(new Response(null, { status: 404 })) : fetch(`${workstation.bridgeUrl}/v1/request`, init);
    });
    const fallbackStatus = await legacyClient.sendObdLocalBridgeStatusIntent("bridge_status");
    check(fallbackStatus.ok === true && fallbackRequests.length === 2 && fallbackRequests[1] === publicEndpoints[0], "Legacy static UI did not fall back to the existing separate bridge");
    await assert.rejects(startLocalWorkstation({ ...options, webPort }), { code: "EADDRINUSE" });
    check((await fetch(workstation.webUrl)).status === 200, "A competing launcher stopped the existing workstation");
  } finally {
    await workstation.close();
    await workstation.close();
  }
  check(!workstation.webServer.listening && !workstation.bridgeServer.listening, "Workstation shutdown left a listener behind");
  const occupied = http.createServer((request, response) => response.end("occupied"));
  await new Promise((resolve) => occupied.listen(0, "127.0.0.1", resolve));
  try {
    await assert.rejects(startLocalWorkstation({ ...options, webPort, bridgePort: occupied.address().port }), { code: "EADDRINUSE" });
    const retry = await startLocalWorkstation({ ...options, webPort, pairingToken: undefined });
    try {
      check(retry.webServer.listening && occupied.listening, "Failed bridge startup leaked the UI port or stopped the occupied server");
      check(/^[0-9a-f]{48}$/.test(retry.pairingToken) && retry.pairingToken !== options.pairingToken, "Workstation did not generate a runtime pairing token when none was configured");
    } finally {
      await retry.close();
    }
  } finally {
    await new Promise((resolve) => occupied.close(resolve));
  }
  await assert.rejects(startLocalWorkstation({ ...options, webPort: -1 }), /invalid_workstation_port/);
  await assert.rejects(startLocalWorkstation({ ...options, pairingToken: "short" }), /workstation_pairing_token_too_short/);
  check(true, "Invalid settings rejected");
  process.env.LOCAL_BRIDGE_REPLAY_LOG = "must-not-be-read.log";
  await assert.rejects(startLocalWorkstation(options), /workstation_replay_not_allowed/);
  check(true, "Inherited replay rejected");
} finally {
  if (previousReplay === undefined) delete process.env.LOCAL_BRIDGE_REPLAY_LOG;
  else process.env.LOCAL_BRIDGE_REPLAY_LOG = previousReplay;
  if (previousPairing === undefined) delete process.env.LOCAL_BRIDGE_PAIRING_TOKEN;
  else process.env.LOCAL_BRIDGE_PAIRING_TOKEN = previousPairing;
}
console.log(`Local workstation checks: ${checks}\nErrors: 0`);
