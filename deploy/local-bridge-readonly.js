import http from "node:http";
import { createHash } from "node:crypto";
import { execFile, execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runJ2534NativePreflight } from "./scripts/j2534-registered-driver-native-preflight.js";

const DEFAULT_PORT = 8765;
const API_VERSION = "v1";
const J2534_REGISTRY_ROOTS = [
  "HKLM\\SOFTWARE\\PassThruSupport.04.04",
  "HKLM\\SOFTWARE\\WOW6432Node\\PassThruSupport.04.04"
];
const MAX_J2534_LIBRARY_SIZE = 64 * 1024 * 1024;
const MAX_PE_EXPORT_NAMES = 4096;
const J2534_HOST_ARCHITECTURE = process.arch === "ia32" ? "x86" : process.arch === "x64" ? "x64" : process.arch === "arm64" ? "arm64" : "unknown";
const J2534_HOST_BITNESS = J2534_HOST_ARCHITECTURE === "x86" ? 32 : J2534_HOST_ARCHITECTURE === "unknown" ? null : 64;
const J2534_WORKER_CONTRACT_VERSION = "j2534-readonly-worker-v1";
const J2534_REGISTERED_DRIVER_DESCRIPTOR_VERSION = "j2534-registered-driver-descriptor-v1";
const J2534_WORKER_SCRIPT_PATH = path.join(path.dirname(fileURLToPath(import.meta.url)), "scripts", "j2534-readonly-worker.js");
let j2534WorkerReviewActive = false;
const j2534RegisteredDriverDescriptorSecrets = new WeakMap();
const J2534_REQUIRED_API_NAMES = Object.freeze([
  "PassThruOpen",
  "PassThruClose",
  "PassThruConnect",
  "PassThruDisconnect",
  "PassThruReadMsgs",
  "PassThruWriteMsgs",
  "PassThruStartPeriodicMsg",
  "PassThruStopPeriodicMsg",
  "PassThruStartMsgFilter",
  "PassThruStopMsgFilter",
  "PassThruSetProgrammingVoltage",
  "PassThruReadVersion",
  "PassThruGetLastError",
  "PassThruIoctl"
]);
// v1 can only issue whitelisted diagnostic read queries through a separate worker.
const J2534_READONLY_REQUIRED_API_NAMES = Object.freeze([
  "PassThruOpen",
  "PassThruClose",
  "PassThruConnect",
  "PassThruDisconnect",
  "PassThruReadMsgs",
  "PassThruWriteMsgs",
  "PassThruStartMsgFilter",
  "PassThruStopMsgFilter",
  "PassThruReadVersion",
  "PassThruGetLastError"
]);
const J2534_RESTRICTED_API_NAMES = Object.freeze([
  "PassThruStartPeriodicMsg",
  "PassThruStopPeriodicMsg",
  "PassThruSetProgrammingVoltage",
  "PassThruIoctl"
]);
const J2534_IDENTITY_API_NAMES = Object.freeze([
  "PassThruOpen",
  "PassThruReadVersion",
  "PassThruClose"
]);
const REPLAY_RESPONSE_SERVICES = new Set([0x41, 0x42, 0x43, 0x46, 0x47, 0x49, 0x4A, 0x7F]);
const READ_INTENTS = new Set([
  "bridge_status",
  "list_vci",
  "adapter_identity",
  "read_stored_dtc",
  "read_pending_dtc",
  "read_permanent_dtc",
  "read_freeze_frame",
  "read_supported_pids",
  "read_ecu_info",
  "read_onboard_monitor",
  "read_readiness",
  "read_live_pid_snapshot"
]);
const SAFE_STATUS_INTENTS = new Set([
  "bridge_status",
  "list_vci",
  "adapter_identity"
]);
const BLOCKED_WRITE_INTENTS = new Set([
  "clear_dtc",
  "routine_control",
  "input_output_control",
  "security_access",
  "write_data_by_identifier",
  "request_download",
  "ecu_reset"
]);
const SAMPLE_SUPPORTED_PIDS = [
  "03", "04", "05", "06", "07", "08", "09", "0A", "0B", "0C", "0D", "0E", "0F", "10", "11", "12", "13", "1C", "1D", "1E",
  "1F", "21", "22", "23", "2C", "2D", "2E", "2F", "30", "31", "32", "33",
  "3C", "42", "43", "44", "45", "46", "47", "48", "49", "4A", "4B", "4C",
  "4D", "4E", "51", "52", "59", "5A", "5B", "5C", "5D", "5E", "61", "62", "63", "64", "65", "66", "6A", "6C", "8E"
];
const SAMPLE_LIVE_VALUES = [
  { id: "engine_speed", pid: "0C", value: 1726, unit: "rpm" },
  { id: "fuel_system_status_bank1", pid: "03", value: "closed_loop_oxygen_sensor_feedback", unit: "" },
  { id: "fuel_system_status_bank2", pid: "03", value: "not_available", unit: "" },
  { id: "coolant_temp", pid: "05", value: 83, unit: "°C" },
  { id: "vehicle_speed", pid: "0D", value: 0, unit: "km/h" },
  { id: "calculated_load", pid: "04", value: 21.6, unit: "%" },
  { id: "stft_b1", pid: "06", value: 0, unit: "%" },
  { id: "ltft_b1", pid: "07", value: 19.53, unit: "%" },
  { id: "fuel_pressure", pid: "0A", value: 120, unit: "kPa" },
  { id: "map", pid: "0B", value: 40, unit: "kPa" },
  { id: "intake_air_temp", pid: "0F", value: 40, unit: "°C" },
  { id: "maf", pid: "10", value: 6.55, unit: "g/s" },
  { id: "throttle_position", pid: "11", value: 50.2, unit: "%" },
  { id: "secondary_air_status", pid: "12", value: "upstream_of_catalytic_converter", unit: "" },
  { id: "oxygen_sensors_present", pid: "13", value: "b1s1,b1s2", unit: "" },
  { id: "obd_standard", pid: "1C", value: "eobd_and_obd_ii", unit: "" },
  { id: "oxygen_sensors_present_4banks", pid: "1D", value: "b1s1,b1s2", unit: "" },
  { id: "auxiliary_input_status", pid: "1E", value: "pto_inactive", unit: "" },
  { id: "engine_runtime", pid: "1F", value: 600, unit: "s" },
  { id: "distance_with_mil", pid: "21", value: 100, unit: "km" },
  { id: "fuel_rail_pressure_vacuum", pid: "22", value: 20.22, unit: "kPa" },
  { id: "fuel_rail_pressure", pid: "23", value: 2000, unit: "kPa" },
  { id: "commanded_egr", pid: "2C", value: 50.2, unit: "%" },
  { id: "egr_error", pid: "2D", value: 12.5, unit: "%" },
  { id: "commanded_evap_purge", pid: "2E", value: 25.1, unit: "%" },
  { id: "fuel_level", pid: "2F", value: 50.2, unit: "%" },
  { id: "warmups_since_clear", pid: "30", value: 5, unit: "count" },
  { id: "distance_since_clear", pid: "31", value: 120, unit: "km" },
  { id: "barometric_pressure", pid: "33", value: 100, unit: "kPa" },
  { id: "catalyst_temp_b1s1", pid: "3C", value: 360, unit: "°C" },
  { id: "control_module_voltage", pid: "42", value: 14.2, unit: "V" },
  { id: "absolute_load", pid: "43", value: 100.39, unit: "%" },
  { id: "commanded_equivalence_ratio", pid: "44", value: 1, unit: "λ" },
  { id: "relative_throttle_position", pid: "45", value: 50.2, unit: "%" },
  { id: "ambient_air_temp", pid: "46", value: 40, unit: "°C" },
  { id: "absolute_throttle_b", pid: "47", value: 50.2, unit: "%" },
  { id: "accelerator_position_d", pid: "49", value: 37.65, unit: "%" },
  { id: "commanded_throttle_actuator", pid: "4C", value: 50.2, unit: "%" },
  { id: "time_with_mil", pid: "4D", value: 60, unit: "min" },
  { id: "time_since_clear", pid: "4E", value: 120, unit: "min" },
  { id: "fuel_type", pid: "51", value: "diesel", unit: "" },
  { id: "ethanol_percentage", pid: "52", value: 25.1, unit: "%" },
  { id: "fuel_rail_pressure_absolute", pid: "59", value: 2000, unit: "kPa" },
  { id: "hybrid_battery_remaining", pid: "5B", value: 56.47, unit: "%" },
  { id: "engine_oil_temp", pid: "5C", value: 60, unit: "°C" },
  { id: "fuel_injection_timing", pid: "5D", value: 8, unit: "°" },
  { id: "engine_fuel_rate", pid: "5E", value: 5, unit: "L/h" },
  { id: "driver_demand_torque", pid: "61", value: 15, unit: "%" },
  { id: "actual_engine_torque", pid: "62", value: 25, unit: "%" },
  { id: "engine_reference_torque", pid: "63", value: 400, unit: "Nm" },
  { id: "auxiliary_io_supported", pid: "65", value: "mask_80", unit: "" },
  { id: "maf_sensor_status", pid: "66", value: "mask_01", unit: "" },
  { id: "commanded_diesel_intake_air_flow", pid: "6A", value: 50.2, unit: "%" },
  { id: "commanded_throttle_control", pid: "6C", value: 50.2, unit: "%" },
  { id: "engine_friction_torque", pid: "8E", value: -5, unit: "%" }
];
const SAMPLE_READINESS_DATA = {
  readiness_status_byte_a: 0x00,
  readiness_status_byte_b: 0x07,
  readiness_status_byte_c: 0x65,
  readiness_status_byte_d: 0x00
};
const SAMPLE_ECU_INFO_VALUES = [
  { id: "supported_info_types_00", info_type: "00", value: "55 60 00 00" },
  { id: "vin", info_type: "02", value: "JTDKN3DU0A0123456" },
  { id: "calibration_id", info_type: "04", value: "CAL-1234" },
  { id: "calibration_verification_number", info_type: "06", value: "CVN-ABCD" },
  { id: "ecu_name", info_type: "0A", value: "Engine ECU" }
];

function sanitizeEcuInfoValuesForBrowser(values = []) {
  let hadSensitiveIdentifier = false;
  const sanitizedValues = (Array.isArray(values) ? values : []).flatMap((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const id = String(item.id || "").trim().toLowerCase();
    const infoType = String(item.info_type || item.infoType || "").trim().toUpperCase();
    const value = typeof item.value === "string" ? item.value.trim() : "";
    const isVinItem = id === "vin" || id === "vehicle_identification_number" || infoType === "02";
    const hasVinValue = /\b[A-HJ-NPR-Z0-9]{17}\b/i.test(value);
    if (isVinItem || hasVinValue) {
      hadSensitiveIdentifier = true;
      return [];
    }
    return [{ ...item }];
  });
  return { values: sanitizedValues, hadSensitiveIdentifier };
}

function buildEcuInfoEcuSnapshots(values = [], outcomes = []) {
  const rowsByEcu = new Map();
  (Array.isArray(values) ? values : []).forEach((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return;
    const sourceEcu = String(item.source_ecu || item.sourceEcu || item.ecu || item.address || "").trim().toUpperCase();
    if (!sourceEcu) return;
    if (!rowsByEcu.has(sourceEcu)) rowsByEcu.set(sourceEcu, []);
    rowsByEcu.get(sourceEcu).push({ ...item, source_ecu: sourceEcu });
  });
  const outcomesByEcu = new Map();
  (Array.isArray(outcomes) ? outcomes : []).forEach((outcome) => {
    if (!outcome || typeof outcome !== "object" || Array.isArray(outcome)) return;
    const sourceEcu = String(outcome.source_ecu || outcome.sourceEcu || outcome.ecu || outcome.address || "").trim().toUpperCase();
    if (!sourceEcu) return;
    const previous = outcomesByEcu.get(sourceEcu) || {};
    outcomesByEcu.set(sourceEcu, {
      ...previous,
      ...outcome,
      source_ecu: sourceEcu,
      error_codes: [...new Set([...(previous.error_codes || []), ...(outcome.error_codes || [])])]
    });
  });
  return [...new Set([...rowsByEcu.keys(), ...outcomesByEcu.keys()])]
    .sort((left, right) => left.localeCompare(right))
    .map((sourceEcu) => {
      const items = rowsByEcu.get(sourceEcu) || [];
      const outcome = outcomesByEcu.get(sourceEcu) || null;
      return {
        source_ecu: sourceEcu,
        ecu_info_readout_status: outcome?.ecu_info_readout_status || (items.length ? "reported" : "unknown"),
        item_count: items.length,
        item_ids: [...new Set(items.map((item) => item.id).filter(Boolean))],
        items,
        ...(outcome?.ecu_info_negative_response_service ? { ecu_info_negative_response_service: outcome.ecu_info_negative_response_service } : {}),
        ...(outcome?.ecu_info_negative_response_code ? { ecu_info_negative_response_code: outcome.ecu_info_negative_response_code } : {}),
        ...(outcome?.error_codes?.length ? { error_codes: outcome.error_codes } : {}),
        read_only: true,
        vehicle_command_enabled: false,
        would_transmit: false
      };
    });
}

function buildFreezeFrameEcuSnapshots(values = [], triggerEntries = [], outcomes = []) {
  const rowsByEcu = new Map();
  const ensureRow = (ecu) => {
    const sourceEcu = String(ecu || "").trim().toUpperCase();
    if (!sourceEcu) return null;
    if (!rowsByEcu.has(sourceEcu)) rowsByEcu.set(sourceEcu, { values: [], triggerEntries: [], outcomes: [] });
    return rowsByEcu.get(sourceEcu);
  };
  (Array.isArray(values) ? values : []).forEach((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return;
    const sourceEcu = item.source_ecu || item.sourceEcu || item.ecu || item.address;
    const row = ensureRow(sourceEcu);
    if (row) row.values.push({ ...item, source_ecu: String(sourceEcu).trim().toUpperCase() });
  });
  (Array.isArray(triggerEntries) ? triggerEntries : []).forEach((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return;
    const sourceEcu = item.source_ecu || item.sourceEcu || item.ecu || item.address;
    const row = ensureRow(sourceEcu);
    if (row) row.triggerEntries.push({ ...item, source_ecu: String(sourceEcu).trim().toUpperCase() });
  });
  (Array.isArray(outcomes) ? outcomes : []).forEach((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return;
    const row = ensureRow(item.source_ecu || item.sourceEcu || item.ecu || item.address);
    if (row) row.outcomes.push(item);
  });
  return [...rowsByEcu.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([sourceEcu, row]) => {
    const errorCodes = [...new Set(row.outcomes.flatMap((item) => item.error_codes || []))];
    const negativeServices = [...new Set(row.outcomes.map((item) => item.negative_requested_service).filter(Boolean))];
    const negativeCodes = [...new Set(row.outcomes.map((item) => item.negative_response_code).filter(Boolean))];
    const triggerCodes = [...new Set(row.triggerEntries.map((item) => item.code).filter(Boolean))];
    return {
      source_ecu: sourceEcu,
      freeze_frame_readout_status: errorCodes.length || negativeCodes.length ? "unparsed" : "reported",
      monitor_values: row.values,
      trigger_dtc_entries: row.triggerEntries,
      ...(triggerCodes.length === 1 ? { trigger_dtc: triggerCodes[0] } : {}),
      ...(negativeServices.length === 1 ? { freeze_frame_negative_response_service: negativeServices[0] } : {}),
      ...(negativeCodes.length === 1 ? { freeze_frame_negative_response_code: negativeCodes[0] } : {}),
      ...(errorCodes.length ? { error_codes: errorCodes } : {}),
      read_only: true,
      vehicle_command_enabled: false,
      would_transmit: false
    };
  });
}

function buildReadinessEcuSnapshots(snapshots = [], outcomes = []) {
  const rowsByEcu = new Map();
  (Array.isArray(snapshots) ? snapshots : []).forEach((snapshot) => {
    if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) return;
    const sourceEcu = String(snapshot.source_ecu || snapshot.sourceEcu || snapshot.ecu || snapshot.address || "").trim().toUpperCase();
    if (!sourceEcu) return;
    rowsByEcu.set(sourceEcu, { snapshot: { ...snapshot, source_ecu: sourceEcu }, errors: [] });
  });
  (Array.isArray(outcomes) ? outcomes : []).forEach((outcome) => {
    if (!outcome || typeof outcome !== "object" || Array.isArray(outcome)) return;
    const sourceEcu = String(outcome.source_ecu || outcome.sourceEcu || outcome.ecu || outcome.address || "").trim().toUpperCase();
    if (!sourceEcu) return;
    const row = rowsByEcu.get(sourceEcu) || { snapshot: { source_ecu: sourceEcu }, errors: [] };
    row.errors.push(...(outcome.error_codes || []));
    rowsByEcu.set(sourceEcu, row);
  });
  return [...rowsByEcu.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([sourceEcu, row]) => {
    const errorCodes = [...new Set(row.errors)];
    return {
      ...row.snapshot,
      source_ecu: sourceEcu,
      readiness_readout_status: errorCodes.length ? "unparsed" : "reported",
      ...(errorCodes.length ? { error_codes: errorCodes } : {}),
      read_only: true,
      vehicle_command_enabled: false,
      would_transmit: false
    };
  });
}

