import { createJ2534RegisteredDriverDescriptor, createJ2534RegisteredDriverFixtureDescriptor, createLocalBridgeApp, decodeReplayLog, getJ2534DiscoveryEnvironment, inspectJ2534LibraryFile, normalizeJ2534WorkerReviewProcessResult, parseJ2534RegistryDrivers, prepareJ2534WorkerReviewRequest, runJ2534RegisteredDriverNativePreflight, runJ2534WorkerReview, verifyJ2534RegisteredDriverDescriptor } from "../local-bridge-readonly.js";
import { J2534_WORKER_CONTRACT_VERSION, reviewJ2534PassThruOpenRequest } from "./j2534-readonly-worker.js";
import { spawnSync } from "node:child_process";
import { getEventListeners } from "node:events";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const failures = [];
let checks = 0;
const token = "local-bridge-test-token";
const server = createLocalBridgeApp({ pairingToken: token, bridgeVersion: "test-bridge", enableSampleReadouts: true });
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const packageManifest = JSON.parse(fs.readFileSync(path.join(scriptDir, "..", "package.json"), "utf8"));
const j2534BridgeStarterSource = fs.readFileSync(path.join(scriptDir, "start-j2534-readonly-bridge.js"), "utf8");
const j2534WorkerPath = path.join(scriptDir, "j2534-readonly-worker.js");
const j2534HostReviewSource = fs.readFileSync(path.join(scriptDir, "review-j2534-host.js"), "utf8");
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
const j2534UnavailableReadIntents = [
  "read_stored_dtc",
  "read_pending_dtc",
  "read_permanent_dtc",
  "read_freeze_frame",
  "read_supported_pids",
  "read_ecu_info",
  "read_onboard_monitor",
  "read_readiness",
  "read_live_pid_snapshot"
];
check(packageManifest.scripts?.["bridge:j2534:dev"] === "node scripts/start-j2534-readonly-bridge.js" && j2534BridgeStarterSource.includes('process.env.LOCAL_BRIDGE_DISCOVER_J2534 = "1"') && j2534BridgeStarterSource.includes("createLocalBridgeApp()") && j2534BridgeStarterSource.includes("vehicle_command_enabled=false"), "J2534 bridge starter must explicitly enable only static read-only discovery");
check(packageManifest.scripts?.["review:j2534-worker"] === "node scripts/j2534-readonly-worker.js", "J2534 isolated review worker script is not registered");
check(packageManifest.scripts?.["review:j2534-host"] === "node scripts/review-j2534-host.js" && j2534HostReviewSource.includes('discoverJ2534RegistryDrivers({ enabled: true, inspectLibraries: true })') && j2534HostReviewSource.includes('manual_connection_review_confirmed: process.argv.includes("--confirm-manual-review")') && j2534HostReviewSource.includes('runJ2534WorkerReview(devices,') && j2534HostReviewSource.includes('timeout_ms: 5000'), "J2534 host review CLI must derive drivers from static discovery and require manual confirmation");
const blockedJ2534WorkerReview = reviewJ2534PassThruOpenRequest({
  operation: "review_pass_thru_open",
  selected_device_id: "j2534-ready-fixture",
  driver_readiness_status: "runtime_architecture_mismatch",
  open_review_status: "blocked",
  manual_connection_review_confirmed: false,
  timeout_ms: 30000,
  driver_library_path: "C:\\private\\driver.dll",
  vehicle_command_enabled: true
});
check(blockedJ2534WorkerReview.review_status === "blocked" && blockedJ2534WorkerReview.blockers.includes("driver_static_check_incomplete") && blockedJ2534WorkerReview.blockers.includes("raw_driver_path_not_accepted") && blockedJ2534WorkerReview.blockers.includes("vehicle_command_requested") && blockedJ2534WorkerReview.dll_load_attempted === false && blockedJ2534WorkerReview.vehicle_communication_started === false, "J2534 worker review did not fail closed for an unsafe request");
const readyJ2534WorkerRequest = {
  operation: "review_pass_thru_open",
  selected_device_id: "j2534-ready-fixture",
  driver_readiness_status: "readonly_static_check_complete",
  open_review_status: "manual_review_required",
  manual_connection_review_confirmed: true,
  timeout_ms: 5000,
  vehicle_command_enabled: false
};
const readyJ2534WorkerReview = reviewJ2534PassThruOpenRequest(readyJ2534WorkerRequest);
const isolatedJ2534WorkerProcess = spawnSync(process.execPath, [j2534WorkerPath], {
  input: JSON.stringify(readyJ2534WorkerRequest),
  encoding: "utf8",
  timeout: 5000,
  windowsHide: true
});
const isolatedJ2534WorkerReview = isolatedJ2534WorkerProcess.status === 0 ? JSON.parse(isolatedJ2534WorkerProcess.stdout) : null;
check(readyJ2534WorkerReview.contract_version === J2534_WORKER_CONTRACT_VERSION && readyJ2534WorkerReview.review_status === "ready_for_isolated_implementation" && readyJ2534WorkerReview.worker_execution_enabled === false && readyJ2534WorkerReview.pass_thru_open_attempted === false && readyJ2534WorkerReview.vehicle_connection_attempted === false, "J2534 worker review contract did not retain the implementation-only unopened state");
check(isolatedJ2534WorkerReview?.review_status === "ready_for_isolated_implementation" && isolatedJ2534WorkerReview?.worker_execution_enabled === false && isolatedJ2534WorkerReview?.dll_load_attempted === false && isolatedJ2534WorkerReview?.would_transmit === false, "J2534 worker process did not remain isolated and non-executing");
const emptyJ2534DiscoveryEnvironment = getJ2534DiscoveryEnvironment([]);
const detectedJ2534DiscoveryEnvironment = getJ2534DiscoveryEnvironment([{ id: "fixture-j2534" }]);
const mismatchedJ2534DiscoveryEnvironment = getJ2534DiscoveryEnvironment([{
  driver_library_inspection_status: "inspected",
  driver_runtime_compatible: false,
  driver_readonly_api_ready: true
}]);
const incompleteJ2534DiscoveryEnvironment = getJ2534DiscoveryEnvironment([{
  driver_library_inspection_status: "inspected",
  driver_runtime_compatible: true,
  driver_readonly_api_ready: false
}]);
const readyJ2534DiscoveryEnvironment = getJ2534DiscoveryEnvironment([{
  driver_library_inspection_status: "inspected",
  driver_runtime_compatible: true,
  driver_readonly_api_ready: true
}]);
const mixedJ2534DiscoveryEnvironment = getJ2534DiscoveryEnvironment([{
  id: "fixture-incompatible-j2534",
  driver_library_inspection_status: "inspected",
  driver_runtime_compatible: false,
  driver_readonly_api_ready: true
}, {
  id: "fixture-ready-j2534",
  driver_library_inspection_status: "inspected",
  driver_runtime_compatible: true,
  driver_readonly_api_ready: true
}]);
check(emptyJ2534DiscoveryEnvironment.registration_status === "no_registered_driver" && emptyJ2534DiscoveryEnvironment.driver_readiness_status === "no_registered_driver" && emptyJ2534DiscoveryEnvironment.next_check === "install_or_repair_j2534_driver_registration" && emptyJ2534DiscoveryEnvironment.registry_roots_checked.length === 2 && emptyJ2534DiscoveryEnvironment.open_review_status === "blocked" && emptyJ2534DiscoveryEnvironment.open_review_blockers?.includes("no_registered_driver") && emptyJ2534DiscoveryEnvironment.pass_thru_open_allowed === false && emptyJ2534DiscoveryEnvironment.pass_thru_open_attempted === false && emptyJ2534DiscoveryEnvironment.vehicle_connection_attempted === false && emptyJ2534DiscoveryEnvironment.vehicle_command_enabled === false, "J2534 discovery environment did not report a safe no-driver state");
check(detectedJ2534DiscoveryEnvironment.registration_status === "registered_driver_detected" && detectedJ2534DiscoveryEnvironment.driver_readiness_status === "static_inspection_pending" && detectedJ2534DiscoveryEnvironment.next_check === "verify_driver_library_path" && detectedJ2534DiscoveryEnvironment.vehicle_command_enabled === false, "J2534 discovery environment did not preserve the uninspected-driver safety gate");
check(mismatchedJ2534DiscoveryEnvironment.driver_readiness_status === "runtime_architecture_mismatch" && mismatchedJ2534DiscoveryEnvironment.next_check === "install_matching_j2534_driver_architecture" && mismatchedJ2534DiscoveryEnvironment.open_review_blockers?.includes("runtime_architecture_mismatch") && mismatchedJ2534DiscoveryEnvironment.vehicle_command_enabled === false, "J2534 discovery environment did not distinguish an architecture mismatch");
check(incompleteJ2534DiscoveryEnvironment.driver_readiness_status === "readonly_api_incomplete" && incompleteJ2534DiscoveryEnvironment.next_check === "verify_driver_readonly_exports" && incompleteJ2534DiscoveryEnvironment.open_review_blockers?.includes("readonly_api_incomplete") && incompleteJ2534DiscoveryEnvironment.vehicle_command_enabled === false, "J2534 discovery environment did not distinguish missing read-only APIs");
check(readyJ2534DiscoveryEnvironment.driver_readiness_status === "readonly_static_check_complete" && readyJ2534DiscoveryEnvironment.next_check === "manual_vci_connection_review" && readyJ2534DiscoveryEnvironment.open_review_status === "manual_review_required" && readyJ2534DiscoveryEnvironment.open_review_blockers?.join(",") === "manual_vci_connection_review_required" && readyJ2534DiscoveryEnvironment.pass_thru_open_allowed === false && readyJ2534DiscoveryEnvironment.pass_thru_open_attempted === false && readyJ2534DiscoveryEnvironment.vehicle_connection_attempted === false && readyJ2534DiscoveryEnvironment.vehicle_command_enabled === false, "J2534 discovery environment incorrectly enabled or attempted PassThruOpen after static checks");
check(readyJ2534DiscoveryEnvironment.worker_contract_version === J2534_WORKER_CONTRACT_VERSION && readyJ2534DiscoveryEnvironment.worker_execution_status === "disabled_review_only" && readyJ2534DiscoveryEnvironment.dll_load_attempted === false, "J2534 discovery environment did not expose the disabled isolated worker contract");
check(mixedJ2534DiscoveryEnvironment.driver_readiness_status === "readonly_static_check_complete" && mixedJ2534DiscoveryEnvironment.static_ready_vci_count === 1 && mixedJ2534DiscoveryEnvironment.static_blocked_vci_count === 1 && mixedJ2534DiscoveryEnvironment.selected_static_ready_device_id === "fixture-ready-j2534" && mixedJ2534DiscoveryEnvironment.vehicle_command_enabled === false, "J2534 discovery environment did not retain a compatible read-only candidate beside an incompatible driver");
const blockedJ2534WorkerPreparation = prepareJ2534WorkerReviewRequest([], { manual_connection_review_confirmed: true, timeout_ms: 5000 });
const pendingJ2534WorkerPreparation = prepareJ2534WorkerReviewRequest([{
  id: "fixture-ready-j2534",
  driver_library_inspection_status: "inspected",
  driver_runtime_compatible: true,
  driver_readonly_api_ready: true,
  function_library: "C:\\private\\must-not-leak.dll"
}], { manual_connection_review_confirmed: false, timeout_ms: 5000 });
const readyJ2534WorkerPreparation = prepareJ2534WorkerReviewRequest([{
  id: "fixture-ready-j2534",
  driver_library_inspection_status: "inspected",
  driver_runtime_compatible: true,
  driver_readonly_api_ready: true,
  function_library: "C:\\private\\must-not-leak.dll"
}], { manual_connection_review_confirmed: true, timeout_ms: 5000 });
const preparedJ2534WorkerReview = reviewJ2534PassThruOpenRequest(readyJ2534WorkerPreparation.worker_request);
check(blockedJ2534WorkerPreparation.preparation_status === "blocked" && blockedJ2534WorkerPreparation.blockers.includes("no_static_ready_driver") && blockedJ2534WorkerPreparation.worker_request === null && blockedJ2534WorkerPreparation.dll_load_attempted === false && blockedJ2534WorkerPreparation.vehicle_command_enabled === false, "J2534 parent preparation did not reject a missing static-ready driver");
check(pendingJ2534WorkerPreparation.preparation_status === "blocked" && pendingJ2534WorkerPreparation.blockers?.join(",") === "manual_connection_review_not_confirmed" && pendingJ2534WorkerPreparation.worker_request === null && !JSON.stringify(pendingJ2534WorkerPreparation).includes("must-not-leak.dll") && pendingJ2534WorkerPreparation.pass_thru_open_attempted === false, "J2534 parent preparation did not retain manual review or leaked a raw driver path");
check(readyJ2534WorkerPreparation.schema_version === "j2534-worker-review-preparation-v1" && readyJ2534WorkerPreparation.preparation_status === "ready_for_worker_review" && readyJ2534WorkerPreparation.worker_request?.selected_device_id === "fixture-ready-j2534" && readyJ2534WorkerPreparation.worker_request?.timeout_ms === 5000 && readyJ2534WorkerPreparation.worker_request?.vehicle_command_enabled === false && preparedJ2534WorkerReview.review_status === "ready_for_isolated_implementation" && preparedJ2534WorkerReview.worker_execution_enabled === false && preparedJ2534WorkerReview.dll_load_attempted === false && !JSON.stringify(readyJ2534WorkerPreparation).includes("must-not-leak.dll"), "J2534 parent preparation did not produce a bounded path-free disabled worker review request");
const blockedJ2534WorkerExecution = await runJ2534WorkerReview([], { manual_connection_review_confirmed: true, timeout_ms: 5000 });
const completedJ2534WorkerController = new AbortController();
const pendingJ2534WorkerExecution = runJ2534WorkerReview([{
  id: "fixture-ready-j2534",
  driver_library_inspection_status: "inspected",
  driver_runtime_compatible: true,
  driver_readonly_api_ready: true,
  function_library: "C:\\private\\must-not-leak.dll"
}], { manual_connection_review_confirmed: true, timeout_ms: 5000, signal: completedJ2534WorkerController.signal });
let j2534WorkerSettled = false;
pendingJ2534WorkerExecution.then(() => { j2534WorkerSettled = true; });
const concurrentJ2534Reviews = [];
for (const id of ["fixture-ready-j2534", "fixture-other-j2534"]) {
  concurrentJ2534Reviews.push(await runJ2534WorkerReview([{
    id, driver_library_inspection_status: "inspected", driver_runtime_compatible: true, driver_readonly_api_ready: true
  }], { manual_connection_review_confirmed: true }));
}
check(concurrentJ2534Reviews.every((result) => result.execution_status === "worker_busy" && result.blockers?.join(",") === "worker_review_in_progress" && result.review_worker_process_started === false && result.worker_review === null && result.vehicle_command_enabled === false), "Concurrent J2534 reviews started extra workers or failed to report the busy state");
await new Promise((resolve) => setImmediate(resolve));
check(!j2534WorkerSettled, "J2534 worker review blocked the parent event loop until completion");
const completedJ2534WorkerExecution = await pendingJ2534WorkerExecution;
const completedJ2534AbortListenerCount = getEventListeners(completedJ2534WorkerController.signal, "abort").length;
completedJ2534WorkerController.abort();
check(completedJ2534WorkerExecution.execution_status === "review_completed" && completedJ2534WorkerExecution.review_worker_process_exited === true && completedJ2534AbortListenerCount === 0, "A completed J2534 review retained an abort listener or completion preceded child close");
const cancellationJ2534Devices = [{
  id: "fixture-ready-j2534", driver_library_inspection_status: "inspected",
  driver_runtime_compatible: true, driver_readonly_api_ready: true
}];
const preAbortedJ2534Controller = new AbortController();
preAbortedJ2534Controller.abort("C:\\private\\must-not-leak.dll");
const preAbortedJ2534Review = await runJ2534WorkerReview(cancellationJ2534Devices, {
  manual_connection_review_confirmed: true, signal: preAbortedJ2534Controller.signal
});
check(preAbortedJ2534Review.execution_status === "worker_cancelled" && preAbortedJ2534Review.review_worker_process_started === false && preAbortedJ2534Review.worker_review === null && !JSON.stringify(preAbortedJ2534Review).includes("must-not-leak.dll"), "An already cancelled J2534 review spawned a child or exposed the abort reason");
const activeJ2534Controller = new AbortController();
const activeJ2534Review = runJ2534WorkerReview(cancellationJ2534Devices, {
  manual_connection_review_confirmed: true, signal: activeJ2534Controller.signal
});
activeJ2534Controller.abort("C:\\private\\must-not-leak.dll");
const closingJ2534Review = await runJ2534WorkerReview(cancellationJ2534Devices, { manual_connection_review_confirmed: true });
check(closingJ2534Review.execution_status === "worker_busy" && closingJ2534Review.review_worker_process_started === false, "J2534 cancellation released the worker slot before child close");
const cancelledJ2534Review = await activeJ2534Review;
check(cancelledJ2534Review.execution_status === "worker_cancelled" && cancelledJ2534Review.blockers?.join(",") === "worker_review_cancelled" && cancelledJ2534Review.review_worker_process_started === true && cancelledJ2534Review.review_worker_process_exited === true && cancelledJ2534Review.worker_review === null && cancelledJ2534Review.vehicle_command_enabled === false && !JSON.stringify(cancelledJ2534Review).includes("must-not-leak.dll"), "J2534 cancellation did not wait for child close or failed to discard review output");
const invalidJ2534Cancellation = await runJ2534WorkerReview(cancellationJ2534Devices, {
  manual_connection_review_confirmed: true, signal: { aborted: false }
});
check(invalidJ2534Cancellation.execution_status === "worker_failed" && invalidJ2534Cancellation.review_worker_process_started === false && invalidJ2534Cancellation.worker_review === null, "An invalid J2534 abort signal started a review process");
const retriedJ2534Review = await runJ2534WorkerReview(cancellationJ2534Devices, { manual_connection_review_confirmed: true });
check(retriedJ2534Review.execution_status === "review_completed" && retriedJ2534Review.review_worker_process_exited === true, "J2534 review could not retry after cancellation and an invalid abort signal");
const rejectedJ2534Review = await runJ2534WorkerReview([{
  ...cancellationJ2534Devices[0], id: "fixture-invalid id"
}], { manual_connection_review_confirmed: true });
const recoveredJ2534Review = await runJ2534WorkerReview(cancellationJ2534Devices, { manual_connection_review_confirmed: true });
check(rejectedJ2534Review.execution_status === "invalid_worker_response" && rejectedJ2534Review.review_worker_process_exited === true && recoveredJ2534Review.execution_status === "review_completed", "J2534 worker response rejection retained the worker slot or blocked recovery");
const timedOutJ2534WorkerProcess = spawnSync(process.execPath, ["-e", "setInterval(() => {}, 1000)"], {
  timeout: 1000, encoding: "utf8", windowsHide: true, maxBuffer: 64 * 1024
});
const timedOutJ2534WorkerExecution = normalizeJ2534WorkerReviewProcessResult(readyJ2534WorkerPreparation, timedOutJ2534WorkerProcess);
const invalidJ2534WorkerExecution = normalizeJ2534WorkerReviewProcessResult(readyJ2534WorkerPreparation, { status: 0, stdout: "not-json", stderr: "C:\\private\\must-not-leak.dll" });
check(blockedJ2534WorkerExecution.execution_status === "preparation_blocked" && blockedJ2534WorkerExecution.review_worker_process_started === false && blockedJ2534WorkerExecution.worker_review === null && blockedJ2534WorkerExecution.vehicle_command_enabled === false, "J2534 parent runner started a review worker for a blocked preparation");
check(completedJ2534WorkerExecution.execution_status === "review_completed" && completedJ2534WorkerExecution.review_worker_process_started === true && completedJ2534WorkerExecution.worker_review?.review_status === "ready_for_isolated_implementation" && completedJ2534WorkerExecution.worker_review?.selected_device_id === "fixture-ready-j2534" && completedJ2534WorkerExecution.dll_load_attempted === false && completedJ2534WorkerExecution.pass_thru_open_attempted === false && !JSON.stringify(completedJ2534WorkerExecution).includes("must-not-leak.dll"), "J2534 parent runner did not return a sanitized isolated review result");
check(timedOutJ2534WorkerProcess.error?.code === "ETIMEDOUT" && timedOutJ2534WorkerExecution.execution_status === "worker_timed_out" && timedOutJ2534WorkerExecution.review_worker_process_started === true && timedOutJ2534WorkerExecution.blockers?.join(",") === "worker_review_timeout" && timedOutJ2534WorkerExecution.worker_review === null && !Object.hasOwn(timedOutJ2534WorkerExecution, "stderr"), "J2534 parent runner did not fail closed after terminating a timed-out child process");
check(invalidJ2534WorkerExecution.execution_status === "invalid_worker_response" && invalidJ2534WorkerExecution.blockers?.join(",") === "worker_review_invalid_json" && invalidJ2534WorkerExecution.worker_review === null && !JSON.stringify(invalidJ2534WorkerExecution).includes("must-not-leak.dll"), "J2534 parent runner accepted malformed output or leaked worker stderr");
const mismatchedJ2534WorkerResults = [
  { operation: "open" }, { selected_device_id: "other-device" }, { timeout_ms: 10000 },
  { review_status: "unknown" }, { worker_execution_enabled: true }, { dll_load_attempted: true },
  { pass_thru_open_attempted: true }, { vehicle_connection_attempted: true },
  { vehicle_communication_started: true }, { would_transmit: true }, { vehicle_command_enabled: true }
].map((overrides) => normalizeJ2534WorkerReviewProcessResult(readyJ2534WorkerPreparation, {
  status: 0, stdout: JSON.stringify({ ...preparedJ2534WorkerReview, ...overrides })
}));
const unsafeBlockerJ2534WorkerResult = normalizeJ2534WorkerReviewProcessResult(readyJ2534WorkerPreparation, {
  status: 0, stdout: JSON.stringify({ ...preparedJ2534WorkerReview, review_status: "blocked", blockers: ["C:\\private\\must-not-leak.dll"] })
});
const failedJ2534WorkerResults = [
  { status: null, error: { code: "ENOENT", message: "C:\\private\\must-not-leak.dll" } },
  { status: 1, pid: 1234, stderr: "C:\\private\\must-not-leak.dll" }
].map((result) => normalizeJ2534WorkerReviewProcessResult(readyJ2534WorkerPreparation, result));
const oversizedJ2534WorkerResult = normalizeJ2534WorkerReviewProcessResult(readyJ2534WorkerPreparation, {
  status: 0, signal: "SIGTERM", error: { code: "ERR_CHILD_PROCESS_STDIO_MAXBUFFER" }, stdout: JSON.stringify(preparedJ2534WorkerReview)
});
check(oversizedJ2534WorkerResult.execution_status === "worker_failed" && oversizedJ2534WorkerResult.worker_review === null, "J2534 worker output overflow was accepted or misreported as a timeout");
check(mismatchedJ2534WorkerResults.every((result) => result.execution_status === "invalid_worker_response" && result.blockers?.join(",") === "worker_review_contract_mismatch" && result.worker_review === null), "J2534 parent runner accepted a changed request identity or unsafe execution flags");
check(unsafeBlockerJ2534WorkerResult.execution_status === "invalid_worker_response" && unsafeBlockerJ2534WorkerResult.worker_review === null && !JSON.stringify(unsafeBlockerJ2534WorkerResult).includes("must-not-leak.dll"), "J2534 parent runner exposed an unrecognized worker blocker");
check(failedJ2534WorkerResults.every((result) => result.execution_status === "worker_failed" && result.worker_review === null && !JSON.stringify(result).includes("must-not-leak.dll")) && failedJ2534WorkerResults[0].review_worker_process_started === false && failedJ2534WorkerResults[1].review_worker_process_started === true && failedJ2534WorkerResults[1].process_exit_code === 1, "J2534 parent runner did not distinguish launch failure from a failed child process");
const j2534RequiredApis = [
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
];

