import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const J2534_WORKER_CONTRACT_VERSION = "j2534-readonly-worker-v1";

const SAFE_DEVICE_ID = /^[A-Za-z0-9_.:-]{1,80}$/;
const MIN_TIMEOUT_MS = 1000;
const MAX_TIMEOUT_MS = 10000;

const SAFE_READOUT_ATTEMPT_ID = /^[A-Za-z0-9_.:-]{1,96}$/;
const SAFE_ECU_ADDRESS = /^(?:7E[0-9A-F]|18DA[0-9A-F]{4})$/;
const FORBIDDEN_TRANSPORT_RESULT_KEYS = new Set(["raw", "raw_payload", "raw_frames", "frame", "frames", "payload", "response", "responses", "command", "commands"]);

function normalizeHex(value, width) {
  const text = String(value || "").trim().toUpperCase().replace(/^0X/, "");
  return new RegExp(`^[0-9A-F]{${width}}$`).test(text) ? text : null;
}

function isUdsRequestResponseEcuMatch(targetEcu, responseEcu) {
  if (/^7E[0-7]$/.test(targetEcu) && /^7E[8-F]$/.test(responseEcu)) {
    return Number.parseInt(responseEcu, 16) === Number.parseInt(targetEcu, 16) + 8;
  }
  const target29 = /^18DA([0-9A-F]{2})F1$/.exec(targetEcu);
  const response29 = /^18DAF1([0-9A-F]{2})$/.exec(responseEcu);
  return Boolean(target29 && response29 && target29[1] === response29[1]);
}

function containsForbiddenTransportData(value) {
  return value && typeof value === "object" && Object.entries(value)
    .some(([key, child]) => FORBIDDEN_TRANSPORT_RESULT_KEYS.has(key.toLowerCase()) || containsForbiddenTransportData(child));
}

