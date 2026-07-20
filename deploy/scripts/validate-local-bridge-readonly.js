import { createLocalBridgeApp, decodeReplayLog } from "../local-bridge-readonly.js";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const failures = [];
const token = "local-bridge-test-token";
const server = createLocalBridgeApp({ pairingToken: token, bridgeVersion: "test-bridge" });
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const monitorDefinitionRows = JSON.parse(fs.readFileSync(path.join(scriptDir, "..", "data", "obd-monitor-definitions.json"), "utf8"));
const monitorDefinitionIds = new Set(monitorDefinitionRows.map((row) => row.id));
const bridgeComputedValueIds = new Set([
  "mil_status",
  "stored_dtc_count",
  "readiness_status_byte_b",
  "readiness_status_byte_c",
  "readiness_status_byte_d",
  "readiness_flag_count"
]);

function check(condition, message) {
  if (!condition) failures.push(message);
}

function isDtcCode(value) {
  return /^[BCPU][0-3][0-9A-F]{3}$/.test(String(value || ""));
}

function ecuResponseCodes(payload) {
  return (payload?.data?.ecu_responses || []).flatMap((item) => item.dtcs || []);
}

function hasUniqueDtcCodes(items) {
  const codes = (items || []).map((item) => item.code);
  return new Set(codes).size === codes.length;
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
  check(health.sample_mode === true && health.replay_mode === false, "default bridge health did not distinguish sample mode from replay mode");

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
  check(status.data.vci_connected === false && status.data.vehicle_connected === false, "sample bridge incorrectly reported a physical VCI or vehicle connection");

  const vci = await post(port, "list_vci");
  check(vci.data.devices.length === 1, "list_vci did not return sample VCI");
  check(vci.data.devices[0].connected === false && vci.data.devices[0].sample_mode === true && vci.data.devices[0].replay_mode === false, "sample VCI was not clearly marked as disconnected sample data");

  const adapterIdentity = await post(port, "adapter_identity");
  check(adapterIdentity.data.adapter_name === "Read-only Local Bridge Sample", "adapter_identity did not return sample adapter name");
  check(adapterIdentity.data.adapter_family === "local_bridge_sample", "adapter_identity did not return adapter family");
  check(adapterIdentity.data.vehicle_command_enabled === false, "adapter_identity enabled vehicle commands");
  const publicStatus = await post(port, "bridge_status", "");
  check(publicStatus.ok === true && publicStatus.blocked === false, "public bridge_status should work without pairing token");
  const publicAdapterIdentity = await post(port, "adapter_identity", "");
  check(publicAdapterIdentity.ok === true && publicAdapterIdentity.blocked === false, "public adapter_identity should work without pairing token");
  const publicVci = await post(port, "list_vci", "");
  check(publicVci.ok === true && publicVci.blocked === false, "public list_vci should work without pairing token");

  const dtc = await post(port, "read_stored_dtc");
  check(dtc.data.dtcs.some((item) => item.code === "P0171"), "stored DTC response did not include P0171");
  check(dtc.data.ecu_responses[0].ecu === "7E8", "stored DTC response did not include ECU address");
  check(dtc.data.dtcs.every((item) => isDtcCode(item.code) && item.status === "stored"), "stored DTC response included an invalid code or status");
  check(dtc.data.dtcs.every((item) => ecuResponseCodes(dtc).includes(item.code)), "stored DTC response did not match ECU response DTC list");
  check(hasUniqueDtcCodes(dtc.data.dtcs), "stored DTC response included duplicate codes");
  const pendingDtc = await post(port, "read_pending_dtc");
  check(pendingDtc.data.dtcs.every((item) => isDtcCode(item.code) && item.status === "pending"), "pending DTC response included an invalid code or status");
  check(pendingDtc.data.dtcs.every((item) => ecuResponseCodes(pendingDtc).includes(item.code)), "pending DTC response did not match ECU response DTC list");
  check(hasUniqueDtcCodes(pendingDtc.data.dtcs), "pending DTC response included duplicate codes");
  const permanentDtc = await post(port, "read_permanent_dtc");
  check(permanentDtc.data.dtcs.some((item) => item.code === "P0300" && item.status === "permanent"), "permanent DTC response did not include sample P0300");
  check(permanentDtc.data.dtcs.every((item) => isDtcCode(item.code) && item.status === "permanent"), "permanent DTC response included an invalid code or status");
  check(permanentDtc.data.dtcs.every((item) => ecuResponseCodes(permanentDtc).includes(item.code)), "permanent DTC response did not match ECU response DTC list");

  const freezeFrame = await post(port, "read_freeze_frame");
  check(freezeFrame.data.trigger_dtc === "P0171", "freeze frame response did not include trigger DTC");
  check(freezeFrame.data.values.some((item) => item.id === "engine_speed"), "freeze frame response did not include engine speed");

  const supportedPids = await post(port, "read_supported_pids");
  check(supportedPids.data.supported_pids.includes("0C"), "supported PID response did not include engine speed PID");
  check(supportedPids.data.supported_pids.every((pid) => /^[0-9A-F]{2}$/.test(pid)), "supported PID response included invalid PID format");

  const ecuInfo = await post(port, "read_ecu_info");
  check(ecuInfo.data.values.some((item) => item.id === "supported_info_types_00" && item.value === "55 60 00 00"), "ECU info response did not include supported info types");
  check(ecuInfo.data.values.some((item) => item.id === "calibration_id" && item.value === "CAL-1234"), "ECU info response did not include sample CALID");
  check(ecuInfo.data.values.some((item) => item.id === "ecu_name" && item.value === "Engine ECU"), "ECU info response did not include sample ECU name");
  check(ecuInfo.data.values.some((item) => item.id === "vin"), "ECU info response did not include sample VIN for downstream redaction checks");

  const onboardMonitor = await post(port, "read_onboard_monitor");
  check(onboardMonitor.data.tests.some((item) => item.test_id === "01" && item.value === 100), "on-board monitor response did not include sample passing test");
  check(onboardMonitor.data.tests.some((item) => item.test_id === "02" && item.value === 300), "on-board monitor response did not include sample failing test");

  const live = await post(port, "read_live_pid_snapshot");
  check(live.data.values.some((item) => item.id === "engine_speed" && item.value === 1726), "live PID response did not include engine speed");
  check(live.data.values.some((item) => item.id === "map" && item.value === 40), "live PID response did not include sample MAP");
  check(live.data.values.some((item) => item.id === "maf" && item.value === 6.55), "live PID response did not include sample MAF");
  check(live.data.values.some((item) => item.id === "fuel_rail_pressure_vacuum" && item.value === 20.22), "live PID response did not include sample fuel rail vacuum pressure");
  check(live.data.values.some((item) => item.id === "fuel_rail_pressure" && item.value === 2000), "live PID response did not include sample fuel rail pressure");
  check(live.data.values.some((item) => item.id === "fuel_system_status_bank1" && item.value === "closed_loop_oxygen_sensor_feedback"), "live PID response did not include sample fuel system status bank 1");
  check(live.data.values.some((item) => item.id === "secondary_air_status" && item.value === "upstream_of_catalytic_converter"), "live PID response did not include sample secondary air status");
  check(live.data.values.some((item) => item.id === "oxygen_sensors_present" && item.value === "b1s1,b1s2"), "live PID response did not include sample oxygen sensor locations");
  check(live.data.values.some((item) => item.id === "obd_standard" && item.value === "eobd_and_obd_ii"), "live PID response did not include sample OBD standard");
  check(live.data.values.some((item) => item.id === "oxygen_sensors_present_4banks" && item.value === "b1s1,b1s2"), "live PID response did not include sample four-bank oxygen sensor locations");
  check(live.data.values.some((item) => item.id === "auxiliary_input_status" && item.value === "pto_inactive"), "live PID response did not include sample auxiliary input status");
  check(live.data.values.some((item) => item.id === "control_module_voltage"), "live PID response did not include module voltage");
  check(live.data.supported_pids.includes("8E"), "live PID response did not advertise friction torque support");
  check(live.data.values.some((item) => item.id === "engine_friction_torque" && item.value === -5), "live PID response did not include sample friction torque");
  check(live.data.supported_pids.includes("59"), "live PID response did not advertise absolute fuel rail pressure support");
  check(live.data.values.some((item) => item.id === "fuel_rail_pressure_absolute" && item.value === 2000), "live PID response did not include sample absolute fuel rail pressure");
  check(live.data.values.some((item) => item.id === "fuel_type" && item.value === "diesel"), "live PID response did not include sample fuel type");
  check(live.data.values.some((item) => item.id === "auxiliary_io_supported" && item.value === "mask_80"), "live PID response did not include sample auxiliary IO support mask");
  check(live.data.values.some((item) => item.id === "maf_sensor_status" && item.value === "mask_01"), "live PID response did not include sample MAF sensor status mask");
  check(live.data.values.some((item) => item.id === "commanded_diesel_intake_air_flow" && item.value === 50.2), "live PID response did not include sample diesel intake air flow command");
  check(live.data.values.some((item) => item.id === "commanded_throttle_control" && item.value === 50.2), "live PID response did not include sample diesel throttle control command");
  check(live.data.values.length >= 40, "live PID sample response did not include expanded monitor values");
  check(live.data.values.every((item) => monitorDefinitionIds.has(item.id)), "live PID sample response included an id not registered in monitor definitions");
  check(live.data.values.every((item) => live.data.supported_pids.includes(item.pid)), "live PID sample response included a pid not advertised as supported");

  const blockedWrite = await post(port, "clear_dtc");
  check(blockedWrite.ok === false && blockedWrite.blocked === true, "write intent was not blocked");
  check(blockedWrite.would_transmit === false, "blocked write intent would transmit");

  const badToken = await post(port, "read_stored_dtc", "wrong-token-value");
  check(badToken.ok === false && badToken.errors.includes("pairing_token_mismatch"), "bad token was not rejected");

  const unknown = await post(port, "unknown_intent");
  check(unknown.ok === false && unknown.errors.includes("unknown_intent"), "unknown intent was not rejected");
} finally {
  await new Promise((resolve) => server.close(resolve));
}

