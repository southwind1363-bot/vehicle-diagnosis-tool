import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_PORT = 8765;
const API_VERSION = "v1";
const READ_INTENTS = new Set([
  "bridge_status",
  "list_vci",
  "adapter_identity",
  "read_stored_dtc",
  "read_pending_dtc",
  "read_freeze_frame",
  "read_supported_pids",
  "read_live_pid_snapshot"
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
  "04", "05", "06", "07", "08", "09", "0A", "0B", "0C", "0D", "0E", "0F", "10", "11",
  "1F", "21", "22", "23", "2C", "2D", "2E", "2F", "30", "31", "32", "33",
  "3C", "42", "43", "44", "45", "46", "47", "48", "49", "4A", "4B", "4C",
  "4D", "4E", "52", "5A", "5B", "5C", "5D", "5E", "61", "62", "63", "64", "8E"
];
const SAMPLE_LIVE_VALUES = [
  { id: "engine_speed", pid: "0C", value: 1726, unit: "rpm" },
  { id: "coolant_temp", pid: "05", value: 83, unit: "°C" },
  { id: "vehicle_speed", pid: "0D", value: 0, unit: "km/h" },
  { id: "calculated_load", pid: "04", value: 21.6, unit: "%" },
  { id: "stft_b1", pid: "06", value: 0, unit: "%" },
  { id: "ltft_b1", pid: "07", value: 19.53, unit: "%" },
  { id: "fuel_pressure", pid: "0A", value: 120, unit: "kPa" },
  { id: "intake_manifold_pressure", pid: "0B", value: 40, unit: "kPa" },
  { id: "intake_air_temp", pid: "0F", value: 40, unit: "°C" },
  { id: "maf_air_flow", pid: "10", value: 6.55, unit: "g/s" },
  { id: "throttle_position", pid: "11", value: 50.2, unit: "%" },
  { id: "engine_runtime", pid: "1F", value: 600, unit: "s" },
  { id: "distance_with_mil", pid: "21", value: 100, unit: "km" },
  { id: "fuel_rail_pressure", pid: "22", value: 2000, unit: "kPa" },
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
  { id: "ethanol_percentage", pid: "52", value: 25.1, unit: "%" },
  { id: "hybrid_battery_remaining", pid: "5B", value: 56.47, unit: "%" },
  { id: "engine_oil_temp", pid: "5C", value: 60, unit: "°C" },
  { id: "fuel_injection_timing", pid: "5D", value: 8, unit: "°" },
  { id: "engine_fuel_rate", pid: "5E", value: 5, unit: "L/h" },
  { id: "driver_demand_torque", pid: "61", value: 15, unit: "%" },
  { id: "actual_engine_torque", pid: "62", value: 25, unit: "%" },
  { id: "engine_reference_torque", pid: "63", value: 400, unit: "Nm" },
  { id: "engine_friction_torque", pid: "8E", value: -5, unit: "%" }
];

export function createLocalBridgeApp(options = {}) {
  const pairingToken = String(options.pairingToken || process.env.LOCAL_BRIDGE_PAIRING_TOKEN || "");
  const bridgeVersion = options.bridgeVersion || "readonly-dev-0.1.0";
  const replaySnapshot = buildReplaySnapshot(options);

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
        sample_mode: true
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

    sendJson(response, 200, buildReadOnlyResponse(body, bridgeVersion, replaySnapshot));
  });
}

function validateBridgeRequest(body, pairingToken) {
  if (!body || typeof body !== "object") return { ok: false, error: "invalid_json" };
  if (!pairingToken || pairingToken.length < 12) return { ok: false, error: "bridge_pairing_token_not_configured" };
  if (body.api_version !== API_VERSION) return { ok: false, error: "unsupported_api_version" };
  if (!body.request_id || !body.intent || !body.timestamp || !body.pairing_token) return { ok: false, error: "missing_required_field" };
  if (body.pairing_token !== pairingToken) return { ok: false, error: "pairing_token_mismatch" };
  if (BLOCKED_WRITE_INTENTS.has(body.intent)) return { ok: false, error: "write_intent_blocked" };
  if (!READ_INTENTS.has(body.intent)) return { ok: false, error: "unknown_intent" };
  return { ok: true };
}

