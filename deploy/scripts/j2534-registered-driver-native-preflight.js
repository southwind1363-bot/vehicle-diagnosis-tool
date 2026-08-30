import { spawn } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { addAbortListener } from "node:events";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REQUEST_VERSION = "j2534-native-preflight-request-v1";
const RESPONSE_VERSION = "j2534-native-preflight-response-v1";
const DESCRIPTOR_VERSION = "j2534-registered-driver-descriptor-v1";
const RESPONSE_KEYS = [
  "contract_version", "request_nonce", "selected_device_id", "descriptor_version",
  "verification_status", "blockers", "authenticode_status", "authenticode_network_retrieval_allowed", "global_mutex_status",
  "fixed_drive_verified", "final_path_matches",
  "file_identity_stable", "sha256_matches", "size_matches", "architecture_matches",
  "runtime_architecture_matches", "dll_load_attempted", "get_proc_address_attempted",
  "pass_thru_open_attempted", "vehicle_connection_attempted", "vehicle_communication_started",
  "would_transmit", "vehicle_command_enabled", "execution_enabled"
];
const FALSE_FIELDS = ["authenticode_network_retrieval_allowed", "dll_load_attempted", "get_proc_address_attempted", "pass_thru_open_attempted",
  "vehicle_connection_attempted", "vehicle_communication_started", "would_transmit",
  "vehicle_command_enabled", "execution_enabled"];
const TRUE_FIELDS = ["fixed_drive_verified", "final_path_matches", "file_identity_stable", "sha256_matches",
  "size_matches", "architecture_matches", "runtime_architecture_matches"];
const scriptsDirectory = path.dirname(fileURLToPath(import.meta.url));
const nativeDirectory = path.join(scriptsDirectory, "native");
let active = false;
let terminationUnconfirmed = false;

const exactKeys = (value, keys) => value && typeof value === "object" && !Array.isArray(value)
  && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
const safeToken = (value, min = 8, max = 96) => typeof value === "string"
  && value.length >= min && value.length <= max && /^[A-Za-z0-9_-]+$/.test(value);

function baseResult(selectedDeviceId, status = "rejected", blockers = ["native_preflight_failed"]) {
  return {
    contract_version: RESPONSE_VERSION, selected_device_id: selectedDeviceId || null,
    verification_status: status, blockers, authenticode_status: "not_verified", authenticode_network_retrieval_allowed: false, global_mutex_status: "not_acquired",
    fixed_drive_verified: false, final_path_matches: false,
    file_identity_stable: false, sha256_matches: false, size_matches: false,
    architecture_matches: false, runtime_architecture_matches: false,
    dll_load_attempted: false, get_proc_address_attempted: false, pass_thru_open_attempted: false,
    vehicle_connection_attempted: false, vehicle_communication_started: false, would_transmit: false,
    vehicle_command_enabled: false, execution_enabled: false
  };
}

function sanitizeEnvironment() {
  const windows = process.env.SystemRoot || process.env.WINDIR || "C:\\Windows";
  return { SystemRoot: windows, WINDIR: windows, TEMP: os.tmpdir(), TMP: os.tmpdir() };
}

function resolvePackagedWorker(architecture) {
  const manifestPath = path.join(nativeDirectory, "j2534-preflight-workers.json");
  const manifestReal = fs.realpathSync(manifestPath);
  const manifestStat = fs.lstatSync(manifestReal);
  if (manifestReal !== path.resolve(manifestPath) || manifestStat.isSymbolicLink() || !manifestStat.isFile()
    || manifestStat.size < 1 || manifestStat.size > 4096) throw new Error("native_preflight_worker_missing");
  const manifest = JSON.parse(fs.readFileSync(manifestReal, "utf8"));
  if (!exactKeys(manifest, ["schema_version", "workers"]) || manifest.schema_version !== "j2534-native-preflight-workers-v1"
    || !exactKeys(manifest.workers, ["x86", "x64"])) throw new Error("native_preflight_worker_integrity_mismatch");
  const descriptor = manifest.workers[architecture];
  if (!exactKeys(descriptor, ["file", "size", "sha256"]) || descriptor.file !== `j2534-registered-driver-preflight-${architecture}.exe`
    || !Number.isInteger(descriptor.size) || descriptor.size < 1 || descriptor.size > 4 * 1024 * 1024
    || !/^[0-9a-f]{64}$/.test(descriptor.sha256)) throw new Error("native_preflight_worker_integrity_mismatch");
  const requested = path.join(nativeDirectory, descriptor.file);
  const resolved = fs.realpathSync(requested);
  const stat = fs.lstatSync(resolved);
  if (resolved !== path.resolve(requested) || stat.isSymbolicLink() || !stat.isFile() || stat.size !== descriptor.size
    || createHash("sha256").update(fs.readFileSync(resolved)).digest("hex") !== descriptor.sha256)
    throw new Error("native_preflight_worker_integrity_mismatch");
  return resolved;
}

