import assert from "node:assert/strict";
import { createJ2534UdsTransportAdapterRequestBoundary } from "./j2534-uds-transport-adapter-request.js";

export async function validateAdapterDependencyCapture() {
  let originalRuns = 0, replacementRuns = 0;
  const supervisor = { fixture_only: true, async run() {
    originalRuns++;
    return { execution_status: "blocked", errors: ["synthetic_fixture_blocked"] };
  } };
  const dependencies = {
    run_identity_preflight: async () => ({
      preflight_operation_status: "verified_non_executable",
      native_preflight_verified_in_operation: true, package_integrity_verified_in_operation: true,
      authenticode_verified_in_operation: true, selected_device_id: "j2534-0123456789abcdef",
      identity_probe_execution_enabled: false, dll_load_attempted: false,
      pass_thru_open_allowed: false, vehicle_communication_started: false, vehicle_command_enabled: false,
    }),
    build_completion_manifest: () => null,
    transport_supervisor: supervisor,
  };
  const boundary = createJ2534UdsTransportAdapterRequestBoundary(dependencies);
  const request = { mode: "prepare_uds_transport_adapter", target_ecu: "7E0",
    expected_response_ecu: "7E8", requested_data_identifier: "F190" };
  const prepared = await boundary.prepare({}, request);
  const replacement = async () => { replacementRuns++; throw new Error("replacement_called"); };
  dependencies.transport_supervisor = { fixture_only: false, run: replacement };
  dependencies.run_identity_preflight = replacement;
  dependencies.build_completion_manifest = replacement;
  supervisor.run = replacement;
  const controller = boundary.createAttemptController(prepared.adapter_request);
  assert.ok(controller);
  const result = await controller.run({ mode: "uds_readout_attempt", scenario: "positive",
    target_ecu: "7E0", expected_response_ecu: "7E8", requested_data_identifier: "F190" });
  assert.equal(replacementRuns, 0, "Validated dependencies were replaced after preparation");
  assert.equal(originalRuns, 1);
  assert.equal(result.attempt_status, "blocked");
  assert.equal(result.vehicle_communication_started, false);
  assert.equal((await boundary.prepare({}, request)).preparation_status, "prepared_non_executable");
  assert.equal(boundary.createAttemptController(prepared.adapter_request), null);
  return 7;
}
