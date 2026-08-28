// Internal lifecycle only. No DLL loader, production transport, or vehicle channel.
const activeTransports = new WeakSet();
const isStatus = (value) => Number.isInteger(value) && value >= -0x80000000 && value <= 0x7fffffff;
const isDeviceId = (value) => Number.isInteger(value) && value >= 0 && value <= 0xffffffff;

function readVersionBuffer(value) {
  if (!(value instanceof Uint8Array) || value.length !== 80) return null;
  const end = value.indexOf(0);
  if (end <= 0) return null;
  const bytes = value.subarray(0, end);
  if (bytes.some((byte) => byte < 0x20 || byte > 0x7e)) return null;
  return String.fromCharCode(...bytes).trim() || null;
}

export async function runJ2534IdentityLifecycle(transport, options = {}) {
  const step = () => ({ attempted: false, status_code: null });
  const result = {
    schema_version: "j2534-identity-lifecycle-v1",
    status: "blocked",
    errors: [],
    steps: { open: step(), read_version: step(), close: step() },
    cleanup_status: "not_required",
    versions: null
  };
  const fail = (status, code) => { result.status = status; result.errors.push(code); };
  const signal = options?.signal;
  if (signal != null && !(signal instanceof AbortSignal)) {
    fail("blocked", "invalid_abort_signal");
    return result;
  }
  let methods;
  try {
    if (!transport || typeof transport !== "object") throw new Error();
    methods = [transport.open, transport.readVersion, transport.close];
    if (!methods.every((method) => typeof method === "function")) throw new Error();
  } catch {
    fail("blocked", "identity_transport_incomplete");
    return result;
  }
  if (activeTransports.has(transport)) {
    fail("busy", "identity_transport_busy");
    return result;
  }
  if (signal?.aborted) {
    fail("cancelled", "identity_probe_cancelled");
    return result;
  }
  activeTransports.add(transport);
  let ownedDeviceId = null;
  try {
    result.steps.open.attempted = true;
    result.cleanup_status = "unconfirmed";
    let opened;
    try {
      opened = await methods[0].call(transport, null);
      const status = opened?.status;
      if (!isStatus(status)) fail("open_failed", "open_response_invalid");
      else {
        result.steps.open.status_code = status;
        if (status !== 0) {
          result.cleanup_status = "not_required";
          fail("open_failed", "open_status_failed");
        } else {
          const deviceId = opened.device_id;
          if (!isDeviceId(deviceId)) fail("open_failed", "open_device_id_invalid");
          else ownedDeviceId = deviceId;
        }
      }
    } catch { fail("open_failed", "open_threw"); }
    if (ownedDeviceId === null) return result;
    if (signal?.aborted) {
      fail("cancelled", "identity_probe_cancelled");
      return result;
    }
    result.steps.read_version.attempted = true;
    try {
      const readout = await methods[1].call(transport, ownedDeviceId);
      const status = readout?.status;
      if (!isStatus(status)) fail("read_failed", "read_version_response_invalid");
      else {
        result.steps.read_version.status_code = status;
        if (status !== 0) fail("read_failed", "read_version_status_failed");
        else {
          result.versions = {
            firmware: readVersionBuffer(readout.firmware),
            dll: readVersionBuffer(readout.dll),
            api: readVersionBuffer(readout.api)
          };
          if (Object.values(result.versions).some((value) => value === null)) fail("read_failed", "version_buffer_invalid");
          else result.status = "completed";
        }
      }
    } catch { fail("read_failed", "read_version_threw"); }
    if (signal?.aborted) {
      result.errors.push("identity_probe_cancelled");
      if (result.status === "completed") result.status = "cancelled";
    }
    return result;
  } finally {
    try {
      // Await the active call before cleanup; cancellation cannot prove a native call stopped.
      if (ownedDeviceId !== null) {
        result.steps.close.attempted = true;
        try {
          const closed = await methods[2].call(transport, ownedDeviceId);
          const status = closed?.status;
          if (!isStatus(status)) result.errors.push("close_response_invalid");
          else {
            result.steps.close.status_code = status;
            if (status === 0) result.cleanup_status = "confirmed";
            else result.errors.push("close_status_failed");
          }
        } catch { result.errors.push("close_threw"); }
        if (result.cleanup_status !== "confirmed" && result.status === "completed") result.status = "cleanup_failed";
        if (signal?.aborted && !result.errors.includes("identity_probe_cancelled")) {
          result.errors.push("identity_probe_cancelled");
          if (result.status === "completed") result.status = "cancelled";
        }
      }
    } finally { activeTransports.delete(transport); }
  }
}