function buildReadOnlyResponse(request, bridgeVersion, replaySnapshot = null) {
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
        status: "ready_sample_mode",
        paired: true,
        vci_connected: true,
        vehicle_connected: false,
        vehicle_command_enabled: false,
        sample_mode: true,
        replay_loaded: Boolean(replaySnapshot)
      }
    };
  }

  if (request.intent === "list_vci") {
    return {
      ...base,
      data: {
        selected_device_id: "sample-readonly-vci",
        driver_status: "sample_mode",
        devices: [
          {
            id: "sample-readonly-vci",
            label: "Read-only Local Bridge Sample VCI",
            vendor: "vehicle-diagnosis-tool",
            driver_status: "sample_mode",
            connected: true
          }
        ]
      }
    };
  }

  if (request.intent === "adapter_identity") {
    return {
      ...base,
      data: {
        adapter_name: "Read-only Local Bridge Sample",
        adapter_family: "local_bridge_sample",
        firmware_version: bridgeVersion,
        vehicle_command_enabled: false
      }
    };
  }

  if ((request.intent === "read_stored_dtc" || request.intent === "read_pending_dtc") && replaySnapshot) {
    const status = request.intent === "read_pending_dtc" ? "pending" : "stored";
    return {
      ...base,
      data: {
        protocol: replaySnapshot.protocol,
        captured_at: new Date().toISOString(),
        ecu_responses: replaySnapshot.ecuResponses,
        dtcs: replaySnapshot.dtcs.map((item) => ({ ...item, status }))
      }
    };
  }

  if (request.intent === "read_stored_dtc" || request.intent === "read_pending_dtc") {
    const status = request.intent === "read_pending_dtc" ? "pending" : "stored";
    return {
      ...base,
      data: {
        protocol: "ISO15765-4",
        captured_at: new Date().toISOString(),
        ecu_responses: [{ ecu: "7E8", status: "sample", dtcs: ["P0171", "P0300"] }],
        dtcs: [
          { code: "P0171", status, ecu: "7E8" },
          { code: "P0300", status, ecu: "7E8" }
        ]
      }
    };
  }

  if (request.intent === "read_freeze_frame" && replaySnapshot) {
    return {
      ...base,
      data: {
        protocol: replaySnapshot.protocol,
        captured_at: new Date().toISOString(),
        trigger_dtc: replaySnapshot.triggerDtc,
        values: replaySnapshot.freezeFrameValues
      }
    };
  }

  if (request.intent === "read_freeze_frame") {
    return {
      ...base,
      data: {
        protocol: "ISO15765-4",
        captured_at: new Date().toISOString(),
        trigger_dtc: "P0171",
        values: [
          { id: "engine_speed", value: 1726, unit: "rpm" },
          { id: "coolant_temp", value: 83, unit: "°C" }
        ]
      }
    };
  }

  if (request.intent === "read_supported_pids" && replaySnapshot) {
    return {
      ...base,
      data: {
        protocol: replaySnapshot.protocol,
        supported_pids: replaySnapshot.supportedPids,
        captured_at: new Date().toISOString()
      }
    };
  }

  if (request.intent === "read_supported_pids") {
    return {
      ...base,
      data: {
        protocol: "ISO15765-4",
        supported_pids: SAMPLE_SUPPORTED_PIDS,
        captured_at: new Date().toISOString()
      }
    };
  }

  if (request.intent === "read_live_pid_snapshot" && replaySnapshot) {
    return {
      ...base,
      data: {
        protocol: replaySnapshot.protocol,
        supported_pids: replaySnapshot.supportedPids,
        captured_at: new Date().toISOString(),
        values: replaySnapshot.liveValues
      }
    };
  }

  if (request.intent === "read_live_pid_snapshot") {
    return {
      ...base,
      data: {
        protocol: "ISO15765-4",
        supported_pids: SAMPLE_SUPPORTED_PIDS,
        captured_at: new Date().toISOString(),
        values: SAMPLE_LIVE_VALUES
      }
    };
  }

  return buildBlockedResponse(request.request_id, "intent_not_implemented");
}

