import assert from "node:assert/strict";
import http from "node:http";
import { startLocalWorkstation } from "./start-local-workstation.js";

let checks = 0;
const check = (condition, message) => { assert.ok(condition, message); checks += 1; };
const options = { webPort: 0, bridgePort: 0, pairingToken: "workstation-test-token", j2534RegistryText: "" };
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
