import { randomBytes } from "node:crypto";
import { buildUdsReadAdapterCompletionManifest } from "../local-bridge-readonly.js";

const SAFE_DEVICE_ID = /^[A-Za-z0-9_.:-]{1,80}$/;
const SAFE_ECU_ADDRESS = /^(?:7E[0-9A-F]|18DA[0-9A-F]{4})$/;
const SAFE_DID = /^[0-9A-F]{4}$/;
const SCENARIOS = new Set(["positive", "positive-29bit", "negative", "pending", "timeout", "transport-error", "cancelled"]);

const exactKeys = (value, keys) => value && typeof value === "object" && !Array.isArray(value)
  && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));

function isRequestResponseEcuMatch(targetEcu, responseEcu) {
  if (/^7E[0-7]$/.test(targetEcu) && /^7E[8-F]$/.test(responseEcu))
    return Number.parseInt(responseEcu, 16) === Number.parseInt(targetEcu, 16) + 8;
  const target29 = /^18DA([0-9A-F]{2})F1$/.exec(targetEcu);
  const response29 = /^18DAF1([0-9A-F]{2})$/.exec(responseEcu);
  return Boolean(target29 && response29 && target29[1] === response29[1]);
}

function blocked(reason, selectedDeviceId = null) {
  return {
    schema_version: "j2534-uds-readout-attempt-v1",
    record_type: "j2534_uds_readout_attempt",
    attempt_status: "blocked",
    blockers: [reason],
    selected_device_id: selectedDeviceId,
    operation_nonce: null,
    readout_attempt_id: null,
    target_ecu: null,
    expected_response_ecu: null,
    requested_data_identifier: null,
    completion_manifest: null,
    worker_started: false,
    vehicle_connection_attempted: false,
    vehicle_communication_started: false,
    execution_enabled: false,
    would_transmit: false,
    vehicle_command_enabled: false
  };
}

export function createJ2534UdsReadoutAttemptController(options = {}) {
  if (!exactKeys(options, ["selected_device_id", "transport_supervisor"])
    || !SAFE_DEVICE_ID.test(options.selected_device_id)
    || typeof options.transport_supervisor?.run !== "function")
    throw new Error("j2534_uds_attempt_controller_invalid");
  const selectedDeviceId = options.selected_device_id;
  const transportSupervisor = options.transport_supervisor;
  let active = false;

  return Object.freeze({
    async run(request = {}) {
      if (!request || typeof request !== "object" || Array.isArray(request))
        return blocked("j2534_uds_attempt_request_invalid", selectedDeviceId);
      const optionKeys = ["mode", "scenario", "target_ecu", "expected_response_ecu", "requested_data_identifier",
        ...(Object.hasOwn(request, "timeout_ms") ? ["timeout_ms"] : []),
        ...(Object.hasOwn(request, "signal") ? ["signal"] : [])];
      const targetEcu = String(request.target_ecu || "").trim().toUpperCase();
      const expectedResponseEcu = String(request.expected_response_ecu || "").trim().toUpperCase();
      const requestedDataIdentifier = String(request.requested_data_identifier || "").trim().toUpperCase();
      const timeoutMs = request.timeout_ms ?? 5000;
      if (!exactKeys(request, optionKeys) || request.mode !== "uds_readout_attempt"
        || !SCENARIOS.has(request.scenario) || !SAFE_ECU_ADDRESS.test(targetEcu)
        || !SAFE_ECU_ADDRESS.test(expectedResponseEcu) || !isRequestResponseEcuMatch(targetEcu, expectedResponseEcu)
        || !SAFE_DID.test(requestedDataIdentifier)
        || !Number.isInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > 10000
        || (request.signal != null && !(request.signal instanceof AbortSignal)))
        return blocked("j2534_uds_attempt_request_invalid", selectedDeviceId);
      if (active) return blocked("j2534_uds_attempt_busy", selectedDeviceId);

      active = true;
      let operationNonce = null;
      let readoutAttemptId = null;
      try {
        operationNonce = randomBytes(16).toString("hex");
        readoutAttemptId = `j2534-uds-${randomBytes(16).toString("hex")}`;
        const supervised = await transportSupervisor.run({
          mode: "uds_transport_fixture",
          scenario: request.scenario,
          operation_nonce: operationNonce,
          selected_device_id: selectedDeviceId,
          readout_attempt_id: readoutAttemptId,
          target_ecu: targetEcu,
          expected_response_ecu: expectedResponseEcu,
          requested_data_identifier: requestedDataIdentifier,
          timeout_ms: timeoutMs,
          ...(request.signal ? { signal: request.signal } : {})
        });
        const transportResult = supervised?.result?.transport_result || null;
        const bindingsMatch = supervised?.result?.operation_nonce === operationNonce
          && supervised.result.selected_device_id === selectedDeviceId
          && supervised.result.readout_attempt_id === readoutAttemptId
          && supervised.result.target_ecu === targetEcu
          && supervised.result.expected_response_ecu === expectedResponseEcu
          && supervised.result.requested_data_identifier === requestedDataIdentifier
          && transportResult?.readout_attempt_id === readoutAttemptId
          && transportResult?.target_ecu === targetEcu
          && transportResult?.expected_response_ecu === expectedResponseEcu
          && (!Object.hasOwn(transportResult, "requested_data_identifier")
            || transportResult.requested_data_identifier === requestedDataIdentifier);
        const completionManifest = bindingsMatch ? buildUdsReadAdapterCompletionManifest(transportResult) : null;
        const completed = Boolean(completionManifest);
        return {
          schema_version: "j2534-uds-readout-attempt-v1",
          record_type: "j2534_uds_readout_attempt",
          attempt_status: completed ? completionManifest.status
            : supervised?.execution_status === "worker_completed" ? "completion_rejected" : supervised?.execution_status || "blocked",
          blockers: completed ? [] : [...new Set(supervised?.errors?.length ? supervised.errors : ["j2534_uds_attempt_completion_rejected"])],
          selected_device_id: selectedDeviceId,
          operation_nonce: operationNonce,
          readout_attempt_id: readoutAttemptId,
          target_ecu: targetEcu,
          expected_response_ecu: expectedResponseEcu,
          requested_data_identifier: requestedDataIdentifier,
          completion_manifest: completionManifest,
          worker_started: supervised?.worker_started === true,
          vehicle_connection_attempted: false,
          vehicle_communication_started: false,
          execution_enabled: false,
          would_transmit: false,
          vehicle_command_enabled: false
        };
      } catch {
        return {
          ...blocked("j2534_uds_attempt_supervisor_failed", selectedDeviceId),
          operation_nonce: operationNonce,
          readout_attempt_id: readoutAttemptId,
          target_ecu: targetEcu,
          expected_response_ecu: expectedResponseEcu,
          requested_data_identifier: requestedDataIdentifier
        };
      } finally {
        active = false;
      }
    }
  });
}