function runBoundedProcess(file, args, { cwd, input = null, timeout, outputLimit, signal, rejectOutput = false }) {
  return new Promise(resolve => {
    const state = { started: false, exited: false, stdout: "", error: null, termination_unconfirmed: false };
    let child, timer, terminationTimer, abortSubscription, closed = false, settled = false, bytes = 0;
    const resolveOnce = value => { if (!settled) { settled = true; resolve(value); } };
    const finishError = code => {
      if (state.error) return;
      state.error = code;
      if (child && child.exitCode === null && child.signalCode === null) {
        try { child.kill("SIGKILL"); } catch { /* Secondary deadline retains busy ownership. */ }
        terminationTimer = setTimeout(() => {
          if (closed) return;
          state.termination_unconfirmed = true;
          state.error = "native_preflight_termination_unconfirmed";
          terminationUnconfirmed = true;
          resolveOnce(state);
        }, 2000);
      }
    };
    try {
      child = spawn(file, args, { cwd, env: sanitizeEnvironment(), shell: false, windowsHide: true,
        stdio: [input === null ? "ignore" : "pipe", "pipe", "pipe"] });
    } catch { resolveOnce({ ...state, error: "native_preflight_process_failed" }); return; }
    const receive = (chunk, retain) => {
      if (state.error) return;
      bytes += chunk.length;
      if (bytes > outputLimit) return finishError("native_preflight_output_limit");
      if (!retain && chunk.length) return finishError("native_preflight_stderr_detected");
      if (retain) state.stdout += chunk.toString("utf8");
      if (rejectOutput && chunk.length) finishError("native_preflight_compile_output");
    };
    child.once("spawn", () => { state.started = true; });
    child.on("error", () => finishError("native_preflight_process_failed"));
    child.stdout.on("data", chunk => receive(chunk, true));
    child.stderr.on("data", chunk => receive(chunk, false));
    child.stdin?.on("error", () => finishError("native_preflight_stream_error"));
    child.stdout.on("error", () => finishError("native_preflight_stream_error"));
    child.stderr.on("error", () => finishError("native_preflight_stream_error"));
    child.once("exit", (code, signalName) => { if (code !== 0 || signalName) state.error ||= "native_preflight_process_failed"; });
    child.once("close", (code, signalName) => {
      closed = true; clearTimeout(timer); clearTimeout(terminationTimer); state.exited = state.started;
      try { abortSubscription?.[Symbol.dispose](); } catch { /* listener removed below */ }
      try { if (signal) EventTarget.prototype.removeEventListener.call(signal, "abort", cancel); } catch { state.error ||= "native_preflight_process_failed"; }
      if (code !== 0 || signalName) state.error ||= "native_preflight_process_failed";
      if (terminationUnconfirmed) { terminationUnconfirmed = false; active = false; }
      resolveOnce(state);
    });
    const cancel = () => finishError("native_preflight_cancelled");
    timer = setTimeout(() => finishError("native_preflight_timeout"), timeout);
    try {
      if (signal) abortSubscription = addAbortListener(signal, cancel);
      if (signal?.aborted) cancel();
      if (input !== null && !state.error) child.stdin.end(input, "utf8");
      else child.stdin?.destroy();
    } catch { finishError("native_preflight_process_failed"); }
    if (closed) clearTimeout(timer);
  });
}