function buildSupportedPidEcuSnapshots(snapshots = [], outcomes = []) {
  const rowsByEcu = new Map();
  (Array.isArray(snapshots) ? snapshots : []).forEach((snapshot) => {
    if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) return;
    const sourceEcu = String(snapshot.source_ecu || snapshot.sourceEcu || snapshot.ecu || snapshot.address || "").trim().toUpperCase();
    if (!sourceEcu) return;
    rowsByEcu.set(sourceEcu, { snapshot: { ...snapshot, source_ecu: sourceEcu }, errors: [] });
  });
  (Array.isArray(outcomes) ? outcomes : []).forEach((outcome) => {
    if (!outcome || typeof outcome !== "object" || Array.isArray(outcome)) return;
    const sourceEcu = String(outcome.source_ecu || outcome.sourceEcu || outcome.ecu || outcome.address || "").trim().toUpperCase();
    if (!sourceEcu) return;
    const row = rowsByEcu.get(sourceEcu) || { snapshot: { source_ecu: sourceEcu }, errors: [] };
    row.errors.push(...(outcome.error_codes || []));
    rowsByEcu.set(sourceEcu, row);
  });
  return [...rowsByEcu.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([sourceEcu, row]) => {
    const errorCodes = [...new Set(row.errors)];
    return {
      ...row.snapshot,
      source_ecu: sourceEcu,
      supported_pid_readout_status: errorCodes.length ? "unparsed" : "reported",
      ...(errorCodes.length ? { error_codes: errorCodes } : {}),
      read_only: true,
      vehicle_command_enabled: false,
      would_transmit: false
    };
  });
}

function buildOnboardMonitorEcuSnapshots(tests = [], outcomes = []) {
  const rowsByEcu = new Map();
  (Array.isArray(tests) ? tests : []).forEach((test) => {
    if (!test || typeof test !== "object" || Array.isArray(test)) return;
    const sourceEcu = String(test.source_ecu || test.sourceEcu || test.ecu || test.address || "").trim().toUpperCase();
    if (!sourceEcu) return;
    const row = rowsByEcu.get(sourceEcu) || { tests: [], errors: [], details: {} };
    row.tests.push({ ...test, source_ecu: sourceEcu });
    rowsByEcu.set(sourceEcu, row);
  });
  (Array.isArray(outcomes) ? outcomes : []).forEach((outcome) => {
    if (!outcome || typeof outcome !== "object" || Array.isArray(outcome)) return;
    const sourceEcu = String(outcome.source_ecu || outcome.sourceEcu || outcome.ecu || outcome.address || "").trim().toUpperCase();
    if (!sourceEcu) return;
    const row = rowsByEcu.get(sourceEcu) || { tests: [], errors: [], details: {} };
    row.errors.push(...(outcome.error_codes || []));
    row.details = { ...row.details, ...outcome };
    rowsByEcu.set(sourceEcu, row);
  });
  return [...rowsByEcu.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([sourceEcu, row]) => {
    const errorCodes = [...new Set(row.errors)];
    return {
      ...row.details,
      source_ecu: sourceEcu,
      onboard_monitor_readout_status: errorCodes.length ? "unparsed" : "reported",
      tests: row.tests,
      ...(errorCodes.length ? { error_codes: errorCodes } : {}),
      read_only: true,
      vehicle_command_enabled: false,
      would_transmit: false
    };
  });
}

function buildLivePidEcuSnapshots(values = [], outcomes = []) {
  const rowsByEcu = new Map();
  (Array.isArray(values) ? values : []).forEach((value) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return;
    const sourceEcu = String(value.source_ecu || value.sourceEcu || value.ecu || value.address || "").trim().toUpperCase();
    if (!sourceEcu) return;
    const row = rowsByEcu.get(sourceEcu) || { values: [], errors: [], failedPids: [] };
    row.values.push({ ...value, source_ecu: sourceEcu });
    rowsByEcu.set(sourceEcu, row);
  });
  (Array.isArray(outcomes) ? outcomes : []).forEach((outcome) => {
    if (!outcome || typeof outcome !== "object" || Array.isArray(outcome)) return;
    const sourceEcu = String(outcome.source_ecu || outcome.sourceEcu || outcome.ecu || outcome.address || "").trim().toUpperCase();
    if (!sourceEcu) return;
    const row = rowsByEcu.get(sourceEcu) || { values: [], errors: [], failedPids: [] };
    row.errors.push(...(outcome.error_codes || []));
    if (outcome.pid) row.failedPids.push(outcome.pid);
    rowsByEcu.set(sourceEcu, row);
  });
  return [...rowsByEcu.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([sourceEcu, row]) => {
    const errorCodes = [...new Set(row.errors)];
    const failedPids = [...new Set(row.failedPids)];
    return {
      source_ecu: sourceEcu,
      live_pid_readout_status: errorCodes.length ? "unparsed" : "reported",
      monitor_values: row.values,
      ...(failedPids.length ? { failed_pids: failedPids } : {}),
      ...(errorCodes.length ? { error_codes: errorCodes } : {}),
      read_only: true,
      vehicle_command_enabled: false,
      would_transmit: false
    };
  });
}
const SAMPLE_ONBOARD_MONITOR_TESTS = [
  { test_id: "01", component_id: "01", value: 100, min: 50, max: 200 },
  { test_id: "02", component_id: "01", value: 300, min: 50, max: 200 }
];

export function createLocalBridgeApp(options = {}) {
  const pairingToken = String(options.pairingToken || process.env.LOCAL_BRIDGE_PAIRING_TOKEN || "");
  const bridgeVersion = options.bridgeVersion || "readonly-dev-0.1.0";
  const replaySnapshot = buildReplaySnapshot(options);
  const replayMode = Boolean(replaySnapshot);
  const sampleReadoutsEnabled = options.enableSampleReadouts === true;
  const j2534DiscoveryRequested = typeof options.j2534RegistryText === "string"
    || options.discoverJ2534 === true
    || process.env.LOCAL_BRIDGE_DISCOVER_J2534 === "1";
  const discoveredVciDevices = discoverJ2534RegistryDrivers({
    registryText: options.j2534RegistryText,
    enabled: j2534DiscoveryRequested,
    inspectLibraries: j2534DiscoveryRequested
  });
  const j2534DiscoveryEnvironment = getJ2534DiscoveryEnvironment(discoveredVciDevices);

  return http.createServer(async (request, response) => {
    setCorsHeaders(request, response);

    if (request.method === "OPTIONS") {
      response.writeHead(204);
      response.end();
      return;
    }

    if (request.method === "GET" && request.url === "/health") {
      sendJson(response, 200, {
        ok: true,
        bridge_version: bridgeVersion,
        api_version: API_VERSION,
        vehicle_command_enabled: false,
        sample_mode: !replayMode && !j2534DiscoveryRequested,
        sample_readouts_enabled: sampleReadoutsEnabled,
        replay_mode: replayMode,
        j2534_discovery_requested: j2534DiscoveryRequested,
        vci_detected_count: discoveredVciDevices.length,
        ...(j2534DiscoveryRequested ? {
          driver_readiness_status: j2534DiscoveryEnvironment.driver_readiness_status,
          next_check: j2534DiscoveryEnvironment.next_check
        } : {})
      });
      return;
    }

    if (request.method !== "POST" || !["/v1", "/v1/request", "/v1/bridge"].includes(request.url || "")) {
      sendJson(response, 404, buildBlockedResponse(null, "not_found"));
      return;
    }

    const body = await readJsonBody(request).catch(() => null);
    const validation = validateBridgeRequest(body, pairingToken);
    if (!validation.ok) {
      sendJson(response, 200, buildBlockedResponse(body?.request_id || null, validation.error));
      return;
    }

    sendJson(response, 200, buildReadOnlyResponse(body, bridgeVersion, replaySnapshot, discoveredVciDevices, j2534DiscoveryRequested, j2534DiscoveryEnvironment, sampleReadoutsEnabled));
  });
}

function validateBridgeRequest(body, pairingToken) {
  if (!body || typeof body !== "object") return { ok: false, error: "invalid_json" };
  if (!pairingToken || pairingToken.length < 12) return { ok: false, error: "bridge_pairing_token_not_configured" };
  if (body.api_version !== API_VERSION) return { ok: false, error: "unsupported_api_version" };
  if (!body.request_id || !body.intent || !body.timestamp) return { ok: false, error: "missing_required_field" };
  if (BLOCKED_WRITE_INTENTS.has(body.intent)) return { ok: false, error: "write_intent_blocked" };
  if (!READ_INTENTS.has(body.intent)) return { ok: false, error: "unknown_intent" };
  if (!SAFE_STATUS_INTENTS.has(body.intent)) {
    if (!body.pairing_token) return { ok: false, error: "missing_required_field" };
    if (body.pairing_token !== pairingToken) return { ok: false, error: "pairing_token_mismatch" };
  }
  return { ok: true };
}

function isReadinessSnapshotRequest(request = {}) {
  const data = request?.data && typeof request.data === "object" ? request.data : {};
  const requestedPid = String(data.pid || data.requested_pid || data.requestedPid || "").trim().toUpperCase();
  const readoutId = String(data.readout_id || data.readoutId || "").trim();
  return request.intent === "read_readiness"
    || (request.intent === "read_live_pid_snapshot" && (readoutId === "readiness_snapshot" || requestedPid === "01"));
}