function check(condition, message) {
  checks += 1;
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

function buildTestPeLibrary(machine, bitness, exportNames) {
  const buffer = Buffer.alloc(4096);
  const peOffset = 0x80;
  const optionalHeaderSize = bitness === 64 ? 0xF0 : 0xE0;
  const optionalHeaderOffset = peOffset + 24;
  const dataDirectoryOffset = optionalHeaderOffset + (bitness === 64 ? 112 : 96);
  const sectionOffset = optionalHeaderOffset + optionalHeaderSize;
  buffer.writeUInt16LE(0x5A4D, 0);
  buffer.writeUInt32LE(peOffset, 0x3C);
  buffer.writeUInt32LE(0x00004550, peOffset);
  buffer.writeUInt16LE(machine, peOffset + 4);
  buffer.writeUInt16LE(2, peOffset + 6);
  buffer.writeUInt16LE(optionalHeaderSize, peOffset + 20);
  buffer.writeUInt16LE(bitness === 64 ? 0x20B : 0x10B, optionalHeaderOffset);
  buffer.writeUInt32LE(0x1000, dataDirectoryOffset);
  buffer.writeUInt32LE(0x500, dataDirectoryOffset + 4);
  buffer.write(".rdata", sectionOffset, "ascii");
  buffer.writeUInt32LE(0x600, sectionOffset + 8);
  buffer.writeUInt32LE(0x1000, sectionOffset + 12);
  buffer.writeUInt32LE(0x600, sectionOffset + 16);
  buffer.writeUInt32LE(0x200, sectionOffset + 20);
  buffer.writeUInt32LE(0x40000040, sectionOffset + 36);
  const textSectionOffset = sectionOffset + 40;
  buffer.write(".text", textSectionOffset, "ascii");
  buffer.writeUInt32LE(0x200, textSectionOffset + 8);
  buffer.writeUInt32LE(0x2000, textSectionOffset + 12);
  buffer.writeUInt32LE(0x200, textSectionOffset + 16);
  buffer.writeUInt32LE(0x800, textSectionOffset + 20);
  buffer.writeUInt32LE(0x60000020, textSectionOffset + 36);
  const exportOffset = 0x200;
  buffer.writeUInt32LE(exportNames.length, exportOffset + 20);
  buffer.writeUInt32LE(exportNames.length, exportOffset + 24);
  buffer.writeUInt32LE(0x1060, exportOffset + 28);
  buffer.writeUInt32LE(0x10A0, exportOffset + 32);
  buffer.writeUInt32LE(0x10E0, exportOffset + 36);
  let nameRva = 0x1200;
  exportNames.forEach((name, index) => {
    buffer.writeUInt32LE(0x2000 + index * 4, 0x260 + index * 4);
    buffer.writeUInt32LE(nameRva, 0x2A0 + index * 4);
    buffer.writeUInt16LE(index, 0x2E0 + index * 2);
    buffer.write(`${name}\0`, 0x200 + (nameRva - 0x1000), "ascii");
    nameRva += Buffer.byteLength(name, "ascii") + 1;
  });
  return buffer;
}

function post(port, intent, pairingToken = token, data = {}) {
  return fetch(`http://127.0.0.1:${port}/v1/bridge`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Origin": "https://tool.mukiguri.com" },
    body: JSON.stringify({
      request_id: `test-${intent}`,
      api_version: "v1",
      intent,
      timestamp: new Date().toISOString(),
      pairing_token: pairingToken,
      data
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
  check(health.sample_readouts_enabled === true, "explicit bridge sample readout mode was not reported");

  const disabledSampleServer = createLocalBridgeApp({ pairingToken: token, bridgeVersion: "test-bridge" });
  const disabledSamplePort = await new Promise((resolve) => {
    disabledSampleServer.listen(0, "127.0.0.1", () => resolve(disabledSampleServer.address().port));
  });
  try {
    const disabledSampleHealth = await fetch(`http://127.0.0.1:${disabledSamplePort}/health`).then((response) => response.json());
    const disabledSampleReadout = await post(disabledSamplePort, "read_stored_dtc");
    check(disabledSampleHealth.sample_mode === true && disabledSampleHealth.sample_readouts_enabled === false, "default bridge did not report disabled sample readouts");
    check(disabledSampleReadout.ok === false && disabledSampleReadout.blocked === false && disabledSampleReadout.errors.includes("sample_mode_no_vehicle_readout") && disabledSampleReadout.would_transmit === false && disabledSampleReadout.data.sample_mode === true && !Object.hasOwn(disabledSampleReadout.data, "dtcs") && !Object.hasOwn(disabledSampleReadout.data, "values"), "default bridge exposed sample diagnostic values as vehicle readouts");
  } finally {
    await new Promise((resolve) => disabledSampleServer.close(resolve));
  }

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

  const j2534RegistryText = [
    "HKEY_LOCAL_MACHINE\\SOFTWARE\\PassThruSupport.04.04\\Example Vendor\\Example VCI",
    "    Name    REG_SZ    Example J2534 VCI",
    "    Vendor    REG_SZ    Example Vendor",
    "    FunctionLibrary    REG_SZ    C:\\Program Files\\Example Vendor\\passthru.dll",
    "HKEY_LOCAL_MACHINE\\SOFTWARE\\WOW6432Node\\PassThruSupport.04.04\\Other Vendor\\Other VCI",
    "    Vendor    REG_SZ    Other Vendor",
    "    FunctionLibrary    REG_SZ    C:\\Drivers\\otherpassthru.dll"
  ].join("\n");
  const parsedJ2534Drivers = parseJ2534RegistryDrivers(j2534RegistryText);
  check(parsedJ2534Drivers.length === 2 && parsedJ2534Drivers[0]?.label === "Example J2534 VCI" && parsedJ2534Drivers[1]?.label === "Other Vendor", "J2534 registry parser did not retain safe driver labels");
  check(parsedJ2534Drivers.every((item) => item.driver_status === "j2534_registry_detected" && item.connected === false && item.vehicle_command_enabled === false), "J2534 registry parser did not preserve read-only driver detection state");
  check(parsedJ2534Drivers.every((item) => /^j2534-[0-9a-f]{16}$/.test(item.id) && item.driver_readonly_api_ready === false && item.driver_restricted_apis.includes("PassThruSetProgrammingVoltage")), "J2534 registry parser did not expose a stable disabled read-only host profile");
  check(!JSON.stringify(parsedJ2534Drivers).includes("C:\\Program Files"), "J2534 registry parser exposed a local driver path");
  const j2534PeFixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), "vehicle-diagnosis-j2534-"));
  try {
    const x86LibraryPath = path.join(j2534PeFixtureDir, "j2534-x86.dll");
    const x64LibraryPath = path.join(j2534PeFixtureDir, "j2534-x64-partial.dll");
    const arm64LibraryPath = path.join(j2534PeFixtureDir, "j2534-arm64.dll");
    const matchingLibraryPath = path.join(j2534PeFixtureDir, "j2534-runtime-ready.dll");
    const mismatchedLibraryPath = path.join(j2534PeFixtureDir, "j2534-runtime-mismatch.dll");
    const invalidLibraryPath = path.join(j2534PeFixtureDir, "invalid.dll");
    const matchingMachine = process.arch === "ia32" ? 0x014C : process.arch === "arm64" ? 0xAA64 : 0x8664;
    const matchingBitness = process.arch === "ia32" ? 32 : 64;
    const mismatchedMachine = process.arch === "ia32" ? 0x8664 : 0x014C;
    const mismatchedBitness = process.arch === "ia32" ? 64 : 32;
    fs.writeFileSync(x86LibraryPath, buildTestPeLibrary(0x014C, 32, j2534RequiredApis.map((name, index) => index === 0 ? `_${name}@4` : name)));
    fs.writeFileSync(x64LibraryPath, buildTestPeLibrary(0x8664, 64, ["PassThruOpen", "PassThruClose", "PassThruReadVersion"]));
    fs.writeFileSync(arm64LibraryPath, buildTestPeLibrary(0xAA64, 64, j2534RequiredApis));
    fs.writeFileSync(matchingLibraryPath, buildTestPeLibrary(matchingMachine, matchingBitness, j2534RequiredApis));
    fs.writeFileSync(mismatchedLibraryPath, buildTestPeLibrary(mismatchedMachine, mismatchedBitness, j2534RequiredApis));
    fs.writeFileSync(invalidLibraryPath, "not a PE library");
    const x86Inspection = inspectJ2534LibraryFile(x86LibraryPath);
    const x64Inspection = inspectJ2534LibraryFile(x64LibraryPath);
    const arm64Inspection = inspectJ2534LibraryFile(arm64LibraryPath);
    const invalidInspection = inspectJ2534LibraryFile(invalidLibraryPath);
    const missingInspection = inspectJ2534LibraryFile(path.join(j2534PeFixtureDir, "missing.dll"));
    const networkInspection = inspectJ2534LibraryFile("\\\\diagnostic-share\\drivers\\j2534.dll");
    const originalFixtureLibraryRoot = process.env.J2534_TEST_LIBRARY_ROOT;
    process.env.J2534_TEST_LIBRARY_ROOT = j2534PeFixtureDir;
    const quotedExpandedInspection = inspectJ2534LibraryFile(`"%J2534_TEST_LIBRARY_ROOT%${path.sep}${path.basename(x86LibraryPath)}"`);
    if (originalFixtureLibraryRoot === undefined) delete process.env.J2534_TEST_LIBRARY_ROOT;
    else process.env.J2534_TEST_LIBRARY_ROOT = originalFixtureLibraryRoot;
    check(x86Inspection.inspection_status === "inspected" && x86Inspection.pe_architecture === "x86" && x86Inspection.pe_bitness === 32 && x86Inspection.required_api_ready === true && x86Inspection.readonly_api_ready === true && x86Inspection.detected_required_api_count === 14 && x86Inspection.detected_readonly_api_count === 10 && x86Inspection.runtime_compatibility_status === (process.arch === "ia32" ? "compatible" : "architecture_mismatch"), "J2534 PE inspection did not recognize a complete decorated 32-bit read-only API export set");
    check(x64Inspection.inspection_status === "inspected" && x64Inspection.pe_architecture === "x64" && x64Inspection.pe_bitness === 64 && x64Inspection.required_api_ready === false && x64Inspection.readonly_api_ready === false && x64Inspection.missing_required_apis.includes("PassThruConnect") && x64Inspection.missing_readonly_apis.includes("PassThruConnect") && x64Inspection.runtime_compatibility_status === (process.arch === "x64" ? "compatible" : "architecture_mismatch"), "J2534 PE inspection did not report missing 64-bit read-only API exports");
    check(arm64Inspection.pe_architecture === "arm64" && arm64Inspection.pe_bitness === 64 && arm64Inspection.required_api_ready === true && arm64Inspection.runtime_compatibility_status === (process.arch === "arm64" ? "compatible" : "architecture_mismatch"), "J2534 PE inspection did not recognize an ARM64 library");
    check(quotedExpandedInspection.inspection_status === "inspected" && quotedExpandedInspection.pe_architecture === "x86" && quotedExpandedInspection.required_api_ready === true && !JSON.stringify(quotedExpandedInspection).includes(j2534PeFixtureDir), "J2534 PE inspection did not safely resolve quoted environment-variable library paths");
    check(invalidInspection.inspection_status === "invalid_pe" && missingInspection.inspection_status === "file_not_found" && x86Inspection.vehicle_command_enabled === false && !JSON.stringify(x86Inspection).includes(j2534PeFixtureDir), "J2534 PE inspection did not safely reject invalid input or exposed its local path");
    check(networkInspection.inspection_status === "network_path_blocked" && networkInspection.vehicle_command_enabled === false, "J2534 PE inspection did not block a network library path before file access");
    const inspectedRegistryDrivers = parseJ2534RegistryDrivers([
      "HKEY_LOCAL_MACHINE\\SOFTWARE\\PassThruSupport.04.04\\Fixture Vendor\\Fixture VCI",
      "    Name    REG_SZ    Fixture J2534 VCI",
      "    Vendor    REG_SZ    Fixture Vendor",
      `    FunctionLibrary    REG_SZ    ${x86LibraryPath}`
    ].join("\n"), { inspectLibraries: true });
    check(inspectedRegistryDrivers[0]?.driver_library_architecture === "x86" && inspectedRegistryDrivers[0]?.driver_library_bitness === 32 && inspectedRegistryDrivers[0]?.driver_runtime_compatibility_status === (process.arch === "ia32" ? "compatible" : "architecture_mismatch") && inspectedRegistryDrivers[0]?.driver_required_api_ready === true && inspectedRegistryDrivers[0]?.driver_readonly_api_ready === true && inspectedRegistryDrivers[0]?.driver_detected_required_api_count === 14 && inspectedRegistryDrivers[0]?.driver_detected_readonly_api_count === 10, "J2534 registry discovery did not attach safe DLL compatibility metadata");
    check(!JSON.stringify(inspectedRegistryDrivers).includes(x86LibraryPath) && inspectedRegistryDrivers[0]?.vehicle_command_enabled === false, "J2534 registry discovery exposed a DLL path or enabled vehicle commands");
    const descriptorLibraryPath = path.join(j2534PeFixtureDir, "j2534-descriptor-ready.dll");
    fs.writeFileSync(descriptorLibraryPath, buildTestPeLibrary(matchingMachine, matchingBitness, j2534RequiredApis));
    const descriptorRegistryText = [
      "HKEY_LOCAL_MACHINE\\SOFTWARE\\PassThruSupport.04.04\\Fixture Vendor\\Descriptor VCI",
      "    Name    REG_SZ    Descriptor J2534 VCI",
      "    Vendor    REG_SZ    Fixture Vendor",
      `    FunctionLibrary    REG_SZ    ${descriptorLibraryPath}`
    ].join("\n");
    const descriptorDeviceId = parseJ2534RegistryDrivers(descriptorRegistryText)[0]?.id;
    const missingSelectionDescriptor = createJ2534RegisteredDriverFixtureDescriptor({ registryText: descriptorRegistryText });
    const registeredDescriptor = createJ2534RegisteredDriverFixtureDescriptor({
      registryText: descriptorRegistryText,
      selectedDeviceId: descriptorDeviceId
    });
    const injectedProductionDescriptor = createJ2534RegisteredDriverDescriptor({
      registryText: descriptorRegistryText,
      selectedDeviceId: descriptorDeviceId
    });
    check(missingSelectionDescriptor.descriptor_status === "blocked" && missingSelectionDescriptor.blockers.includes("selected_device_not_confirmed"), "J2534 registered descriptor did not require an explicit selected device");
    check(injectedProductionDescriptor.descriptor_status === "blocked" && injectedProductionDescriptor.blockers.includes("registered_driver_not_found"), "J2534 production descriptor accepted caller-supplied registry text");
    check(Object.isFrozen(missingSelectionDescriptor) && Object.isFrozen(missingSelectionDescriptor.blockers), "J2534 blocked descriptor was not deeply frozen");
    if (process.platform === "win32") {
      check(registeredDescriptor.descriptor_status === "blocked" && registeredDescriptor.blockers.includes("native_fixed_drive_verification_required") && registeredDescriptor.exact_identity_api_ready === true && registeredDescriptor.exact_readonly_api_ready === true && registeredDescriptor.runtime_compatible === true, "J2534 registered descriptor did not retain the native fixed-drive verification gate after exact static inspection");
      check(Object.isFrozen(registeredDescriptor) && Object.isFrozen(registeredDescriptor.blockers) && Object.isFrozen(registeredDescriptor.exact_identity_apis) && Object.isFrozen(registeredDescriptor.exact_readonly_apis), "J2534 registered descriptor was not deeply frozen");
      check(registeredDescriptor.execution_enabled === false && registeredDescriptor.dll_load_attempted === false && registeredDescriptor.pass_thru_open_attempted === false && registeredDescriptor.vehicle_connection_attempted === false && registeredDescriptor.vehicle_command_enabled === false, "J2534 registered descriptor enabled execution or vehicle communication");
      check(!JSON.stringify(registeredDescriptor).includes(descriptorLibraryPath) && !JSON.stringify(registeredDescriptor).includes(j2534PeFixtureDir), "J2534 registered descriptor exposed its private DLL path");
      const verifiedDescriptor = verifyJ2534RegisteredDriverDescriptor(registeredDescriptor);
      const clonedDescriptor = structuredClone(registeredDescriptor);
      const rejectedClone = verifyJ2534RegisteredDriverDescriptor(clonedDescriptor);
      const throwingProxyResult = verifyJ2534RegisteredDriverDescriptor(new Proxy({}, { get: () => { throw new Error("must not read unissued descriptor"); } }));
      const rejectedNativeFixture = await runJ2534RegisteredDriverNativePreflight(registeredDescriptor);
      const rejectedNativeClone = await runJ2534RegisteredDriverNativePreflight(clonedDescriptor);
      check(verifiedDescriptor.verification_status === "rejected" && verifiedDescriptor.blockers.includes("native_fixed_drive_verification_required") && verifiedDescriptor.blockers.includes("fixture_registry_source_not_executable") && verifiedDescriptor.sha256 === registeredDescriptor.sha256 && verifiedDescriptor.dll_load_attempted === false, "J2534 fixture descriptor did not reverify identity while retaining native and live-registry gates");
      check(rejectedClone.verification_status === "rejected" && rejectedClone.blockers.includes("descriptor_not_issued"), "J2534 registered descriptor accepted a cloned object without its opaque issuance record");
      check(throwingProxyResult.verification_status === "rejected" && throwingProxyResult.blockers.includes("descriptor_not_issued"), "J2534 registered descriptor read properties from an unissued object");
      check(rejectedNativeFixture.verification_status === "rejected" && rejectedNativeFixture.blockers.join(",") === "live_registry_descriptor_required" && rejectedNativeFixture.execution_enabled === false && rejectedNativeFixture.dll_load_attempted === false && !JSON.stringify(rejectedNativeFixture).includes(descriptorLibraryPath), "J2534 native preflight accepted or exposed a fixture-registry descriptor");
      check(rejectedNativeClone.verification_status === "rejected" && rejectedNativeClone.blockers.join(",") === "descriptor_not_issued" && rejectedNativeClone.execution_enabled === false, "J2534 native preflight accepted a cloned descriptor");

      const mismatchedRegistryText = [
        "HKEY_LOCAL_MACHINE\\SOFTWARE\\PassThruSupport.04.04\\Fixture Vendor\\Opposite Architecture VCI",
        "    Name    REG_SZ    Opposite Architecture J2534 VCI",
        "    Vendor    REG_SZ    Fixture Vendor",
        `    FunctionLibrary    REG_SZ    ${mismatchedLibraryPath}`
      ].join("\n");
      const mismatchedDeviceId = parseJ2534RegistryDrivers(mismatchedRegistryText)[0]?.id;
      const mismatchedDescriptor = createJ2534RegisteredDriverFixtureDescriptor({ registryText: mismatchedRegistryText, selectedDeviceId: mismatchedDeviceId });
      const mismatchedVerification = verifyJ2534RegisteredDriverDescriptor(mismatchedDescriptor);
      const mismatchedNativeFixture = await runJ2534RegisteredDriverNativePreflight(mismatchedDescriptor);
      check(mismatchedDescriptor.descriptor_status === "blocked" && mismatchedDescriptor.runtime_compatible === false
        && mismatchedDescriptor.blockers.includes("registered_driver_runtime_architecture_mismatch")
        && mismatchedDescriptor.blockers.includes("native_fixed_drive_verification_required"), "J2534 opposite-architecture descriptor changed normal readiness or lost its safety gates");
      check(!mismatchedVerification.blockers.includes("descriptor_not_issued")
        && mismatchedVerification.blockers.includes("fixture_registry_source_not_executable")
        && mismatchedVerification.blockers.includes("registered_driver_runtime_architecture_mismatch"), "J2534 opposite-architecture driver was not privately issued for architecture-matched non-executing preflight");
      check(mismatchedNativeFixture.blockers.join(",") === "live_registry_descriptor_required"
        && mismatchedNativeFixture.dll_load_attempted === false && mismatchedNativeFixture.vehicle_communication_started === false, "J2534 opposite-architecture fixture bypassed the live-registry gate");

      const decoratedRegistryText = [
        "HKEY_LOCAL_MACHINE\\SOFTWARE\\PassThruSupport.04.04\\Fixture Vendor\\Decorated VCI",
        "    Name    REG_SZ    Decorated J2534 VCI",
        "    Vendor    REG_SZ    Fixture Vendor",
        `    FunctionLibrary    REG_SZ    ${x86LibraryPath}`
      ].join("\n");
      const decoratedDeviceId = parseJ2534RegistryDrivers(decoratedRegistryText)[0]?.id;
      const decoratedDescriptor = createJ2534RegisteredDriverFixtureDescriptor({ registryText: decoratedRegistryText, selectedDeviceId: decoratedDeviceId });
      check(decoratedDescriptor.descriptor_status === "blocked" && decoratedDescriptor.blockers.includes("registered_driver_identity_exports_decorated_only") && decoratedDescriptor.missing_exact_identity_apis.includes("PassThruOpen"), "J2534 registered descriptor accepted decorated identity exports that the native binding cannot resolve");

      const namedOnlyLibraryPath = path.join(j2534PeFixtureDir, "j2534-named-only.dll");
      const namedOnlyLibrary = buildTestPeLibrary(matchingMachine, matchingBitness, j2534RequiredApis);
      for (let index = 0; index < j2534RequiredApis.length; index += 1) namedOnlyLibrary.writeUInt32LE(0, 0x260 + index * 4);
      fs.writeFileSync(namedOnlyLibraryPath, namedOnlyLibrary);
      const namedOnlyRegistryText = [
        "HKEY_LOCAL_MACHINE\\SOFTWARE\\PassThruSupport.04.04\\Fixture Vendor\\Named Only VCI",
        "    Name    REG_SZ    Named Only J2534 VCI",
        "    Vendor    REG_SZ    Fixture Vendor",
        `    FunctionLibrary    REG_SZ    ${namedOnlyLibraryPath}`
      ].join("\n");
      const namedOnlyDeviceId = parseJ2534RegistryDrivers(namedOnlyRegistryText)[0]?.id;
      const namedOnlyDescriptor = createJ2534RegisteredDriverFixtureDescriptor({ registryText: namedOnlyRegistryText, selectedDeviceId: namedOnlyDeviceId });
      check(namedOnlyDescriptor.descriptor_status === "blocked" && namedOnlyDescriptor.blockers.includes("registered_driver_identity_exports_not_callable") && namedOnlyDescriptor.exact_identity_api_ready === false, "J2534 registered descriptor accepted named exports without callable EAT entries");

      const buildDescriptorForLibrary = (libraryPath, name) => {
        const registryText = [
          `HKEY_LOCAL_MACHINE\\SOFTWARE\\PassThruSupport.04.04\\Fixture Vendor\\${name}`,
          `    Name    REG_SZ    ${name}`,
          "    Vendor    REG_SZ    Fixture Vendor",
          `    FunctionLibrary    REG_SZ    ${libraryPath}`
        ].join("\n");
        const deviceId = parseJ2534RegistryDrivers(registryText)[0]?.id;
        return createJ2534RegisteredDriverFixtureDescriptor({ registryText, selectedDeviceId: deviceId });
      };
      const nonExecutableLibraryPath = path.join(j2534PeFixtureDir, "j2534-non-executable-export.dll");
      const nonExecutableLibrary = buildTestPeLibrary(matchingMachine, matchingBitness, j2534RequiredApis);
      for (let index = 0; index < j2534RequiredApis.length; index += 1) nonExecutableLibrary.writeUInt32LE(0x1500 + index * 4, 0x260 + index * 4);
      fs.writeFileSync(nonExecutableLibraryPath, nonExecutableLibrary);
      const nonExecutableDescriptor = buildDescriptorForLibrary(nonExecutableLibraryPath, "Non-executable Export VCI");
      check(nonExecutableDescriptor.blockers.includes("registered_driver_identity_exports_not_callable") && nonExecutableDescriptor.exact_identity_api_ready === false, "J2534 registered descriptor accepted function RVAs in a non-executable section");

      const virtualTailLibraryPath = path.join(j2534PeFixtureDir, "j2534-virtual-tail-export.dll");
      const virtualTailLibrary = buildTestPeLibrary(matchingMachine, matchingBitness, j2534RequiredApis);
      const fixtureOptionalHeaderSize = matchingBitness === 64 ? 0xF0 : 0xE0;
      const fixtureSectionOffset = 0x80 + 24 + fixtureOptionalHeaderSize;
      virtualTailLibrary.writeUInt32LE(0x800, fixtureSectionOffset + 8);
      for (let index = 0; index < j2534RequiredApis.length; index += 1) virtualTailLibrary.writeUInt32LE(0x1700 + index * 4, 0x260 + index * 4);
      fs.writeFileSync(virtualTailLibraryPath, virtualTailLibrary);
      const virtualTailDescriptor = buildDescriptorForLibrary(virtualTailLibraryPath, "Virtual Tail Export VCI");
      check(virtualTailDescriptor.blockers.includes("registered_driver_identity_exports_not_callable") && virtualTailDescriptor.exact_identity_api_ready === false, "J2534 registered descriptor accepted function RVAs without file-backed section bytes");

      const unsafeRegistryCases = [
        ["\\\\diagnostic-share\\drivers\\j2534.dll", "registered_driver_path_not_local"],
        [`${descriptorLibraryPath}:stream`, "registered_driver_alternate_stream_blocked"],
        [path.join(j2534PeFixtureDir, "missing-descriptor.dll"), "registered_driver_reparse_check_failed"]
      ];
      for (const [unsafePath, blocker] of unsafeRegistryCases) {
        const unsafeRegistryText = [
          "HKEY_LOCAL_MACHINE\\SOFTWARE\\PassThruSupport.04.04\\Fixture Vendor\\Unsafe VCI",
          "    Name    REG_SZ    Unsafe J2534 VCI",
          "    Vendor    REG_SZ    Fixture Vendor",
          `    FunctionLibrary    REG_SZ    ${unsafePath}`
        ].join("\n");
        const unsafeDeviceId = parseJ2534RegistryDrivers(unsafeRegistryText)[0]?.id;
        const unsafeDescriptor = createJ2534RegisteredDriverFixtureDescriptor({ registryText: unsafeRegistryText, selectedDeviceId: unsafeDeviceId });
        check(unsafeDescriptor.descriptor_status === "blocked" && unsafeDescriptor.blockers.includes(blocker) && !JSON.stringify(unsafeDescriptor).includes(unsafePath), `J2534 registered descriptor did not safely reject ${blocker}`);
      }

      fs.writeFileSync(descriptorLibraryPath, buildTestPeLibrary(mismatchedMachine, mismatchedBitness, j2534RequiredApis));
      const replacedVerification = verifyJ2534RegisteredDriverDescriptor(registeredDescriptor);
      check(replacedVerification.verification_status === "rejected" && replacedVerification.blockers.includes("registered_driver_file_changed"), "J2534 registered descriptor did not reject a replaced DLL");
    } else {
      check(registeredDescriptor.descriptor_status === "platform_unsupported" && registeredDescriptor.blockers.includes("platform_unsupported"), "J2534 registered descriptor did not fail closed on a non-Windows host");
    }
    const prioritizedJ2534RegistryText = [
      "HKEY_LOCAL_MACHINE\\SOFTWARE\\PassThruSupport.04.04\\Fixture Vendor\\Incompatible VCI",
      "    Name    REG_SZ    Incompatible J2534 VCI",
      "    Vendor    REG_SZ    Fixture Vendor",
      `    FunctionLibrary    REG_SZ    ${mismatchedLibraryPath}`,
      "HKEY_LOCAL_MACHINE\\SOFTWARE\\PassThruSupport.04.04\\Fixture Vendor\\Ready VCI",
      "    Name    REG_SZ    Ready J2534 VCI",
      "    Vendor    REG_SZ    Fixture Vendor",
      `    FunctionLibrary    REG_SZ    ${matchingLibraryPath}`
    ].join("\n");
    const prioritizedJ2534Server = createLocalBridgeApp({ pairingToken: token, j2534RegistryText: prioritizedJ2534RegistryText });
    const prioritizedJ2534Port = await new Promise((resolve) => {
      prioritizedJ2534Server.listen(0, "127.0.0.1", () => resolve(prioritizedJ2534Server.address().port));
    });
    try {
      const prioritizedVci = await post(prioritizedJ2534Port, "list_vci");
      const prioritizedIdentity = await post(prioritizedJ2534Port, "adapter_identity");
      const prioritizedReadout = await post(prioritizedJ2534Port, "read_stored_dtc");
      const readyDevice = prioritizedVci.data.devices.find((device) => device.label === "Ready J2534 VCI");
      check(prioritizedVci.data.driver_readiness_status === "readonly_static_check_complete" && prioritizedVci.data.open_review_status === "manual_review_required" && prioritizedVci.data.open_review_blockers?.join(",") === "manual_vci_connection_review_required" && prioritizedVci.data.pass_thru_open_allowed === false && prioritizedVci.data.pass_thru_open_attempted === false && prioritizedVci.data.vehicle_connection_attempted === false && prioritizedVci.data.static_ready_vci_count === 1 && prioritizedVci.data.static_blocked_vci_count === 1 && prioritizedVci.data.selected_device_id === readyDevice?.id && prioritizedVci.data.selected_static_ready_device_id === readyDevice?.id, "J2534 discovery did not prefer the runtime-compatible read-only driver and retain the unopened review gate");
      check(prioritizedIdentity.data.adapter_name === "Ready J2534 VCI" && prioritizedIdentity.data.vehicle_command_enabled === false, "J2534 adapter identity did not retain the preferred read-only driver");
      check(prioritizedReadout.ok === false && prioritizedReadout.errors.includes("vci_not_connected") && prioritizedReadout.data.selected_device_id === readyDevice?.id && prioritizedReadout.would_transmit === false && prioritizedReadout.data.vehicle_command_enabled === false, "J2534 preferred driver readout did not remain closed before manual connection review");
    } finally {
      await new Promise((resolve) => prioritizedJ2534Server.close(resolve));
    }
  } finally {
    fs.rmSync(j2534PeFixtureDir, { recursive: true, force: true });
  }
  const j2534DiscoveryServer = createLocalBridgeApp({ pairingToken: token, j2534RegistryText });
  const j2534DiscoveryPort = await new Promise((resolve) => {
    j2534DiscoveryServer.listen(0, "127.0.0.1", () => resolve(j2534DiscoveryServer.address().port));
  });
  try {
    const j2534Status = await post(j2534DiscoveryPort, "bridge_status");
    const j2534Vci = await post(j2534DiscoveryPort, "list_vci");
    const j2534Identity = await post(j2534DiscoveryPort, "adapter_identity");
    check(j2534Status.data.sample_mode === false && j2534Status.data.vci_detected_count === 2 && j2534Status.data.registration_status === "registered_driver_detected" && j2534Status.data.driver_readiness_status === "static_inspection_pending" && j2534Status.data.next_check === "verify_driver_library_path" && j2534Status.data.registry_roots_checked?.length === 2 && [32, 64].includes(j2534Status.data.bridge_runtime_bitness) && j2534Status.data.open_review_status === "blocked" && j2534Status.data.open_review_blockers?.includes("driver_library_not_inspected") && j2534Status.data.pass_thru_open_attempted === false && j2534Status.data.vehicle_connection_attempted === false && j2534Vci.data.driver_status === "j2534_registry_detected" && j2534Vci.data.driver_readiness_status === "static_inspection_pending" && j2534Vci.data.devices.length === 2 && j2534Vci.data.devices.every((item) => item.connected === false), "J2534 registry discovery did not expose detected drivers and unopened static runtime context");
    check(j2534Identity.data.adapter_family === "j2534_passthru" && j2534Identity.data.driver_status === "j2534_registry_detected" && j2534Identity.data.registration_status === "registered_driver_detected" && j2534Identity.data.driver_readiness_status === "static_inspection_pending" && j2534Identity.data.registry_roots_checked?.length === 2 && j2534Identity.data.vehicle_command_enabled === false, "J2534 registry discovery did not preserve adapter identity and static runtime read-only safety");
    for (const intent of j2534UnavailableReadIntents) {
      const unavailableReadout = await post(j2534DiscoveryPort, intent);
      check(unavailableReadout.ok === false && unavailableReadout.blocked === false && unavailableReadout.would_transmit === false && unavailableReadout.errors.includes("vci_not_connected"), `J2534 discovery ${intent} did not stop before an unopened VCI readout`);
      check(unavailableReadout.data.connection_status === "driver_detected_not_opened" && unavailableReadout.data.vehicle_command_enabled === false, `J2534 discovery ${intent} did not retain the unopened read-only state`);
      check(!Object.hasOwn(unavailableReadout.data, "dtcs") && !Object.hasOwn(unavailableReadout.data, "values") && !Object.hasOwn(unavailableReadout.data, "tests") && !Object.hasOwn(unavailableReadout.data, "supported_pids"), `J2534 discovery ${intent} exposed sample diagnostic data`);
    }
  } finally {
    await new Promise((resolve) => j2534DiscoveryServer.close(resolve));
  }

  const j2534MissingDriverServer = createLocalBridgeApp({ pairingToken: token, discoverJ2534: true, j2534RegistryText: "" });
  const j2534MissingDriverPort = await new Promise((resolve) => {
    j2534MissingDriverServer.listen(0, "127.0.0.1", () => resolve(j2534MissingDriverServer.address().port));
  });
  try {
    const missingDriverHealth = await fetch(`http://127.0.0.1:${j2534MissingDriverPort}/health`).then((response) => response.json());
    const missingDriverStatus = await post(j2534MissingDriverPort, "bridge_status");
    const missingDriverVci = await post(j2534MissingDriverPort, "list_vci");
    const missingDriverIdentity = await post(j2534MissingDriverPort, "adapter_identity");
    check(missingDriverHealth.sample_mode === false && missingDriverHealth.j2534_discovery_requested === true && missingDriverHealth.vci_detected_count === 0 && missingDriverHealth.driver_readiness_status === "no_registered_driver" && missingDriverHealth.next_check === "install_or_repair_j2534_driver_registration", "Empty J2534 discovery incorrectly fell back to sample health mode");
    check(missingDriverStatus.data.status === "driver_not_detected" && missingDriverStatus.data.sample_mode === false && missingDriverStatus.data.vci_detected_count === 0 && missingDriverStatus.data.registration_status === "no_registered_driver" && missingDriverStatus.data.driver_readiness_status === "no_registered_driver" && missingDriverStatus.data.registry_roots_checked?.length === 2 && [32, 64].includes(missingDriverStatus.data.bridge_runtime_bitness), "Empty J2534 discovery did not expose a distinct bridge status and static runtime context");
    check(missingDriverVci.data.devices.length === 0 && missingDriverVci.data.selected_device_id === null && missingDriverVci.data.driver_status === "j2534_driver_not_detected" && missingDriverVci.data.registration_status === "no_registered_driver" && missingDriverVci.data.next_check === "install_or_repair_j2534_driver_registration", "Empty J2534 discovery exposed a sample VCI");
    check(missingDriverIdentity.data.adapter_name === null && missingDriverIdentity.data.connection_status === "driver_not_detected" && missingDriverIdentity.data.vehicle_command_enabled === false, "Empty J2534 discovery exposed a sample adapter identity");
    for (const intent of j2534UnavailableReadIntents) {
      const unavailableReadout = await post(j2534MissingDriverPort, intent);
      check(unavailableReadout.ok === false && unavailableReadout.blocked === false && unavailableReadout.would_transmit === false && unavailableReadout.errors.includes("vci_not_detected"), `Empty J2534 discovery ${intent} did not stop before sample readout fallback`);
      check(!Object.hasOwn(unavailableReadout.data, "dtcs") && !Object.hasOwn(unavailableReadout.data, "values") && !Object.hasOwn(unavailableReadout.data, "tests") && !Object.hasOwn(unavailableReadout.data, "supported_pids"), `Empty J2534 discovery ${intent} exposed sample diagnostic data`);
    }
  } finally {
    await new Promise((resolve) => j2534MissingDriverServer.close(resolve));
  }

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
  check(ecuInfo.data.had_sensitive_identifier === true && !ecuInfo.data.values.some((item) => item.id === "vin") && !JSON.stringify(ecuInfo).includes("JTDKN3DU0A0123456"), "ECU info response exposed a raw VIN instead of marking it redacted");

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
  const readiness = await post(port, "read_readiness", token, { readout_id: "readiness_snapshot", pid: "01" });
  check(readiness.ok === true && readiness.blocked === false && readiness.would_transmit === false, "readiness request was not kept read-only");
  check(readiness.data.readiness_status_byte_a === 0x00 && readiness.data.readiness_status_byte_b === 0x07 && readiness.data.readiness_status_byte_c === 0x65 && readiness.data.readiness_status_byte_d === 0x00, "readiness request did not return a dedicated Mode 01 PID 01 snapshot");
  const legacyReadiness = await post(port, "read_live_pid_snapshot", token, { readout_id: "readiness_snapshot", pid: "01" });
  check(legacyReadiness.ok === true && legacyReadiness.would_transmit === false && legacyReadiness.data.readiness_status_byte_b === 0x07, "legacy readiness request was not retained as a read-only compatibility route");
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
  "can0 7E9#0749000100008000",
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
  check(!Object.hasOwn(replayDtc.data, "captured_at"), "replay DTC response fabricated a capture timestamp");
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
    check(incompleteReplayDtc.ok === false && incompleteReplayDtc.errors.includes("replay_dtc_payload_incomplete") && incompleteReplayDtc.data.dtcs.length === 0 && incompleteReplayDtc.data.ecu_responses?.some((item) => item.ecu === "7E8" && item.status === "unparsed" && item.error_codes?.includes("replay_dtc_payload_incomplete") && item.vehicle_command_enabled === false), "incomplete replay DTC payload lost its ECU-scoped read-only failure");
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

  const negativeReplayLog = [
    "can0 7E8#037F0311",
    "can0 7E9#037F0712",
    "can0 7EA#037F0A22",
    "can0 7E8#037F0212",
    "can0 7E8#037F0922",
    "can0 7E8#037F0631"
  ].join("\n");
  const negativeReplayServer = createLocalBridgeApp({ pairingToken: token, replayLogText: negativeReplayLog });
  const negativeReplayPort = await new Promise((resolve) => {
    negativeReplayServer.listen(0, "127.0.0.1", () => resolve(negativeReplayServer.address().port));
  });
  try {
    const negativeReplayReadouts = [
      ["read_stored_dtc", "replay_negative_response_03_11"],
      ["read_pending_dtc", "replay_negative_response_07_12"],
      ["read_permanent_dtc", "replay_negative_response_0A_22"],
      ["read_freeze_frame", "replay_negative_response_02_12"],
      ["read_ecu_info", "replay_negative_response_09_22"],
      ["read_onboard_monitor", "replay_negative_response_06_31"]
    ];
    for (const [intent, error] of negativeReplayReadouts) {
      const response = await post(negativeReplayPort, intent);
      check(response.ok === false && response.errors.includes(error) && response.would_transmit === false, `replay ${intent} did not retain its negative OBD response as a read-only failure`);
    }
    const negativeMode09 = await post(negativeReplayPort, "read_ecu_info");
    check(negativeMode09.data.readout_ecu_ids?.includes("7E8") && negativeMode09.data.ecu_info_ecu_snapshots?.some((item) => item.source_ecu === "7E8" && item.ecu_info_readout_status === "unparsed" && item.ecu_info_negative_response_service === "09" && item.ecu_info_negative_response_code === "22" && item.error_codes?.includes("replay_negative_response_09_22") && item.item_count === 0 && item.vehicle_command_enabled === false && item.would_transmit === false), "replay Mode 09 negative response lost its ECU-scoped read-only outcome");
    const negativeStoredDtc = await post(negativeReplayPort, "read_stored_dtc");
    check(negativeStoredDtc.data.dtc_negative_response_services?.includes("03") && negativeStoredDtc.data.dtc_negative_response_codes?.includes("11") && negativeStoredDtc.data.ecu_responses?.some((item) => item.ecu === "7E8" && item.status === "negative_response" && item.response_services?.includes("7F") && item.negative_requested_services?.includes("03") && item.negative_response_labels?.includes("OBD NRC 11") && item.negative_response_count === 1 && item.dtcs?.length === 0 && item.would_transmit === false), "replay stored DTC negative response lost its ECU-scoped service evidence");
    const negativePendingDtc = await post(negativeReplayPort, "read_pending_dtc");
    const negativePermanentDtc = await post(negativeReplayPort, "read_permanent_dtc");
    check(negativePendingDtc.data.ecu_responses?.some((item) => item.ecu === "7E9" && item.dtc_status === "pending" && item.negative_requested_services?.includes("07") && item.negative_response_labels?.includes("OBD NRC 12")) && negativePermanentDtc.data.ecu_responses?.some((item) => item.ecu === "7EA" && item.dtc_status === "permanent" && item.negative_requested_services?.includes("0A") && item.negative_response_labels?.includes("OBD NRC 22")) && [negativePendingDtc, negativePermanentDtc].every((item) => item.ok === false && item.would_transmit === false), "replay pending or permanent DTC negative response was assigned to the wrong ECU or status");
    const negativeFreezeFrame = await post(negativeReplayPort, "read_freeze_frame");
    check(negativeFreezeFrame.data.readout_ecu_ids?.includes("7E8") && negativeFreezeFrame.data.freeze_frame_ecu_snapshots?.some((item) => item.source_ecu === "7E8" && item.freeze_frame_readout_status === "unparsed" && item.freeze_frame_negative_response_service === "02" && item.freeze_frame_negative_response_code === "12" && item.error_codes?.includes("replay_negative_response_02_12") && item.monitor_values?.length === 0 && item.vehicle_command_enabled === false), "replay freeze-frame negative response lost its ECU-scoped outcome");
    const negativeMode01Replay = decodeReplayLog("can0 7E8#037F0112");
    check(negativeMode01Replay.readoutErrors.live_pid_snapshot === null && negativeMode01Replay.readoutErrors.readiness_snapshot === null && negativeMode01Replay.readoutErrors.supported_pids === null, "replay Mode 01 negative response was assigned to an unknown PID readout");
  } finally {
    await new Promise((resolve) => negativeReplayServer.close(resolve));
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

  const multiEcuReplay = decodeReplayLog(["can0 7E8#04410C1AF8", "can0 7E9#04410C1B58"].join("\n"));
  check(multiEcuReplay.liveValues.length === 2 && multiEcuReplay.liveValues.every((item) => item.id === "engine_speed" && ["7E8", "7E9"].includes(item.source_ecu)), "replay live values lost ECU identity or collapsed values from separate ECUs");
  const multiEcuSupportedPidReplay = decodeReplayLog(["can0 7E8#06410080000000", "can0 7E9#06410040000000"].join("\n"));
  check(multiEcuSupportedPidReplay.supportedPidEcuSnapshots?.some((item) => item.source_ecu === "7E8" && item.supported_pid_page_bases.includes("00") && item.supported_pids.includes("01")) && multiEcuSupportedPidReplay.supportedPidEcuSnapshots?.some((item) => item.source_ecu === "7E9" && item.supported_pid_page_bases.includes("00") && item.supported_pids.includes("02")), "replay supported PID pages lost ECU-specific capability boundaries");
  const mixedSupportedPidServer = createLocalBridgeApp({ pairingToken: token, replayLogText: ["can0 7E8#06410080000000", "can0 7E9#03410080"].join("\n") });
  const mixedSupportedPidPort = await new Promise((resolve) => {
    mixedSupportedPidServer.listen(0, "127.0.0.1", () => resolve(mixedSupportedPidServer.address().port));
  });
  try {
    const mixedSupportedPid = await post(mixedSupportedPidPort, "read_supported_pids", token);
    check(mixedSupportedPid.ok === false && mixedSupportedPid.errors?.includes("replay_supported_pids_payload_incomplete") && mixedSupportedPid.data.readout_ecu_ids?.join(",") === "7E8,7E9" && mixedSupportedPid.data.supported_pid_ecu_snapshots?.some((item) => item.source_ecu === "7E8" && item.supported_pid_readout_status === "reported" && item.supported_pids?.includes("01") && item.vehicle_command_enabled === false) && mixedSupportedPid.data.supported_pid_ecu_snapshots?.some((item) => item.source_ecu === "7E9" && item.supported_pid_readout_status === "unparsed" && item.error_codes?.includes("replay_supported_pids_payload_incomplete") && item.supported_pids === undefined) && mixedSupportedPid.would_transmit === false, "mixed supported PID replay discarded the valid ECU or promoted the incomplete ECU");
  } finally {
    await new Promise((resolve) => mixedSupportedPidServer.close(resolve));
  }
  const incompleteSupportedPidTransport = decodeReplayLog("can0 7EA#100641008000");
  check(incompleteSupportedPidTransport.readoutErrors.supported_pids === "replay_supported_pids_transport_incomplete" && incompleteSupportedPidTransport.readoutErrors.live_pid_snapshot === null && incompleteSupportedPidTransport.supportedPidEcuOutcomes?.some((item) => item.source_ecu === "7EA" && item.error_codes?.includes("replay_supported_pids_transport_incomplete")), "incomplete supported PID transport was not isolated as an ECU-scoped capability failure");
  const multiEcuFreezeFrameReplay = decodeReplayLog(["can0 7E8#054202000171", "can0 7E9#054202000300"].join("\n"));
  check(multiEcuFreezeFrameReplay.triggerDtc === "P0171" && multiEcuFreezeFrameReplay.triggerDtcEntries?.some((item) => item.code === "P0171" && item.source_ecu === "7E8") && multiEcuFreezeFrameReplay.triggerDtcEntries?.some((item) => item.code === "P0300" && item.source_ecu === "7E9"), "replay freeze-frame trigger DTCs lost ECU-specific evidence");

  const mixedStoredDtcServer = createLocalBridgeApp({ pairingToken: token, replayLogText: ["can0 7E8#03430171", "can0 7E9#037F0311"].join("\n") });
  const mixedStoredDtcPort = await new Promise((resolve) => {
    mixedStoredDtcServer.listen(0, "127.0.0.1", () => resolve(mixedStoredDtcServer.address().port));
  });
  try {
    const mixedStoredDtc = await post(mixedStoredDtcPort, "read_stored_dtc");
    check(mixedStoredDtc.ok === false && mixedStoredDtc.data.dtcs?.some((item) => item.code === "P0171" && item.ecu === "7E8") && mixedStoredDtc.data.ecu_responses?.some((item) => item.ecu === "7E8" && item.status === "reported" && item.response_services?.includes("43") && item.dtcs?.includes("P0171")) && mixedStoredDtc.data.ecu_responses?.some((item) => item.ecu === "7E9" && item.status === "negative_response" && item.response_services?.includes("7F") && item.negative_requested_services?.includes("03")) && mixedStoredDtc.would_transmit === false, "mixed stored DTC replay discarded valid ECU codes or lost the negative-response ECU");
  } finally {
    await new Promise((resolve) => mixedStoredDtcServer.close(resolve));
  }

  const mixedFreezeFrameServer = createLocalBridgeApp({ pairingToken: token, replayLogText: ["can0 7E8#054202000171", "can0 7E8#04420C001AF8", "can0 7E9#037F0212"].join("\n") });
  const mixedFreezeFramePort = await new Promise((resolve) => {
    mixedFreezeFrameServer.listen(0, "127.0.0.1", () => resolve(mixedFreezeFrameServer.address().port));
  });
  try {
    const mixedFreezeFrame = await post(mixedFreezeFramePort, "read_freeze_frame");
    check(mixedFreezeFrame.ok === false && mixedFreezeFrame.data.values?.some((item) => item.id === "engine_speed" && item.source_ecu === "7E8") && mixedFreezeFrame.data.trigger_dtc_entries?.some((item) => item.code === "P0171" && item.source_ecu === "7E8") && mixedFreezeFrame.data.readout_ecu_ids?.join(",") === "7E8,7E9" && mixedFreezeFrame.data.freeze_frame_ecu_snapshots?.some((item) => item.source_ecu === "7E8" && item.freeze_frame_readout_status === "reported" && item.monitor_values?.some((value) => value.id === "engine_speed") && item.trigger_dtc === "P0171") && mixedFreezeFrame.data.freeze_frame_ecu_snapshots?.some((item) => item.source_ecu === "7E9" && item.freeze_frame_readout_status === "unparsed" && item.freeze_frame_negative_response_code === "12" && item.monitor_values?.length === 0) && mixedFreezeFrame.would_transmit === false, "mixed freeze-frame replay discarded valid ECU evidence or lost the failed ECU outcome");
  } finally {
    await new Promise((resolve) => mixedFreezeFrameServer.close(resolve));
  }

  const mixedReadinessServer = createLocalBridgeApp({ pairingToken: token, replayLogText: ["can0 7E8#06410181070000", "can0 7E9#03410181"].join("\n") });
  const mixedReadinessPort = await new Promise((resolve) => {
    mixedReadinessServer.listen(0, "127.0.0.1", () => resolve(mixedReadinessServer.address().port));
  });
  try {
    const mixedReadiness = await post(mixedReadinessPort, "read_readiness", token, { readout_id: "readiness_snapshot", pid: "01" });
    check(mixedReadiness.ok === false && mixedReadiness.errors?.includes("replay_readiness_payload_incomplete") && mixedReadiness.data.readout_ecu_ids?.join(",") === "7E8,7E9" && mixedReadiness.data.readiness_ecu_snapshots?.some((item) => item.source_ecu === "7E8" && item.readiness_readout_status === "reported" && item.readiness_status_byte_a === 0x81 && item.vehicle_command_enabled === false) && mixedReadiness.data.readiness_ecu_snapshots?.some((item) => item.source_ecu === "7E9" && item.readiness_readout_status === "unparsed" && item.error_codes?.includes("replay_readiness_payload_incomplete") && item.readiness_status_byte_a === undefined) && mixedReadiness.would_transmit === false, "mixed readiness replay discarded the valid ECU or promoted the incomplete ECU");
  } finally {
    await new Promise((resolve) => mixedReadinessServer.close(resolve));
  }

  const incompleteReadinessTransport = decodeReplayLog("can0 7EA#100641018107");
  check(incompleteReadinessTransport.readoutErrors.readiness_snapshot === "replay_readiness_transport_incomplete" && incompleteReadinessTransport.readoutErrors.live_pid_snapshot === null && incompleteReadinessTransport.readinessEcuOutcomes?.some((item) => item.source_ecu === "7EA" && item.error_codes?.includes("replay_readiness_transport_incomplete")), "incomplete Mode 01 PID 01 transport was not isolated as an ECU-scoped readiness failure");

  const mixedMode09Server = createLocalBridgeApp({
    pairingToken: token,
    replayLogText: ["can0 7E8#100B49040143414C", "can0 7E8#212D31323334", "can0 7E9#037F0922"].join("\n")
  });
  const mixedMode09Port = await new Promise((resolve) => {
    mixedMode09Server.listen(0, "127.0.0.1", () => resolve(mixedMode09Server.address().port));
  });
  try {
    const mixedMode09 = await post(mixedMode09Port, "read_ecu_info");
    check(mixedMode09.ok === false && mixedMode09.data.values?.some((item) => item.id === "calibration_id" && item.value === "CAL-1234" && item.source_ecu === "7E8") && mixedMode09.data.readout_ecu_ids?.join(",") === "7E8,7E9" && mixedMode09.data.ecu_info_ecu_snapshots?.some((item) => item.source_ecu === "7E8" && item.ecu_info_readout_status === "reported" && item.item_ids?.includes("calibration_id")) && mixedMode09.data.ecu_info_ecu_snapshots?.some((item) => item.source_ecu === "7E9" && item.ecu_info_readout_status === "unparsed" && item.ecu_info_negative_response_code === "22" && item.item_count === 0) && mixedMode09.would_transmit === false, "mixed Mode 09 replay discarded valid ECU data or lost the failed ECU outcome");
  } finally {
    await new Promise((resolve) => mixedMode09Server.close(resolve));
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
    check(incompleteIsoTpReplay.ok === false && incompleteIsoTpReplay.errors.includes("replay_ecu_info_transport_incomplete") && incompleteIsoTpReplay.data.values.length === 0 && incompleteIsoTpReplay.data.readout_ecu_ids?.includes("7E8") && incompleteIsoTpReplay.data.ecu_info_ecu_snapshots?.some((item) => item.source_ecu === "7E8" && item.ecu_info_readout_status === "unparsed" && item.error_codes?.includes("replay_ecu_info_transport_incomplete") && item.item_count === 0), "incomplete replay ISO-TP ECU information was not reported as an ECU-scoped transport failure");
  } finally {
    await new Promise((resolve) => incompleteIsoTpReplayServer.close(resolve));
  }

  const vinReplayServer = createLocalBridgeApp({
    pairingToken: token,
    replayLogText: [
      "can0 7E8#101349024A54444B",
      "can0 7E8#214E334455304130",
      "can0 7E8#2231323334353600"
    ].join("\n")
  });
  const vinReplayPort = await new Promise((resolve) => {
    vinReplayServer.listen(0, "127.0.0.1", () => resolve(vinReplayServer.address().port));
  });
  try {
    const vinReplayEcuInfo = await post(vinReplayPort, "read_ecu_info");
    check(vinReplayEcuInfo.ok === true && vinReplayEcuInfo.data.had_sensitive_identifier === true && vinReplayEcuInfo.data.values.length === 0 && !JSON.stringify(vinReplayEcuInfo).includes("JTDKN3DU0A0123456"), "Mode 09 VIN replay exposed a raw VIN through the local bridge");
  } finally {
    await new Promise((resolve) => vinReplayServer.close(resolve));
  }

  const replayEcuInfo = await post(replayPort, "read_ecu_info");
  check(!Object.hasOwn(replayEcuInfo.data, "captured_at"), "replay ECU information response fabricated a capture timestamp");
  check(replayEcuInfo.data.values.some((item) => item.id === "supported_info_types_00" && item.value === "55 60 00 00"), "replay ECU info did not decode Mode 09 supported information types");
  check(replayEcuInfo.data.values.some((item) => item.id === "in_use_performance_tracking_spark" && item.value === "00 00 00 01"), "replay ECU info did not decode Mode 09 spark performance counters");
  check(replayEcuInfo.data.values.some((item) => item.id === "calibration_id" && item.value === "CAL-1234"), "replay ECU info did not decode CALID");
  check(replayEcuInfo.data.values.some((item) => item.id === "ecu_name" && item.value === "Engine ECU"), "replay ECU info did not decode ECU name");
  check(replayEcuInfo.data.values.some((item) => item.id === "in_use_performance_tracking_compression" && item.value === "00 00 00 02"), "replay ECU info did not decode Mode 09 compression performance counters");
  check(replayEcuInfo.data.readout_ecu_ids.join(",") === "7E8,7E9" && replayEcuInfo.data.ecu_info_ecu_snapshots?.some((item) => item.source_ecu === "7E8" && item.ecu_info_readout_status === "reported" && item.item_ids.includes("calibration_id") && item.vehicle_command_enabled === false && item.would_transmit === false) && replayEcuInfo.data.ecu_info_ecu_snapshots?.some((item) => item.source_ecu === "7E9" && item.item_ids.includes("supported_info_types_00")), "replay ECU information did not retain separate read-only Mode 09 evidence for each responding ECU");

  const replayMode09LeadingZero = decodeReplayLog("can0 7E8#0749000100008000");
  check(replayMode09LeadingZero.ecuInfoValues.some((item) => item.id === "supported_info_types_00" && item.value === "00 00 80 00"), "replay Mode 09 supported information types dropped leading zero bytes");
  const replayMode09CounterIsoTp = decodeReplayLog(["can0 7E8#100B490801000000", "can0 7E8#210300000004"].join("\n"));
  check(replayMode09CounterIsoTp.ecuInfoValues.some((item) => item.id === "in_use_performance_tracking_spark" && item.value === "00 00 00 03 00 00 00 04"), "replay ISO-TP Mode 09 performance counters were not retained as raw bytes");

  const replayOnboardMonitor = await post(replayPort, "read_onboard_monitor");
  check(replayOnboardMonitor.data.tests.some((item) => item.test_id === "01" && item.value === 100), "replay Mode 06 did not decode passing test");
  check(replayOnboardMonitor.data.tests.some((item) => item.test_id === "02" && item.value === 300), "replay Mode 06 did not decode failing test");
  check(replayOnboardMonitor.data.readout_ecu_ids?.includes("7E8") && replayOnboardMonitor.data.onboard_monitor_ecu_snapshots?.some((item) => item.source_ecu === "7E8" && item.onboard_monitor_readout_status === "reported" && item.tests?.length === 2 && item.vehicle_command_enabled === false && item.would_transmit === false), "replay Mode 06 did not retain a read-only ECU-scoped snapshot");

  const mixedOnboardMonitorServer = createLocalBridgeApp({ pairingToken: token, replayLogText: ["can0 7E8#094601010064003200C8", "can0 7E9#037F0631"].join("\n") });
  const mixedOnboardMonitorPort = await new Promise((resolve) => {
    mixedOnboardMonitorServer.listen(0, "127.0.0.1", () => resolve(mixedOnboardMonitorServer.address().port));
  });
  try {
    const mixedOnboardMonitor = await post(mixedOnboardMonitorPort, "read_onboard_monitor", token);
    check(mixedOnboardMonitor.ok === false && mixedOnboardMonitor.errors?.includes("replay_negative_response_06_31") && mixedOnboardMonitor.data.readout_ecu_ids?.join(",") === "7E8,7E9" && mixedOnboardMonitor.data.onboard_monitor_ecu_snapshots?.some((item) => item.source_ecu === "7E8" && item.onboard_monitor_readout_status === "reported" && item.tests?.some((test) => test.test_id === "01" && test.value === 100)) && mixedOnboardMonitor.data.onboard_monitor_ecu_snapshots?.some((item) => item.source_ecu === "7E9" && item.onboard_monitor_readout_status === "unparsed" && item.error_codes?.includes("replay_negative_response_06_31") && item.negative_requested_service === "06" && item.negative_response_code === "31" && item.tests?.length === 0) && mixedOnboardMonitor.would_transmit === false, "mixed Mode 06 replay discarded the valid ECU or lost the negative-response ECU");
  } finally {
    await new Promise((resolve) => mixedOnboardMonitorServer.close(resolve));
  }
  const incompleteOnboardMonitorTransport = decodeReplayLog("can0 7EA#1009460101006400");
  check(incompleteOnboardMonitorTransport.readoutErrors.onboard_monitor === "replay_onboard_monitor_transport_incomplete" && incompleteOnboardMonitorTransport.onboardMonitorEcuOutcomes?.some((item) => item.source_ecu === "7EA" && item.error_codes?.includes("replay_onboard_monitor_transport_incomplete")), "incomplete Mode 06 transport was not retained as an ECU-scoped monitor failure");

  const replayLive = await post(replayPort, "read_live_pid_snapshot");
  check(!Object.hasOwn(replayLive.data, "captured_at"), "replay live PID response fabricated a capture timestamp");
  check(replayLive.data.values.some((item) => item.id === "engine_speed" && item.value === 1726), "replay live response did not decode engine speed");
  check(replayLive.data.readout_ecu_ids?.includes("7E8") && replayLive.data.live_pid_ecu_snapshots?.some((item) => item.source_ecu === "7E8" && item.live_pid_readout_status === "reported" && item.monitor_values?.some((value) => value.id === "engine_speed") && item.vehicle_command_enabled === false && item.would_transmit === false), "replay live PID response did not retain a read-only ECU-scoped snapshot");
  const mixedLivePidServer = createLocalBridgeApp({ pairingToken: token, replayLogText: ["can0 7E8#04410C1AF8", "can0 7E9#03410C1A"].join("\n") });
  const mixedLivePidPort = await new Promise((resolve) => {
    mixedLivePidServer.listen(0, "127.0.0.1", () => resolve(mixedLivePidServer.address().port));
  });
  try {
    const mixedLivePid = await post(mixedLivePidPort, "read_live_pid_snapshot", token);
    check(mixedLivePid.ok === false && mixedLivePid.errors?.includes("replay_live_pid_payload_unparsed") && mixedLivePid.data.readout_ecu_ids?.join(",") === "7E8,7E9" && mixedLivePid.data.live_pid_ecu_snapshots?.some((item) => item.source_ecu === "7E8" && item.live_pid_readout_status === "reported" && item.monitor_values?.some((value) => value.id === "engine_speed" && value.value === 1726)) && mixedLivePid.data.live_pid_ecu_snapshots?.some((item) => item.source_ecu === "7E9" && item.live_pid_readout_status === "unparsed" && item.error_codes?.includes("replay_live_pid_payload_unparsed") && item.failed_pids?.includes("0C") && item.monitor_values?.length === 0) && mixedLivePid.would_transmit === false, "mixed live PID replay discarded the valid ECU or lost the malformed ECU response");
  } finally {
    await new Promise((resolve) => mixedLivePidServer.close(resolve));
  }
  const incompleteLivePidTransport = decodeReplayLog("can0 7EA#1006410C1AF8");
  check(incompleteLivePidTransport.readoutErrors.live_pid_snapshot === "replay_live_pid_transport_incomplete" && incompleteLivePidTransport.readoutErrors.readiness_snapshot === null && incompleteLivePidTransport.readoutErrors.supported_pids === null && incompleteLivePidTransport.livePidEcuOutcomes?.some((item) => item.source_ecu === "7EA" && item.pid === "0C" && item.error_codes?.includes("replay_live_pid_transport_incomplete")), "incomplete live PID transport was not isolated as an ECU- and PID-scoped failure");
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
  const replayReadiness = await post(replayPort, "read_readiness", token, { readout_id: "readiness_snapshot", pid: "01" });
  check(replayReadiness.ok === true && replayReadiness.would_transmit === false && replayReadiness.data.readout_ecu_ids?.includes("7E8") && replayReadiness.data.readiness_ecu_snapshots.some((item) => item.source_ecu === "7E8" && item.readiness_readout_status === "reported" && item.readiness_status_byte_a === 0x81 && item.readiness_status_byte_b === 0x07 && item.vehicle_command_enabled === false && item.would_transmit === false), "replay readiness request did not return an ECU-scoped Mode 01 PID 01 snapshot");
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
  check(replayFreezeFrame.data.readout_ecu_ids?.includes("7E8") && replayFreezeFrame.data.freeze_frame_ecu_snapshots?.some((item) => item.source_ecu === "7E8" && item.freeze_frame_readout_status === "reported" && item.trigger_dtc === "P0171" && item.monitor_values?.some((value) => value.id === "engine_speed") && item.vehicle_command_enabled === false && item.would_transmit === false), "replay freeze frame did not expose its ECU-scoped read-only snapshot");
} finally {
  await new Promise((resolve) => replayServer.close(resolve));
}

const appSource = fs.readFileSync(new URL("../script.js", import.meta.url), "utf8");
const publishedCheckCount = Number(appSource.match(/bridgeValidationCheckLabel: "bridge検証 (\d+)件"/)?.[1]);
if (publishedCheckCount !== checks) failures.push(`Published bridge check count ${publishedCheckCount} does not match executed checks ${checks}`);
console.log(`Local bridge read-only checks: ${checks}`);
console.log(`Errors: ${failures.length}`);
if (failures.length) {
  failures.forEach((failure) => console.error(`ERROR: ${failure}`));
  process.exitCode = 1;
}
