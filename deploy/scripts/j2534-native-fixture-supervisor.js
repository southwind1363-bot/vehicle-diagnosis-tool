import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createBoundedFixtureWorker } from "./bounded-fixture-worker.js";

const SCENARIOS = new Set(["success", "open-failure", "overrun", "hang", "crash", "result-then-hang"]);
const keysMatch = (value, keys) => value && typeof value === "object" && !Array.isArray(value)
  && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
const digest = file => createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const isHash = value => typeof value === "string" && /^[0-9a-f]{64}$/.test(value);
const isStep = value => keysMatch(value, ["attempted", "status_code"]) && typeof value.attempted === "boolean"
  && (value.status_code === null || (Number.isInteger(value.status_code) && value.status_code >= -0x80000000 && value.status_code <= 0x7fffffff))
  && (value.attempted || value.status_code === null);
const isVersion = value => typeof value === "string" && /^[\x20-\x21\x23-\x5b\x5d-\x7e]{1,79}$/.test(value) && value.trim() === value;

export function parseJ2534NativeFixtureOutput(output, scenario, architecture) {
  if (typeof output !== "string" || Buffer.byteLength(output) > 4096 || !SCENARIOS.has(scenario) || !["x86", "x64"].includes(architecture)) return null;
  let envelope;
  try { envelope = JSON.parse(output); } catch { return null; }
  if (!keysMatch(envelope, ["schema_version", "fixture_only", "native_fixture_executed", "vendor_dll_executed", "vehicle_communication", "architecture", "pointer_bits", "scenario", "lifecycle"])
    || envelope.schema_version !== "j2534-native-fixture-worker-v1" || envelope.fixture_only !== true
    || envelope.native_fixture_executed !== true || envelope.vendor_dll_executed !== false || envelope.vehicle_communication !== false
    || envelope.architecture !== architecture || envelope.pointer_bits !== (architecture === "x86" ? 32 : 64) || envelope.scenario !== scenario) return null;
  const lifecycle = envelope.lifecycle;
  if (!keysMatch(lifecycle, ["status", "errors", "steps", "cleanup_status", "module_reference", "versions"])
    || !Array.isArray(lifecycle.errors) || !keysMatch(lifecycle.steps, ["open", "read_version", "close"])
    || !Object.values(lifecycle.steps).every(isStep)) return null;
  const { open, read_version: read, close } = lifecycle.steps;
  if (scenario === "success" || scenario === "result-then-hang") {
    if (lifecycle.status !== "completed" || lifecycle.errors.length !== 0 || open.status_code !== 0 || read.status_code !== 0 || close.status_code !== 0
      || !open.attempted || !read.attempted || !close.attempted || lifecycle.cleanup_status !== "confirmed" || lifecycle.module_reference !== "released"
      || !keysMatch(lifecycle.versions, ["firmware", "dll", "api"]) || !Object.values(lifecycle.versions).every(isVersion)
      || lifecycle.versions.firmware !== "fixture-fw" || lifecycle.versions.dll !== "fixture-dll" || lifecycle.versions.api !== "04.04") return null;
  } else if (scenario === "open-failure") {
    if (lifecycle.status !== "open_failed" || JSON.stringify(lifecycle.errors) !== '["open_status_failed"]' || !open.attempted || open.status_code !== -7
      || read.attempted || close.attempted || lifecycle.cleanup_status !== "not_required" || lifecycle.module_reference !== "released" || lifecycle.versions !== null) return null;
  } else if (scenario === "overrun") {
    if (lifecycle.status !== "corrupted" || JSON.stringify(lifecycle.errors) !== '["native_version_buffer_overrun"]' || !open.attempted || open.status_code !== 0
      || !read.attempted || read.status_code !== null || close.attempted || lifecycle.cleanup_status !== "unconfirmed" || lifecycle.module_reference !== "retained" || lifecycle.versions !== null) return null;
  } else return null;
  return structuredClone(envelope);
}