function buildReadOnlyResponse(request, bridgeVersion, replaySnapshot = null, discoveredVciDevices = [], j2534DiscoveryRequested = false, j2534DiscoveryEnvironment = getJ2534DiscoveryEnvironment(discoveredVciDevices), sampleReadoutsEnabled = false) {
  const replayMode = Boolean(replaySnapshot);
  const discoveryMode = !replayMode && j2534DiscoveryRequested;
  const driverDetected = discoveryMode && discoveredVciDevices.length > 0;
  const selectedJ2534Driver = driverDetected ? selectPreferredJ2534Driver(discoveredVciDevices) : null;
  const j2534StatusData = discoveryMode ? {
    registration_status: j2534DiscoveryEnvironment.registration_status,
    driver_readiness_status: j2534DiscoveryEnvironment.driver_readiness_status,
    next_check: j2534DiscoveryEnvironment.next_check,
    registry_roots_checked: [...j2534DiscoveryEnvironment.registry_roots_checked],
    bridge_runtime_architecture: j2534DiscoveryEnvironment.bridge_runtime_architecture,
    bridge_runtime_bitness: j2534DiscoveryEnvironment.bridge_runtime_bitness,
    open_review_status: j2534DiscoveryEnvironment.open_review_status,
    open_review_blockers: [...j2534DiscoveryEnvironment.open_review_blockers],
    pass_thru_open_allowed: false,
    pass_thru_open_attempted: false,
    vehicle_connection_attempted: false,
    worker_contract_version: J2534_WORKER_CONTRACT_VERSION,
    worker_execution_status: "disabled_review_only",
    dll_load_attempted: false,
    static_ready_vci_count: j2534DiscoveryEnvironment.static_ready_vci_count,
    static_blocked_vci_count: j2534DiscoveryEnvironment.static_blocked_vci_count,
    selected_static_ready_device_id: j2534DiscoveryEnvironment.selected_static_ready_device_id
  } : {};
  const base = {
    request_id: request.request_id,
    ok: true,
    blocked: false,
    would_transmit: false,
    errors: [],
    data: null
  };

  if (request.intent === "bridge_status") {
    return {
      ...base,
      data: {
        bridge_version: bridgeVersion,
        api_version: API_VERSION,
        status: replayMode ? "ready_replay_mode" : driverDetected ? "ready_driver_discovery_mode" : discoveryMode ? "driver_not_detected" : "ready_sample_mode",
        paired: true,
        vci_connected: false,
        vehicle_connected: false,
        vehicle_command_enabled: false,
        sample_mode: !replayMode && !discoveryMode,
        replay_mode: replayMode,
        replay_loaded: replayMode,
        j2534_discovery_requested: discoveryMode,
        vci_detected_count: discoveredVciDevices.length,
        ...j2534StatusData
      }
    };
  }

  if (request.intent === "list_vci") {
    return {
      ...base,
      data: {
        selected_device_id: replayMode ? "replay-readonly-input" : selectedJ2534Driver?.id || (discoveryMode ? null : "sample-readonly-vci"),
        driver_status: replayMode ? "replay_mode" : driverDetected ? "j2534_registry_detected" : discoveryMode ? "j2534_driver_not_detected" : "sample_mode",
        ...j2534StatusData,
        devices: replayMode ? [
          {
            id: "replay-readonly-input",
            label: "Read-only Local Bridge Replay Input",
            vendor: "vehicle-diagnosis-tool",
            driver_status: "replay_mode",
            sample_mode: false,
            replay_mode: true,
            connected: false
          }
        ] : driverDetected ? discoveredVciDevices : discoveryMode ? [] : [
          {
            id: "sample-readonly-vci",
            label: "Read-only Local Bridge Sample VCI",
            vendor: "vehicle-diagnosis-tool",
            driver_status: "sample_mode",
            sample_mode: true,
            replay_mode: false,
            connected: false
          }
        ]
      }
    };
  }

  if (request.intent === "adapter_identity") {
    return {
      ...base,
      data: {
        adapter_name: replayMode ? "Read-only Local Bridge Replay" : selectedJ2534Driver?.label || (discoveryMode ? null : "Read-only Local Bridge Sample"),
        adapter_family: replayMode ? "local_bridge_replay" : discoveryMode ? "j2534_passthru" : "local_bridge_sample",
        firmware_version: bridgeVersion,
        sample_mode: !replayMode && !discoveryMode,
        replay_mode: replayMode,
        driver_status: replayMode ? "replay_mode" : driverDetected ? "j2534_registry_detected" : discoveryMode ? "j2534_driver_not_detected" : "sample_mode",
        connection_status: driverDetected ? "driver_detected_not_opened" : discoveryMode ? "driver_not_detected" : null,
        ...j2534StatusData,
        vehicle_command_enabled: false
      }
    };
  }

  if (discoveryMode) {
    return {
      ...base,
      ok: false,
      errors: [driverDetected ? "vci_not_connected" : "vci_not_detected"],
      data: {
        selected_device_id: selectedJ2534Driver?.id || null,
        adapter_family: "j2534_passthru",
        driver_status: driverDetected ? "j2534_registry_detected" : "j2534_driver_not_detected",
        connection_status: driverDetected ? "driver_detected_not_opened" : "driver_not_detected",
        ...j2534StatusData,
        vehicle_command_enabled: false
      }
    };
  }

  if (!replayMode && !sampleReadoutsEnabled) {
    return {
      ...base,
      ok: false,
      errors: ["sample_mode_no_vehicle_readout"],
      data: {
        sample_mode: true,
        sample_readouts_enabled: false,
        connection_status: "sample_mode_no_vehicle_readout",
        vehicle_command_enabled: false
      }
    };
  }

  if ((request.intent === "read_stored_dtc" || request.intent === "read_pending_dtc" || request.intent === "read_permanent_dtc") && replaySnapshot) {
    const status = request.intent === "read_pending_dtc" ? "pending" : request.intent === "read_permanent_dtc" ? "permanent" : "stored";
    const dtcs = replaySnapshot.dtcs.filter((item) => item.status === status);
    const replayError = replaySnapshot.dtcReadoutErrors?.[status]
      || (replaySnapshot.dtcReadoutObserved?.[status] ? null : "replay_dtc_status_not_observed");
    return {
      ...base,
      ...(replayError ? { ok: false, errors: [replayError] } : {}),
      data: {
        protocol: replaySnapshot.protocol,
        ecu_responses: buildEcuResponsesForDtcs(dtcs, status, replaySnapshot.dtcEcuOutcomes),
        dtc_negative_response_services: [...new Set((replaySnapshot.dtcEcuOutcomes || [])
          .filter((item) => item.dtc_status === status && item.status === "negative_response")
          .map((item) => item.negative_requested_service)
          .filter(Boolean))],
        dtc_negative_response_codes: [...new Set((replaySnapshot.dtcEcuOutcomes || [])
          .filter((item) => item.dtc_status === status && item.status === "negative_response")
          .map((item) => item.negative_response_code)
          .filter(Boolean))],
        dtcs
      }
    };
  }

  if (request.intent === "read_stored_dtc" || request.intent === "read_pending_dtc" || request.intent === "read_permanent_dtc") {
    const status = request.intent === "read_pending_dtc" ? "pending" : request.intent === "read_permanent_dtc" ? "permanent" : "stored";
    const sampleCodes = status === "permanent" ? ["P0300"] : ["P0171", "P0300"];
    return {
      ...base,
      data: {
        protocol: "ISO15765-4",
        ecu_responses: [{ ecu: "7E8", status: "sample", dtcs: sampleCodes }],
        dtcs: sampleCodes.map((code) => ({ code, status, ecu: "7E8" }))
      }
    };
  }

  if (request.intent === "read_freeze_frame" && replaySnapshot) {
    const replayError = replaySnapshot.readoutErrors?.freeze_frame
      || (replaySnapshot.readoutObserved?.freeze_frame ? null : "replay_freeze_frame_not_observed");
    const freezeFrameEcuSnapshots = buildFreezeFrameEcuSnapshots(replaySnapshot.freezeFrameValues, replaySnapshot.triggerDtcEntries, replaySnapshot.freezeFrameEcuOutcomes);
    return {
      ...base,
      ...(replayError ? { ok: false, errors: [replayError] } : {}),
      data: {
        protocol: replaySnapshot.protocol,
        trigger_dtc: replaySnapshot.triggerDtc,
        trigger_dtc_entries: replaySnapshot.triggerDtcEntries,
        readout_ecu_ids: freezeFrameEcuSnapshots.map((item) => item.source_ecu),
        freeze_frame_ecu_snapshots: freezeFrameEcuSnapshots,
        values: replaySnapshot.freezeFrameValues
      }
    };
  }

  if (request.intent === "read_freeze_frame") {
    return {
      ...base,
      data: {
        protocol: "ISO15765-4",
        trigger_dtc: "P0171",
        values: [
          { id: "engine_speed", value: 1726, unit: "rpm" },
          { id: "coolant_temp", value: 83, unit: "°C" }
        ]
      }
    };
  }

  if (request.intent === "read_supported_pids" && replaySnapshot) {
    const replayError = replaySnapshot.readoutErrors?.supported_pids
      || (replaySnapshot.readoutObserved?.supported_pids ? null : "replay_supported_pids_not_observed");
    const supportedPidEcuSnapshots = buildSupportedPidEcuSnapshots(replaySnapshot.supportedPidEcuSnapshots, replaySnapshot.supportedPidEcuOutcomes);
    return {
      ...base,
      ...(replayError ? { ok: false, errors: [replayError] } : {}),
      data: {
        protocol: replaySnapshot.protocol,
        supported_pids: replaySnapshot.supportedPids,
        readout_ecu_ids: supportedPidEcuSnapshots.map((item) => item.source_ecu),
        supported_pid_ecu_snapshots: supportedPidEcuSnapshots
      }
    };
  }

  if (request.intent === "read_supported_pids") {
    return {
      ...base,
      data: {
        protocol: "ISO15765-4",
        supported_pids: SAMPLE_SUPPORTED_PIDS
      }
    };
  }

  if (request.intent === "read_ecu_info" && replaySnapshot) {
    const replayError = replaySnapshot.readoutErrors?.ecu_info
      || (replaySnapshot.readoutObserved?.ecu_info ? null : "replay_ecu_info_not_observed");
    const ecuInfo = sanitizeEcuInfoValuesForBrowser(replaySnapshot.ecuInfoValues);
    const ecuInfoEcuSnapshots = buildEcuInfoEcuSnapshots(ecuInfo.values, replaySnapshot.ecuInfoEcuOutcomes);
    return {
      ...base,
      ...(replayError ? { ok: false, errors: [replayError] } : {}),
      data: {
        protocol: replaySnapshot.protocol,
        values: ecuInfo.values,
        readout_ecu_ids: ecuInfoEcuSnapshots.map((item) => item.source_ecu),
        ecu_info_ecu_snapshots: ecuInfoEcuSnapshots,
        ...(ecuInfo.hadSensitiveIdentifier ? { had_sensitive_identifier: true } : {})
      }
    };
  }

  if (request.intent === "read_ecu_info") {
    const ecuInfo = sanitizeEcuInfoValuesForBrowser(SAMPLE_ECU_INFO_VALUES);
    const ecuInfoEcuSnapshots = buildEcuInfoEcuSnapshots(ecuInfo.values);
    return {
      ...base,
      data: {
        protocol: "ISO15765-4",
        values: ecuInfo.values,
        readout_ecu_ids: ecuInfoEcuSnapshots.map((item) => item.source_ecu),
        ecu_info_ecu_snapshots: ecuInfoEcuSnapshots,
        ...(ecuInfo.hadSensitiveIdentifier ? { had_sensitive_identifier: true } : {})
      }
    };
  }

  if (request.intent === "read_onboard_monitor" && replaySnapshot) {
    const replayError = replaySnapshot.readoutErrors?.onboard_monitor
      || (replaySnapshot.readoutObserved?.onboard_monitor ? null : "replay_onboard_monitor_not_observed");
    const onboardMonitorEcuSnapshots = buildOnboardMonitorEcuSnapshots(replaySnapshot.onboardMonitorTests, replaySnapshot.onboardMonitorEcuOutcomes);
    return {
      ...base,
      ...(replayError ? { ok: false, errors: [replayError] } : {}),
      data: {
        protocol: replaySnapshot.protocol,
        tests: replaySnapshot.onboardMonitorTests,
        readout_ecu_ids: onboardMonitorEcuSnapshots.map((item) => item.source_ecu),
        onboard_monitor_ecu_snapshots: onboardMonitorEcuSnapshots
      }
    };
  }

  if (request.intent === "read_onboard_monitor") {
    return {
      ...base,
      data: {
        protocol: "ISO15765-4",
        tests: SAMPLE_ONBOARD_MONITOR_TESTS
      }
    };
  }

  if (isReadinessSnapshotRequest(request) && replaySnapshot) {
    const replayError = replaySnapshot.readoutErrors?.readiness_snapshot
      || (replaySnapshot.readoutObserved?.readiness_snapshot ? null : "replay_readiness_not_observed");
    const readinessEcuSnapshots = buildReadinessEcuSnapshots(replaySnapshot.readinessEcuSnapshots, replaySnapshot.readinessEcuOutcomes);
    return {
      ...base,
      ...(replayError ? { ok: false, errors: [replayError] } : {}),
      data: {
        protocol: replaySnapshot.protocol,
        readout_ecu_ids: readinessEcuSnapshots.map((item) => item.source_ecu),
        readiness_ecu_snapshots: readinessEcuSnapshots
      }
    };
  }

  if (isReadinessSnapshotRequest(request)) {
    return {
      ...base,
      data: {
        protocol: "ISO15765-4",
        ...SAMPLE_READINESS_DATA
      }
    };
  }

  if (request.intent === "read_live_pid_snapshot" && replaySnapshot) {
    const replayError = replaySnapshot.readoutErrors?.live_pid_snapshot
      || (replaySnapshot.readoutObserved?.live_pid_snapshot ? null : "replay_live_pid_not_observed");
    const livePidEcuSnapshots = buildLivePidEcuSnapshots(replaySnapshot.liveValues, replaySnapshot.livePidEcuOutcomes);
    return {
      ...base,
      ...(replayError ? { ok: false, errors: [replayError] } : {}),
      data: {
        protocol: replaySnapshot.protocol,
        supported_pids: replaySnapshot.supportedPids,
        values: replaySnapshot.liveValues,
        readout_ecu_ids: livePidEcuSnapshots.map((item) => item.source_ecu),
        live_pid_ecu_snapshots: livePidEcuSnapshots
      }
    };
  }

  if (request.intent === "read_live_pid_snapshot") {
    return {
      ...base,
      data: {
        protocol: "ISO15765-4",
        supported_pids: SAMPLE_SUPPORTED_PIDS,
        values: SAMPLE_LIVE_VALUES
      }
    };
  }

  return buildBlockedResponse(request.request_id, "intent_not_implemented");
}

export function discoverJ2534RegistryDrivers(options = {}) {
  const registryText = typeof options.registryText === "string"
    ? options.registryText
    : options.enabled === true ? readJ2534RegistryText() : "";
  return parseJ2534RegistryDrivers(registryText, { inspectLibraries: options.inspectLibraries === true });
}

export function getJ2534DiscoveryEnvironment(devices = []) {
  const registeredDevices = Array.isArray(devices) ? devices : [];
  const detectedCount = registeredDevices.length;
  const deviceReadiness = registeredDevices.map((device) => getJ2534DriverReadiness(device));
  const readyDeviceIndexes = deviceReadiness
    .map((status, index) => status === "readonly_static_check_complete" ? index : -1)
    .filter((index) => index >= 0);
  const hasStaticReadyDriver = readyDeviceIndexes.length > 0;
  const hasUninspectedDriver = deviceReadiness.includes("static_inspection_pending");
  const hasArchitectureMismatch = deviceReadiness.includes("runtime_architecture_mismatch");
  const hasReadonlyApiGap = deviceReadiness.includes("readonly_api_incomplete");
  const driver_readiness_status = detectedCount === 0
    ? "no_registered_driver"
    : hasStaticReadyDriver
      ? "readonly_static_check_complete"
      : hasUninspectedDriver
      ? "static_inspection_pending"
      : hasArchitectureMismatch
        ? "runtime_architecture_mismatch"
        : hasReadonlyApiGap
          ? "readonly_api_incomplete"
          : "static_inspection_pending";
  const next_check = driver_readiness_status === "no_registered_driver"
    ? "install_or_repair_j2534_driver_registration"
    : driver_readiness_status === "static_inspection_pending"
      ? "verify_driver_library_path"
      : driver_readiness_status === "runtime_architecture_mismatch"
        ? "install_matching_j2534_driver_architecture"
        : driver_readiness_status === "readonly_api_incomplete"
          ? "verify_driver_readonly_exports"
          : "manual_vci_connection_review";
  const open_review_blockers = driver_readiness_status === "no_registered_driver"
    ? ["no_registered_driver"]
    : driver_readiness_status === "static_inspection_pending"
      ? ["driver_library_not_inspected"]
      : driver_readiness_status === "runtime_architecture_mismatch"
        ? ["runtime_architecture_mismatch"]
        : driver_readiness_status === "readonly_api_incomplete"
          ? ["readonly_api_incomplete"]
          : ["manual_vci_connection_review_required"];
  return {
    registry_roots_checked: [...J2534_REGISTRY_ROOTS],
    bridge_runtime_architecture: J2534_HOST_ARCHITECTURE,
    bridge_runtime_bitness: J2534_HOST_BITNESS,
    registration_status: detectedCount > 0 ? "registered_driver_detected" : "no_registered_driver",
    driver_readiness_status,
    next_check,
    open_review_status: hasStaticReadyDriver ? "manual_review_required" : "blocked",
    open_review_blockers,
    pass_thru_open_allowed: false,
    pass_thru_open_attempted: false,
    vehicle_connection_attempted: false,
    worker_contract_version: J2534_WORKER_CONTRACT_VERSION,
    worker_execution_status: "disabled_review_only",
    dll_load_attempted: false,
    static_ready_vci_count: readyDeviceIndexes.length,
    static_blocked_vci_count: detectedCount - readyDeviceIndexes.length,
    selected_static_ready_device_id: readyDeviceIndexes.length > 0 ? registeredDevices[readyDeviceIndexes[0]]?.id || null : null,
    vehicle_command_enabled: false
  };
}

export function prepareJ2534WorkerReviewRequest(devices = [], options = {}) {
  const registeredDevices = Array.isArray(devices) ? devices : [];
  const environment = getJ2534DiscoveryEnvironment(registeredDevices);
  const selectedDeviceId = String(environment.selected_static_ready_device_id || "").trim();
  const selectedDevice = registeredDevices.find((device) => device?.id === selectedDeviceId) || null;
  const timeoutMs = Number(options.timeout_ms ?? options.timeoutMs ?? 5000);
  const manualConnectionReviewConfirmed = options.manual_connection_review_confirmed === true
    || options.manualConnectionReviewConfirmed === true;
  const blockers = [];
  if (!selectedDevice) blockers.push("no_static_ready_driver");
  if (environment.driver_readiness_status !== "readonly_static_check_complete") blockers.push("driver_static_check_incomplete");
  if (environment.open_review_status !== "manual_review_required") blockers.push("open_review_not_ready");
  if (!manualConnectionReviewConfirmed) blockers.push("manual_connection_review_not_confirmed");
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > 10000) blockers.push("worker_timeout_out_of_range");
  const workerRequest = blockers.length ? null : {
    operation: "review_pass_thru_open",
    selected_device_id: selectedDeviceId,
    driver_readiness_status: environment.driver_readiness_status,
    open_review_status: environment.open_review_status,
    manual_connection_review_confirmed: true,
    timeout_ms: timeoutMs,
    vehicle_command_enabled: false
  };
  return {
    schema_version: "j2534-worker-review-preparation-v1",
    preparation_status: blockers.length ? "blocked" : "ready_for_worker_review",
    blockers: [...new Set(blockers)],
    selected_device_id: selectedDeviceId || null,
    timeout_ms: Number.isInteger(timeoutMs) && timeoutMs >= 1000 && timeoutMs <= 10000 ? timeoutMs : null,
    worker_contract_version: environment.worker_contract_version,
    worker_request: workerRequest,
    raw_driver_path_included: false,
    worker_execution_enabled: false,
    dll_load_attempted: false,
    pass_thru_open_attempted: false,
    vehicle_connection_attempted: false,
    would_transmit: false,
    vehicle_command_enabled: false
  };
}

export async function runJ2534WorkerReview(devices = [], options = {}) {
  const preparation = prepareJ2534WorkerReviewRequest(devices, options);
  if (!preparation.worker_request) return normalizeJ2534WorkerReviewProcessResult(preparation);
  const signal = options.signal;
  if (signal != null && !(signal instanceof AbortSignal)) {
    return normalizeJ2534WorkerReviewProcessResult(preparation, { error: { code: "INVALID_ABORT_SIGNAL" } });
  }
  if (signal?.aborted) {
    return normalizeJ2534WorkerReviewProcessResult(preparation, { error: { code: "ABORT_ERR" } });
  }
  if (j2534WorkerReviewActive) {
    return normalizeJ2534WorkerReviewProcessResult(preparation, { error: { code: "J2534_REVIEW_BUSY" } });
  }
  j2534WorkerReviewActive = true;
  try {
    return await executeJ2534WorkerReview(preparation, signal);
  } finally {
    j2534WorkerReviewActive = false;
  }
}

async function executeJ2534WorkerReview(preparation, signal) {
  const processResult = await new Promise((resolve) => {
    let cancelled = false;
    let result = null;
    const child = execFile(process.execPath, [J2534_WORKER_SCRIPT_PATH], {
      encoding: "utf8",
      timeout: preparation.timeout_ms,
      windowsHide: true,
      maxBuffer: 64 * 1024
    }, (error, stdout) => {
      const timedOut = error?.killed === true && error.signal === "SIGTERM" && error.code === null;
      result = {
        pid: child.pid,
        status: error ? (Number.isInteger(error.code) ? error.code : null) : 0,
        signal: error?.signal || null,
        error: cancelled ? { code: "ABORT_ERR" } : timedOut ? { code: "ETIMEDOUT" } : error,
        stdout
      };
    });
    const cancelReview = () => {
      cancelled = true;
      child.kill();
    };
    // Resolve only after close, including when a spawn error invokes the callback earlier.
    child.once("close", () => {
      signal?.removeEventListener("abort", cancelReview);
      resolve({ ...result, closed: true });
    });
    signal?.addEventListener("abort", cancelReview, { once: true });
    if (signal?.aborted) cancelReview();
    // A worker may close stdin before consuming the request; its exit remains authoritative.
    child.stdin.on("error", () => {});
    child.stdin.end(JSON.stringify(preparation.worker_request));
  });
  return normalizeJ2534WorkerReviewProcessResult(preparation, processResult);
}

