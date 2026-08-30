import fs from "node:fs";
import path from "node:path";

const FILE_NAME = "j2534-native-quarantine-v1.json";
const SCHEMA_VERSION = "j2534-native-quarantine-v1";
const REASONS = new Set(["termination_unconfirmed", "cleanup_unconfirmed", "worker_corrupted"]);
const exactKeys = (value, keys) => value && typeof value === "object" && !Array.isArray(value)
  && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));

function readState(file) {
  try {
    const stat = fs.lstatSync(file);
    if (stat.isSymbolicLink() || !stat.isFile() || stat.size < 1 || stat.size > 512)
      return { quarantined: true, reason: "state_invalid" };
    const value = JSON.parse(fs.readFileSync(file, "utf8"));
    if (!exactKeys(value, ["schema_version", "state", "reason"])
      || value.schema_version !== SCHEMA_VERSION || value.state !== "manual_review_required"
      || !REASONS.has(value.reason)) return { quarantined: true, reason: "state_invalid" };
    return { quarantined: true, reason: value.reason };
  } catch (error) {
    return error?.code === "ENOENT" ? { quarantined: false, reason: null }
      : { quarantined: true, reason: "state_invalid" };
  }
}

export function createJ2534NativeQuarantineStore(directory) {
  const requested = path.resolve(directory);
  const requestedStat = fs.lstatSync(requested);
  const root = fs.realpathSync(requested);
  if (requestedStat.isSymbolicLink() || !requestedStat.isDirectory() || root.startsWith("\\\\"))
    throw new Error("j2534_quarantine_directory_invalid");
  const file = path.join(root, FILE_NAME);
  return Object.freeze({
    read() { return Object.freeze(readState(file)); },
    mark(reason) {
      if (!REASONS.has(reason)) throw new Error("j2534_quarantine_reason_invalid");
      const current = readState(file);
      if (current.quarantined) return Object.freeze(current);
      const bytes = Buffer.from(`${JSON.stringify({
        schema_version: SCHEMA_VERSION, state: "manual_review_required", reason
      })}\n`, "utf8");
      let descriptor;
      try {
        descriptor = fs.openSync(file, "wx", 0o600);
        fs.writeFileSync(descriptor, bytes);
        fs.fsyncSync(descriptor);
      } catch (error) {
        if (error?.code !== "EEXIST") return Object.freeze({ quarantined: true, reason: "state_invalid" });
      } finally {
        if (descriptor !== undefined) fs.closeSync(descriptor);
      }
      const stored = readState(file);
      return Object.freeze(stored.quarantined ? stored : { quarantined: true, reason: "state_invalid" });
    }
  });
}
