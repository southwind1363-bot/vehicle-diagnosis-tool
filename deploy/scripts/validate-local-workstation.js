import assert from "node:assert/strict";
import http from "node:http";
import fs from "node:fs";
import vm from "node:vm";
import { startLocalWorkstation } from "./start-local-workstation.js";

let checks = 0;
const check = (condition, message) => { assert.ok(condition, message); checks += 1; };
const options = { webPort: 0, bridgePort: 0, pairingToken: "workstation-test-token", j2534RegistryText: "" };
const appSource = fs.readFileSync(new URL("../script.js", import.meta.url), "utf8");
const clientSource = appSource.slice(appSource.indexOf("async function fetchObdLocalBridgeEndpoint("), appSource.indexOf("const WEB_SERIAL_ADAPTER_ERROR_LINES"));
function createClient(webUrl, token, fetchRequest = fetch) {
  const context = vm.createContext({
    location: new URL(webUrl), obdDevSession: { bridgeEndpoint: null },
    localStorage: { getItem: () => token }, generateId: () => "workstation-client-test",
    fetch: fetchRequest, AbortController, setTimeout, clearTimeout
  });
  const constants = ["OBD_DEV_TOKEN_KEY", "OBD_LOCAL_BRIDGE_PORTS", "OBD_LOCAL_BRIDGE_PATHS", "OBD_LOCAL_BRIDGE_TIMEOUT_MS"]
    .map((name) => appSource.match(new RegExp(`const ${name} = [^;]+;`))?.[0]).join("\n");
  vm.runInContext(`${constants}\n${clientSource}`, context);
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
    await assert.rejects(client.sendObdLocalBridgeIntent("clear_dtc"));
    check(requests.length === 2, "UI sent a forbidden write intent");
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
