import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createBoundedFixtureWorker } from "./bounded-fixture-worker.js";
import { buildJ2534UdsTransportResult } from "./j2534-readonly-worker.js";

const SCENARIOS = new Set(["success", "open-failure", "overrun", "hang", "crash", "result-then-hang"]);
const VERIFIED_IDENTITY_SCENARIOS = new Set(["success", "hold"]);
const UDS_TRANSPORT_SCENARIOS = new Set(["positive", "positive-29bit", "negative", "pending", "timeout", "transport-error", "cancelled"]);
const UDS_TRANSPORT_CONTROL_SCENARIOS = new Set(["hang", "overflow", "stderr", "crash", "result-then-hang"]);
const UDS_TRANSPORT_WORKER_SCENARIOS = new Set([...UDS_TRANSPORT_SCENARIOS, ...UDS_TRANSPORT_CONTROL_SCENARIOS]);
const keysMatch = (value, keys) => value && typeof value === "object" && !Array.isArray(value)
  && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
const digest = file => createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const isHash = value => typeof value === "string" && /^[0-9a-f]{64}$/.test(value);
const isStep = value => keysMatch(value, ["attempted", "status_code"]) && typeof value.attempted === "boolean"
  && (value.status_code === null || (Number.isInteger(value.status_code) && value.status_code >= -0x80000000 && value.status_code <= 0x7fffffff))
  && (value.attempted || value.status_code === null);
const isVersion = value => typeof value === "string" && /^[\x20-\x21\x23-\x5b\x5d-\x7e]{1,79}$/.test(value) && value.trim() === value;
const isSafeToken = value => typeof value === "string" && /^[A-Za-z0-9_-]{8,64}$/.test(value);

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

