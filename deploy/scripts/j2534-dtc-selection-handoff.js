import path from "node:path";

// Development-only private metadata handoff. Dependencies must resolve opaque
// registered-driver descriptors from their own trusted store, not UI snapshots.
// This module grants no execution authority and performs no DLL or vehicle I/O.
function copySelection(value, request) {
  if (!value || typeof value !== "object" || Array.isArray(value)
    || Object.keys(value).length !== 5
    || !["selected_device_id", "path", "sha256", "size", "architecture"].every(key => Object.hasOwn(value, key))) return null;
  const { selected_device_id, path: file, sha256, size, architecture } = value;
  if (typeof selected_device_id !== "string" || !/^j2534-[0-9a-f]{16}$/.test(selected_device_id)
    || typeof file !== "string" || !/^[A-Za-z]:\\/.test(file) || file.includes("\0")
    || path.win32.normalize(file) !== file
    || typeof sha256 !== "string" || !/^[0-9a-fA-F]{64}$/.test(sha256)
    || !Number.isSafeInteger(size) || size < 1 || !["x86", "x64"].includes(architecture)) return null;
  return Object.freeze({ selected_device_id, path: file, sha256: sha256.toUpperCase(), size, architecture,
    request_ecu: request.request_ecu, service: request.service });
}

export function createJ2534DtcSelectionHandoff({ resolveDescriptor, revalidateDescriptor, now, ttlMs = 5000 }) {
  if (![resolveDescriptor, revalidateDescriptor, now].every(fn => typeof fn === "function")
    || !Number.isInteger(ttlMs) || ttlMs < 1 || ttlMs > 60000) throw new Error("dtc_handoff_dependencies_invalid");
  const secrets = new WeakMap();
  return Object.freeze({
    prepare(descriptor, request) {
      try {
        if (!request || typeof request !== "object" || Array.isArray(request)
          || Object.keys(request).length !== 2 || !Object.hasOwn(request, "request_ecu") || !Object.hasOwn(request, "service")) return null;
        const intent = Object.freeze({ request_ecu: request.request_ecu, service: request.service });
        if (!Number.isInteger(intent.request_ecu) || intent.request_ecu < 0x7e0 || intent.request_ecu > 0x7e7
          || ![3, 7, 10].includes(intent.service)) return null;
        const issuedAt = now();
        if (!Number.isFinite(issuedAt)) return null;
        const selection = copySelection(resolveDescriptor(descriptor), intent);
        if (!selection) return null;
        const ticket = Object.freeze({});
        secrets.set(ticket, { descriptor, selection, issuedAt, deadline: issuedAt + ttlMs });
        return ticket;
      } catch { return null; }
    },
    consume(ticket) {
      try {
        const record = ticket && typeof ticket === "object" ? secrets.get(ticket) : null;
        if (!record) return null;
        secrets.delete(ticket); // Consumed even on expiry, revalidation failure or exception.
        const startedAt = now();
        if (!Number.isFinite(startedAt) || startedAt < record.issuedAt || startedAt >= record.deadline) return null;
        const current = copySelection(revalidateDescriptor(record.descriptor), record.selection);
        if (!current || !Object.keys(record.selection).every(key => current[key] === record.selection[key])) return null;
        const finishedAt = now();
        if (!Number.isFinite(finishedAt) || finishedAt < startedAt || finishedAt >= record.deadline) return null;
        // Private caller only. Do not put this object in UI, logs or saved sessions.
        return record.selection;
      } catch { return null; }
    }
  });
}
