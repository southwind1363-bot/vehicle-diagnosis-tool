import path from "node:path";

// Private development metadata only. No file access, DLL loading or permission.
// Keep the existing DTC service allowlist separate and unchanged.
function copySelection(value, request) {
  const keys = ["selected_device_id", "path", "sha256", "size", "architecture"];
  if (!value || typeof value !== "object" || Array.isArray(value)
    || Object.keys(value).length !== keys.length || !keys.every(k => Object.hasOwn(value, k))) return null;
  const { selected_device_id, path: file, sha256, size, architecture } = value;
  if (typeof selected_device_id !== "string" || !/^j2534-[0-9a-f]{16}$/.test(selected_device_id)
    || typeof file !== "string" || !/^[A-Za-z]:\\/.test(file) || file.includes("\0")
    || path.win32.normalize(file) !== file
    || typeof sha256 !== "string" || !/^[0-9a-fA-F]{64}$/.test(sha256)
    || !Number.isSafeInteger(size) || size < 1 || !["x86", "x64"].includes(architecture)) return null;
  return Object.freeze({ selected_device_id, path: file, sha256: sha256.toUpperCase(), size, architecture,
    request_ecu: request.request_ecu, service: 1, pid: request.pid });
}

export function createJ2534Mode01SelectionHandoff({ resolveDescriptor, revalidateDescriptor, now, ttlMs = 5000 }) {
  if (![resolveDescriptor, revalidateDescriptor, now].every(fn => typeof fn === "function")
    || !Number.isInteger(ttlMs) || ttlMs < 1 || ttlMs > 60000) throw new Error("mode01_handoff_dependencies_invalid");
  const secrets = new WeakMap();
  return Object.freeze({
    prepare(descriptor, request) {
      try {
        if (!request || typeof request !== "object" || Array.isArray(request)
          || Object.keys(request).length !== 2 || !Object.hasOwn(request, "request_ecu") || !Object.hasOwn(request, "pid")) return null;
        const intent = Object.freeze({ request_ecu: request.request_ecu, pid: request.pid });
        if (!Number.isInteger(intent.request_ecu) || intent.request_ecu < 0x7e0 || intent.request_ecu > 0x7e7
          || ![5, 12].includes(intent.pid)) return null;
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
        secrets.delete(ticket); // Every attempt consumes, including failed revalidation.
        const startedAt = now();
        if (!Number.isFinite(startedAt) || startedAt < record.issuedAt || startedAt >= record.deadline) return null;
        const current = copySelection(revalidateDescriptor(record.descriptor), record.selection);
        if (!current || !Object.keys(record.selection).every(k => current[k] === record.selection[k])) return null;
        const finishedAt = now();
        if (!Number.isFinite(finishedAt) || finishedAt < startedAt || finishedAt >= record.deadline) return null;
        // Private parent only: never export this path/hash to UI or saved sessions.
        return record.selection;
      } catch { return null; }
    }
  });
}
