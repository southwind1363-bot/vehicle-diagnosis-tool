import { createJ2534UdsReadoutAttemptController } from "./j2534-uds-readout-attempt-controller.js";

const SAFE_DEVICE_ID = /^j2534-[0-9a-f]{16}$/;
const SAFE_ECU_ADDRESS = /^(?:7E[0-9A-F]|18DA[0-9A-F]{4})$/;
const SAFE_DID = /^[0-9A-F]{4}$/;

const plainObject = value => {
  try {
    return value !== null && typeof value === "object" && !Array.isArray(value)
      && Object.getPrototypeOf(value) === Object.prototype;
  } catch { return false; }
};

function isRequestResponseEcuMatch(targetEcu, responseEcu) {
  if (/^7E[0-7]$/.test(targetEcu) && /^7E[8-F]$/.test(responseEcu))
    return Number.parseInt(responseEcu, 16) === Number.parseInt(targetEcu, 16) + 8;
  const target29 = /^18DA([0-9A-F]{2})F1$/.exec(targetEcu);
  const response29 = /^18DAF1([0-9A-F]{2})$/.exec(responseEcu);
  return Boolean(target29 && response29 && target29[1] === response29[1]);
}

function blocked(reason) {
  return Object.freeze({
    schema_version: "j2534-uds-transport-adapter-preparation-v1",
    preparation_status: "blocked",
    blockers: Object.freeze([reason]),
    adapter_request: null,
    dll_load_attempted: false,
    pass_thru_open_attempted: false,
    vehicle_connection_attempted: false,
    vehicle_communication_started: false,
    execution_enabled: false,
    dispatch_enabled: false,
    would_transmit: false,
    vehicle_command_enabled: false
  });
}

function verifiedIdentity(snapshot) {
  try {
    return plainObject(snapshot)
      && snapshot.preflight_operation_status === "completed"
      && snapshot.native_preflight_verified_in_operation === true
      && snapshot.package_integrity_verified_in_operation === true
      && snapshot.authenticode_verified_in_operation === true
      && SAFE_DEVICE_ID.test(snapshot.selected_device_id)
      && snapshot.identity_probe_execution_enabled === false
      && snapshot.dll_load_attempted === false
      && snapshot.pass_thru_open_allowed === false
      && snapshot.vehicle_communication_started === false
      && snapshot.vehicle_command_enabled === false;
  } catch { return false; }
}

export function createJ2534UdsTransportAdapterRequestBoundary(dependencies = {}) {
  if (!plainObject(dependencies) || Object.keys(dependencies).length !== 3
    || typeof dependencies.run_identity_preflight !== "function"
    || typeof dependencies.build_completion_manifest !== "function"
    || dependencies.transport_supervisor?.fixture_only !== true
    || typeof dependencies.transport_supervisor?.run !== "function")
    throw new Error("j2534_uds_transport_adapter_dependencies_invalid");
  const preparedSecrets = new WeakMap();
  const consumedRequests = new WeakSet();

  return Object.freeze({
    async prepare(identityOperation, request = {}) {
      let targetEcu, expectedResponseEcu, requestedDataIdentifier;
      try {
        if (!plainObject(request) || Object.keys(request).length !== 4 || request.mode !== "prepare_uds_transport_adapter"
          || typeof request.target_ecu !== "string" || typeof request.expected_response_ecu !== "string"
          || typeof request.requested_data_identifier !== "string") return blocked("j2534_uds_transport_adapter_request_invalid");
        targetEcu = request.target_ecu.trim().toUpperCase();
        expectedResponseEcu = request.expected_response_ecu.trim().toUpperCase();
        requestedDataIdentifier = request.requested_data_identifier.trim().toUpperCase();
      } catch { return blocked("j2534_uds_transport_adapter_request_invalid"); }
      if (!SAFE_ECU_ADDRESS.test(targetEcu) || !SAFE_ECU_ADDRESS.test(expectedResponseEcu)
        || !isRequestResponseEcuMatch(targetEcu, expectedResponseEcu) || !SAFE_DID.test(requestedDataIdentifier))
        return blocked("j2534_uds_transport_adapter_request_invalid");
      let identitySnapshot;
      try { identitySnapshot = await dependencies.run_identity_preflight(identityOperation); }
      catch { return blocked("j2534_identity_preflight_failed"); }
      if (!verifiedIdentity(identitySnapshot)) return blocked("j2534_identity_preflight_not_verified");
      const adapterRequest = Object.freeze({
        schema_version: "j2534-uds-transport-adapter-request-v1",
        record_type: "j2534_uds_transport_adapter_request",
        selected_device_id: identitySnapshot.selected_device_id,
        target_ecu: targetEcu,
        expected_response_ecu: expectedResponseEcu,
        requested_data_identifier: requestedDataIdentifier,
        identity_preflight_status: "verified_non_executable",
        adapter_implemented: false,
        dll_load_attempted: false,
        pass_thru_open_attempted: false,
        vehicle_connection_attempted: false,
        vehicle_communication_started: false,
        execution_enabled: false,
        dispatch_enabled: false,
        would_transmit: false,
        vehicle_command_enabled: false
      });
      preparedSecrets.set(adapterRequest, Object.freeze({ selectedDeviceId: identitySnapshot.selected_device_id }));
      return Object.freeze({
        schema_version: "j2534-uds-transport-adapter-preparation-v1",
        preparation_status: "prepared_non_executable",
        blockers: Object.freeze([]),
        adapter_request: adapterRequest,
        dll_load_attempted: false,
        pass_thru_open_attempted: false,
        vehicle_connection_attempted: false,
        vehicle_communication_started: false,
        execution_enabled: false,
        dispatch_enabled: false,
        would_transmit: false,
        vehicle_command_enabled: false
      });
    },

    createAttemptController(adapterRequest) {
      if (!adapterRequest || typeof adapterRequest !== "object" || consumedRequests.has(adapterRequest)) return null;
      const secret = preparedSecrets.get(adapterRequest);
      if (!secret || adapterRequest.selected_device_id !== secret.selectedDeviceId) return null;
      consumedRequests.add(adapterRequest);
      preparedSecrets.delete(adapterRequest);
      return createJ2534UdsReadoutAttemptController({
        selected_device_id: secret.selectedDeviceId,
        transport_supervisor: dependencies.transport_supervisor,
        build_completion_manifest: dependencies.build_completion_manifest,
        request_scope: Object.freeze({
          target_ecu: adapterRequest.target_ecu,
          expected_response_ecu: adapterRequest.expected_response_ecu,
          requested_data_identifier: adapterRequest.requested_data_identifier
        })
      });
    }
  });
}