const replayLog = [
  "can0 7E8#0643000001710300",
  "can0 7E8#0341030200",
  "can0 7E8#06410181070000",
  "can0 7E8#03410680",
  "can0 7E8#03410799",
  "can0 7E8#0341087A",
  "can0 7E8#03410988",
  "can0 7E8#03410A28",
  "can0 7E8#04410C1AF8",
  "can0 7E8#03410E80",
  "can0 7E8#03410F50",
  "can0 7E8#0441140180",
  "can0 7E8#03411201",
  "can0 7E8#03411303",
  "can0 7E8#03411C07",
  "can0 7E8#03411D03",
  "can0 7E8#03411E00",
  "can0 7E8#04411F0258",
  "can0 7E8#0441210064",
  "can0 7E8#0441220100",
  "can0 7E8#04412300C8",
  "can0 7E8#06412480004000",
  "can0 7E8#03412C80",
  "can0 7E8#03412D90",
  "can0 7E8#03412E40",
  "can0 7E8#03412F80",
  "can0 7E8#03413005",
  "can0 7E8#0441310078",
  "can0 7E8#0441320100",
  "can0 7E8#03413364",
  "can0 7E8#06413480008100",
  "can0 7E8#04413C0FA0",
  "(171234.123456) can0 7E8#0341057B",
  "0.001,7E8,false,Rx,0,4,41,42,37,78",
  "can0 7E8#0441430100",
  "can0 7E8#0441448000",
  "can0 7E8#03414580",
  "can0 7E8#03414650",
  "can0 7E8#03414780",
  "can0 7E8#03414840",
  "can0 7E8#03414960",
  "can0 7E8#03414A70",
  "can0 7E8#03414B90",
  "can0 7E8#03414C80",
  "can0 7E8#04414D003C",
  "can0 7E8#04414E0078",
  "can0 7E8#03415104",
  "can0 7E8#03415240",
  "can0 7E8#04415900C8",
  "can0 7E8#03415A80",
  "can0 7E8#03415B90",
  "can0 7E8#03415C64",
  "can0 7E8#04415D6D00",
  "can0 7E8#04415E0064",
  "can0 7E8#0341618C",
  "can0 7E8#03416296",
  "can0 7E8#0441630190",
  "can0 7E8#0741647D82878C91",
  "can0 7E8#03416580",
  "can0 7E8#03416601",
  "can0 7E8#03416A80",
  "can0 7E8#03416C80",
  "can0 7E8#03418E78",
  "can0 7E8#0749000155600000",
  "can0 7E8#0749080100000001",
  "can0 7E8#0C49040143414C2D31323334",
  "can0 7E8#0C490A01456E67696E6520454355",
  "can0 7E8#07490B0100000002",
  "can0 7E8#094601010064003200C8",
  "can0 7E8#09460201012C003200C8",
  "can0 7E8#0742010081070000",
  "can0 7E8#044A044000",
  "can0 7E8#054202000171",
  "can0 7E8#04420C001AF8",
  "can0 7E8#034205007B"
].join("\n");
const replayServer = createLocalBridgeApp({ pairingToken: token, bridgeVersion: "test-bridge", replayLogText: replayLog });
const replayPort = await new Promise((resolve) => {
  replayServer.listen(0, "127.0.0.1", () => resolve(replayServer.address().port));
});

