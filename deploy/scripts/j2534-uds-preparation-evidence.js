const SAFE_ECU_ADDRESS = /^(?:7E[0-9A-F]|18DA[0-9A-F]{4})$/;
const SAFE_DID = /^[0-9A-F]{4}$/;
const SAFE_BLOCKER = /^[a-z0-9_]{3,96}$/;

const plainObject = value => {
  try { return value !== null && typeof value === "object" && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype; }
  catch { return false; }
};

function isRequestResponseEcuMatch(targetEcu, responseEcu) {
  if (/^7E[0-7]$/.test(targetEcu) && /^7E[8-F]$/.test(responseEcu))
    return Number.parseInt(responseEcu, 16) === Number.parseInt(targetEcu, 16) + 8;
  const target29 = /^18DA([0-9A-F]{2})F1$/.exec(targetEcu);
  const response29 = /^18DAF1([0-9A-F]{2})$/.exec(responseEcu);
  return Boolean(target29 && response29 && target29[1] === response29[1]);
}

const sanitizeBlockers = (value, fallback) => {
  const blockers = [...new Set((Array.isArray(value) ? value : []).filter(item => typeof item === "string" && SAFE_BLOCKER.test(item)).slice(0, 8))];
  return Object.freeze(blockers.length ? blockers : [fallback]);
};

export function parseJ2534UdsPreparationArguments(args = [], deviceCount = 0) {
  if (!Array.isArray(args) || args.length !== 5 || args[0] !== "--prepare-uds-request"
    || !Number.isInteger(deviceCount) || deviceCount < 0 || !/^[1-9]\d*$/.test(args[1]))
    return Object.freeze({ status: "invalid", index: null, request: null });
  const index = Number(args[1]) - 1;
  const targetEcu = typeof args[2] === "string" ? args[2].trim().toUpperCase() : "";
  const expectedResponseEcu = typeof args[3] === "string" ? args[3].trim().toUpperCase() : "";
  const requestedDataIdentifier = typeof args[4] === "string" ? args[4].trim().toUpperCase() : "";
  if (!Number.isSafeInteger(index) || index < 0 || index >= deviceCount || !SAFE_ECU_ADDRESS.test(targetEcu)
    || !SAFE_ECU_ADDRESS.test(expectedResponseEcu) || !isRequestResponseEcuMatch(targetEcu, expectedResponseEcu)
    || !SAFE_DID.test(requestedDataIdentifier))
    return Object.freeze({ status: "invalid", index: null, request: null });
  return Object.freeze({
    status: "selected",
    index,
    request: Object.freeze({
      mode: "prepare_uds_transport_adapter",
      target_ecu: targetEcu,
      expected_response_ecu: expectedResponseEcu,
      requested_data_identifier: requestedDataIdentifier
    })
  });
}

const EVIDENCE_KEYS = Object.freeze([
  "schema_version", "captured_at", "evidence_scope", "selected_driver_index", "target_ecu",
  "expected_response_ecu", "requested_data_identifier", "preparation_status", "blockers",
  "identity_preflight_status", "private_fields_included", "evidence_authorizes_execution",
  "adapter_implemented", "dll_load_attempted", "pass_thru_open_attempted", "vehicle_connection_attempted",
  "vehicle_communication_started", "dispatch_enabled", "would_transmit", "vehicle_command_enabled", "execution_enabled"
]);

