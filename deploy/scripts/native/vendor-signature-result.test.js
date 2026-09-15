import test from "node:test";
import assert from "node:assert/strict";
import { validateVendorSignatureResult as validate } from "./vendor-signature-result.js";

const hash = "A".repeat(64);
const report = { observation_status: "observed_only", signature_status: "Valid",
  signature_type: "Authenticode", signer_certificate_sha256: "b".repeat(64),
  file_sha256: hash, publisher_verified: false, dependency_closure_verified: false, execution_enabled: false };
const inspect = changes => validate(JSON.stringify({ ...report, ...changes }), hash);
const noAuthority = value => {
  assert.equal(value.publisher_verified, false);
  assert.equal(value.dependency_closure_verified, false);
  assert.equal(value.execution_enabled, false);
  assert.ok(Object.isFrozen(value));
};

test("valid reports retain type and certificate hash without granting trust", () => {
  for (const signature_type of ["Authenticode", "Catalog"]) {
    const value = inspect({ signature_type, file_sha256: hash.toLowerCase() });
    assert.equal(value.observation_accepted, true);
    assert.equal(value.signature_status, "Valid");
    assert.equal(value.signature_type, signature_type);
    assert.equal(value.signer_certificate_sha256, "B".repeat(64));
    noAuthority(value);
  }
});
test("negative signature statuses remain negative, not successful verification", () => {
  for (const signature_status of ["UnknownError", "NotSigned", "HashMismatch", "NotTrusted", "NotSupportedFileFormat", "Incompatible"]) {
    const value = inspect({ signature_status, signature_type: "None", signer_certificate_sha256: null });
    assert.equal(value.observation_accepted, true);
    assert.equal(value.signature_status, signature_status);
    noAuthority(value);
  }
});
test("wrong files, missing evidence and asserted permissions are rejected", () => {
  for (const change of [{ file_sha256: "C".repeat(64) }, { file_sha256: null },
    { signature_status: "valid" }, { signature_type: "Other" },
    { signer_certificate_sha256: "B".repeat(40) }, { signer_certificate_sha256: null },
    { signature_type: "None" }, { observation_status: "unverified" },
    { publisher_verified: true }, { dependency_closure_verified: true }, { execution_enabled: true },
    { signature_status: "NotSigned" }, { secret_path: "do-not-return" }]) {
    const value = inspect(change);
    assert.equal(value.observation_accepted, false);
    assert.equal(Object.hasOwn(value, "signer_certificate_sha256"), false);
    assert.ok(!JSON.stringify(value).includes("do-not-return"));
    noAuthority(value);
  }
  const missing = { ...report }; delete missing.execution_enabled;
  assert.equal(validate(JSON.stringify(missing), hash).observation_accepted, false);
});
test("bounded malformed inputs never produce partial observations", () => {
  for (const text of [null, {}, "{", "null", "[]", " ".repeat(4097)]) {
    const value = validate(text, hash);
    assert.equal(value.observation_accepted, false); noAuthority(value);
  }
  assert.equal(validate(JSON.stringify(report), "bad").observation_accepted, false);
});
