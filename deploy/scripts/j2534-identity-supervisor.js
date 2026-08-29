import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createBoundedFixtureWorker } from "./bounded-fixture-worker.js";

const WORKER = fileURLToPath(new URL("./fixtures/j2534-identity-worker.js", import.meta.url));
const LIMIT = 4096;
const SCENARIOS = new Set(["success", "open_error", "read_error", "close_error", "read_close_error", "invalid_version", "open", "read", "close", "crash", "invalid_json", "bad_result", "stdout_limit", "stderr_limit", "combined_limit", "boundary", "result_then_hang"]);
const keysMatch = (value, keys) => value && typeof value === "object" && !Array.isArray(value)
  && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
const isCode = (value) => Number.isInteger(value) && value >= -0x80000000 && value <= 0x7fffffff;
const isVersion = (value) => typeof value === "string" && /^[\x20-\x7e]{1,79}$/.test(value) && value.trim() === value;

export function parseJ2534IdentityFixtureOutput(output, scenario) {
  if (typeof output !== "string" || Buffer.byteLength(output) > LIMIT || !SCENARIOS.has(scenario)) return null;
  let envelope;
  try { envelope = JSON.parse(output); } catch { return null; }
  if (!keysMatch(envelope, ["schema_version", "fixture_only", "scenario", "result"])
    || envelope.schema_version !== "j2534-identity-fixture-worker-v1" || envelope.fixture_only !== true || envelope.scenario !== scenario) return null;
  const result = envelope.result;
  if (!keysMatch(result, ["schema_version", "status", "errors", "steps", "cleanup_status", "versions"])
    || result.schema_version !== "j2534-identity-lifecycle-v1" || !Array.isArray(result.errors)
    || result.errors.length > 2 || new Set(result.errors).size !== result.errors.length
    || !keysMatch(result.steps, ["open", "read_version", "close"])) return null;
  for (const step of Object.values(result.steps)) {
    if (!keysMatch(step, ["attempted", "status_code"]) || typeof step.attempted !== "boolean"
      || (step.status_code !== null && !isCode(step.status_code)) || (!step.attempted && step.status_code !== null)) return null;
  }
  const { open, read_version: read, close } = result.steps;
  if (!open.attempted) return null;
  const versions = result.versions;
  if (versions !== null && (!keysMatch(versions, ["firmware", "dll", "api"])
    || Object.values(versions).some((value) => value !== null && !isVersion(value)))) return null;
  const validVersions = versions !== null && Object.values(versions).every(isVersion);
  const allowed = [];
  if (result.status === "open_failed") {
    if (read.attempted || close.attempted || versions !== null) return null;
    const explicitFailure = open.status_code !== null && open.status_code !== 0;
    if (result.cleanup_status !== (explicitFailure ? "not_required" : "unconfirmed")) return null;
    allowed.push(explicitFailure ? ["open_status_failed"] : open.status_code === 0
      ? ["open_device_id_invalid", "open_threw"] : ["open_response_invalid", "open_threw"]);
  } else {
    if (open.status_code !== 0 || !read.attempted || !close.attempted
      || result.cleanup_status !== (close.status_code === 0 ? "confirmed" : "unconfirmed")) return null;
    if (result.status === "read_failed") {
      if (read.status_code === 0) {
        if (validVersions) return null;
        allowed.push(versions === null ? ["read_version_threw"] : ["version_buffer_invalid"]);
      } else {
        if (versions !== null) return null;
        allowed.push(read.status_code === null ? ["read_version_response_invalid", "read_version_threw"] : ["read_version_status_failed"]);
      }
    } else if (result.status === "completed" || result.status === "cleanup_failed") {
      if (read.status_code !== 0 || !validVersions || (result.status === "completed") !== (close.status_code === 0)) return null;
    } else return null;
    if (close.status_code !== 0) allowed.push(close.status_code === null ? ["close_response_invalid", "close_threw"] : ["close_status_failed"]);
  }
  if (result.errors.length !== allowed.length || !allowed.every((codes) => result.errors.some((code) => codes.includes(code)))) return null;
  return {
    schema_version: result.schema_version, status: result.status, errors: [...result.errors],
    steps: Object.fromEntries(Object.entries(result.steps).map(([key, value]) => [key, { attempted: value.attempted, status_code: value.status_code }])),
    cleanup_status: result.cleanup_status, versions: versions === null ? null : { firmware: versions.firmware, dll: versions.dll, api: versions.api }
  };
}

const runWorker = createBoundedFixtureWorker({
  spawnWorker(scenario) {
    const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^NODE_(OPTIONS|PATH)$/i.test(key)));
    return spawn(process.execPath, [WORKER, scenario, "--supervised"], { env, shell: false, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
  },
  parseOutput(output, scenario) { return parseJ2534IdentityFixtureOutput(output, scenario); }
});

// Development fixture only. No raw executable/DLL paths or production backend.
export async function runJ2534IdentityFixture(options = {}) {
  const result = {
    schema_version: "j2534-identity-supervision-v1", fixture_only: true, native_execution_enabled: false,
    execution_status: "request_blocked", worker_started: false, worker_exited: false,
    termination_requested: false, termination_signal_sent: false,
    fixture_cleanup_status: "unconfirmed", real_adapter_cleanup_status: "not_tested", result: null, errors: []
  };
  let scenario, timeout, signal;
  try {
    if (!options || typeof options !== "object" || Array.isArray(options)
      || Object.keys(options).some((key) => !["mode", "scenario", "timeout_ms", "signal"].includes(key))) throw new Error();
    const mode = options.mode;
    scenario = options.scenario;
    timeout = options.timeout_ms;
    signal = options.signal;
    if (scenario === undefined) scenario = "success";
    if (timeout === undefined) timeout = 5000;
    if (mode !== "fixture" || !SCENARIOS.has(scenario) || !Number.isInteger(timeout) || timeout < 1000 || timeout > 10000
      || (signal != null && !(signal instanceof AbortSignal))) throw new Error();
  } catch { result.errors = ["fixture_request_invalid"]; return result; }
  if (signal?.aborted) { result.execution_status = "worker_cancelled"; result.errors = ["worker_cancelled"]; return result; }
  const supervised = await runWorker({ timeout, signal, context: scenario });
  Object.assign(result, {
    execution_status: supervised.execution_status, worker_started: supervised.worker_started,
    worker_exited: supervised.worker_exited, termination_requested: supervised.termination_requested,
    termination_signal_sent: supervised.termination_signal_sent, result: supervised.parsed_result,
    errors: supervised.errors
  });
  if (result.result) result.fixture_cleanup_status = result.result.cleanup_status;
  return result;
}