try {
  const replayStatus = await post(replayPort, "bridge_status");
  check(replayStatus.data.replay_loaded === true && replayStatus.data.replay_mode === true && replayStatus.data.sample_mode === false && replayStatus.data.vci_connected === false, "replay mode was not safely reported in bridge_status");
  const replayVci = await post(replayPort, "list_vci");
  check(replayVci.data.devices[0]?.id === "replay-readonly-input" && replayVci.data.devices[0]?.replay_mode === true && replayVci.data.devices[0]?.connected === false, "replay mode did not identify its disconnected input source");

  const replayDtc = await post(replayPort, "read_stored_dtc");
  check(replayDtc.data.dtcs.some((item) => item.code === "P0171"), "replay DTC response did not include P0171");
  check(replayDtc.data.ecu_responses[0].ecu === "7E8", "replay DTC response did not keep ECU address");
  check(replayDtc.data.dtcs.every((item) => isDtcCode(item.code) && item.status === "stored"), "replay stored DTC response included an invalid code or status");
  check(replayDtc.data.dtcs.every((item) => ecuResponseCodes(replayDtc).includes(item.code)), "replay stored DTC response did not match ECU response DTC list");
  check(hasUniqueDtcCodes(replayDtc.data.dtcs), "replay stored DTC response included duplicate codes");
  check(!replayDtc.data.dtcs.some((item) => item.code === "P0440"), "replay stored DTC response promoted a permanent DTC");
  const replayPendingDtc = await post(replayPort, "read_pending_dtc");
  check(replayPendingDtc.ok === false && replayPendingDtc.errors.includes("replay_dtc_status_not_observed") && replayPendingDtc.data.dtcs.length === 0 && replayPendingDtc.data.ecu_responses.every((item) => item.dtcs.length === 0), "replay pending DTC response fabricated an empty result when its service was not observed");
  const replayPermanentDtc = await post(replayPort, "read_permanent_dtc");
  check(replayPermanentDtc.data.dtcs.some((item) => item.code === "P0440" && item.status === "permanent"), "replay permanent DTC response did not include P0440");
  check(replayPermanentDtc.data.dtcs.every((item) => item.status === "permanent" && ecuResponseCodes(replayPermanentDtc).includes(item.code)), "replay permanent DTC response did not match ECU response DTC list");

  const incompleteReplayServer = createLocalBridgeApp({ pairingToken: token, replayLogText: "can0 7E8#024301" });
  const incompleteReplayPort = await new Promise((resolve) => {
    incompleteReplayServer.listen(0, "127.0.0.1", () => resolve(incompleteReplayServer.address().port));
  });
  try {
    const incompleteReplayDtc = await post(incompleteReplayPort, "read_stored_dtc");
    check(incompleteReplayDtc.ok === false && incompleteReplayDtc.errors.includes("replay_dtc_payload_incomplete") && incompleteReplayDtc.data.dtcs.length === 0, "incomplete replay DTC payload was treated as an empty valid readout");
    const missingReplayReadouts = [
      ["read_freeze_frame", "replay_freeze_frame_not_observed"],
      ["read_supported_pids", "replay_supported_pids_not_observed"],
      ["read_ecu_info", "replay_ecu_info_not_observed"],
      ["read_onboard_monitor", "replay_onboard_monitor_not_observed"],
      ["read_live_pid_snapshot", "replay_live_pid_not_observed"]
    ];
    for (const [intent, error] of missingReplayReadouts) {
      const response = await post(incompleteReplayPort, intent);
      check(response.ok === false && response.errors.includes(error), `replay ${intent} was treated as an empty valid readout when not observed`);
    }
  } finally {
    await new Promise((resolve) => incompleteReplayServer.close(resolve));
  }

  const malformedReplayLog = [
    "can0 7E8#04420C001A",
    "can0 7E8#0441001818",
    "can0 7E8#024904",
    "can0 7E8#0446010100",
    "can0 7E8#03410C1A"
  ].join("\n");
  const malformedReplayServer = createLocalBridgeApp({ pairingToken: token, replayLogText: malformedReplayLog });
  const malformedReplayPort = await new Promise((resolve) => {
    malformedReplayServer.listen(0, "127.0.0.1", () => resolve(malformedReplayServer.address().port));
  });
  try {
    const malformedReplayReadouts = [
      ["read_freeze_frame", "replay_freeze_frame_payload_unparsed"],
      ["read_supported_pids", "replay_supported_pids_payload_incomplete"],
      ["read_ecu_info", "replay_ecu_info_payload_unparsed"],
      ["read_onboard_monitor", "replay_onboard_monitor_payload_incomplete"],
      ["read_live_pid_snapshot", "replay_live_pid_payload_unparsed"]
    ];
    for (const [intent, error] of malformedReplayReadouts) {
      const response = await post(malformedReplayPort, intent);
      check(response.ok === false && response.errors.includes(error), `replay ${intent} treated a malformed payload as an empty valid readout`);
    }
  } finally {
    await new Promise((resolve) => malformedReplayServer.close(resolve));
  }

  const replayFramingCases = [
    ["raw", "41 0C 1A F8", true],
    ["single_frame", "can0 7E8#04410C1AF8", true],
    ["dlc_single_frame", "7E8 [8] 04 41 0C 1A F8 00 00 00", true],
    ["embedded_service_byte", "can0 7E8#070001410C1AF800", false],
    ["isotp_first_frame", "can0 7E8#1010490443414C2D", false]
  ];
  for (const [name, replayText, expectedLiveReadout] of replayFramingCases) {
    const snapshot = decodeReplayLog(replayText);
    check(snapshot.readoutObserved.live_pid_snapshot === expectedLiveReadout && snapshot.liveValues.length === (expectedLiveReadout ? 1 : 0), `replay ${name} framing was accepted outside a positive response boundary`);
  }

  const replayIsoTpCases = [
    ["complete", ["can0 7E8#100B49040143414C", "can0 7E8#212D31323334"].join("\n"), true],
    ["dlc_complete", ["7E8 [8] 10 0B 49 04 01 43 41 4C", "7E8 [6] 21 2D 31 32 33 34"].join("\n"), true],
    ["csv_complete", ["2026-07-20,7E8,8,10,0B,49,04,01,43,41,4C", "2026-07-20,7E8,6,21,2D,31,32,33,34"].join("\n"), true],
    ["dlc_length_mismatch", ["7E8 [8] 10 0B 49 04 01 43 41", "7E8 [6] 21 2D 31 32 33 34"].join("\n"), false],
    ["incomplete", "can0 7E8#100B49040143414C", false],
    ["sequence_error", ["can0 7E8#100B49040143414C", "can0 7E8#222D31323334"].join("\n"), false],
    ["orphan", "can0 7E8#212D31323334", false]
  ];
  for (const [name, replayText, expectedEcuInfo] of replayIsoTpCases) {
    const snapshot = decodeReplayLog(replayText);
    const calibrationId = snapshot.ecuInfoValues.find((item) => item.id === "calibration_id")?.value || null;
    const expectedError = expectedEcuInfo ? null : name === "orphan" || name === "dlc_length_mismatch" ? null : "replay_ecu_info_transport_incomplete";
    check((calibrationId === "CAL-1234") === expectedEcuInfo && snapshot.readoutErrors.ecu_info === expectedError, `replay ISO-TP ${name} did not preserve complete-only ECU information`);
  }

  const incompleteIsoTpReplayServer = createLocalBridgeApp({ pairingToken: token, replayLogText: "can0 7E8#100B49040143414C" });
  const incompleteIsoTpReplayPort = await new Promise((resolve) => {
    incompleteIsoTpReplayServer.listen(0, "127.0.0.1", () => resolve(incompleteIsoTpReplayServer.address().port));
  });
  try {
    const incompleteIsoTpReplay = await post(incompleteIsoTpReplayPort, "read_ecu_info");
    check(incompleteIsoTpReplay.ok === false && incompleteIsoTpReplay.errors.includes("replay_ecu_info_transport_incomplete") && incompleteIsoTpReplay.data.values.length === 0, "incomplete replay ISO-TP ECU information was not reported as a transport failure");
  } finally {
    await new Promise((resolve) => incompleteIsoTpReplayServer.close(resolve));
  }

  const replayEcuInfo = await post(replayPort, "read_ecu_info");
  check(replayEcuInfo.data.values.some((item) => item.id === "supported_info_types_00" && item.value === "55 60 00 00"), "replay ECU info did not decode Mode 09 supported information types");
  check(replayEcuInfo.data.values.some((item) => item.id === "in_use_performance_tracking_spark" && item.value === "00 00 00 01"), "replay ECU info did not decode Mode 09 spark performance counters");
  check(replayEcuInfo.data.values.some((item) => item.id === "calibration_id" && item.value === "CAL-1234"), "replay ECU info did not decode CALID");
  check(replayEcuInfo.data.values.some((item) => item.id === "ecu_name" && item.value === "Engine ECU"), "replay ECU info did not decode ECU name");
  check(replayEcuInfo.data.values.some((item) => item.id === "in_use_performance_tracking_compression" && item.value === "00 00 00 02"), "replay ECU info did not decode Mode 09 compression performance counters");

  const replayMode09LeadingZero = decodeReplayLog("can0 7E8#0749000100008000");
  check(replayMode09LeadingZero.ecuInfoValues.some((item) => item.id === "supported_info_types_00" && item.value === "00 00 80 00"), "replay Mode 09 supported information types dropped leading zero bytes");
  const replayMode09CounterIsoTp = decodeReplayLog(["can0 7E8#100B490801000000", "can0 7E8#210300000004"].join("\n"));
  check(replayMode09CounterIsoTp.ecuInfoValues.some((item) => item.id === "in_use_performance_tracking_spark" && item.value === "00 00 00 03 00 00 00 04"), "replay ISO-TP Mode 09 performance counters were not retained as raw bytes");

  const replayOnboardMonitor = await post(replayPort, "read_onboard_monitor");
  check(replayOnboardMonitor.data.tests.some((item) => item.test_id === "01" && item.value === 100), "replay Mode 06 did not decode passing test");
  check(replayOnboardMonitor.data.tests.some((item) => item.test_id === "02" && item.value === 300), "replay Mode 06 did not decode failing test");

  const replayLive = await post(replayPort, "read_live_pid_snapshot");
  check(replayLive.data.values.some((item) => item.id === "engine_speed" && item.value === 1726), "replay live response did not decode engine speed");
  check(replayLive.data.values.some((item) => item.id === "coolant_temp" && item.value === 83), "replay live response did not decode coolant temperature");
  check(replayLive.data.values.some((item) => item.id === "control_module_voltage" && item.value === 14.2), "replay live response did not decode module voltage");
  check(replayLive.data.values.some((item) => item.id === "mil_status" && item.value === true), "replay live response did not decode MIL status");
  check(replayLive.data.values.some((item) => item.id === "stored_dtc_count" && item.value === 1), "replay live response did not decode stored DTC count");
  check(replayLive.data.values.some((item) => item.id === "readiness_flag_count" && item.value === 3), "replay live response did not decode readiness flags");
  check(replayLive.data.values.some((item) => item.id === "fuel_system_status_bank1" && item.value === "closed_loop_oxygen_sensor_feedback"), "replay live response did not decode fuel system status bank 1");
  check(replayLive.data.values.some((item) => item.id === "fuel_system_status_bank2" && item.value === "not_available"), "replay live response did not decode fuel system status bank 2");
  check(replayLive.data.values.some((item) => item.id === "secondary_air_status" && item.value === "upstream_of_catalytic_converter"), "replay live response did not decode secondary air status");
  check(replayLive.data.values.some((item) => item.id === "oxygen_sensors_present" && item.value === "b1s1,b1s2"), "replay live response did not decode oxygen sensor locations");
  check(replayLive.data.values.some((item) => item.id === "obd_standard" && item.value === "eobd_and_obd_ii"), "replay live response did not decode OBD standard");
  check(replayLive.data.values.some((item) => item.id === "oxygen_sensors_present_4banks" && item.value === "b1s1,b1s2"), "replay live response did not decode four-bank oxygen sensor locations");
  check(replayLive.data.values.some((item) => item.id === "auxiliary_input_status" && item.value === "pto_inactive"), "replay live response did not decode auxiliary input status");
  check(replayLive.data.values.some((item) => item.id === "stft_b1" && item.value === 0), "replay live response did not decode STFT B1");
  check(replayLive.data.values.some((item) => item.id === "ltft_b1" && item.value === 19.53), "replay live response did not decode LTFT B1");
  check(replayLive.data.values.some((item) => item.id === "fuel_pressure" && item.value === 120), "replay live response did not decode fuel pressure");
  check(replayLive.data.values.some((item) => item.id === "intake_air_temp" && item.value === 40), "replay live response did not decode intake air temperature");
  check(replayLive.data.values.some((item) => item.id === "o2_b1s1_voltage" && item.value === 0.005), "replay live response did not decode O2 B1S1 voltage");
  check(replayLive.data.values.some((item) => item.id === "engine_runtime" && item.value === 600), "replay live response did not decode engine runtime");
  check(replayLive.data.values.some((item) => item.id === "fuel_rail_pressure" && item.value === 2000), "replay live response did not decode fuel rail pressure");
  check(replayLive.data.values.some((item) => item.id === "wide_o2_b1s1_ratio" && item.value === 1), "replay live response did not decode wide O2 voltage ratio");
  check(replayLive.data.values.some((item) => item.id === "wide_o2_b1s1_voltage_wide" && item.value === 2), "replay live response did not decode wide O2 voltage");
  check(replayLive.data.values.some((item) => item.id === "commanded_egr" && item.value === 50.2), "replay live response did not decode commanded EGR");
  check(replayLive.data.values.some((item) => item.id === "egr_error" && item.value === 12.5), "replay live response did not decode EGR error");
  check(replayLive.data.values.some((item) => item.id === "commanded_evap_purge" && item.value === 25.1), "replay live response did not decode EVAP purge");
  check(replayLive.data.values.some((item) => item.id === "fuel_level" && item.value === 50.2), "replay live response did not decode fuel level");
  check(replayLive.data.values.some((item) => item.id === "warmups_since_clear" && item.value === 5), "replay live response did not decode warmups since clear");
  check(replayLive.data.values.some((item) => item.id === "distance_since_clear" && item.value === 120), "replay live response did not decode distance since clear");
  check(replayLive.data.values.some((item) => item.id === "evap_vapor_pressure" && item.value === 64), "replay live response did not decode EVAP vapor pressure");
  check(replayLive.data.values.some((item) => item.id === "barometric_pressure" && item.value === 100), "replay live response did not decode barometric pressure");
  check(replayLive.data.values.some((item) => item.id === "wide_o2_b1s1_current_ratio" && item.value === 1), "replay live response did not decode wide O2 current ratio");
  check(replayLive.data.values.some((item) => item.id === "wide_o2_b1s1_current" && item.value === 1), "replay live response did not decode wide O2 current");
  check(replayLive.data.values.some((item) => item.id === "catalyst_temp_b1s1" && item.value === 360), "replay live response did not decode catalyst temperature");
  check(replayLive.data.values.some((item) => item.id === "absolute_load" && item.value === 100.39), "replay live response did not decode absolute load");
  check(replayLive.data.values.some((item) => item.id === "commanded_equivalence_ratio" && item.value === 1), "replay live response did not decode commanded equivalence ratio");
  check(replayLive.data.values.some((item) => item.id === "relative_throttle_position" && item.value === 50.2), "replay live response did not decode relative throttle position");
  check(replayLive.data.values.some((item) => item.id === "ambient_air_temp" && item.value === 40), "replay live response did not decode ambient air temperature");
  check(replayLive.data.values.some((item) => item.id === "absolute_throttle_b" && item.value === 50.2), "replay live response did not decode absolute throttle B");
  check(replayLive.data.values.some((item) => item.id === "accelerator_position_d" && item.value === 37.65), "replay live response did not decode accelerator position D");
  check(replayLive.data.values.some((item) => item.id === "commanded_throttle_actuator" && item.value === 50.2), "replay live response did not decode commanded throttle actuator");
  check(replayLive.data.values.some((item) => item.id === "time_with_mil" && item.value === 60), "replay live response did not decode time with MIL");
  check(replayLive.data.values.some((item) => item.id === "time_since_clear" && item.value === 120), "replay live response did not decode time since clear");
  check(replayLive.data.values.some((item) => item.id === "fuel_type" && item.value === "diesel"), "replay live response did not decode fuel type");
  check(replayLive.data.values.some((item) => item.id === "ethanol_percentage" && item.value === 25.1), "replay live response did not decode ethanol percentage");
  check(replayLive.data.values.some((item) => item.id === "fuel_rail_pressure_absolute" && item.value === 2000), "replay live response did not decode absolute fuel rail pressure");
  check(replayLive.data.values.some((item) => item.id === "hybrid_battery_remaining" && item.value === 56.47), "replay live response did not decode hybrid battery remaining");
  check(replayLive.data.values.some((item) => item.id === "engine_oil_temp" && item.value === 60), "replay live response did not decode engine oil temperature");
  check(replayLive.data.values.some((item) => item.id === "fuel_injection_timing" && item.value === 8), "replay live response did not decode fuel injection timing");
  check(replayLive.data.values.some((item) => item.id === "engine_fuel_rate" && item.value === 5), "replay live response did not decode engine fuel rate");
  check(replayLive.data.values.some((item) => item.id === "driver_demand_torque" && item.value === 15), "replay live response did not decode driver demand torque");
  check(replayLive.data.values.some((item) => item.id === "actual_engine_torque" && item.value === 25), "replay live response did not decode actual engine torque");
  check(replayLive.data.values.some((item) => item.id === "engine_reference_torque" && item.value === 400), "replay live response did not decode engine reference torque");
  check(replayLive.data.values.some((item) => item.id === "engine_percent_torque_idle" && item.value === 0), "replay live response did not decode idle torque point");
  check(replayLive.data.values.some((item) => item.id === "engine_percent_torque_point4" && item.value === 20), "replay live response did not decode torque point 4");
  check(replayLive.data.values.some((item) => item.id === "auxiliary_io_supported" && item.value === "mask_80"), "replay live response did not decode auxiliary IO support mask");
  check(replayLive.data.values.some((item) => item.id === "maf_sensor_status" && item.value === "mask_01"), "replay live response did not decode MAF sensor status mask");
  check(replayLive.data.values.some((item) => item.id === "commanded_diesel_intake_air_flow" && item.value === 50.2), "replay live response did not decode diesel intake air flow command");
  check(replayLive.data.values.some((item) => item.id === "commanded_throttle_control" && item.value === 50.2), "replay live response did not decode diesel throttle control command");
  check(replayLive.data.values.some((item) => item.id === "engine_friction_torque" && item.value === -5), "replay live response did not decode engine friction torque");
  check(replayLive.data.values.every((item) => monitorDefinitionIds.has(item.id) || bridgeComputedValueIds.has(item.id)), "replay live response included an id not registered in monitor definitions or bridge computed values");
  check(replayLive.data.values.every((item) => replayLive.data.supported_pids.includes(item.pid)), "replay live response included a pid not advertised as supported");

  const replayFreezeFrame = await post(replayPort, "read_freeze_frame");
  check(replayFreezeFrame.data.trigger_dtc === "P0171", "replay freeze frame did not decode trigger DTC");
  check(replayFreezeFrame.data.values.some((item) => item.id === "engine_speed" && item.value === 1726 && item.freeze_frame_number === 0), "replay freeze frame did not decode engine speed");
  check(replayFreezeFrame.data.values.some((item) => item.id === "coolant_temp" && item.value === 83 && item.freeze_frame_number === 0), "replay freeze frame did not decode coolant temperature");
  check(replayFreezeFrame.data.values.some((item) => item.id === "mil_status" && item.value === true && item.freeze_frame_number === 0), "replay freeze frame did not decode MIL status");
  check(replayFreezeFrame.data.values.some((item) => item.id === "stored_dtc_count" && item.value === 1 && item.freeze_frame_number === 0), "replay freeze frame did not decode stored DTC count");
  check(replayFreezeFrame.data.values.some((item) => item.id === "readiness_flag_count" && item.value === 3 && item.freeze_frame_number === 0), "replay freeze frame did not decode readiness flags");
  check(replayFreezeFrame.data.values.every((item) => monitorDefinitionIds.has(item.id) || bridgeComputedValueIds.has(item.id)), "replay freeze frame included an id not registered in monitor definitions or bridge computed values");
} finally {
  await new Promise((resolve) => replayServer.close(resolve));
}

if (failures.length) {
  failures.forEach((failure) => console.error(`ERROR: ${failure}`));
  process.exitCode = 1;
} else {
  console.log("Local bridge read-only checks: 168");
  console.log("Errors: 0");
}
