// Development-only validation of a reported observation, NOT cryptographic
// verification. Never accept imported/session JSON as execution authorization.
const keys = ["observation_status", "signature_status", "signature_type",
  "signer_certificate_sha256", "file_sha256", "publisher_verified",
  "dependency_closure_verified", "execution_enabled"];
const statuses = new Set(["Valid", "UnknownError", "NotSigned", "HashMismatch",
  "NotTrusted", "NotSupportedFileFormat", "Incompatible"]);
const digest = value => typeof value === "string" && /^[A-Fa-f0-9]{64}$/.test(value);
const result = (reason, details = {}) => Object.freeze({ reason,
  observation_accepted: false, publisher_verified: false,
  dependency_closure_verified: false, execution_enabled: false, ...details });

export function validateVendorSignatureResult(text, expectedFileSha256) {
  try {
    if (!digest(expectedFileSha256) || typeof text !== "string" || text.length > 4096) return result("invalid_input");
    const value = JSON.parse(text);
    if (!value || typeof value !== "object" || Array.isArray(value)
      || Object.keys(value).length !== keys.length || !keys.every(key => Object.hasOwn(value, key))
      || value.publisher_verified !== false || value.dependency_closure_verified !== false
      || value.execution_enabled !== false) return result("invalid_observation");
    if (value.observation_status !== "observed_only") return result("observation_unavailable");
    if (!statuses.has(value.signature_status) || !["None", "Authenticode", "Catalog"].includes(value.signature_type)
      || !digest(value.file_sha256)
      || (value.signer_certificate_sha256 !== null && !digest(value.signer_certificate_sha256))) return result("invalid_observation");
    if (value.file_sha256.toUpperCase() !== expectedFileSha256.toUpperCase()) return result("file_mismatch");
    if (value.signature_status === "Valid" && (value.signature_type === "None" || value.signer_certificate_sha256 === null)) return result("invalid_observation");
    // Unsigned reports must not smuggle an unrelated signer into later review.
    if (value.signature_status === "NotSigned" && (value.signature_type !== "None" || value.signer_certificate_sha256 !== null)) return result("invalid_observation");
    return result("observation_only", { observation_accepted: true,
      signature_status: value.signature_status, signature_type: value.signature_type,
      signer_certificate_sha256: value.signer_certificate_sha256?.toUpperCase() ?? null });
  } catch { return result("invalid_input"); }
}