export function normalizeJ2534WorkerReviewProcessResult(preparation = {}, processResult = null) {
  const request = preparation?.worker_request;
  const base = {
    schema_version: "j2534-worker-review-execution-v1",
    selected_device_id: preparation?.selected_device_id || null,
    timeout_ms: preparation?.timeout_ms || null,
    worker_contract_version: preparation?.worker_contract_version || J2534_WORKER_CONTRACT_VERSION,
    review_worker_process_started: Boolean(request && Number.isInteger(processResult?.pid) && processResult.pid > 0),
    review_worker_process_exited: Boolean(request && Number.isInteger(processResult?.pid) && processResult.pid > 0 && processResult.closed === true),
    worker_execution_enabled: false,
    dll_load_attempted: false,
    pass_thru_open_attempted: false,
    vehicle_connection_attempted: false,
    would_transmit: false,
    vehicle_command_enabled: false
  };
  if (!request) {
    return {
      ...base,
      execution_status: "preparation_blocked",
      blockers: Array.isArray(preparation?.blockers) ? [...new Set(preparation.blockers)] : ["worker_request_not_prepared"],
      worker_review: null,
      process_exit_code: null
    };
  }
  if (processResult?.error?.code === "J2534_REVIEW_BUSY") {
    return { ...base, execution_status: "worker_busy", blockers: ["worker_review_in_progress"], worker_review: null, process_exit_code: null };
  }
  if (processResult?.error?.code === "ABORT_ERR") {
    return { ...base, execution_status: "worker_cancelled", blockers: ["worker_review_cancelled"], worker_review: null, process_exit_code: null };
  }
  if (processResult?.error?.code === "ETIMEDOUT") {
    return { ...base, execution_status: "worker_timed_out", blockers: ["worker_review_timeout"], worker_review: null, process_exit_code: null };
  }
  if (!processResult || processResult.error || processResult.status !== 0) {
    return { ...base, execution_status: "worker_failed", blockers: ["worker_review_process_failed"], worker_review: null, process_exit_code: Number.isInteger(processResult?.status) ? processResult.status : null };
  }
  let workerReview = null;
  try {
    workerReview = JSON.parse(String(processResult.stdout || "").trim());
  } catch {
    return { ...base, execution_status: "invalid_worker_response", blockers: ["worker_review_invalid_json"], worker_review: null, process_exit_code: 0 };
  }
  const allowedBlockers = new Set([
    "operation_not_allowed", "selected_device_not_confirmed", "driver_static_check_incomplete",
    "open_review_not_ready", "manual_connection_review_not_confirmed", "worker_timeout_out_of_range",
    "raw_driver_path_not_accepted", "vehicle_command_requested"
  ]);
  const validReview = workerReview
    && workerReview.contract_version === J2534_WORKER_CONTRACT_VERSION
    && workerReview.operation === "review_pass_thru_open"
    && workerReview.selected_device_id === request.selected_device_id
    && workerReview.timeout_ms === request.timeout_ms
    && Array.isArray(workerReview.blockers)
    && workerReview.blockers.every((item) => allowedBlockers.has(item))
    && ((workerReview.review_status === "ready_for_isolated_implementation" && workerReview.blockers.length === 0)
      || (workerReview.review_status === "blocked" && workerReview.blockers.length > 0))
    && workerReview.worker_execution_enabled === false
    && workerReview.dll_load_attempted === false
    && workerReview.pass_thru_open_attempted === false
    && workerReview.vehicle_connection_attempted === false
    && workerReview.vehicle_communication_started === false
    && workerReview.would_transmit === false
    && workerReview.vehicle_command_enabled === false;
  if (!validReview) {
    return { ...base, execution_status: "invalid_worker_response", blockers: ["worker_review_contract_mismatch"], worker_review: null, process_exit_code: 0 };
  }
  const sanitizedReview = {
    contract_version: workerReview.contract_version,
    operation: workerReview.operation,
    review_status: workerReview.review_status,
    blockers: [...new Set(workerReview.blockers)],
    selected_device_id: workerReview.selected_device_id,
    timeout_ms: workerReview.timeout_ms,
    worker_execution_enabled: false,
    dll_load_attempted: false,
    pass_thru_open_attempted: false,
    vehicle_connection_attempted: false,
    vehicle_communication_started: false,
    would_transmit: false,
    vehicle_command_enabled: false
  };
  return {
    ...base,
    execution_status: sanitizedReview.review_status === "ready_for_isolated_implementation" ? "review_completed" : "review_blocked",
    blockers: sanitizedReview.blockers,
    worker_review: sanitizedReview,
    process_exit_code: 0
  };
}

function getJ2534DriverReadiness(device = {}) {
  if (device?.driver_library_inspection_status !== "inspected") return "static_inspection_pending";
  if (device?.driver_runtime_compatible !== true) return "runtime_architecture_mismatch";
  if (device?.driver_readonly_api_ready !== true) return "readonly_api_incomplete";
  return "readonly_static_check_complete";
}

function selectPreferredJ2534Driver(devices = []) {
  const registeredDevices = Array.isArray(devices) ? devices : [];
  return registeredDevices.find((device) => getJ2534DriverReadiness(device) === "readonly_static_check_complete")
    || registeredDevices[0]
    || null;
}

export function parseJ2534RegistryDrivers(text = "", options = {}) {
  return parseJ2534RegistryEntries(text).map((current) => {
    const label = current.name || current.vendor || "J2534 Pass-Thru";
    const libraryInspection = options.inspectLibraries === true ? inspectJ2534LibraryFile(current.functionLibrary) : null;
    return {
      id: createStableJ2534DeviceId(current),
      label,
      vendor: current.vendor || "unknown",
      adapter_family: "j2534_passthru",
      driver_status: "j2534_registry_detected",
      driver_library_detected: true,
      driver_library_registered: true,
      driver_library_inspection_status: libraryInspection?.inspection_status || "not_inspected",
      driver_library_architecture: libraryInspection?.pe_architecture || null,
      driver_library_bitness: libraryInspection?.pe_bitness || null,
      bridge_runtime_architecture: libraryInspection?.bridge_runtime_architecture || J2534_HOST_ARCHITECTURE,
      bridge_runtime_bitness: libraryInspection?.bridge_runtime_bitness || J2534_HOST_BITNESS,
      driver_runtime_compatible: libraryInspection?.runtime_compatible ?? null,
      driver_runtime_compatibility_status: libraryInspection?.runtime_compatibility_status || "not_inspected",
      driver_required_api_count: libraryInspection?.required_api_count || J2534_REQUIRED_API_NAMES.length,
      driver_detected_required_api_count: libraryInspection?.detected_required_api_count || 0,
      driver_missing_required_apis: libraryInspection?.missing_required_apis || [],
      driver_required_api_ready: libraryInspection?.required_api_ready === true,
      driver_readonly_required_api_count: libraryInspection?.readonly_required_api_count || J2534_READONLY_REQUIRED_API_NAMES.length,
      driver_detected_readonly_api_count: libraryInspection?.detected_readonly_api_count || 0,
      driver_missing_readonly_apis: libraryInspection?.missing_readonly_apis || [],
      driver_readonly_api_ready: libraryInspection?.readonly_api_ready === true,
      driver_restricted_apis: [...J2534_RESTRICTED_API_NAMES],
      sample_mode: false,
      replay_mode: false,
      connected: false,
      connection_status: "driver_detected_not_opened",
      vehicle_command_enabled: false
    };
  });
}

function parseJ2534RegistryEntries(text = "") {
  const rows = [];
  let current = null;
  const appendCurrent = () => {
    if (!current?.functionLibrary) return;
    rows.push({ ...current });
  };
  String(text || "").split(/\r?\n/).forEach((line) => {
    if (/^HKEY_LOCAL_MACHINE\\/i.test(line.trim())) {
      appendCurrent();
      current = { registryKey: line.trim(), name: "", vendor: "", functionLibrary: "" };
      return;
    }
    if (!current) return;
    const match = line.match(/^\s*(Name|Vendor|FunctionLibrary)\s+REG_\w+\s+(.+?)\s*$/i);
    if (!match) return;
    const key = match[1].toLowerCase();
    current[key === "functionlibrary" ? "functionLibrary" : key] = match[2];
  });
  appendCurrent();
  return rows;
}

export function createJ2534RegisteredDriverDescriptor(options = {}) {
  const registryText = options.enabled === true ? readJ2534RegistryText() : "";
  return createJ2534RegisteredDriverDescriptorFromRegistry(
    registryText,
    options.selectedDeviceId,
    "live_windows_registry"
  );
}

export function createJ2534RegisteredDriverFixtureDescriptor(options = {}) {
  return createJ2534RegisteredDriverDescriptorFromRegistry(
    typeof options.registryText === "string" ? options.registryText : "",
    options.selectedDeviceId,
    "test_fixture_registry"
  );
}

function createJ2534RegisteredDriverDescriptorFromRegistry(registryText, requestedDeviceId, descriptorSource) {
  const selectedDeviceId = String(requestedDeviceId || "").trim();
  const entry = parseJ2534RegistryEntries(registryText)
    .find((item) => createStableJ2534DeviceId(item) === selectedDeviceId);
  const blocked = (status, blockers) => deepFreezeJ2534Value({
    contract_version: J2534_REGISTERED_DRIVER_DESCRIPTOR_VERSION,
    descriptor_status: status,
    blockers,
    selected_device_id: selectedDeviceId || null,
    execution_enabled: false,
    dll_load_attempted: false,
    pass_thru_open_attempted: false,
    vehicle_connection_attempted: false,
    vehicle_command_enabled: false
  });
  if (!selectedDeviceId) return blocked("blocked", ["selected_device_not_confirmed"]);
  if (!entry) return blocked("blocked", ["registered_driver_not_found"]);
  if (process.platform !== "win32") return blocked("platform_unsupported", ["platform_unsupported"]);
  const inspection = inspectRegisteredJ2534Library(entry.functionLibrary);
  const descriptor = deepFreezeJ2534Value({
    contract_version: J2534_REGISTERED_DRIVER_DESCRIPTOR_VERSION,
    descriptor_status: inspection.blockers.length ? "blocked" : "static_identity_descriptor_ready",
    blockers: inspection.blockers,
    selected_device_id: selectedDeviceId,
    descriptor_source: descriptorSource,
    registry_view: /\\WOW6432Node\\/i.test(entry.registryKey) ? "wow6432" : "native",
    driver_architecture: inspection.pe_architecture,
    driver_bitness: inspection.pe_bitness,
    bridge_runtime_architecture: J2534_HOST_ARCHITECTURE,
    bridge_runtime_bitness: J2534_HOST_BITNESS,
    runtime_compatible: inspection.runtime_compatible,
    file_size: inspection.file_size,
    sha256: inspection.sha256,
    exact_identity_apis: inspection.detected_identity_apis,
    missing_exact_identity_apis: inspection.missing_identity_apis,
    exact_identity_api_ready: inspection.missing_identity_apis.length === 0,
    exact_readonly_apis: inspection.detected_readonly_apis,
    missing_exact_readonly_apis: inspection.missing_readonly_apis,
    exact_readonly_api_ready: inspection.missing_readonly_apis.length === 0,
    fixed_drive_verification_status: "native_loader_required",
    execution_enabled: false,
    dll_load_attempted: false,
    pass_thru_open_attempted: false,
    vehicle_connection_attempted: false,
    vehicle_command_enabled: false
  });
  const issuableBlockers = new Set([
    "native_fixed_drive_verification_required",
    "registered_driver_runtime_architecture_mismatch"
  ]);
  if (inspection.fingerprint && inspection.blockers.every((blocker) => issuableBlockers.has(blocker))) {
    j2534RegisteredDriverDescriptorSecrets.set(descriptor, {
      selectedDeviceId,
      descriptorSource,
      libraryPath: inspection.library_path,
      fingerprint: inspection.fingerprint
    });
  }
  return descriptor;
}

export function verifyJ2534RegisteredDriverDescriptor(descriptor) {
  const secret = descriptor && typeof descriptor === "object"
    ? j2534RegisteredDriverDescriptorSecrets.get(descriptor)
    : null;
  if (!secret) {
    return deepFreezeJ2534Value({
      contract_version: J2534_REGISTERED_DRIVER_DESCRIPTOR_VERSION,
      selected_device_id: null,
      verification_status: "rejected",
      blockers: ["descriptor_not_issued"],
      execution_enabled: false,
      dll_load_attempted: false,
      pass_thru_open_attempted: false,
      vehicle_connection_attempted: false,
      vehicle_command_enabled: false
    });
  }
  const base = {
    contract_version: J2534_REGISTERED_DRIVER_DESCRIPTOR_VERSION,
    selected_device_id: secret.selectedDeviceId,
    descriptor_source: secret.descriptorSource,
    execution_enabled: false,
    dll_load_attempted: false,
    pass_thru_open_attempted: false,
    vehicle_connection_attempted: false,
    vehicle_command_enabled: false
  };
  const inspection = inspectRegisteredJ2534Library(secret.libraryPath);
  const sameFile = secret.fingerprint
    && inspection.fingerprint
    && inspection.fingerprint.device === secret.fingerprint.device
    && inspection.fingerprint.inode === secret.fingerprint.inode
    && inspection.fingerprint.size === secret.fingerprint.size
    && inspection.fingerprint.mtime_ns === secret.fingerprint.mtime_ns
    && inspection.fingerprint.ctime_ns === secret.fingerprint.ctime_ns
    && inspection.fingerprint.sha256 === secret.fingerprint.sha256;
  const blockers = [...inspection.blockers];
  if (secret.descriptorSource !== "live_windows_registry") blockers.unshift("fixture_registry_source_not_executable");
  if (!sameFile) blockers.unshift("registered_driver_file_changed");
  return deepFreezeJ2534Value({
    ...base,
    verification_status: blockers.length ? "rejected" : "verified_static_identity",
    blockers: [...new Set(blockers)],
    sha256: inspection.sha256,
    file_size: inspection.file_size,
    driver_architecture: inspection.pe_architecture,
    driver_bitness: inspection.pe_bitness
  });
}

export async function runJ2534RegisteredDriverNativePreflight(descriptor, options = {}) {
  const secret = descriptor && typeof descriptor === "object"
    ? j2534RegisteredDriverDescriptorSecrets.get(descriptor)
    : null;
  const blocked = (selectedDeviceId, blocker) => deepFreezeJ2534Value({
    contract_version: "j2534-native-preflight-response-v1",
    selected_device_id: selectedDeviceId || null,
    verification_status: "rejected",
    blockers: [blocker],
    fixed_drive_verified: false,
    final_path_matches: false,
    file_identity_stable: false,
    sha256_matches: false,
    size_matches: false,
    architecture_matches: false,
    runtime_architecture_matches: false,
    dll_load_attempted: false,
    get_proc_address_attempted: false,
    pass_thru_open_attempted: false,
    vehicle_connection_attempted: false,
    vehicle_communication_started: false,
    would_transmit: false,
    vehicle_command_enabled: false,
    execution_enabled: false
  });
  if (!secret) return blocked(null, "descriptor_not_issued");
  if (secret.descriptorSource !== "live_windows_registry")
    return blocked(secret.selectedDeviceId, "live_registry_descriptor_required");
  const sameFingerprint = (left, right) => left && right
    && left.device === right.device && left.inode === right.inode && left.size === right.size
    && left.mtime_ns === right.mtime_ns && left.ctime_ns === right.ctime_ns && left.sha256 === right.sha256;
  const before = inspectRegisteredJ2534Library(secret.libraryPath);
  const issuableBlockers = new Set([
    "native_fixed_drive_verification_required",
    "registered_driver_runtime_architecture_mismatch"
  ]);
  if (!before.fingerprint || !before.blockers.includes("native_fixed_drive_verification_required")
    || !before.blockers.every((blocker) => issuableBlockers.has(blocker)))
    return blocked(secret.selectedDeviceId, "registered_driver_preflight_ineligible");
  if (!sameFingerprint(secret.fingerprint, before.fingerprint))
    return blocked(secret.selectedDeviceId, "registered_driver_file_changed");
  const result = await runJ2534NativePreflight({
    selected_device_id: secret.selectedDeviceId,
    descriptor_source: secret.descriptorSource,
    private_library_path: secret.libraryPath,
    expected_sha256: secret.fingerprint.sha256,
    expected_file_size: before.file_size,
    expected_architecture: before.pe_architecture
  }, options);
  const after = inspectRegisteredJ2534Library(secret.libraryPath);
  if (!sameFingerprint(secret.fingerprint, after.fingerprint))
    return blocked(secret.selectedDeviceId, "registered_driver_file_changed");
  return deepFreezeJ2534Value(result);
}

function createStableJ2534DeviceId(driver = {}) {
  const identity = [driver.registryKey, driver.vendor, driver.name, driver.functionLibrary]
    .map((value) => String(value || "").trim().toLowerCase())
    .join("\u0000");
  const digest = createHash("sha256").update(identity).digest("hex").slice(0, 16);
  return `j2534-${digest}`;
}

function resolveJ2534LibraryPath(filePath = "") {
  const trimmed = String(filePath || "").trim();
  const unquoted = trimmed.length >= 2 && trimmed.startsWith('"') && trimmed.endsWith('"')
    ? trimmed.slice(1, -1).trim()
    : trimmed;
  return unquoted.replace(/%([A-Za-z_][A-Za-z0-9_]*)%/g, (token, name) => process.env[name] || token);
}

