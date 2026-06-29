import http from "node:http";
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

export function createLocalBridgeApp(options = {}) {
  const pairingToken = String(options.pairingToken || process.env.LOCAL_BRIDGE_PAIRING_TOKEN || "");
  const bridgeVersion = options.bridgeVersion || "readonly-dev-0.1.0";

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

    sendJson(response, 200, buildReadOnlyResponse(body, bridgeVersion));
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

function buildReadOnlyResponse(request, bridgeVersion) {
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
        sample_mode: true
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

  if (request.intent === "read_supported_pids") {
    return {
      ...base,
      data: {
        protocol: "ISO15765-4",
        supported_pids: ["04", "05", "06", "07", "0B", "0C", "0D", "10", "11", "42"],
        captured_at: new Date().toISOString()
      }
    };
  }

  if (request.intent === "read_live_pid_snapshot") {
    return {
      ...base,
      data: {
        protocol: "ISO15765-4",
        supported_pids: ["04", "05", "0B", "0C", "0D", "10", "11", "42"],
        captured_at: new Date().toISOString(),
        values: [
          { id: "engine_speed", pid: "0C", value: 1726, unit: "rpm" },
          { id: "coolant_temp", pid: "05", value: 83, unit: "°C" },
          { id: "vehicle_speed", pid: "0D", value: 0, unit: "km/h" },
          { id: "calculated_load", pid: "04", value: 21.6, unit: "%" },
          { id: "control_module_voltage", pid: "42", value: 14.2, unit: "V" }
        ]
      }
    };
  }

  return buildBlockedResponse(request.request_id, "intent_not_implemented");
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
