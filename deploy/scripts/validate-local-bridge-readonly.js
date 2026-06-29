import { createLocalBridgeApp } from "../local-bridge-readonly.js";

const failures = [];
const token = "local-bridge-test-token";
const server = createLocalBridgeApp({ pairingToken: token, bridgeVersion: "test-bridge" });

function check(condition, message) {
  if (!condition) failures.push(message);
}

function post(port, intent, pairingToken = token) {
  return fetch(`http://127.0.0.1:${port}/v1/bridge`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Origin": "https://tool.mukiguri.com" },
    body: JSON.stringify({
      request_id: `test-${intent}`,
      api_version: "v1",
      intent,
      timestamp: new Date().toISOString(),
      pairing_token: pairingToken,
      data: {}
    })
  }).then((response) => response.json());
}

const port = await new Promise((resolve) => {
  server.listen(0, "127.0.0.1", () => resolve(server.address().port));
});

try {
  const health = await fetch(`http://127.0.0.1:${port}/health`).then((response) => response.json());
  check(health.ok === true, "health endpoint did not respond ok");
  check(health.vehicle_command_enabled === false, "health endpoint enabled vehicle commands");

  const preflight = await fetch(`http://127.0.0.1:${port}/v1/bridge`, {
    method: "OPTIONS",
    headers: { Origin: "http://127.0.0.1:3001", "Access-Control-Request-Method": "POST" }
  });
  check(preflight.status === 204, "CORS preflight did not return 204");
  check(preflight.headers.get("access-control-allow-origin") === "http://127.0.0.1:3001", "local CORS origin was not allowed");

  const status = await post(port, "bridge_status");
  check(status.ok === true && status.blocked === false, "bridge_status did not return ok");
  check(status.would_transmit === false, "bridge_status would transmit");
  check(status.data.vehicle_command_enabled === false, "bridge status enabled vehicle commands");
  check(status.data.sample_mode === true, "bridge status did not mark sample mode");

  const vci = await post(port, "list_vci");
  check(vci.data.devices.length === 1, "list_vci did not return sample VCI");
  check(vci.data.devices[0].connected === true, "sample VCI was not connected");

  const dtc = await post(port, "read_stored_dtc");
  check(dtc.data.dtcs.some((item) => item.code === "P0171"), "stored DTC response did not include P0171");
  check(dtc.data.ecu_responses[0].ecu === "7E8", "stored DTC response did not include ECU address");

  const live = await post(port, "read_live_pid_snapshot");
  check(live.data.values.some((item) => item.id === "engine_speed" && item.value === 1726), "live PID response did not include engine speed");
  check(live.data.values.some((item) => item.id === "control_module_voltage"), "live PID response did not include module voltage");

  const blockedWrite = await post(port, "clear_dtc");
  check(blockedWrite.ok === false && blockedWrite.blocked === true, "write intent was not blocked");
  check(blockedWrite.would_transmit === false, "blocked write intent would transmit");

  const badToken = await post(port, "bridge_status", "wrong-token-value");
  check(badToken.ok === false && badToken.errors.includes("pairing_token_mismatch"), "bad token was not rejected");

  const unknown = await post(port, "unknown_intent");
  check(unknown.ok === false && unknown.errors.includes("unknown_intent"), "unknown intent was not rejected");
} finally {
  await new Promise((resolve) => server.close(resolve));
}

if (failures.length) {
  failures.forEach((failure) => console.error(`ERROR: ${failure}`));
  process.exitCode = 1;
} else {
  console.log("Local bridge read-only checks: 17");
  console.log("Errors: 0");
}