export function inspectJ2534LibraryFile(filePath = "") {
  const base = {
    inspection_status: "not_inspected",
    pe_architecture: null,
    pe_bitness: null,
    bridge_runtime_architecture: J2534_HOST_ARCHITECTURE,
    bridge_runtime_bitness: J2534_HOST_BITNESS,
    runtime_compatible: null,
    runtime_compatibility_status: "not_inspected",
    export_table_status: "not_inspected",
    required_api_count: J2534_REQUIRED_API_NAMES.length,
    detected_required_api_count: 0,
    detected_required_apis: [],
    missing_required_apis: [...J2534_REQUIRED_API_NAMES],
    required_api_ready: false,
    readonly_required_api_count: J2534_READONLY_REQUIRED_API_NAMES.length,
    detected_readonly_api_count: 0,
    detected_readonly_apis: [],
    missing_readonly_apis: [...J2534_READONLY_REQUIRED_API_NAMES],
    readonly_api_ready: false,
    restricted_apis: [...J2534_RESTRICTED_API_NAMES],
    vehicle_command_enabled: false
  };
  const resolvedPath = resolveJ2534LibraryPath(filePath);
  if (!resolvedPath) return { ...base, inspection_status: "path_missing" };
  if (isJ2534NetworkLibraryPath(resolvedPath)) {
    return { ...base, inspection_status: "network_path_blocked" };
  }
  try {
    const stat = fs.statSync(resolvedPath);
    if (!stat.isFile()) return { ...base, inspection_status: "not_a_file" };
    if (stat.size <= 0 || stat.size > MAX_J2534_LIBRARY_SIZE) {
      return { ...base, inspection_status: stat.size > MAX_J2534_LIBRARY_SIZE ? "file_too_large" : "file_empty" };
    }
    const metadata = readPortableExecutableMetadata(fs.readFileSync(resolvedPath));
    if (!metadata) return { ...base, inspection_status: "invalid_pe", export_table_status: "invalid_pe" };
    const normalizedExports = new Set(metadata.exportNames.map(normalizePeExportName));
    const detectedRequiredApis = J2534_REQUIRED_API_NAMES.filter((name) => normalizedExports.has(name));
    const missingRequiredApis = J2534_REQUIRED_API_NAMES.filter((name) => !normalizedExports.has(name));
    const detectedReadonlyApis = J2534_READONLY_REQUIRED_API_NAMES.filter((name) => normalizedExports.has(name));
    const missingReadonlyApis = J2534_READONLY_REQUIRED_API_NAMES.filter((name) => !normalizedExports.has(name));
    const runtimeCompatible = metadata.architecture !== "unknown" && metadata.architecture === J2534_HOST_ARCHITECTURE;
    return {
      ...base,
      inspection_status: "inspected",
      pe_architecture: metadata.architecture,
      pe_bitness: metadata.bitness,
      runtime_compatible: runtimeCompatible,
      runtime_compatibility_status: runtimeCompatible ? "compatible" : metadata.architecture === "unknown" || J2534_HOST_ARCHITECTURE === "unknown" ? "unknown" : "architecture_mismatch",
      export_table_status: metadata.exportTableStatus,
      detected_required_api_count: detectedRequiredApis.length,
      detected_required_apis: detectedRequiredApis,
      missing_required_apis: missingRequiredApis,
      required_api_ready: missingRequiredApis.length === 0,
      detected_readonly_api_count: detectedReadonlyApis.length,
      detected_readonly_apis: detectedReadonlyApis,
      missing_readonly_apis: missingReadonlyApis,
      readonly_api_ready: missingReadonlyApis.length === 0
    };
  } catch (error) {
    return {
      ...base,
      inspection_status: error?.code === "ENOENT" ? "file_not_found" : "read_failed"
    };
  }
}

function isJ2534NetworkLibraryPath(filePath = "") {
  const normalized = String(filePath || "").trim().replaceAll("/", "\\").toLowerCase();
  return normalized.startsWith("\\\\") || normalized.startsWith("\\\\?\\unc\\");
}

function inspectRegisteredJ2534Library(filePath = "") {
  const resolvedPath = resolveJ2534LibraryPath(filePath);
  const failed = (blocker) => ({
    blockers: [blocker],
    library_path: resolvedPath,
    fingerprint: null,
    pe_architecture: null,
    pe_bitness: null,
    runtime_compatible: false,
    file_size: null,
    sha256: null,
    detected_identity_apis: [],
    missing_identity_apis: [...J2534_IDENTITY_API_NAMES],
    detected_readonly_apis: [],
    missing_readonly_apis: [...J2534_READONLY_REQUIRED_API_NAMES]
  });
  if (!resolvedPath) return failed("registered_driver_path_missing");
  if (/%[A-Za-z_][A-Za-z0-9_]*%/.test(resolvedPath)) return failed("registered_driver_environment_unresolved");
  if (isJ2534NetworkLibraryPath(resolvedPath) || /^\\\\[?.]\\/i.test(resolvedPath)) return failed("registered_driver_path_not_local");
  if (!/^[A-Za-z]:\\/.test(resolvedPath) || !path.win32.isAbsolute(resolvedPath)) return failed("registered_driver_path_not_absolute");
  if (resolvedPath.slice(2).includes(":")) return failed("registered_driver_alternate_stream_blocked");
  if (resolvedPath.split(/[\\/]+/).some((part) => part === "." || part === "..")) return failed("registered_driver_path_not_canonical");
  if (path.win32.extname(resolvedPath).toLowerCase() !== ".dll") return failed("registered_driver_not_dll");
  const canonicalPath = path.win32.normalize(resolvedPath);
  const reparseStatus = getJ2534ReparsePathStatus(canonicalPath);
  if (reparseStatus === "reparse") return failed("registered_driver_reparse_path_blocked");
  if (reparseStatus === "inspection_failed") return failed("registered_driver_reparse_check_failed");
  let handle;
  try {
    handle = fs.openSync(canonicalPath, "r");
    const before = fs.fstatSync(handle, { bigint: true });
    if (!before.isFile()) return failed("registered_driver_not_file");
    if (before.size <= 0n || before.size > BigInt(MAX_J2534_LIBRARY_SIZE)) {
      return failed(before.size > BigInt(MAX_J2534_LIBRARY_SIZE) ? "registered_driver_file_too_large" : "registered_driver_file_empty");
    }
    const fileSize = Number(before.size);
    const buffer = Buffer.allocUnsafe(fileSize);
    let offset = 0;
    while (offset < buffer.length) {
      const bytesRead = fs.readSync(handle, buffer, offset, buffer.length - offset, offset);
      if (!bytesRead) break;
      offset += bytesRead;
    }
    const after = fs.fstatSync(handle, { bigint: true });
    if (offset !== buffer.length
      || before.dev !== after.dev
      || before.ino !== after.ino
      || before.size !== after.size
      || before.mtimeNs !== after.mtimeNs
      || before.ctimeNs !== after.ctimeNs) {
      return failed("registered_driver_changed_during_read");
    }
    const metadata = readPortableExecutableMetadata(buffer);
    if (!metadata) return failed("registered_driver_invalid_pe");
    const exactExports = new Set(metadata.callableExportNames);
    const detectedIdentityApis = J2534_IDENTITY_API_NAMES.filter((name) => exactExports.has(name));
    const missingIdentityApis = J2534_IDENTITY_API_NAMES.filter((name) => !exactExports.has(name));
    const detectedReadonlyApis = J2534_READONLY_REQUIRED_API_NAMES.filter((name) => exactExports.has(name));
    const missingReadonlyApis = J2534_READONLY_REQUIRED_API_NAMES.filter((name) => !exactExports.has(name));
    const blockers = ["native_fixed_drive_verification_required"];
    if (metadata.exportTableStatus !== "parsed") blockers.push("registered_driver_export_table_incomplete");
    if (missingIdentityApis.length) {
      const hasNamedButUncallableIdentity = missingIdentityApis.some((name) => metadata.exportNames.includes(name));
      const hasDecoratedIdentity = missingIdentityApis.some((name) => metadata.exportNames.some((rawName) => rawName !== name && normalizePeExportName(rawName) === name));
      blockers.push(hasNamedButUncallableIdentity
        ? "registered_driver_identity_exports_not_callable"
        : hasDecoratedIdentity
          ? "registered_driver_identity_exports_decorated_only"
          : "registered_driver_identity_exports_missing");
    }
    if (missingReadonlyApis.length) blockers.push("registered_driver_readonly_exports_missing");
    const runtimeCompatible = metadata.architecture !== "unknown" && metadata.architecture === J2534_HOST_ARCHITECTURE;
    if (!runtimeCompatible) blockers.push("registered_driver_runtime_architecture_mismatch");
    const sha256 = createHash("sha256").update(buffer).digest("hex");
    return {
      blockers: [...new Set(blockers)],
      library_path: canonicalPath,
      fingerprint: {
        device: String(before.dev),
        inode: String(before.ino),
        size: String(before.size),
        mtime_ns: String(before.mtimeNs),
        ctime_ns: String(before.ctimeNs),
        sha256
      },
      pe_architecture: metadata.architecture,
      pe_bitness: metadata.bitness,
      runtime_compatible: runtimeCompatible,
      file_size: fileSize,
      sha256,
      detected_identity_apis: detectedIdentityApis,
      missing_identity_apis: missingIdentityApis,
      detected_readonly_apis: detectedReadonlyApis,
      missing_readonly_apis: missingReadonlyApis
    };
  } catch (error) {
    return failed(error?.code === "ENOENT" ? "registered_driver_file_not_found" : "registered_driver_read_failed");
  } finally {
    if (handle !== undefined) fs.closeSync(handle);
  }
}

function getJ2534ReparsePathStatus(filePath) {
  const root = path.win32.parse(filePath).root;
  let current = root;
  try {
    for (const part of filePath.slice(root.length).split("\\").filter(Boolean)) {
      current = path.win32.join(current, part);
      if (fs.lstatSync(current).isSymbolicLink()) return "reparse";
    }
    return "clear";
  } catch {
    return "inspection_failed";
  }
}

function deepFreezeJ2534Value(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.values(value).forEach(deepFreezeJ2534Value);
  return Object.freeze(value);
}

function readPortableExecutableMetadata(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 0x40 || buffer.readUInt16LE(0) !== 0x5A4D) return null;
  const peOffset = buffer.readUInt32LE(0x3C);
  if (peOffset < 0x40 || peOffset + 24 > buffer.length || buffer.readUInt32LE(peOffset) !== 0x00004550) return null;
  const machine = buffer.readUInt16LE(peOffset + 4);
  const sectionCount = buffer.readUInt16LE(peOffset + 6);
  const optionalHeaderSize = buffer.readUInt16LE(peOffset + 20);
  const optionalHeaderOffset = peOffset + 24;
  if (sectionCount > 96 || optionalHeaderSize < 2 || optionalHeaderOffset + optionalHeaderSize > buffer.length) return null;
  const optionalMagic = buffer.readUInt16LE(optionalHeaderOffset);
  const bitness = optionalMagic === 0x10B ? 32 : optionalMagic === 0x20B ? 64 : null;
  if (!bitness) return null;
  const architecture = machine === 0x014C ? "x86" : machine === 0x8664 ? "x64" : machine === 0xAA64 ? "arm64" : "unknown";
  const dataDirectoryOffset = optionalHeaderOffset + (bitness === 32 ? 96 : 112);
  const sectionTableOffset = optionalHeaderOffset + optionalHeaderSize;
  if (dataDirectoryOffset + 8 > optionalHeaderOffset + optionalHeaderSize || sectionTableOffset + sectionCount * 40 > buffer.length) return null;
  const sections = [];
  for (let index = 0; index < sectionCount; index += 1) {
    const offset = sectionTableOffset + index * 40;
    sections.push({
      virtualSize: buffer.readUInt32LE(offset + 8),
      virtualAddress: buffer.readUInt32LE(offset + 12),
      rawSize: buffer.readUInt32LE(offset + 16),
      rawOffset: buffer.readUInt32LE(offset + 20),
      characteristics: buffer.readUInt32LE(offset + 36)
    });
  }
  const rvaToOffset = (rva, length = 1) => {
    const section = sections.find((item) => rva >= item.virtualAddress && rva - item.virtualAddress < item.rawSize);
    if (!section) return null;
    const offset = section.rawOffset + (rva - section.virtualAddress);
    return rva - section.virtualAddress + length <= section.rawSize && offset >= 0 && offset + length <= buffer.length ? offset : null;
  };
  const exportRva = buffer.readUInt32LE(dataDirectoryOffset);
  const exportSize = buffer.readUInt32LE(dataDirectoryOffset + 4);
  if (!exportRva) return { architecture, bitness, exportTableStatus: "missing", exportNames: [], callableExportNames: [] };
  const exportOffset = rvaToOffset(exportRva, 40);
  if (exportOffset === null) return { architecture, bitness, exportTableStatus: "malformed", exportNames: [], callableExportNames: [] };
  const functionCount = buffer.readUInt32LE(exportOffset + 20);
  const nameCount = buffer.readUInt32LE(exportOffset + 24);
  const functionsRva = buffer.readUInt32LE(exportOffset + 28);
  const namesRva = buffer.readUInt32LE(exportOffset + 32);
  const ordinalsRva = buffer.readUInt32LE(exportOffset + 36);
  if (nameCount > MAX_PE_EXPORT_NAMES || functionCount > MAX_PE_EXPORT_NAMES) {
    return { architecture, bitness, exportTableStatus: "name_limit_exceeded", exportNames: [], callableExportNames: [] };
  }
  const namesOffset = nameCount ? rvaToOffset(namesRva, nameCount * 4) : null;
  const ordinalsOffset = nameCount ? rvaToOffset(ordinalsRva, nameCount * 2) : null;
  const functionsOffset = functionCount ? rvaToOffset(functionsRva, functionCount * 4) : null;
  if (nameCount && (namesOffset === null || ordinalsOffset === null || functionsOffset === null)) {
    return { architecture, bitness, exportTableStatus: "malformed", exportNames: [], callableExportNames: [] };
  }
  const exportNames = [];
  const callableExportNames = [];
  for (let index = 0; index < nameCount; index += 1) {
    const nameRva = buffer.readUInt32LE(namesOffset + index * 4);
    const nameOffset = rvaToOffset(nameRva);
    if (nameOffset === null) continue;
    const terminator = buffer.indexOf(0, nameOffset);
    if (terminator < 0 || terminator - nameOffset > 160) continue;
    const name = buffer.toString("ascii", nameOffset, terminator);
    if (!/^[A-Za-z_][A-Za-z0-9_@?$]*$/.test(name)) continue;
    exportNames.push(name);
    const ordinal = buffer.readUInt16LE(ordinalsOffset + index * 2);
    if (ordinal >= functionCount) continue;
    const functionRva = buffer.readUInt32LE(functionsOffset + ordinal * 4);
    const forwarded = exportSize > 0 && functionRva >= exportRva && functionRva < exportRva + exportSize;
    const functionSection = sections.find((item) => functionRva >= item.virtualAddress && functionRva - item.virtualAddress < item.rawSize);
    const executable = Boolean(functionSection && (functionSection.characteristics & 0x20000000));
    if (functionRva && !forwarded && executable && rvaToOffset(functionRva) !== null) callableExportNames.push(name);
  }
  return {
    architecture,
    bitness,
    exportTableStatus: "parsed",
    exportNames: [...new Set(exportNames)],
    callableExportNames: [...new Set(callableExportNames)]
  };
}

function normalizePeExportName(name = "") {
  return String(name || "").replace(/^_/, "").replace(/@\d+$/, "");
}

function readJ2534RegistryText() {
  if (process.platform !== "win32") return "";
  return J2534_REGISTRY_ROOTS.map((registryRoot) => {
    try {
      return execFileSync("reg.exe", ["query", registryRoot, "/s"], {
        encoding: "utf8",
        windowsHide: true,
        stdio: ["ignore", "pipe", "ignore"],
        timeout: 4000,
        maxBuffer: 1024 * 1024
      });
    } catch (_error) {
      return "";
    }
  }).filter(Boolean).join("\n");
}

function buildReplaySnapshot(options = {}) {
  const replayText = String(options.replayLogText || readReplayLogFile(options.replayLogPath || process.env.LOCAL_BRIDGE_REPLAY_LOG) || "");
  return replayText ? decodeReplayLog(replayText) : null;
}