function parseResponse(output, request) {
  if (typeof output !== "string" || Buffer.byteLength(output) > 4096 || output.includes(request.private_library_path)) return null;
  let value;
  try { value = JSON.parse(output); } catch { return null; }
  if (!exactKeys(value, RESPONSE_KEYS) || value.contract_version !== RESPONSE_VERSION
    || value.request_nonce !== request.request_nonce || value.selected_device_id !== request.selected_device_id
    || value.descriptor_version !== DESCRIPTOR_VERSION || !["verified_non_executable", "rejected"].includes(value.verification_status)
    || !Array.isArray(value.blockers) || value.blockers.length > 8 || !value.blockers.every(item => safeToken(item, 3, 96))
    || !["not_verified", "not_trusted", "verified_file_policy"].includes(value.authenticode_status)
    || !["not_acquired", "acquired_for_preflight"].includes(value.global_mutex_status)
    || FALSE_FIELDS.some(field => value[field] !== false) || TRUE_FIELDS.some(field => typeof value[field] !== "boolean")) return null;
  if (value.verification_status === "verified_non_executable"
    ? value.blockers.length !== 0 || TRUE_FIELDS.some(field => value[field] !== true)
      || !["verified_file_policy"].includes(value.authenticode_status)
      || value.global_mutex_status !== "acquired_for_preflight"
    : value.blockers.length === 0) return null;
  return value;
}

export async function runJ2534NativePreflight(privateRequest, options = {}) {
  const selected = safeToken(privateRequest?.selected_device_id) ? privateRequest.selected_device_id : null;
  const blocked = code => baseResult(selected, "rejected", [code]);
  if (active) return blocked("native_preflight_in_progress");
  const timeout = options.timeout_ms ?? 5000;
  const signal = options.signal;
  const optionKeys = ["timeout_ms", "signal"].filter(key => Object.hasOwn(options, key));
  if (!exactKeys(options, optionKeys)
    || !Number.isInteger(timeout) || timeout < 1000 || timeout > 10000
    || (signal != null && !(signal instanceof AbortSignal))) return blocked("native_preflight_request_invalid");
  const requestKeys = ["selected_device_id", "descriptor_source", "private_library_path", "expected_sha256", "expected_file_size", "expected_architecture"];
  if (!exactKeys(privateRequest, requestKeys) || !selected || privateRequest.descriptor_source !== "live_windows_registry"
    || typeof privateRequest.private_library_path !== "string" || !/^[0-9a-f]{64}$/.test(privateRequest.expected_sha256)
    || !Number.isInteger(privateRequest.expected_file_size) || privateRequest.expected_file_size < 1
    || !["x86", "x64"].includes(privateRequest.expected_architecture)) return blocked("native_preflight_request_invalid");
  active = true;
  try {
    if (signal?.aborted) return blocked("native_preflight_cancelled");
    const workerReal = resolvePackagedWorker(privateRequest.expected_architecture);
    const request = {
      contract_version: REQUEST_VERSION, operation: "verify_registered_driver_non_executable",
      request_nonce: randomBytes(16).toString("hex"), selected_device_id: selected,
      descriptor_version: DESCRIPTOR_VERSION, descriptor_source: privateRequest.descriptor_source,
      private_library_path: privateRequest.private_library_path, expected_sha256: privateRequest.expected_sha256,
      expected_file_size: privateRequest.expected_file_size, expected_architecture: privateRequest.expected_architecture,
      execution_enabled: false, vehicle_command_enabled: false
    };
    const executed = await runBoundedProcess(workerReal, [], { cwd: nativeDirectory, input: JSON.stringify(request), timeout,
      outputLimit: 4096, signal });
    if (executed.error) return blocked(executed.error);
    const parsed = parseResponse(executed.stdout, request);
    if (!parsed) return blocked("native_preflight_response_invalid");
    const { request_nonce: ignoredNonce, descriptor_version: ignoredDescriptorVersion, ...publicResult } = parsed;
    return publicResult;
  } catch (error) { return blocked(error?.message === "native_preflight_worker_integrity_mismatch"
    ? "native_preflight_worker_integrity_mismatch" : "native_preflight_worker_missing"); }
  finally { if (!terminationUnconfirmed) active = false; }
}
