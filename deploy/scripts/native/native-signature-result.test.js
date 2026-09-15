import test from "node:test";
import assert from "node:assert/strict";
import { convertNativeSignatureResult as convert } from "./native-signature-result.js";
const digest = "A".repeat(64);
const observation = { observation_status: "observed_only", wintrust_status: "0x800B0100",
  file_sha256: digest, signer_certificate_sha256: null, scope: "embedded_file", cache_only: true,
  publisher_verified: false, dependency_closure_verified: false, execution_enabled: false };
const completed = (changes = {}) => ({ status: 0, signal: null, stderr: "", stdout: JSON.stringify({ ...observation, ...changes }) });
const rejected = value => {
  assert.equal(value.signature_report, null);
  assert.equal(value.publisher_verified, false);
  assert.equal(value.execution_enabled, false);
  assert.ok(Object.isFrozen(value));
};
test("completed reports preserve unsigned and synthetic valid distinction without authority", () => {
  for (const [changes, expected] of [[{}, "NotSigned"], [{ wintrust_status: "0x00000000", signer_certificate_sha256: "B".repeat(64) }, "Valid"]]) {
    const value = convert(completed(changes), digest);
    assert.equal(JSON.parse(value.signature_report).signature_status, expected);
    assert.equal(value.publisher_verified, false); assert.equal(value.execution_enabled, false);
    assert.ok(Object.isFrozen(value));
  }
});
test("failure, timeout, signal and incomplete parent results cannot supply observations", () => {
  for (const changes of [{ status: 1 }, { status: null }, { status: "0" },
    { signal: "SIGTERM" }, { signal: undefined }, { error: { code: "ETIMEDOUT" } },
    { stderr: "secret-error" }, { stdout: "x".repeat(4097) }, { stdout: "{" }]) {
    rejected(convert({ ...completed(), ...changes }, digest));
  }
  rejected(convert(null, digest));
});
test("unknown scopes, missing signer, mismatched hashes and permission assertions reject", () => {
  for (const changes of [{ wintrust_status: "0x800B0109" }, { wintrust_status: 0 },
    { wintrust_status: "0x00000000" }, { signer_certificate_sha256: "B".repeat(64) },
    { scope: "catalog" }, { cache_only: false }, { execution_enabled: true },
    { publisher_verified: true }, { dependency_closure_verified: true },
    { file_sha256: "C".repeat(64) }, { unknown_path: "secret" }]) {
    rejected(convert(completed(changes), digest));
  }
  rejected(convert(completed(), "bad"));
});