function buildEcuResponsesForDtcs(dtcs = [], dtcStatus = "stored", outcomes = []) {
  const matchingOutcomes = (Array.isArray(outcomes) ? outcomes : []).filter((item) => item?.dtc_status === dtcStatus && item?.ecu);
  const ecuIds = [...new Set([
    ...(Array.isArray(dtcs) ? dtcs : []).map((item) => item?.ecu).filter(Boolean),
    ...matchingOutcomes.map((item) => item.ecu)
  ])].sort();
  const requestedService = dtcStatus === "pending" ? "07" : dtcStatus === "permanent" ? "0A" : "03";
  const positiveResponseService = dtcStatus === "pending" ? "47" : dtcStatus === "permanent" ? "4A" : "43";
  return ecuIds.map((ecu) => {
    const ecuOutcomes = matchingOutcomes.filter((item) => item.ecu === ecu);
    const codes = [...new Set((Array.isArray(dtcs) ? dtcs : []).filter((item) => item.ecu === ecu).map((item) => item.code))];
    const hasReported = ecuOutcomes.some((item) => item.status === "reported") || codes.length > 0;
    const negativeOutcomes = ecuOutcomes.filter((item) => item.status === "negative_response");
    const errorCodes = [...new Set(ecuOutcomes.flatMap((item) => item.error_codes || []))];
    const status = hasReported ? "reported" : negativeOutcomes.length ? "negative_response" : "unparsed";
    const responseServices = [...new Set([
      ...(hasReported ? [positiveResponseService] : []),
      ...(negativeOutcomes.length ? ["7F"] : [])
    ])];
    const negativeResponseCodes = [...new Set(negativeOutcomes.map((item) => item.negative_response_code).filter(Boolean))];
    return {
      ecu,
      intent: dtcStatus === "pending" ? "read_pending_dtc" : dtcStatus === "permanent" ? "read_permanent_dtc" : "read_stored_dtc",
      dtc_status: dtcStatus,
      status,
      dtc_count: codes.length,
      response_count: ecuOutcomes.length || 1,
      services: [requestedService],
      response_services: responseServices,
      negative_response_count: negativeOutcomes.length,
      pending_negative_response_count: negativeOutcomes.filter((item) => item.negative_response_code === "78").length,
      negative_requested_services: negativeOutcomes.length ? [requestedService] : [],
      negative_response_labels: negativeResponseCodes.map((code) => `OBD NRC ${code}`),
      ...(errorCodes.length ? { error_codes: errorCodes } : {}),
      dtcs: codes,
      read_only: true,
      vehicle_command_enabled: false,
      would_transmit: false
    };
  });
}

function readReplayLogFile(filePath) {
  if (!filePath) return "";
  try {
    return fs.readFileSync(path.resolve(filePath), "utf8");
  } catch (_error) {
    return "";
  }
}

export function decodeReplayLog(text) {
  const packets = reassembleReplayIsoTpPackets(String(text || "")
    .split(/\r?\n/)
    .map((line) => parseReplayLineBytes(line))
    .filter((packet) => packet.bytes.length));
  const dtcs = [];
  const liveValues = [];
  const livePidEcuOutcomes = [];
  const freezeFrameValues = [];
  const freezeFrameEcuOutcomes = [];
  const ecuInfoValues = [];
  const ecuInfoEcuOutcomes = [];
  const dtcEcuOutcomes = [];
  const onboardMonitorTests = [];
  const onboardMonitorEcuOutcomes = [];
  const supportedPids = new Set();
  const supportedPidsByEcu = new Map();
  const supportedPidPageBasesByEcu = new Map();
  const supportedPidEcuOutcomes = [];
  const ecus = new Set();
  const dtcReadoutObserved = { stored: false, pending: false, permanent: false };
  const dtcReadoutErrors = { stored: null, pending: null, permanent: null };
  const readoutObserved = { freeze_frame: false, supported_pids: false, readiness_snapshot: false, ecu_info: false, onboard_monitor: false, live_pid_snapshot: false };
  const readoutErrors = { freeze_frame: null, supported_pids: null, readiness_snapshot: null, ecu_info: null, onboard_monitor: null, live_pid_snapshot: null };
  const readinessEcuSnapshots = [];
  const readinessEcuOutcomes = [];
  let triggerDtc = null;
  const triggerDtcEntries = [];

  const recordSupportedPid = (ecu, pid) => {
    if (!pid) return;
    supportedPids.add(pid);
    if (!ecu) return;
    const ecuPids = supportedPidsByEcu.get(ecu) || new Set();
    ecuPids.add(pid);
    supportedPidsByEcu.set(ecu, ecuPids);
  };

  const recordSupportedPidPageBase = (ecu, pid) => {
    if (!ecu || !pid) return;
    const pageBases = supportedPidPageBasesByEcu.get(ecu) || new Set();
    pageBases.add(pid);
    supportedPidPageBasesByEcu.set(ecu, pageBases);
  };

  const recordSupportedPidEcuOutcome = (ecu, errorCode) => {
    if (!ecu || !errorCode) return;
    supportedPidEcuOutcomes.push({ source_ecu: ecu, error_codes: [errorCode] });
  };

  const recordEcuInfoOutcome = (ecu, errorCode, details = {}) => {
    if (!ecu || !errorCode) return;
    ecuInfoEcuOutcomes.push({
      source_ecu: ecu,
      ecu_info_readout_status: "unparsed",
      error_codes: [errorCode],
      ...details
    });
  };

  const recordDtcEcuOutcome = (ecu, dtcStatus, status, details = {}) => {
    if (!ecu || !dtcStatus || !status) return;
    dtcEcuOutcomes.push({ ecu, dtc_status: dtcStatus, status, ...details });
  };

  const recordFreezeFrameEcuOutcome = (ecu, errorCode, details = {}) => {
    if (!ecu || !errorCode) return;
    freezeFrameEcuOutcomes.push({ source_ecu: ecu, error_codes: [errorCode], ...details });
  };

  const recordReadinessEcuOutcome = (ecu, errorCode) => {
    if (!ecu || !errorCode) return;
    readinessEcuOutcomes.push({ source_ecu: ecu, error_codes: [errorCode] });
  };

  const recordOnboardMonitorEcuOutcome = (ecu, errorCode, details = {}) => {
    if (!ecu || !errorCode) return;
    onboardMonitorEcuOutcomes.push({ source_ecu: ecu, error_codes: [errorCode], ...details });
  };

  const recordLivePidEcuOutcome = (ecu, errorCode, pid = null) => {
    if (!ecu || !errorCode) return;
    livePidEcuOutcomes.push({ source_ecu: ecu, error_codes: [errorCode], ...(pid ? { pid } : {}) });
  };

  packets.forEach((packet) => {
    const { ecu, bytes } = packet;
    if (ecu) ecus.add(ecu);
    if (packet.isoTpIncomplete) {
      applyReplayIsoTpTransportError(packet, dtcReadoutErrors, readoutErrors);
      if (packet.responseService === 0x49) recordEcuInfoOutcome(ecu, "replay_ecu_info_transport_incomplete");
      if (packet.responseService === 0x42) recordFreezeFrameEcuOutcome(ecu, "replay_freeze_frame_transport_incomplete");
      if (packet.responseService === 0x41 && packet.responsePid === 0x01) recordReadinessEcuOutcome(ecu, "replay_readiness_transport_incomplete");
      if (packet.responseService === 0x41 && isSupportedPidBase(packet.responsePid)) recordSupportedPidEcuOutcome(ecu, "replay_supported_pids_transport_incomplete");
      if (packet.responseService === 0x46) recordOnboardMonitorEcuOutcome(ecu, "replay_onboard_monitor_transport_incomplete");
      if (packet.responseService === 0x41 && packet.responsePid !== 0x01 && !isSupportedPidBase(packet.responsePid)) {
        recordLivePidEcuOutcome(ecu, "replay_live_pid_transport_incomplete", toHexByte(packet.responsePid));
      }
      if ([0x43, 0x47, 0x4A].includes(packet.responseService)) {
        const dtcStatus = packet.responseService === 0x47 ? "pending" : packet.responseService === 0x4A ? "permanent" : "stored";
        recordDtcEcuOutcome(ecu, dtcStatus, "unparsed", { error_codes: ["replay_dtc_transport_incomplete"] });
      }
      return;
    }
    const serviceIndex = findReplayResponseIndex(bytes);
    if (serviceIndex < 0) return;
    const service = bytes[serviceIndex];

    if (service === 0x7F) {
      applyReplayNegativeResponse(bytes[serviceIndex + 1], bytes[serviceIndex + 2], dtcReadoutErrors, readoutErrors);
      if ([0x03, 0x07, 0x0A].includes(bytes[serviceIndex + 1])) {
        const requestedService = bytes[serviceIndex + 1];
        const responseCode = toHexByte(bytes[serviceIndex + 2]);
        const dtcStatus = requestedService === 0x07 ? "pending" : requestedService === 0x0A ? "permanent" : "stored";
        if (responseCode) recordDtcEcuOutcome(ecu, dtcStatus, "negative_response", {
          negative_requested_service: toHexByte(requestedService),
          negative_response_code: responseCode
        });
      }
      if (bytes[serviceIndex + 1] === 0x02) {
        const responseCode = toHexByte(bytes[serviceIndex + 2]);
        if (responseCode) recordFreezeFrameEcuOutcome(ecu, `replay_negative_response_02_${responseCode}`, {
          negative_requested_service: "02",
          negative_response_code: responseCode
        });
      }
      if (bytes[serviceIndex + 1] === 0x09) {
        const responseCode = toHexByte(bytes[serviceIndex + 2]);
        if (responseCode) {
          recordEcuInfoOutcome(ecu, `replay_negative_response_09_${responseCode}`, {
            ecu_info_negative_response_service: "09",
            ecu_info_negative_response_code: responseCode
          });
        }
      }
      if (bytes[serviceIndex + 1] === 0x06) {
        const responseCode = toHexByte(bytes[serviceIndex + 2]);
        if (responseCode) recordOnboardMonitorEcuOutcome(ecu, `replay_negative_response_06_${responseCode}`, {
          negative_requested_service: "06",
          negative_response_code: responseCode
        });
      }
      return;
    }

    if (service === 0x43 || service === 0x47 || service === 0x4A) {
      const status = service === 0x47 ? "pending" : service === 0x4A ? "permanent" : "stored";
      const payloadStart = serviceIndex + 1;
      const payloadLength = bytes.length - payloadStart;
      const trailingPaddingByte = payloadLength % 2 === 1 ? bytes[bytes.length - 1] : null;
      if (payloadLength < 2 || (payloadLength % 2 === 1 && trailingPaddingByte !== 0)) {
        dtcReadoutErrors[status] = "replay_dtc_payload_incomplete";
        recordDtcEcuOutcome(ecu, status, "unparsed", { error_codes: ["replay_dtc_payload_incomplete"] });
        return;
      }
      dtcReadoutObserved[status] = true;
      recordDtcEcuOutcome(ecu, status, "reported", { response_service: toHexByte(service) });
      const completePayloadEnd = payloadLength % 2 === 0 ? bytes.length : bytes.length - 1;
      for (let index = payloadStart; index + 1 < completePayloadEnd; index += 2) {
        const high = bytes[index];
        const low = bytes[index + 1];
        if (high === 0 && low === 0) continue;
        dtcs.push({ code: decodeDtcPair(high, low), status, ecu: ecu || null });
      }
      return;
    }

    if (service === 0x42) {
      const pid = toHexByte(bytes[serviceIndex + 1]);
      const frameNumber = bytes[serviceIndex + 2];
      if (!pid || !Number.isInteger(frameNumber)) {
        readoutErrors.freeze_frame = "replay_freeze_frame_payload_incomplete";
        recordFreezeFrameEcuOutcome(ecu, "replay_freeze_frame_payload_incomplete");
        return;
      }
      if (pid === "02") {
        if (serviceIndex + 4 >= bytes.length) {
          readoutErrors.freeze_frame = "replay_freeze_frame_payload_incomplete";
          recordFreezeFrameEcuOutcome(ecu, "replay_freeze_frame_payload_incomplete");
          return;
        }
        const decodedDtc = decodeDtcPair(bytes[serviceIndex + 3], bytes[serviceIndex + 4]);
        if (decodedDtc !== "P0000") {
          triggerDtc = triggerDtc || decodedDtc;
          triggerDtcEntries.push({
            code: decodedDtc,
            frame_number: frameNumber,
            ...(ecu ? { source_ecu: ecu } : {})
          });
        }
        readoutObserved.freeze_frame = true;
        return;
      }
      const decodedValues = decodeLivePidValues(pid, bytes.slice(serviceIndex + 3));
      if (!decodedValues.length) {
        readoutErrors.freeze_frame = "replay_freeze_frame_payload_unparsed";
        recordFreezeFrameEcuOutcome(ecu, "replay_freeze_frame_payload_unparsed");
        return;
      }
      readoutObserved.freeze_frame = true;
      decodedValues.forEach((decoded) => freezeFrameValues.push({
        ...decoded,
        freeze_frame_number: frameNumber,
        ...(ecu ? { source_ecu: ecu } : {})
      }));
      recordSupportedPid(ecu, pid);
      return;
    }

    if (service === 0x49) {
      const decoded = decodeEcuInfoValue(bytes[serviceIndex + 1], bytes.slice(serviceIndex + 2));
      if (!decoded) {
        readoutErrors.ecu_info = "replay_ecu_info_payload_unparsed";
        recordEcuInfoOutcome(ecu, "replay_ecu_info_payload_unparsed");
        return;
      }
      readoutObserved.ecu_info = true;
      ecuInfoValues.push(ecu ? { ...decoded, source_ecu: ecu } : decoded);
      return;
    }

    if (service === 0x46) {
      const decoded = decodeOnboardMonitorTest(bytes.slice(serviceIndex + 1));
      if (!decoded) {
        readoutErrors.onboard_monitor = "replay_onboard_monitor_payload_incomplete";
        recordOnboardMonitorEcuOutcome(ecu, "replay_onboard_monitor_payload_incomplete");
        return;
      }
      readoutObserved.onboard_monitor = true;
      onboardMonitorTests.push(ecu ? { ...decoded, source_ecu: ecu } : decoded);
      return;
    }

    if (service === 0x41) {
      const pid = toHexByte(bytes[serviceIndex + 1]);
      if (!pid) return;
      if (isSupportedPidBase(bytes[serviceIndex + 1])) {
        const bitmap = bytes.slice(serviceIndex + 2, serviceIndex + 6);
        if (bitmap.length < 4) {
          readoutErrors.supported_pids = "replay_supported_pids_payload_incomplete";
          recordSupportedPidEcuOutcome(ecu, "replay_supported_pids_payload_incomplete");
          return;
        }
        readoutObserved.supported_pids = true;
        const decodedPids = decodeSupportedPids(bitmap, bytes[serviceIndex + 1]);
        decodedPids.forEach((item) => recordSupportedPid(ecu, item));
        recordSupportedPidPageBase(ecu, pid);
        return;
      }
      if (pid === "01") {
        const readinessBytes = bytes.slice(serviceIndex + 2, serviceIndex + 6);
        if (readinessBytes.length < 4) {
          readoutErrors.readiness_snapshot = "replay_readiness_payload_incomplete";
          recordReadinessEcuOutcome(ecu, "replay_readiness_payload_incomplete");
          return;
        }
        readoutObserved.readiness_snapshot = true;
        readinessEcuSnapshots.push({
          ...(ecu ? { source_ecu: ecu } : {}),
          readiness_status_byte_a: readinessBytes[0],
          readiness_status_byte_b: readinessBytes[1],
          readiness_status_byte_c: readinessBytes[2],
          readiness_status_byte_d: readinessBytes[3]
        });
      }
      const decodedValues = decodeLivePidValues(pid, bytes.slice(serviceIndex + 2));
      if (!decodedValues.length) {
        readoutErrors.live_pid_snapshot = "replay_live_pid_payload_unparsed";
        recordLivePidEcuOutcome(ecu, "replay_live_pid_payload_unparsed", pid);
        return;
      }
      readoutObserved.live_pid_snapshot = true;
      decodedValues.forEach((decoded) => liveValues.push(ecu ? { ...decoded, source_ecu: ecu } : decoded));
      recordSupportedPid(ecu, pid);
    }
  });

  return {
    protocol: "ISO15765-4-log-replay",
    dtcReadoutObserved,
    dtc_readout_observed: { ...dtcReadoutObserved },
    dtcReadoutErrors,
    dtc_readout_errors: { ...dtcReadoutErrors },
    readoutObserved,
    readout_observed: { ...readoutObserved },
    readoutErrors,
    readout_errors: { ...readoutErrors },
    ecuResponses: [...ecus].map((ecu) => ({ ecu, status: "replay", dtcs: dtcs.filter((item) => item.ecu === ecu).map((item) => item.code) })),
    dtcEcuOutcomes: uniqueBy(dtcEcuOutcomes, (item) => `${item.ecu || ""}:${item.dtc_status || ""}:${item.status || ""}:${item.negative_requested_service || ""}:${item.negative_response_code || ""}:${(item.error_codes || []).join(",")}`),
    dtcs: uniqueBy(dtcs, (item) => `${item.code}:${item.status}:${item.ecu || ""}`),
    liveValues: uniqueBy(liveValues, (item) => `${item.id}:${item.source_ecu || ""}`),
    livePidEcuOutcomes: uniqueBy(livePidEcuOutcomes, (item) => `${item.source_ecu || ""}:${item.pid || ""}:${(item.error_codes || []).join(",")}`),
    freezeFrameValues: uniqueBy(freezeFrameValues, (item) => `${item.id}:${item.freeze_frame_number}:${item.source_ecu || ""}`),
    freezeFrameEcuOutcomes: uniqueBy(freezeFrameEcuOutcomes, (item) => `${item.source_ecu || ""}:${item.negative_requested_service || ""}:${item.negative_response_code || ""}:${(item.error_codes || []).join(",")}`),
    ecuInfoValues: uniqueBy(ecuInfoValues, (item) => `${item.id}:${item.source_ecu || ""}`),
    ecuInfoEcuOutcomes: uniqueBy(ecuInfoEcuOutcomes, (item) => `${item.source_ecu || ""}:${item.ecu_info_negative_response_service || ""}:${item.ecu_info_negative_response_code || ""}:${(item.error_codes || []).join(",")}`),
    onboardMonitorTests: uniqueBy(onboardMonitorTests, (item) => `${item.test_id}:${item.component_id}:${item.source_ecu || ""}`),
    onboardMonitorEcuOutcomes: uniqueBy(onboardMonitorEcuOutcomes, (item) => `${item.source_ecu || ""}:${item.negative_requested_service || ""}:${item.negative_response_code || ""}:${(item.error_codes || []).join(",")}`),
    readinessEcuSnapshots: uniqueBy(readinessEcuSnapshots, (item) => item.source_ecu || "default"),
    readinessEcuOutcomes: uniqueBy(readinessEcuOutcomes, (item) => `${item.source_ecu || ""}:${(item.error_codes || []).join(",")}`),
    triggerDtc,
    triggerDtcEntries: uniqueBy(triggerDtcEntries, (item) => `${item.code}:${item.frame_number}:${item.source_ecu || ""}`),
    supportedPids: [...supportedPids].sort(),
    supportedPidEcuOutcomes: uniqueBy(supportedPidEcuOutcomes, (item) => `${item.source_ecu || ""}:${(item.error_codes || []).join(",")}`),
    supportedPidEcuSnapshots: [...new Set([...supportedPidsByEcu.keys(), ...supportedPidPageBasesByEcu.keys()])]
      .sort()
      .map((ecu) => ({
        source_ecu: ecu,
        supported_pids: [...(supportedPidsByEcu.get(ecu) || new Set())].sort(),
        supported_pid_page_bases: [...(supportedPidPageBasesByEcu.get(ecu) || new Set())].sort()
      }))
  };
}