function buildReplaySnapshot(options = {}) {
  const replayText = String(options.replayLogText || readReplayLogFile(options.replayLogPath || process.env.LOCAL_BRIDGE_REPLAY_LOG) || "");
  return replayText ? decodeReplayLog(replayText) : null;
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
  const packets = String(text || "")
    .split(/\r?\n/)
    .map((line) => parseReplayLineBytes(line))
    .filter((packet) => packet.bytes.length);
  const dtcs = [];
  const liveValues = [];
  const freezeFrameValues = [];
  const supportedPids = new Set();
  const ecus = new Set();
  let triggerDtc = null;

  packets.forEach(({ ecu, bytes }) => {
    if (ecu) ecus.add(ecu);
    const serviceIndex = bytes.findIndex((byte) => [0x41, 0x42, 0x43, 0x47, 0x4A].includes(byte));
    if (serviceIndex < 0) return;
    const service = bytes[serviceIndex];

    if (service === 0x43 || service === 0x47 || service === 0x4A) {
      const status = service === 0x47 ? "pending" : service === 0x4A ? "permanent" : "stored";
      for (let index = serviceIndex + 1; index + 1 < bytes.length; index += 2) {
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
      if (!pid || !Number.isInteger(frameNumber)) return;
      if (pid === "02" && serviceIndex + 4 < bytes.length) {
        triggerDtc = decodeDtcPair(bytes[serviceIndex + 3], bytes[serviceIndex + 4]);
        return;
      }
      const decodedValues = decodeLivePidValues(pid, bytes.slice(serviceIndex + 3));
      if (decodedValues.length) {
        decodedValues.forEach((decoded) => freezeFrameValues.push({
          ...decoded,
          freeze_frame_number: frameNumber
        }));
        supportedPids.add(pid);
      }
      return;
    }

    if (service === 0x41) {
      const pid = toHexByte(bytes[serviceIndex + 1]);
      if (!pid) return;
      if (isSupportedPidBase(bytes[serviceIndex + 1])) {
        decodeSupportedPids(bytes.slice(serviceIndex + 2, serviceIndex + 6), bytes[serviceIndex + 1]).forEach((item) => supportedPids.add(item));
        return;
      }
      const decodedValues = decodeLivePidValues(pid, bytes.slice(serviceIndex + 2));
      if (decodedValues.length) {
        decodedValues.forEach((decoded) => liveValues.push(decoded));
        supportedPids.add(pid);
      }
    }
  });

  return {
    protocol: "ISO15765-4-log-replay",
    ecuResponses: [...ecus].map((ecu) => ({ ecu, status: "replay", dtcs: dtcs.filter((item) => item.ecu === ecu).map((item) => item.code) })),
    dtcs: uniqueBy(dtcs, (item) => `${item.code}:${item.status}:${item.ecu || ""}`),
    liveValues: uniqueBy(liveValues, (item) => item.id),
    freezeFrameValues: uniqueBy(freezeFrameValues, (item) => `${item.id}:${item.freeze_frame_number}`),
    triggerDtc,
    supportedPids: [...supportedPids].sort()
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
    "5A": ["relative_accelerator_position", Number.isInteger(a) ? a * 100 / 255 : null, "%"],
    "5B": ["hybrid_battery_remaining", Number.isInteger(a) ? a * 100 / 255 : null, "%"],
    "5C": ["engine_oil_temp", Number.isInteger(a) ? a - 40 : null, "°C"],
    "5D": ["fuel_injection_timing", Number.isInteger(a) && Number.isInteger(b) ? (((a * 256) + b) / 128) - 210 : null, "°"],
    "5E": ["engine_fuel_rate", Number.isInteger(a) && Number.isInteger(b) ? ((a * 256) + b) * 0.05 : null, "L/h"],
    "61": ["driver_demand_torque", Number.isInteger(a) ? a - 125 : null, "%"],
    "62": ["actual_engine_torque", Number.isInteger(a) ? a - 125 : null, "%"],
    "63": ["engine_reference_torque", Number.isInteger(a) && Number.isInteger(b) ? (a * 256) + b : null, "Nm"],
    "8E": ["engine_friction_torque", Number.isInteger(a) ? a - 125 : null, "%"]
  };
  const row = pidMap[pid];
  if (!row || !Number.isFinite(row[1])) return null;
  return { id: row[0], pid, value: Number(row[1].toFixed(2)), unit: row[2] };
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
