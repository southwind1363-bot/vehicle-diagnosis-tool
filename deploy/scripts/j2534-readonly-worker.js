import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const J2534_WORKER_CONTRACT_VERSION = "j2534-readonly-worker-v1";

const SAFE_DEVICE_ID = /^[A-Za-z0-9_.:-]{1,80}$/;
const MIN_TIMEOUT_MS = 1000;
const MAX_TIMEOUT_MS = 10000;

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

function runOneShotReview() {
  try {
    const input = JSON.parse(fs.readFileSync(0, "utf8") || "{}");
    process.stdout.write(`${JSON.stringify(reviewJ2534PassThruOpenRequest(input))}\n`);
  } catch {
    process.stdout.write(`${JSON.stringify(reviewJ2534PassThruOpenRequest({}))}\n`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  runOneShotReview();
}