// Development-only factory. The validator supplies a fixed, integrity-pinned temp descriptor.
export function createJ2534NativeFixtureSupervisor(descriptor) {
  if (!keysMatch(descriptor, ["temp_root", "architecture", "worker", "fixtures"]) || !["x86", "x64"].includes(descriptor.architecture)
    || !keysMatch(descriptor.worker, ["path", "sha256"]) || !isHash(descriptor.worker.sha256)
    || !keysMatch(descriptor.fixtures, ["success", "open-failure", "overrun", "hang", "crash"])) throw new Error("native_fixture_descriptor_invalid");
  const architecture = descriptor.architecture;
  const tempRoot = fs.realpathSync(descriptor.temp_root);
  const systemTemp = fs.realpathSync(os.tmpdir());
  if (path.dirname(tempRoot) !== systemTemp || !path.basename(tempRoot).startsWith("vehicle-j2534-native-")
    || path.basename(descriptor.worker.path) !== "j2534-native-fixture-worker.exe") throw new Error("native_fixture_descriptor_invalid");
  const expectedDirectory = path.join(tempRoot, architecture);
  const files = Object.fromEntries(Object.entries({ worker: descriptor.worker, ...descriptor.fixtures })
    .map(([name, file]) => [name, Object.freeze({ path: file.path, sha256: file.sha256 })]));
  const identities = {};
  for (const [name, file] of Object.entries(files)) {
    if (!keysMatch(file, ["path", "sha256"]) || !isHash(file.sha256) || path.dirname(file.path) !== expectedDirectory
      || (name !== "worker" && path.basename(file.path) !== `${name}.dll`)) throw new Error("native_fixture_descriptor_invalid");
    const actual = fs.realpathSync(file.path);
    const stat = fs.lstatSync(actual);
    if (actual !== path.resolve(file.path) || stat.isSymbolicLink() || !stat.isFile() || digest(actual) !== file.sha256) throw new Error("native_fixture_descriptor_invalid");
    identities[name] = { dev: stat.dev, ino: stat.ino, size: stat.size };
  }
  const verifyFiles = () => Object.entries(files).every(([name, file]) => {
    try {
      const stat = fs.lstatSync(file.path); const identity = identities[name];
      return stat.isFile() && !stat.isSymbolicLink() && stat.dev === identity.dev && stat.ino === identity.ino
        && stat.size === identity.size && digest(file.path) === file.sha256;
    } catch { return false; }
  });
  const runWorker = createBoundedFixtureWorker({
    rejectStderr: true,
    spawnWorker(scenario) {
      if (!verifyFiles()) throw new Error("native_fixture_descriptor_changed");
      const windows = process.env.SystemRoot || process.env.WINDIR || "C:\\Windows";
      const env = { SystemRoot: windows, WINDIR: windows, TEMP: os.tmpdir(), TMP: os.tmpdir() };
      return spawn(files.worker.path, ["--fixture", scenario], { cwd: expectedDirectory, env, shell: false, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    },
    parseOutput(output, scenario) { return parseJ2534NativeFixtureOutput(output, scenario, architecture); }
  });
  return Object.freeze({
    async run(options = {}) {
      const base = {
        schema_version: "j2534-native-fixture-supervision-v1", fixture_only: true, native_fixture_execution_confirmed: false,
        vendor_dll_executed: false, vehicle_communication: false, architecture,
        execution_status: "request_blocked", worker_started: false, worker_exited: false,
        termination_requested: false, termination_signal_sent: false, fixture_cleanup_status: "unconfirmed", result: null, errors: []
      };
      let scenario, timeout, signal;
      try {
        if (!keysMatch(options, ["mode", "scenario", ...(Object.hasOwn(options, "timeout_ms") ? ["timeout_ms"] : []), ...(Object.hasOwn(options, "signal") ? ["signal"] : [])])) throw new Error();
        scenario = options.scenario; timeout = options.timeout_ms ?? 5000; signal = options.signal;
        if (options.mode !== "native_fixture" || !SCENARIOS.has(scenario) || !Number.isInteger(timeout) || timeout < 1000 || timeout > 10000
          || (signal != null && !(signal instanceof AbortSignal))) throw new Error();
      } catch { base.errors = ["native_fixture_request_invalid"]; return base; }
      if (signal?.aborted) { base.execution_status = "worker_cancelled"; base.errors = ["worker_cancelled"]; return base; }
      const supervised = await runWorker({ timeout, signal, context: scenario });
      Object.assign(base, {
        execution_status: supervised.execution_status, worker_started: supervised.worker_started, worker_exited: supervised.worker_exited,
        termination_requested: supervised.termination_requested, termination_signal_sent: supervised.termination_signal_sent,
        result: supervised.parsed_result, errors: supervised.errors
      });
      base.native_fixture_execution_confirmed = base.result !== null;
      if (base.result) base.fixture_cleanup_status = base.result.lifecycle.cleanup_status;
      return base;
    }
  });
}