function parseReplayLineBytes(line) {
  const normalized = normalizeReplayCanLine(line);
  const tokens = normalized.toUpperCase().match(/\b[0-9A-F]{2,8}\b/g) || [];
  const hasCanId = /^[0-9A-F]{3}$/.test(tokens[0] || "") || /^[0-9A-F]{8}$/.test(tokens[0] || "");
  const ecu = hasCanId ? tokens[0] : null;
  const byteTokens = (hasCanId ? tokens.slice(1) : tokens).filter((token) => /^[0-9A-F]{2}$/.test(token));
  return { ecu, bytes: byteTokens.map((token) => parseInt(token, 16)) };
}

function reassembleReplayIsoTpPackets(packets = []) {
  const output = [];
  const pendingByEcu = new Map();

  const discardPending = (ecu) => {
    const pending = pendingByEcu.get(ecu);
    if (!pending) return;
    pendingByEcu.delete(ecu);
    output.push(buildReplayIsoTpIncompletePacket(pending.ecu, pending.payload));
  };

  packets.forEach((packet) => {
    const bytes = getReplayIsoTpTransportBytes(packet?.bytes || []);
    const pci = bytes[0];
    const isFirstFrame = packet?.ecu && Number.isInteger(pci) && (pci & 0xF0) === 0x10 && Number.isInteger(bytes[1]);
    const isConsecutiveFrame = packet?.ecu && Number.isInteger(pci) && (pci & 0xF0) === 0x20;

    if (isFirstFrame) {
      const expectedLength = ((pci & 0x0F) * 0x100) + bytes[1];
      if (expectedLength <= 7) {
        output.push(buildReplayIsoTpIncompletePacket(packet.ecu, bytes.slice(2)));
        return;
      }
      discardPending(packet.ecu);
      const pending = {
        ecu: packet.ecu,
        expectedLength,
        payload: bytes.slice(2),
        nextSequenceNumber: 1,
        sequenceError: false
      };
      if (pending.payload.length >= pending.expectedLength) {
        output.push({ ecu: pending.ecu, bytes: pending.payload.slice(0, pending.expectedLength) });
      } else {
        pendingByEcu.set(packet.ecu, pending);
      }
      return;
    }

    if (isConsecutiveFrame) {
      const pending = pendingByEcu.get(packet.ecu);
      if (!pending) {
        output.push(buildReplayIsoTpIncompletePacket(packet.ecu));
        return;
      }
      const sequenceNumber = pci & 0x0F;
      if (sequenceNumber !== pending.nextSequenceNumber) pending.sequenceError = true;
      pending.nextSequenceNumber = (sequenceNumber + 1) & 0x0F;
      pending.payload.push(...bytes.slice(1));
      if (pending.payload.length >= pending.expectedLength) {
        pendingByEcu.delete(packet.ecu);
        output.push(pending.sequenceError
          ? buildReplayIsoTpIncompletePacket(pending.ecu, pending.payload)
          : { ecu: pending.ecu, bytes: pending.payload.slice(0, pending.expectedLength) });
      }
      return;
    }

    output.push(packet);
  });

  pendingByEcu.forEach((_pending, ecu) => discardPending(ecu));
  return output;
}

function buildReplayIsoTpIncompletePacket(ecu, payload = []) {
  return {
    ecu: ecu || null,
    bytes: [],
    isoTpIncomplete: true,
    responseService: payload[0],
    responsePid: payload[1]
  };
}

function applyReplayIsoTpTransportError(packet, dtcReadoutErrors, readoutErrors) {
  const service = packet?.responseService;
  if (service === 0x43 || service === 0x47 || service === 0x4A) {
    const status = service === 0x47 ? "pending" : service === 0x4A ? "permanent" : "stored";
    dtcReadoutErrors[status] = "replay_dtc_transport_incomplete";
    return;
  }
  if (service === 0x42) {
    readoutErrors.freeze_frame = "replay_freeze_frame_transport_incomplete";
    return;
  }
  if (service === 0x49) {
    readoutErrors.ecu_info = "replay_ecu_info_transport_incomplete";
    return;
  }
  if (service === 0x46) {
    readoutErrors.onboard_monitor = "replay_onboard_monitor_transport_incomplete";
    return;
  }
  if (service === 0x41) {
    const pid = packet?.responsePid;
    if (isSupportedPidBase(pid)) {
      readoutErrors.supported_pids = "replay_supported_pids_transport_incomplete";
    } else if (pid === 0x01) {
      readoutErrors.readiness_snapshot = "replay_readiness_transport_incomplete";
    } else {
      readoutErrors.live_pid_snapshot = "replay_live_pid_transport_incomplete";
    }
  }
}

function applyReplayNegativeResponse(requestedService, responseCode, dtcReadoutErrors, readoutErrors) {
  const requestedServiceHex = toHexByte(requestedService);
  const responseCodeHex = toHexByte(responseCode);
  if (!requestedServiceHex || !responseCodeHex) return;
  const errorCode = `replay_negative_response_${requestedServiceHex}_${responseCodeHex}`;
  if (requestedService === 0x03 || requestedService === 0x07 || requestedService === 0x0A) {
    const status = requestedService === 0x07 ? "pending" : requestedService === 0x0A ? "permanent" : "stored";
    dtcReadoutErrors[status] = errorCode;
    return;
  }
  if (requestedService === 0x02) {
    readoutErrors.freeze_frame = errorCode;
    return;
  }
  if (requestedService === 0x09) {
    readoutErrors.ecu_info = errorCode;
    return;
  }
  if (requestedService === 0x06) readoutErrors.onboard_monitor = errorCode;
}

function getReplayIsoTpTransportBytes(bytes = []) {
  if (bytes[0] === bytes.length - 1 && isReplayIsoTpPci(bytes[1])) return bytes.slice(1);
  return bytes;
}

function isReplayIsoTpPci(value) {
  return Number.isInteger(value) && ((value & 0xF0) === 0x10 || (value & 0xF0) === 0x20);
}

function findReplayResponseIndex(bytes = []) {
  if (REPLAY_RESPONSE_SERVICES.has(bytes[0])) return 0;
  if (isReplaySingleFramePci(bytes[0]) && REPLAY_RESPONSE_SERVICES.has(bytes[1])) return 1;
  if (bytes[0] === bytes.length - 1 && isReplaySingleFramePci(bytes[1]) && REPLAY_RESPONSE_SERVICES.has(bytes[2])) return 2;
  return -1;
}

function isReplaySingleFramePci(value) {
  return Number.isInteger(value) && (value & 0xF0) === 0;
}

function normalizeReplayCanLine(line) {
  let text = String(line || "").trim().replace(/^\(\s*[0-9]+(?:\.[0-9]+)?\s*\)\s+/, "");
  text = text.replace(/\b([0-9A-F]{3}|[0-9A-F]{8})#([0-9A-F]{2,128})\b/gi, (_match, id, data) => {
    const bytes = data.match(/[0-9A-F]{2}/gi) || [];
    return [id.toUpperCase(), ...bytes.map((byte) => byte.toUpperCase())].join(" ");
  });
  text = text.replace(/\b([0-9A-F]{3}|[0-9A-F]{8})\s+\[(\d{1,2})\]\s+((?:[0-9A-F]{2}[\s,]*){1,64})/gi, (_match, id, length, data) => {
    const lengthByte = Math.max(0, Math.min(255, parseInt(length, 10) || 0)).toString(16).toUpperCase().padStart(2, "0");
    const bytes = data.match(/[0-9A-F]{2}/gi) || [];
    return [id.toUpperCase(), lengthByte, ...bytes.map((byte) => byte.toUpperCase())].join(" ");
  });
  const csv = normalizeReplayCsvLine(text);
  return csv || text;
}

function normalizeReplayCsvLine(line) {
  if (!/[,;\t]/.test(line)) return "";
  const parts = String(line).split(/[,;\t]/).map((part) => part.trim()).filter(Boolean);
  const idIndex = parts.findIndex((part) => /^[0-9A-F]{3}$|^[0-9A-F]{8}$/i.test(part));
  if (idIndex < 0) return "";
  let byteStart = parts.length;
  while (byteStart > idIndex + 1 && /^[0-9A-F]{2}$/i.test(parts[byteStart - 1])) byteStart -= 1;
  const bytes = parts.slice(byteStart).filter((part) => /^[0-9A-F]{2}$/i.test(part));
  if (!bytes.length) return "";
  const lengthPart = parts[byteStart - 1] || "";
  const parsedLength = /^\d{1,3}$/.test(lengthPart) ? parseInt(lengthPart, 10) : bytes.length;
  const lengthByte = Math.max(0, Math.min(255, parsedLength)).toString(16).toUpperCase().padStart(2, "0");
  return [parts[idIndex].toUpperCase(), lengthByte, ...bytes.map((byte) => byte.toUpperCase())].join(" ");
}

function decodeDtcPair(high, low) {
  const system = ["P", "C", "B", "U"][(high & 0xC0) >> 6];
  return `${system}${((high & 0x30) >> 4).toString(16)}${(high & 0x0F).toString(16)}${((low & 0xF0) >> 4).toString(16)}${(low & 0x0F).toString(16)}`.toUpperCase();
}

function decodeLivePidValues(pid, payload) {
  const a = payload[0];
  const b = payload[1];
  const c = payload[2];
  const d = payload[3];

  if (pid === "01" && [a, b, c, d].every(Number.isInteger)) {
    return [
      { id: "mil_status", pid, value: Boolean(a & 0x80), unit: "boolean" },
      { id: "stored_dtc_count", pid, value: a & 0x7F, unit: "count" },
      { id: "readiness_status_byte_b", pid, value: b, unit: "raw" },
      { id: "readiness_status_byte_c", pid, value: c, unit: "raw" },
      { id: "readiness_status_byte_d", pid, value: d, unit: "raw" },
      { id: "readiness_flag_count", pid, value: countSetBits(b) + countSetBits(c) + countSetBits(d), unit: "count" }
    ];
  }

  if (pid === "03" && Number.isInteger(a) && Number.isInteger(b)) {
    return [
      { id: "fuel_system_status_bank1", pid, value: decodeFuelSystemStatus(a), unit: "" },
      { id: "fuel_system_status_bank2", pid, value: decodeFuelSystemStatus(b), unit: "" }
    ];
  }

  if (pid === "1C" && Number.isInteger(a)) {
    return [{ id: "obd_standard", pid, value: decodeObdStandard(a), unit: "" }];
  }

  if (pid === "12" && Number.isInteger(a)) {
    return [{ id: "secondary_air_status", pid, value: decodeSecondaryAirStatus(a), unit: "" }];
  }

  if (pid === "13" && Number.isInteger(a)) {
    return [{ id: "oxygen_sensors_present", pid, value: decodeOxygenSensorsPresent(a, false), unit: "" }];
  }

  if (pid === "1D" && Number.isInteger(a)) {
    return [{ id: "oxygen_sensors_present_4banks", pid, value: decodeOxygenSensorsPresent(a, true), unit: "" }];
  }

  if (pid === "1E" && Number.isInteger(a)) {
    return [{ id: "auxiliary_input_status", pid, value: (a & 0x01) ? "pto_active" : "pto_inactive", unit: "" }];
  }

  const o2SensorPidMap = {
    "14": ["o2_b1s1_voltage", "o2_b1s1_stft"],
    "15": ["o2_b1s2_voltage", "o2_b1s2_stft"],
    "16": ["o2_b1s3_voltage", "o2_b1s3_stft"],
    "17": ["o2_b1s4_voltage", "o2_b1s4_stft"],
    "18": ["o2_b2s1_voltage", "o2_b2s1_stft"],
    "19": ["o2_b2s2_voltage", "o2_b2s2_stft"],
    "1A": ["o2_b2s3_voltage", "o2_b2s3_stft"],
    "1B": ["o2_b2s4_voltage", "o2_b2s4_stft"]
  };
  if (o2SensorPidMap[pid] && Number.isInteger(a) && Number.isInteger(b)) {
    const [voltageId, trimId] = o2SensorPidMap[pid];
    return [
      { id: voltageId, pid, value: Number((a / 200).toFixed(3)), unit: "V" },
      { id: trimId, pid, value: decodePercentCentered(b), unit: "%" }
    ];
  }

  const wideO2VoltagePidMap = {
    "24": ["wide_o2_b1s1_ratio", "wide_o2_b1s1_voltage_wide"],
    "25": ["wide_o2_b1s2_ratio", "wide_o2_b1s2_voltage_wide"],
    "26": ["wide_o2_b1s3_ratio", "wide_o2_b1s3_voltage_wide"],
    "27": ["wide_o2_b1s4_ratio", "wide_o2_b1s4_voltage_wide"],
    "28": ["wide_o2_b2s1_ratio", "wide_o2_b2s1_voltage_wide"],
    "29": ["wide_o2_b2s2_ratio", "wide_o2_b2s2_voltage_wide"],
    "2A": ["wide_o2_b2s3_ratio", "wide_o2_b2s3_voltage_wide"],
    "2B": ["wide_o2_b2s4_ratio", "wide_o2_b2s4_voltage_wide"]
  };
  if (wideO2VoltagePidMap[pid] && [a, b, c, d].every(Number.isInteger)) {
    const [ratioId, voltageId] = wideO2VoltagePidMap[pid];
    return [
      { id: ratioId, pid, value: Number((((a * 256) + b) / 32768).toFixed(3)), unit: "" },
      { id: voltageId, pid, value: Number((((c * 256) + d) / 8192).toFixed(3)), unit: "V" }
    ];
  }

  const wideO2CurrentPidMap = {
    "34": ["wide_o2_b1s1_current_ratio", "wide_o2_b1s1_current"],
    "35": ["wide_o2_b1s2_current_ratio", "wide_o2_b1s2_current"],
    "38": ["wide_o2_b2s1_current_ratio", "wide_o2_b2s1_current"],
    "39": ["wide_o2_b2s2_current_ratio", "wide_o2_b2s2_current"]
  };
  if (wideO2CurrentPidMap[pid] && [a, b, c, d].every(Number.isInteger)) {
    const [ratioId, currentId] = wideO2CurrentPidMap[pid];
    return [
      { id: ratioId, pid, value: Number((((a * 256) + b) / 32768).toFixed(3)), unit: "" },
      { id: currentId, pid, value: Number(((((c * 256) + d) - 32768) / 256).toFixed(3)), unit: "mA" }
    ];
  }

  const catalystTempPidMap = {
    "3C": "catalyst_temp_b1s1",
    "3D": "catalyst_temp_b2s1",
    "3E": "catalyst_temp_b1s2",
    "3F": "catalyst_temp_b2s2"
  };
  if (catalystTempPidMap[pid] && Number.isInteger(a) && Number.isInteger(b)) {
    return [{
      id: catalystTempPidMap[pid],
      pid,
      value: Number(((((a * 256) + b) / 10) - 40).toFixed(1)),
      unit: "°C"
    }];
  }

  if (pid === "64" && [a, b, c, d, payload[4]].every(Number.isInteger)) {
    return [
      { id: "engine_percent_torque_idle", pid, value: a - 125, unit: "%" },
      { id: "engine_percent_torque_point1", pid, value: b - 125, unit: "%" },
      { id: "engine_percent_torque_point2", pid, value: c - 125, unit: "%" },
      { id: "engine_percent_torque_point3", pid, value: d - 125, unit: "%" },
      { id: "engine_percent_torque_point4", pid, value: payload[4] - 125, unit: "%" }
    ];
  }

  const decoded = decodeLivePid(pid, payload);
  return decoded ? [decoded] : [];
}