export function buildJ2534UdsTransportResult(input = {}) {
  const result = input && typeof input === "object" && !Array.isArray(input) ? input : {};
  const readoutAttemptId = String(result.readout_attempt_id || result.readoutAttemptId || "").trim();
  const targetEcu = String(result.target_ecu || result.targetEcu || "").trim().toUpperCase();
  const expectedResponseEcu = String(result.expected_response_ecu || result.expectedResponseEcu || "").trim().toUpperCase();
  const sourceEcu = String(result.source_ecu || result.sourceEcu || "").trim().toUpperCase();
  const requestedDataIdentifier = normalizeHex(result.requested_data_identifier || result.requestedDataIdentifier, 4);
  const responseDataIdentifier = normalizeHex(result.response_data_identifier || result.responseDataIdentifier, 4);
  const negativeRequestedService = normalizeHex(result.negative_requested_service || result.negativeRequestedService, 2);
  const negativeResponseCode = normalizeHex(result.negative_response_code || result.negativeResponseCode, 2);
  const transportStatus = String(result.transport_status || result.transportStatus || "").trim().toLowerCase();
  const terminal = ["timeout", "transport_error", "cancelled"].includes(transportStatus);
  const responseCount = Number(result.response_count ?? result.responseCount);
  const responseWaitMs = Number(result.response_wait_ms ?? result.responseWaitMs);
  const payloadByteCount = Number(result.payload_byte_count ?? result.payloadByteCount);
  const hasPositiveEvidence = Boolean(sourceEcu && requestedDataIdentifier && responseDataIdentifier && Number.isSafeInteger(payloadByteCount));
  const hasNegativeEvidence = Boolean(sourceEcu && negativeRequestedService && negativeResponseCode);
  const derivedStatus = terminal
    ? transportStatus
    : hasNegativeEvidence ? (negativeResponseCode === "78" ? "pending" : "negative_response")
      : hasPositiveEvidence ? "response_received" : null;
  const declaredStatus = String(result.status || "").trim().toLowerCase();

  if (result.operation !== "format_uds_read_transport_result"
    || !SAFE_READOUT_ATTEMPT_ID.test(readoutAttemptId)
    || !SAFE_ECU_ADDRESS.test(targetEcu) || !SAFE_ECU_ADDRESS.test(expectedResponseEcu) || !isUdsRequestResponseEcuMatch(targetEcu, expectedResponseEcu)
    || containsForbiddenTransportData(result)
    || (transportStatus && !["response_received", "negative_response", "pending", "timeout", "transport_error", "cancelled"].includes(transportStatus))
    || !derivedStatus || (declaredStatus && declaredStatus !== derivedStatus) || (transportStatus && transportStatus !== derivedStatus)
    || result.execution_enabled === true || result.executionEnabled === true
    || result.would_transmit === true || result.wouldTransmit === true
    || result.vehicle_command_enabled === true || result.vehicleCommandEnabled === true
    || !Number.isSafeInteger(responseCount) || responseCount < 0 || responseCount > 4096
    || !Number.isSafeInteger(responseWaitMs) || responseWaitMs < 0 || responseWaitMs > 120000
    || (terminal ? responseCount !== 0 : responseCount < 1)
    || (terminal ? (sourceEcu || hasPositiveEvidence || hasNegativeEvidence) : hasPositiveEvidence === hasNegativeEvidence)
    || (!terminal && (!SAFE_ECU_ADDRESS.test(sourceEcu) || sourceEcu !== expectedResponseEcu))
    || (hasPositiveEvidence && (requestedDataIdentifier !== responseDataIdentifier || payloadByteCount < 1 || payloadByteCount > 65535))
    || (hasNegativeEvidence && (negativeRequestedService !== "22" || (negativeResponseCode === "78" ? transportStatus && transportStatus !== "pending" : transportStatus && transportStatus !== "negative_response")))) return null;

  return {
    schema_version: "uds_read_transport_result_v1",
    record_type: "uds_read_transport_result",
    bridge_intent: "read_ecu_info",
    adapter_family: "j2534",
    readout_attempt_id: readoutAttemptId,
    target_ecu: targetEcu,
    expected_response_ecu: expectedResponseEcu,
    ...(terminal ? { transport_status: transportStatus } : {}),
    ...(sourceEcu ? { source_ecu: sourceEcu } : {}),
    response_count: responseCount,
    response_wait_ms: responseWaitMs,
    ...(hasPositiveEvidence ? {
      requested_data_identifier: requestedDataIdentifier,
      response_data_identifier: responseDataIdentifier,
      payload_byte_count: payloadByteCount
    } : {}),
    ...(hasNegativeEvidence ? {
      negative_requested_service: negativeRequestedService,
      negative_response_code: negativeResponseCode
    } : {}),
    retained_raw_frames: false,
    retained_raw_response: false,
    read_only: true,
    execution_enabled: false,
    would_transmit: false,
    vehicle_command_enabled: false
  };
}
export function reviewJ2534PassThruOpenRequest(input = {}) {
  const request = input && typeof input === "object" && !Array.isArray(input) ? input : {};
  const blockers = [];
  const deviceId = String(request.selected_device_id || request.selectedDeviceId || "").trim();
  const timeoutMs = Number(request.timeout_ms ?? request.timeoutMs);

  if (request.operation !== "review_pass_thru_open") blockers.push("operation_not_allowed");
  if (!SAFE_DEVICE_ID.test(deviceId)) blockers.push("selected_device_not_confirmed");
  if (request.driver_readiness_status !== "readonly_static_check_complete") blockers.push("driver_static_check_incomplete");
  if (request.open_review_status !== "manual_review_required") blockers.push("open_review_not_ready");
  if (request.manual_connection_review_confirmed !== true) blockers.push("manual_connection_review_not_confirmed");
  if (!Number.isInteger(timeoutMs) || timeoutMs < MIN_TIMEOUT_MS || timeoutMs > MAX_TIMEOUT_MS) blockers.push("worker_timeout_out_of_range");
  if (request.driver_library_path || request.driverLibraryPath || request.function_library || request.functionLibrary) blockers.push("raw_driver_path_not_accepted");
  if (request.vehicle_command_enabled === true || request.vehicleCommandEnabled === true) blockers.push("vehicle_command_requested");

  return {
    contract_version: J2534_WORKER_CONTRACT_VERSION,
    operation: "review_pass_thru_open",
    review_status: blockers.length ? "blocked" : "ready_for_isolated_implementation",
    blockers: [...new Set(blockers)],
    selected_device_id: SAFE_DEVICE_ID.test(deviceId) ? deviceId : null,
    timeout_ms: Number.isInteger(timeoutMs) && timeoutMs >= MIN_TIMEOUT_MS && timeoutMs <= MAX_TIMEOUT_MS ? timeoutMs : null,
    worker_execution_enabled: false,
    dll_load_attempted: false,
    pass_thru_open_attempted: false,
    vehicle_connection_attempted: false,
    vehicle_communication_started: false,
    would_transmit: false,
    vehicle_command_enabled: false
  };
}

function runOneShotWorker() {
  try {
    const input = JSON.parse(fs.readFileSync(0, "utf8") || "{}");
    const output = input.operation === "format_uds_read_transport_result"
      ? buildJ2534UdsTransportResult(input)
      : reviewJ2534PassThruOpenRequest(input);
    process.stdout.write(`${JSON.stringify(output)}\n`);
    if (!output) process.exitCode = 1;
  } catch {
    process.stdout.write(`${JSON.stringify(reviewJ2534PassThruOpenRequest({}))}\n`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  runOneShotWorker();
}
