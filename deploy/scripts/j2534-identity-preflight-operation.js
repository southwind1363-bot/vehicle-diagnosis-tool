const isPlainObject = (value) => {
  try {
    return value !== null && typeof value === "object"
      && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
  } catch {
    return false;
  }
};

const readIssueOptions = (options) => {
  try {
    if (!isPlainObject(options) || Object.keys(options).length !== 1) return null;
    const selectedDeviceId = options.selected_device_id;
    return typeof selectedDeviceId === "string" && /^j2534-[0-9a-f]{16}$/.test(selectedDeviceId)
      ? { selectedDeviceId }
      : null;
  } catch {
    return null;
  }
};

const readRunOptions = (options) => {
  try {
    if (!isPlainObject(options) || Object.keys(options).some((key) => key !== "signal")) return null;
    const signal = options.signal;
    return signal == null || signal instanceof AbortSignal ? { signal } : null;
  } catch {
    return null;
  }
};

const readBlockers = (result) => {
  try {
    return Array.isArray(result?.blockers) ? result.blockers : [];
  } catch {
    return [];
  }
};

export function createJ2534IdentityPreflightOperationController(dependencies = {}) {
  const issueRecord = dependencies.issueRecord;
  const revalidateRecord = dependencies.revalidateRecord;
  const runPreflight = dependencies.runPreflight;
  const validatePreflight = dependencies.validatePreflight;
  const buildSnapshot = dependencies.buildSnapshot;
  const now = dependencies.now;
  const createNonce = dependencies.createNonce;
  const ttlMs = dependencies.ttlMs;
  const minimumRunWindowMs = dependencies.minimumRunWindowMs;
  if (![issueRecord, revalidateRecord, runPreflight, validatePreflight, buildSnapshot, now, createNonce].every((item) => typeof item === "function")
    || !Number.isInteger(ttlMs) || ttlMs < 1000 || ttlMs > 60000
    || !Number.isInteger(minimumRunWindowMs) || minimumRunWindowMs < 0 || minimumRunWindowMs >= ttlMs)
    throw new Error("j2534_identity_operation_dependencies_invalid");

  const operationSecrets = new WeakMap();
  const consumedOperations = new WeakSet();
  let issuedOperation = null;
  let activeOperation = null;
  let poisoned = false;

  const rejected = (blocker, selectedDeviceId = null) => buildSnapshot({ selectedDeviceId }, {
    operationStatus: "rejected", blockers: [blocker], preflightVerified: false
  });

  function issue(options = {}) {
    const parsedOptions = readIssueOptions(options);
    if (!parsedOptions) {
      return Object.freeze({ status: "rejected", operation: null, readiness: rejected("selected_device_not_confirmed") });
    }
    const selectedDeviceId = parsedOptions.selectedDeviceId;
    if (poisoned) return Object.freeze({ status: "rejected", operation: null, readiness: rejected("identity_preflight_process_poisoned", selectedDeviceId) });
    if (issuedOperation !== null) {
      const existing = operationSecrets.get(issuedOperation);
      const currentTime = now();
      if (existing && Number.isFinite(currentTime) && currentTime >= existing.deadline) {
        consumedOperations.add(issuedOperation);
        operationSecrets.delete(issuedOperation);
        issuedOperation = null;
      }
    }
    if (issuedOperation !== null || activeOperation !== null)
      return Object.freeze({ status: "rejected", operation: null, readiness: rejected("identity_preflight_operation_busy", selectedDeviceId) });
    let record;
    try { record = issueRecord(selectedDeviceId); }
    catch { record = null; }
    if (!isPlainObject(record) || record.accepted !== true || record.selectedDeviceId !== selectedDeviceId) {
      let blocker = "live_registry_descriptor_not_verified";
      try { if (typeof record?.blocker === "string") blocker = record.blocker; } catch {}
      return Object.freeze({ status: "rejected", operation: null, readiness: rejected(blocker, selectedDeviceId) });
    }
    const issuedAt = now();
    const nonce = createNonce();
    if (!Number.isFinite(issuedAt) || typeof nonce !== "string" || !/^[a-f0-9]{32}$/.test(nonce))
      return Object.freeze({ status: "rejected", operation: null, readiness: rejected("identity_preflight_operation_issue_failed", selectedDeviceId) });
    const operation = Object.freeze({});
    operationSecrets.set(operation, {
      state: "ISSUED", selectedDeviceId, descriptor: record.descriptor,
      devices: record.devices, packageIntegrityVerified: record.packageIntegrityVerified === true,
      nonce, issuedAt, deadline: issuedAt + ttlMs
    });
    issuedOperation = operation;
    return Object.freeze({ status: "issued", operation, readiness: null });
  }

  async function run(operation, options = {}) {
    const parsedOptions = readRunOptions(options);
    if (!parsedOptions) return rejected("identity_preflight_operation_options_invalid");
    const signal = parsedOptions.signal;
    if (!operation || typeof operation !== "object") return rejected("identity_preflight_operation_not_issued");
    let record;
    try { record = operationSecrets.get(operation); }
    catch { return rejected("identity_preflight_operation_not_issued"); }
    if (!record || operation !== issuedOperation || consumedOperations.has(operation)) return rejected("identity_preflight_operation_not_issued");

    // Consume before any asynchronous work so a parallel caller cannot enter.
    consumedOperations.add(operation);
    operationSecrets.delete(operation);
    issuedOperation = null;
    record.state = "RUNNING";
    if (poisoned) return rejected("identity_preflight_process_poisoned", record.selectedDeviceId);
    const startedAt = now();
    if (!Number.isFinite(startedAt) || startedAt < record.issuedAt || startedAt > record.deadline) {
      record.state = "EXPIRED";
      return rejected("identity_preflight_operation_expired", record.selectedDeviceId);
    }
    if (activeOperation !== null) {
      record.state = "REJECTED";
      return rejected("identity_preflight_operation_busy", record.selectedDeviceId);
    }
    activeOperation = operation;
    try {
      if (signal?.aborted) {
        record.state = "CANCELLED";
        return rejected("identity_preflight_operation_cancelled", record.selectedDeviceId);
      }
      let current;
      try { current = revalidateRecord(record); }
      catch { current = null; }
      if (!isPlainObject(current) || current.accepted !== true || current.selectedDeviceId !== record.selectedDeviceId) {
        record.state = "REJECTED";
        return rejected(typeof current?.blocker === "string" ? current.blocker : "selected_driver_not_registered", record.selectedDeviceId);
      }
      record.devices = current.devices;
      record.packageIntegrityVerified = record.packageIntegrityVerified === true
        && current.packageIntegrityVerified === true;
      if (!record.packageIntegrityVerified) {
        record.state = "REJECTED";
        return rejected("package_integrity_not_verified", record.selectedDeviceId);
      }
      const preflightAt = now();
      if (!Number.isFinite(preflightAt) || preflightAt < startedAt || record.deadline - preflightAt < minimumRunWindowMs) {
        record.state = "EXPIRED";
        return rejected("identity_preflight_operation_expired", record.selectedDeviceId);
      }
      let completion;
      try { completion = await runPreflight(record.descriptor, { signal, operationNonce: record.nonce }); }
      catch { completion = null; }
      let result = null;
      try {
        if (isPlainObject(completion) && completion.operationNonce === record.nonce) result = completion.result;
      } catch {}
      const resultBlockers = readBlockers(result);
      if (resultBlockers.includes("native_preflight_termination_unconfirmed")) {
        poisoned = true;
        record.state = "POISONED";
        return rejected("identity_preflight_process_poisoned", record.selectedDeviceId);
      }
      if (signal?.aborted || resultBlockers.includes("native_preflight_cancelled")) {
        record.state = "CANCELLED";
        return rejected("identity_preflight_operation_cancelled", record.selectedDeviceId);
      }
      let preflightValid = false;
      try { preflightValid = validatePreflight(record, result) === true; } catch {}
      if (!preflightValid) {
        record.state = "REJECTED";
        return rejected("native_preflight_not_verified_in_operation", record.selectedDeviceId);
      }
      record.state = "VERIFIED_NON_EXECUTABLE";
      return buildSnapshot(record, { operationStatus: "verified_non_executable", blockers: [], preflightVerified: true,
        packageIntegrityVerified: record.packageIntegrityVerified === true,
        authenticodeVerified: result?.authenticode_status === "verified_file_policy" });
    } finally {
      record.descriptor = null;
      record.devices = null;
      record.packageIntegrityVerified = false;
      record.nonce = null;
      activeOperation = null;
    }
  }

  return Object.freeze({ issue, run });
}
