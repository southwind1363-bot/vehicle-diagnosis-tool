import { validateVendorSignatureResult } from "./vendor-signature-result.js";

const keys = ["observation_status", "wintrust_status", "file_sha256", "signer_certificate_sha256",
  "scope", "cache_only", "publisher_verified", "dependency_closure_verified", "execution_enabled"];
const reject = reason => Object.freeze({ reason, signature_report: null,
  publisher_verified: false, dependency_closure_verified: false, execution_enabled: false });

// Trusted bounded parent's in-memory result, not an authenticated wire format.
export function convertSupervisedSignatureResult(completion, expectedFileSha256) {
  try {
    if (!completion || completion.execution_status !== "worker_completed"
      || completion.worker_started !== true || completion.worker_exited !== true
      || completion.termination_requested !== false || completion.termination_signal_sent !== false
      || !Array.isArray(completion.errors) || completion.errors.length !== 0) return reject("worker_incomplete");
    const parsed = completion.parsed_result;
    if (!parsed || parsed.reason !== "observation_only" || parsed.execution_enabled !== false
      || parsed.publisher_verified !== false || parsed.dependency_closure_verified !== false)
      return reject("invalid_output");
    const report = parsed.signature_report;
    const checked = validateVendorSignatureResult(report, expectedFileSha256);
    if (!checked.observation_accepted) return reject(checked.reason);
    if (!((checked.signature_status === "Valid" && checked.signature_type === "Authenticode")
      || (checked.signature_status === "NotSigned" && checked.signature_type === "None"))) return reject("invalid_output");
    return Object.freeze({ ...reject("observation_only"), signature_report: report });
  } catch { return reject("invalid_output"); }
}

// Private adapter for a trusted parent's completed spawnSync result. This is not
// a process supervisor, worker authenticator, public JSON import or execution gate.
export function convertNativeSignatureResult(completion, expectedFileSha256) {
  try {
    if (!completion || completion.status !== 0 || completion.signal !== null
      || completion.error != null || completion.stderr !== "") return reject("worker_incomplete");
    if (typeof completion.stdout !== "string" || completion.stdout.length > 4096) return reject("invalid_output");
    const value = JSON.parse(completion.stdout);
    if (!value || typeof value !== "object" || Array.isArray(value)
      || Object.keys(value).length !== keys.length || !keys.every(key => Object.hasOwn(value, key))
      || value.observation_status !== "observed_only" || value.scope !== "embedded_file"
      || value.cache_only !== true || value.publisher_verified !== false
      || value.dependency_closure_verified !== false || value.execution_enabled !== false) return reject("invalid_output");
    // Only the two meanings currently covered by the observation path are mapped.
    // Unknown WinTrust failures must not be flattened into NotSigned or Valid.
    const signatureStatus = value.wintrust_status === "0x00000000" ? "Valid"
      : value.wintrust_status === "0x800B0100" ? "NotSigned" : null;
    if (!signatureStatus) return reject("unmapped_wintrust_status");
    const report = JSON.stringify({ observation_status: "observed_only",
      signature_status: signatureStatus, signature_type: signatureStatus === "Valid" ? "Authenticode" : "None",
      signer_certificate_sha256: value.signer_certificate_sha256, file_sha256: value.file_sha256,
      publisher_verified: false, dependency_closure_verified: false, execution_enabled: false });
    const checked = validateVendorSignatureResult(report, expectedFileSha256);
    if (!checked.observation_accepted) return reject(checked.reason);
    return Object.freeze({ ...reject("observation_only"), signature_report: report });
  } catch { return reject("invalid_output"); }
}