function buildEvidence(selection, preparation, capturedAt) {
  const prepared = preparation?.preparation_status === "prepared_non_executable"
    && Array.isArray(preparation?.blockers) && preparation.blockers.length === 0
    && preparation?.adapter_request?.identity_preflight_status === "verified_non_executable"
    && preparation.adapter_request.adapter_implemented === false
    && [preparation, preparation.adapter_request].every(value => ["dll_load_attempted", "pass_thru_open_attempted",
      "vehicle_connection_attempted", "vehicle_communication_started", "execution_enabled", "dispatch_enabled",
      "would_transmit", "vehicle_command_enabled"].every(key => value?.[key] === false));
  const blockers = prepared ? Object.freeze([]) : sanitizeBlockers(preparation?.blockers, "j2534_uds_transport_adapter_preparation_invalid");
  return Object.freeze({
    schema_version: "j2534-uds-adapter-preparation-evidence-v1",
    captured_at: capturedAt,
    evidence_scope: "production_identity_bound_uds_adapter_preparation",
    selected_driver_index: selection.index + 1,
    target_ecu: selection.request.target_ecu,
    expected_response_ecu: selection.request.expected_response_ecu,
    requested_data_identifier: selection.request.requested_data_identifier,
    preparation_status: prepared ? "prepared_non_executable" : "blocked",
    blockers,
    identity_preflight_status: prepared ? "verified_non_executable" : "not_verified",
    private_fields_included: false,
    evidence_authorizes_execution: false,
    adapter_implemented: false,
    dll_load_attempted: false,
    pass_thru_open_attempted: false,
    vehicle_connection_attempted: false,
    vehicle_communication_started: false,
    dispatch_enabled: false,
    would_transmit: false,
    vehicle_command_enabled: false,
    execution_enabled: false
  });
}

export function validateJ2534UdsPreparationEvidence(value) {
  try {
    if (!plainObject(value) || Object.keys(value).length !== EVIDENCE_KEYS.length || !EVIDENCE_KEYS.every(key => Object.hasOwn(value, key))) return false;
    if (value.schema_version !== "j2534-uds-adapter-preparation-evidence-v1"
      || value.evidence_scope !== "production_identity_bound_uds_adapter_preparation"
      || typeof value.captured_at !== "string" || new Date(value.captured_at).toISOString() !== value.captured_at
      || !Number.isInteger(value.selected_driver_index) || value.selected_driver_index < 1 || value.selected_driver_index > 64
      || !SAFE_ECU_ADDRESS.test(value.target_ecu) || !SAFE_ECU_ADDRESS.test(value.expected_response_ecu)
      || !isRequestResponseEcuMatch(value.target_ecu, value.expected_response_ecu) || !SAFE_DID.test(value.requested_data_identifier)
      || !Array.isArray(value.blockers) || value.blockers.length > 8 || new Set(value.blockers).size !== value.blockers.length
      || !value.blockers.every(item => typeof item === "string" && SAFE_BLOCKER.test(item))) return false;
    const prepared = value.preparation_status === "prepared_non_executable" && value.identity_preflight_status === "verified_non_executable"
      && value.blockers.length === 0;
    const blocked = value.preparation_status === "blocked" && value.identity_preflight_status === "not_verified" && value.blockers.length > 0;
    const falseKeys = EVIDENCE_KEYS.slice(10);
    return (prepared || blocked) && falseKeys.every(key => value[key] === false);
  } catch { return false; }
}

export async function runJ2534UdsPreparationEvidence(devices, selection, dependencies = {}, options = {}) {
  if (!Array.isArray(devices) || selection?.status !== "selected" || !devices[selection.index]
    || !plainObject(dependencies) || Object.keys(dependencies).length !== 2
    || typeof dependencies.issue_identity_operation !== "function"
    || typeof dependencies.create_identity_bound_boundary !== "function")
    throw new Error("j2534_uds_preparation_evidence_dependencies_invalid");
  const capturedAt = typeof options.capturedAt === "string" ? options.capturedAt : new Date().toISOString();
  const inertSupervisor = Object.freeze({
    fixture_only: true,
    run: async () => { throw new Error("j2534_uds_preparation_evidence_transport_disabled"); }
  });
  let preparation;
  try {
    const issued = dependencies.issue_identity_operation({ selected_device_id: devices[selection.index]?.id });
    if (issued?.status !== "issued" || !issued.operation) {
      preparation = { preparation_status: "blocked", blockers: issued?.readiness?.blockers || ["identity_preflight_operation_not_issued"], adapter_request: null };
    } else {
      const boundary = dependencies.create_identity_bound_boundary(inertSupervisor);
      preparation = await boundary.prepare(issued.operation, selection.request);
    }
  } catch {
    preparation = { preparation_status: "blocked", blockers: ["j2534_uds_transport_adapter_preparation_failed"], adapter_request: null };
  }
  const evidence = buildEvidence(selection, preparation, capturedAt);
  if (!validateJ2534UdsPreparationEvidence(evidence)) throw new Error("j2534_uds_preparation_evidence_invalid");
  return evidence;
}