function decodeLivePid(pid, payload) {
  const a = payload[0];
  const b = payload[1];
  if (pid === "51" && Number.isInteger(a)) {
    return { id: "fuel_type", pid, value: decodeFuelType(a), unit: "" };
  }
  const pidMap = {
    "04": ["calculated_load", Number.isInteger(a) ? a * 100 / 255 : null, "%"],
    "05": ["coolant_temp", Number.isInteger(a) ? a - 40 : null, "°C"],
    "06": ["stft_b1", decodePercentCentered(a), "%"],
    "07": ["ltft_b1", decodePercentCentered(a), "%"],
    "08": ["stft_b2", decodePercentCentered(a), "%"],
    "09": ["ltft_b2", decodePercentCentered(a), "%"],
    "0A": ["fuel_pressure", Number.isInteger(a) ? a * 3 : null, "kPa"],
    "0B": ["map", Number.isInteger(a) ? a : null, "kPa"],
    "0C": ["engine_speed", Number.isInteger(a) && Number.isInteger(b) ? ((a * 256) + b) / 4 : null, "rpm"],
    "0D": ["vehicle_speed", Number.isInteger(a) ? a : null, "km/h"],
    "0E": ["timing_advance", Number.isInteger(a) ? (a / 2) - 64 : null, "°"],
    "0F": ["intake_air_temp", Number.isInteger(a) ? a - 40 : null, "°C"],
    "10": ["maf", Number.isInteger(a) && Number.isInteger(b) ? ((a * 256) + b) / 100 : null, "g/s"],
    "11": ["throttle_position", Number.isInteger(a) ? a * 100 / 255 : null, "%"],
    "1F": ["engine_runtime", Number.isInteger(a) && Number.isInteger(b) ? (a * 256) + b : null, "s"],
    "21": ["distance_with_mil", Number.isInteger(a) && Number.isInteger(b) ? (a * 256) + b : null, "km"],
    "22": ["fuel_rail_pressure_vacuum", Number.isInteger(a) && Number.isInteger(b) ? ((a * 256) + b) * 0.079 : null, "kPa"],
    "23": ["fuel_rail_pressure", Number.isInteger(a) && Number.isInteger(b) ? ((a * 256) + b) * 10 : null, "kPa"],
    "2C": ["commanded_egr", Number.isInteger(a) ? a * 100 / 255 : null, "%"],
    "2D": ["egr_error", decodePercentCentered(a), "%"],
    "2E": ["commanded_evap_purge", Number.isInteger(a) ? a * 100 / 255 : null, "%"],
    "2F": ["fuel_level", Number.isInteger(a) ? a * 100 / 255 : null, "%"],
    "30": ["warmups_since_clear", Number.isInteger(a) ? a : null, "count"],
    "31": ["distance_since_clear", Number.isInteger(a) && Number.isInteger(b) ? (a * 256) + b : null, "km"],
    "32": ["evap_vapor_pressure", Number.isInteger(a) && Number.isInteger(b) ? (((a * 256) + b) / 4) : null, "Pa"],
    "33": ["barometric_pressure", Number.isInteger(a) ? a : null, "kPa"],
    "42": ["control_module_voltage", Number.isInteger(a) && Number.isInteger(b) ? ((a * 256) + b) / 1000 : null, "V"],
    "43": ["absolute_load", Number.isInteger(a) && Number.isInteger(b) ? ((a * 256) + b) * 100 / 255 : null, "%"],
    "44": ["commanded_equivalence_ratio", Number.isInteger(a) && Number.isInteger(b) ? ((a * 256) + b) / 32768 : null, ""],
    "45": ["relative_throttle_position", Number.isInteger(a) ? a * 100 / 255 : null, "%"],
    "46": ["ambient_air_temp", Number.isInteger(a) ? a - 40 : null, "°C"],
    "47": ["absolute_throttle_b", Number.isInteger(a) ? a * 100 / 255 : null, "%"],
    "48": ["absolute_throttle_c", Number.isInteger(a) ? a * 100 / 255 : null, "%"],
    "49": ["accelerator_position_d", Number.isInteger(a) ? a * 100 / 255 : null, "%"],
    "4A": ["accelerator_position_e", Number.isInteger(a) ? a * 100 / 255 : null, "%"],
    "4B": ["accelerator_position_f", Number.isInteger(a) ? a * 100 / 255 : null, "%"],
    "4C": ["commanded_throttle_actuator", Number.isInteger(a) ? a * 100 / 255 : null, "%"],
    "4D": ["time_with_mil", Number.isInteger(a) && Number.isInteger(b) ? (a * 256) + b : null, "min"],
    "4E": ["time_since_clear", Number.isInteger(a) && Number.isInteger(b) ? (a * 256) + b : null, "min"],
    "52": ["ethanol_percentage", Number.isInteger(a) ? a * 100 / 255 : null, "%"],
    "59": ["fuel_rail_pressure_absolute", Number.isInteger(a) && Number.isInteger(b) ? ((a * 256) + b) * 10 : null, "kPa"],
    "5A": ["relative_accelerator_position", Number.isInteger(a) ? a * 100 / 255 : null, "%"],
    "5B": ["hybrid_battery_remaining", Number.isInteger(a) ? a * 100 / 255 : null, "%"],
    "5C": ["engine_oil_temp", Number.isInteger(a) ? a - 40 : null, "°C"],
    "5D": ["fuel_injection_timing", Number.isInteger(a) && Number.isInteger(b) ? (((a * 256) + b) / 128) - 210 : null, "°"],
    "5E": ["engine_fuel_rate", Number.isInteger(a) && Number.isInteger(b) ? ((a * 256) + b) * 0.05 : null, "L/h"],
    "61": ["driver_demand_torque", Number.isInteger(a) ? a - 125 : null, "%"],
    "62": ["actual_engine_torque", Number.isInteger(a) ? a - 125 : null, "%"],
    "63": ["engine_reference_torque", Number.isInteger(a) && Number.isInteger(b) ? (a * 256) + b : null, "Nm"],
    "65": ["auxiliary_io_supported", Number.isInteger(a) ? a : null, "raw_mask"],
    "66": ["maf_sensor_status", Number.isInteger(a) ? a : null, "raw_mask"],
    "6A": ["commanded_diesel_intake_air_flow", Number.isInteger(a) ? a * 100 / 255 : null, "%"],
    "6C": ["commanded_throttle_control", Number.isInteger(a) ? a * 100 / 255 : null, "%"],
    "8E": ["engine_friction_torque", Number.isInteger(a) ? a - 125 : null, "%"]
  };
  const row = pidMap[pid];
  if (!row || !Number.isFinite(row[1])) return null;
  if (row[2] === "raw_mask") return { id: row[0], pid, value: `mask_${toHexByte(row[1])}`, unit: "" };
  return { id: row[0], pid, value: Number(row[1].toFixed(2)), unit: row[2] };
}

function decodeEcuInfoValue(infoTypeByte, payload = []) {
  const infoType = toHexByte(infoTypeByte);
  const itemMap = {
    "00": "supported_info_types_00",
    "02": "vin",
    "04": "calibration_id",
    "06": "calibration_verification_number",
    "08": "in_use_performance_tracking_spark",
    "0A": "ecu_name",
    "0B": "in_use_performance_tracking_compression"
  };
  const id = itemMap[infoType];
  if (!id) return null;
  const bytes = trimEcuInfoPayload(payload, infoType === "00");
  if (["00", "08", "0B"].includes(infoType)) {
    if (!bytes.length) return null;
    return { id, info_type: infoType, value: bytes.map((byte) => toHexByte(byte)).join(" ") };
  }
  const value = bytesToAscii(bytes);
  if (!value) return null;
  return { id, info_type: infoType, value };
}

function decodeOnboardMonitorTest(payload = []) {
  if (payload.length < 8) return null;
  return {
    test_id: toHexByte(payload[0]),
    component_id: toHexByte(payload[1]),
    value: (payload[2] * 256) + payload[3],
    min: (payload[4] * 256) + payload[5],
    max: (payload[6] * 256) + payload[7]
  };
}

function trimEcuInfoPayload(payload = [], preserveLeadingZeros = false) {
  const bytes = payload.filter(Number.isInteger);
  if (preserveLeadingZeros) return bytes.length ? bytes.slice(1) : [];
  if (bytes.length > 1 && bytes[0] <= 0x10) return bytes.slice(1);
  return bytes;
}

function bytesToAscii(bytes = []) {
  return bytes
    .filter((byte) => byte >= 0x20 && byte <= 0x7E)
    .map((byte) => String.fromCharCode(byte))
    .join("")
    .trim();
}

function decodeFuelType(value) {
  const fuelTypes = {
    0x00: "not_available",
    0x01: "gasoline",
    0x02: "methanol",
    0x03: "ethanol",
    0x04: "diesel",
    0x05: "lpg",
    0x06: "cng",
    0x07: "propane",
    0x08: "electric",
    0x09: "bifuel_gasoline",
    0x0A: "bifuel_methanol",
    0x0B: "bifuel_ethanol",
    0x0C: "bifuel_lpg",
    0x0D: "bifuel_cng",
    0x0E: "bifuel_propane",
    0x0F: "bifuel_electric",
    0x10: "bifuel_electric_combustion",
    0x11: "hybrid_gasoline",
    0x12: "hybrid_ethanol",
    0x13: "hybrid_diesel",
    0x14: "hybrid_electric",
    0x15: "hybrid_mixed_fuel",
    0x16: "hybrid_regenerative"
  };
  return fuelTypes[value] || `unknown_${toHexByte(value)}`;
}

function decodeFuelSystemStatus(value) {
  const statuses = {
    0x00: "not_available",
    0x01: "open_loop_insufficient_temperature",
    0x02: "closed_loop_oxygen_sensor_feedback",
    0x04: "open_loop_engine_load_or_fuel_cut",
    0x08: "open_loop_system_failure",
    0x10: "closed_loop_with_fault"
  };
  return statuses[value] || `unknown_${toHexByte(value)}`;
}

function decodeObdStandard(value) {
  const standards = {
    0x01: "obd_ii_carb",
    0x02: "obd_epa",
    0x03: "obd_and_obd_ii",
    0x04: "obd_i",
    0x05: "not_obd_compliant",
    0x06: "eobd",
    0x07: "eobd_and_obd_ii",
    0x08: "eobd_and_obd",
    0x09: "eobd_obd_and_obd_ii",
    0x0A: "jobd",
    0x0B: "jobd_and_obd_ii",
    0x0C: "jobd_and_eobd",
    0x0D: "jobd_eobd_and_obd_ii",
    0x11: "engine_manufacturer_diagnostics",
    0x12: "engine_manufacturer_diagnostics_enhanced",
    0x13: "heavy_duty_obd_c",
    0x14: "heavy_duty_obd",
    0x15: "world_wide_harmonized_obd",
    0x17: "heavy_duty_eobd_i",
    0x18: "heavy_duty_eobd_i_no_nox_control",
    0x19: "heavy_duty_eobd_ii",
    0x1A: "heavy_duty_eobd_ii_no_nox_control",
    0x1C: "brazil_obd_phase_1",
    0x1D: "brazil_obd_phase_2",
    0x1E: "korean_obd",
    0x1F: "india_obd_i",
    0x20: "india_obd_ii",
    0x21: "heavy_duty_euro_obd_stage_i",
    0x22: "heavy_duty_euro_obd_stage_i_no_nox_control",
    0x23: "heavy_duty_euro_obd_stage_ii",
    0x24: "heavy_duty_euro_obd_stage_ii_no_nox_control"
  };
  return standards[value] || `unknown_${toHexByte(value)}`;
}

function decodeSecondaryAirStatus(value) {
  const statuses = {
    0x01: "upstream_of_catalytic_converter",
    0x02: "downstream_of_catalytic_converter",
    0x04: "from_outside_or_off",
    0x08: "pump_commanded_for_diagnostics"
  };
  return statuses[value] || `unknown_${toHexByte(value)}`;
}

function decodeOxygenSensorsPresent(value, fourBanks) {
  const labels = fourBanks
    ? ["b1s1", "b1s2", "b2s1", "b2s2", "b3s1", "b3s2", "b4s1", "b4s2"]
    : ["b1s1", "b1s2", "b1s3", "b1s4", "b2s1", "b2s2", "b2s3", "b2s4"];
  const present = labels.filter((_label, index) => value & (1 << index));
  return present.length ? present.join(",") : "none";
}

function decodePercentCentered(value) {
  return Number.isInteger(value) ? (value * 100 / 128) - 100 : null;
}

function countSetBits(value) {
  if (!Number.isInteger(value)) return 0;
  let count = 0;
  for (let bit = 0; bit < 8; bit++) {
    if (value & (1 << bit)) count += 1;
  }
  return count;
}

function decodeSupportedPids(bytes, basePid) {
  const supported = [];
  bytes.forEach((byte, byteIndex) => {
    for (let bit = 7; bit >= 0; bit--) {
      if (byte & (1 << bit)) supported.push(toHexByte(basePid + byteIndex * 8 + (8 - bit)));
    }
  });
  return supported.filter(Boolean);
}

function isSupportedPidBase(pid) {
  return [0x00, 0x20, 0x40, 0x60, 0x80, 0xA0, 0xC0, 0xE0].includes(pid);
}

function toHexByte(value) {
  return Number.isInteger(value) && value >= 0 && value <= 255 ? value.toString(16).toUpperCase().padStart(2, "0") : "";
}

function uniqueBy(items, getKey) {
  const seen = new Set();
  return items.filter((item) => {
    const key = getKey(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function buildBlockedResponse(requestId, error) {
  return {
    request_id: requestId,
    ok: false,
    blocked: true,
    would_transmit: false,
    errors: [error],
    data: null
  };
}

function readJsonBody(request) {
  return new Promise((resolve, reject) => {
    let raw = "";
    request.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 16384) {
        reject(new Error("request_too_large"));
        request.destroy();
      }
    });
    request.on("end", () => {
      try {
        resolve(JSON.parse(raw || "{}"));
      } catch (error) {
        reject(error);
      }
    });
    request.on("error", reject);
  });
}

function setCorsHeaders(request, response) {
  const origin = request.headers.origin || "";
  const allowedOrigin = isAllowedOrigin(origin) ? origin : "https://tool.mukiguri.com";
  response.setHeader("Access-Control-Allow-Origin", allowedOrigin);
  response.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type");
  response.setHeader("Access-Control-Max-Age", "600");
}

function isAllowedOrigin(origin) {
  return origin === "https://tool.mukiguri.com"
    || /^http:\/\/127\.0\.0\.1:\d+$/.test(origin)
    || /^http:\/\/localhost:\d+$/.test(origin);
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(payload));
}

const currentFile = fileURLToPath(import.meta.url);
const entryFile = process.argv[1] ? path.resolve(process.argv[1]) : "";

if (currentFile === entryFile) {
  const port = Number(process.env.LOCAL_BRIDGE_PORT || process.env.PORT || DEFAULT_PORT);
  const server = createLocalBridgeApp();
  server.listen(port, "127.0.0.1", () => {
    console.log(`read-only local bridge: http://127.0.0.1:${port}`);
    console.log("set LOCAL_BRIDGE_PAIRING_TOKEN to the same value as the browser dev token");
    console.log("vehicle_command_enabled=false sample_mode=true");
  });
}