export function parseJ2534UdsTransportFixtureOutput(output, scenario, architecture) {
  if (typeof output !== "string" || Buffer.byteLength(output) > 4096
    || !UDS_TRANSPORT_SCENARIOS.has(scenario) || !["x86", "x64"].includes(architecture)) return null;
  let envelope;
  try { envelope = JSON.parse(output); } catch { return null; }
  if (!keysMatch(envelope, ["schema_version", "fixture_only", "native_fixture_executed", "vendor_dll_executed",
    "vehicle_connection_attempted", "vehicle_communication_started", "execution_enabled", "would_transmit",
    "vehicle_command_enabled", "architecture", "pointer_bits", "scenario", "transport_result_candidate"])
    || envelope.schema_version !== "j2534-uds-transport-fixture-v1" || envelope.fixture_only !== true
    || envelope.native_fixture_executed !== true || envelope.vendor_dll_executed !== false
    || envelope.vehicle_connection_attempted !== false || envelope.vehicle_communication_started !== false
    || envelope.execution_enabled !== false || envelope.would_transmit !== false || envelope.vehicle_command_enabled !== false
    || envelope.architecture !== architecture || envelope.pointer_bits !== (architecture === "x86" ? 32 : 64)
    || envelope.scenario !== scenario) return null;
  const transportResult = buildJ2534UdsTransportResult(envelope.transport_result_candidate);
  if (!transportResult || transportResult.readout_attempt_id !== `native-fixture-${scenario}-001`) return null;
  const terminalStatus = scenario === "transport-error" ? "transport_error"
    : ["timeout", "cancelled"].includes(scenario) ? scenario : null;
  if (terminalStatus) {
    if (transportResult.transport_status !== terminalStatus || transportResult.response_count !== 0
      || Object.hasOwn(transportResult, "source_ecu")) return null;
  } else if (scenario === "negative" || scenario === "pending") {
    if (transportResult.negative_requested_service !== "22"
      || transportResult.negative_response_code !== (scenario === "pending" ? "78" : "31")) return null;
  } else if (transportResult.requested_data_identifier !== "F189"
    || transportResult.response_data_identifier !== "F189" || transportResult.payload_byte_count !== 6) return null;
  const parsed = structuredClone(envelope);
  delete parsed.transport_result_candidate;
  parsed.transport_result = transportResult;
  return parsed;
}
export function parseJ2534VerifiedIdentityFixtureOutput(output, context) {
  if (typeof output !== "string" || Buffer.byteLength(output) > 4096 || !keysMatch(context,
    ["architecture", "scenario", "request_nonce", "selected_device_id"])
    || !["x86", "x64"].includes(context.architecture) || !VERIFIED_IDENTITY_SCENARIOS.has(context.scenario)
    || !isSafeToken(context.request_nonce) || !isSafeToken(context.selected_device_id)) return null;
  let envelope;
  try { envelope = JSON.parse(output); } catch { return null; }
  if (!keysMatch(envelope, ["contract_version", "request_nonce", "selected_device_id", "verification_status", "blockers",
    "global_mutex_status", "verified_file_handle_status", "identity_lifecycle_status", "callback_completed",
    "fixture_write_blocked", "fixture_rename_blocked", "fixture_delete_blocked", "module_reference", "versions",
    "vendor_dll_executed", "vehicle_communication", "vehicle_command_enabled"])
    || envelope.contract_version !== "j2534-verified-identity-fixture-v1"
    || envelope.request_nonce !== context.request_nonce || envelope.selected_device_id !== context.selected_device_id
    || envelope.verification_status !== "verified_non_executable" || !Array.isArray(envelope.blockers) || envelope.blockers.length !== 0
    || envelope.global_mutex_status !== "held_for_identity_lifecycle"
    || envelope.verified_file_handle_status !== "held_through_identity_lifecycle"
    || envelope.identity_lifecycle_status !== "completed" || envelope.callback_completed !== true
    || envelope.fixture_write_blocked !== true || envelope.fixture_rename_blocked !== true || envelope.fixture_delete_blocked !== true
    || envelope.module_reference !== "released" || !keysMatch(envelope.versions, ["firmware", "dll", "api"])
    || !Object.values(envelope.versions).every(isVersion) || envelope.versions.firmware !== "fixture-fw"
    || envelope.versions.dll !== "fixture-dll" || envelope.versions.api !== "04.04"
    || envelope.vendor_dll_executed !== false || envelope.vehicle_communication !== false
    || envelope.vehicle_command_enabled !== false) return null;
  return structuredClone(envelope);
}
// Development-only factory. The validator supplies a fixed, integrity-pinned temp descriptor.
export function createJ2534NativeFixtureSupervisor(descriptor, controls = {}) {
  if (controls === null || typeof controls !== "object" || Array.isArray(controls))
    throw new Error("native_fixture_supervisor_controls_invalid");
  const controlKeys = Object.keys(controls);
  if (controlKeys.some(key => !["quarantineStore", "requireTrialConfirmation"].includes(key))
    || (Object.hasOwn(controls, "quarantineStore")
      && (typeof controls.quarantineStore?.read !== "function" || typeof controls.quarantineStore?.mark !== "function"))
    || (Object.hasOwn(controls, "requireTrialConfirmation") && typeof controls.requireTrialConfirmation !== "boolean"))
    throw new Error("native_fixture_supervisor_controls_invalid");
  const quarantineStore = controls.quarantineStore || null;
  const requireTrialConfirmation = controls.requireTrialConfirmation === true;
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
        const expectedKeys = ["mode", "scenario", ...(Object.hasOwn(options, "timeout_ms") ? ["timeout_ms"] : []),
          ...(Object.hasOwn(options, "signal") ? ["signal"] : []),
          ...(Object.hasOwn(options, "interactive_trial_confirmation") ? ["interactive_trial_confirmation"] : [])];
        if (!keysMatch(options, expectedKeys)) throw new Error();
        scenario = options.scenario; timeout = options.timeout_ms ?? 5000; signal = options.signal;
        if (options.mode !== "native_fixture" || !SCENARIOS.has(scenario) || !Number.isInteger(timeout) || timeout < 1000 || timeout > 10000
          || (signal != null && !(signal instanceof AbortSignal))
          || (requireTrialConfirmation ? options.interactive_trial_confirmation !== true
            : Object.hasOwn(options, "interactive_trial_confirmation"))) throw new Error();
      } catch {
        base.errors = [requireTrialConfirmation ? "native_identity_trial_confirmation_required" : "native_fixture_request_invalid"];
        return base;
      }
      if (quarantineStore) {
        let quarantine;
        try { quarantine = quarantineStore.read(); } catch { quarantine = { quarantined: true }; }
        if (quarantine?.quarantined !== false) {
          base.execution_status = "worker_quarantined";
          base.errors = ["native_identity_quarantine_not_clear"];
          return base;
        }
      }
      if (signal?.aborted) { base.execution_status = "worker_cancelled"; base.errors = ["worker_cancelled"]; return base; }
      const supervised = await runWorker({ timeout, signal, context: scenario });
      Object.assign(base, {
        execution_status: supervised.execution_status, worker_started: supervised.worker_started, worker_exited: supervised.worker_exited,
        termination_requested: supervised.termination_requested, termination_signal_sent: supervised.termination_signal_sent,
        result: supervised.parsed_result, errors: supervised.errors
      });
      base.native_fixture_execution_confirmed = base.result !== null;
      if (base.result) base.fixture_cleanup_status = base.result.lifecycle.cleanup_status;
      if (quarantineStore && base.worker_started && !["confirmed", "not_required"].includes(base.fixture_cleanup_status)) {
        const reason = base.result?.lifecycle?.status === "corrupted" ? "worker_corrupted" : "cleanup_unconfirmed";
        try { quarantineStore.mark(reason); } catch { /* A failed latch remains fail-closed on its next read. */ }
      }
      return base;
    }
  });
}
// Development-only supervisor for the generated UDS transport-result fixture.
export function createJ2534UdsTransportFixtureSupervisor(descriptor) {
  if (!keysMatch(descriptor, ["temp_root", "architecture", "worker"])
    || !["x86", "x64"].includes(descriptor.architecture)
    || !keysMatch(descriptor.worker, ["path", "sha256"]) || !isHash(descriptor.worker.sha256))
    throw new Error("uds_transport_fixture_descriptor_invalid");
  const architecture = descriptor.architecture;
  const tempRoot = fs.realpathSync(descriptor.temp_root);
  const systemTemp = fs.realpathSync(os.tmpdir());
  const workerPath = descriptor.worker.path;
  if (path.dirname(tempRoot) !== systemTemp || !path.basename(tempRoot).startsWith("vehicle-j2534-native-")
    || path.basename(workerPath) !== "j2534-uds-transport-fixture-worker.exe"
    || path.dirname(workerPath) !== path.join(tempRoot, architecture))
    throw new Error("uds_transport_fixture_descriptor_invalid");
  const actualPath = fs.realpathSync(workerPath);
  const identity = fs.lstatSync(actualPath);
  if (actualPath !== path.resolve(workerPath) || identity.isSymbolicLink() || !identity.isFile()
    || digest(actualPath) !== descriptor.worker.sha256) throw new Error("uds_transport_fixture_descriptor_invalid");
  const pinnedIdentity = Object.freeze({ dev: identity.dev, ino: identity.ino, size: identity.size });
  const verifyWorker = () => {
    try {
      const stat = fs.lstatSync(workerPath);
      return stat.isFile() && !stat.isSymbolicLink() && stat.dev === pinnedIdentity.dev && stat.ino === pinnedIdentity.ino
        && stat.size === pinnedIdentity.size && digest(workerPath) === descriptor.worker.sha256;
    } catch { return false; }
  };
  const runWorker = createBoundedFixtureWorker({
    outputLimit: 4096,
    rejectStderr: true,
    spawnWorker(scenario) {
      if (!verifyWorker()) throw new Error("uds_transport_fixture_worker_changed");
      const windows = process.env.SystemRoot || process.env.WINDIR || "C:\\Windows";
      const env = { SystemRoot: windows, WINDIR: windows, TEMP: os.tmpdir(), TMP: os.tmpdir() };
      return spawn(workerPath, ["--fixture", scenario], {
        cwd: path.dirname(workerPath), env, shell: false, windowsHide: true, stdio: ["ignore", "pipe", "pipe"]
      });
    },
    parseOutput(output, scenario) { return parseJ2534UdsTransportFixtureOutput(output, scenario, architecture); }
  });
  return Object.freeze({
    async run(options = {}) {
      const base = {
        schema_version: "j2534-uds-transport-fixture-supervision-v1", fixture_only: true,
        native_fixture_execution_confirmed: false, vendor_dll_executed: false,
        vehicle_connection_attempted: false, vehicle_communication_started: false,
        execution_enabled: false, would_transmit: false, vehicle_command_enabled: false,
        architecture, execution_status: "request_blocked", worker_started: false, worker_exited: false,
        termination_requested: false, termination_signal_sent: false,
        fixture_cleanup_status: "unconfirmed", result: null, errors: []
      };
      let scenario, timeout, signal;
      try {
        const expectedKeys = ["mode", "scenario", ...(Object.hasOwn(options, "timeout_ms") ? ["timeout_ms"] : []),
          ...(Object.hasOwn(options, "signal") ? ["signal"] : [])];
        if (!keysMatch(options, expectedKeys)) throw new Error();
        scenario = options.scenario; timeout = options.timeout_ms ?? 5000; signal = options.signal;
        if (options.mode !== "uds_transport_fixture" || !UDS_TRANSPORT_WORKER_SCENARIOS.has(scenario)
          || !Number.isInteger(timeout) || timeout < 1000 || timeout > 10000
          || (signal != null && !(signal instanceof AbortSignal))) throw new Error();
      } catch {
        base.errors = ["uds_transport_fixture_request_invalid"];
        return base;
      }
      if (signal?.aborted) { base.execution_status = "worker_cancelled"; base.errors = ["worker_cancelled"]; return base; }
      const supervised = await runWorker({ timeout, signal, context: scenario });
      Object.assign(base, {
        execution_status: supervised.execution_status, worker_started: supervised.worker_started,
        worker_exited: supervised.worker_exited, termination_requested: supervised.termination_requested,
        termination_signal_sent: supervised.termination_signal_sent, result: supervised.parsed_result,
        errors: supervised.errors
      });
      base.native_fixture_execution_confirmed = base.result !== null;
      if (base.result) base.fixture_cleanup_status = "confirmed";
      return base;
    }
  });
}
// Development-only supervisor for the generated verified-handle/Global-mutex identity fixture.
export function createJ2534VerifiedIdentityFixtureSupervisor(descriptor, controls = {}) {
  if (controls === null || typeof controls !== "object" || Array.isArray(controls))
    throw new Error("verified_identity_supervisor_controls_invalid");
  const controlKeys = Object.keys(controls);
  if (controlKeys.some(key => !["quarantineStore", "requireTrialConfirmation"].includes(key))
    || (Object.hasOwn(controls, "quarantineStore")
      && (typeof controls.quarantineStore?.read !== "function" || typeof controls.quarantineStore?.mark !== "function"))
    || (Object.hasOwn(controls, "requireTrialConfirmation") && typeof controls.requireTrialConfirmation !== "boolean"))
    throw new Error("verified_identity_supervisor_controls_invalid");
  if (!keysMatch(descriptor, ["temp_root", "architecture", "worker", "fixture"])
    || !["x86", "x64"].includes(descriptor.architecture)
    || !keysMatch(descriptor.worker, ["path", "sha256"]) || !isHash(descriptor.worker.sha256)
    || !keysMatch(descriptor.fixture, ["path", "sha256", "size"]) || !isHash(descriptor.fixture.sha256)
    || !Number.isSafeInteger(descriptor.fixture.size) || descriptor.fixture.size < 1)
    throw new Error("verified_identity_descriptor_invalid");
  const architecture = descriptor.architecture;
  const tempRoot = fs.realpathSync(descriptor.temp_root);
  const systemTemp = fs.realpathSync(os.tmpdir());
  if (path.dirname(tempRoot) !== systemTemp || !path.basename(tempRoot).startsWith("vehicle-j2534-native-"))
    throw new Error("verified_identity_descriptor_invalid");
  const expectedDirectory = path.join(tempRoot, architecture);
  const files = Object.freeze({
    worker: Object.freeze({ path: descriptor.worker.path, sha256: descriptor.worker.sha256 }),
    fixture: Object.freeze({ path: descriptor.fixture.path, sha256: descriptor.fixture.sha256, size: descriptor.fixture.size })
  });
  if (path.basename(files.worker.path) !== "j2534-verified-identity-fixture.exe"
    || path.basename(files.fixture.path) !== "success.dll" || path.dirname(files.worker.path) !== expectedDirectory
    || path.dirname(files.fixture.path) !== expectedDirectory) throw new Error("verified_identity_descriptor_invalid");
  const identities = {};
  for (const [name, file] of Object.entries(files)) {
    const actual = fs.realpathSync(file.path); const stat = fs.lstatSync(actual);
    if (actual !== path.resolve(file.path) || stat.isSymbolicLink() || !stat.isFile() || digest(actual) !== file.sha256
      || (name === "fixture" && stat.size !== file.size)) throw new Error("verified_identity_descriptor_invalid");
    identities[name] = { dev: stat.dev, ino: stat.ino, size: stat.size };
  }
  const verifyFiles = () => Object.entries(files).every(([name, file]) => {
    try {
      const stat = fs.lstatSync(file.path); const identity = identities[name];
      return stat.isFile() && !stat.isSymbolicLink() && stat.dev === identity.dev && stat.ino === identity.ino
        && stat.size === identity.size && digest(file.path) === file.sha256;
    } catch { return false; }
  });
  const quarantineStore = controls.quarantineStore || null;
  const requireTrialConfirmation = controls.requireTrialConfirmation === true;
  const runWorker = createBoundedFixtureWorker({
    rejectStderr: true,
    spawnWorker(context) {
      if (!verifyFiles()) throw new Error("verified_identity_descriptor_changed");
      const windows = process.env.SystemRoot || process.env.WINDIR || "C:\\Windows";
      const env = { SystemRoot: windows, WINDIR: windows, TEMP: os.tmpdir(), TMP: os.tmpdir() };
      return spawn(files.worker.path, ["--fixture", context.scenario, files.fixture.sha256, String(files.fixture.size),
        architecture, context.request_nonce, context.selected_device_id],
      { cwd: expectedDirectory, env, shell: false, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    },
    parseOutput(output, context) { return parseJ2534VerifiedIdentityFixtureOutput(output, context); }
  });
  return Object.freeze({
    async run(options = {}) {
      const base = {
        schema_version: "j2534-verified-identity-fixture-supervision-v1", fixture_only: true,
        verified_identity_execution_confirmed: false, vendor_dll_executed: false, vehicle_communication: false,
        vehicle_command_enabled: false, architecture, execution_status: "request_blocked", worker_started: false,
        worker_exited: false, termination_requested: false, termination_signal_sent: false,
        fixture_cleanup_status: "unconfirmed", result: null, errors: []
      };
      let context, timeout, signal;
      try {
        const allowed = ["mode", "scenario", "request_nonce", "selected_device_id", "interactive_trial_confirmation", "timeout_ms", "signal"];
        if (!options || typeof options !== "object" || Array.isArray(options)
          || Object.keys(options).some(key => !allowed.includes(key))) throw new Error();
        context = { architecture, scenario: options.scenario, request_nonce: options.request_nonce, selected_device_id: options.selected_device_id };
        timeout = options.timeout_ms ?? 5000; signal = options.signal;
        if (options.mode !== "verified_identity_fixture" || !VERIFIED_IDENTITY_SCENARIOS.has(context.scenario)
          || !isSafeToken(context.request_nonce) || !isSafeToken(context.selected_device_id)
          || !Number.isInteger(timeout) || timeout < 1000 || timeout > 10000
          || (signal != null && !(signal instanceof AbortSignal))
          || (requireTrialConfirmation ? options.interactive_trial_confirmation !== true
            : Object.hasOwn(options, "interactive_trial_confirmation"))) throw new Error();
      } catch {
        base.errors = [requireTrialConfirmation ? "native_identity_trial_confirmation_required" : "verified_identity_request_invalid"];
        return base;
      }
      if (quarantineStore) {
        let quarantine;
        try { quarantine = quarantineStore.read(); } catch { quarantine = { quarantined: true }; }
        if (quarantine?.quarantined !== false) {
          base.execution_status = "worker_quarantined"; base.errors = ["native_identity_quarantine_not_clear"]; return base;
        }
      }
      if (signal?.aborted) { base.execution_status = "worker_cancelled"; base.errors = ["worker_cancelled"]; return base; }
      const supervised = await runWorker({ timeout, signal, context });
      Object.assign(base, {
        execution_status: supervised.execution_status, worker_started: supervised.worker_started, worker_exited: supervised.worker_exited,
        termination_requested: supervised.termination_requested, termination_signal_sent: supervised.termination_signal_sent,
        result: supervised.parsed_result, errors: supervised.errors
      });
      base.verified_identity_execution_confirmed = base.result !== null;
      if (base.result) base.fixture_cleanup_status = "confirmed";
      if (quarantineStore && base.worker_started && base.fixture_cleanup_status !== "confirmed") {
        try { quarantineStore.mark("cleanup_unconfirmed"); } catch { /* The real store reports a fail-closed state. */ }
      }
      return base;
    }
  });
}
