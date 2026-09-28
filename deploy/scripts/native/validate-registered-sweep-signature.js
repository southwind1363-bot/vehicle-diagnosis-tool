import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { createJ2534SweepSelectionHandoff } from "../j2534-sweep-selection-handoff.js";
import { createSweepSignatureFixtureSource } from "./sweep-signature-fixture-review.js";
import { createSweepSelectionReviewFromHandoff } from "./sweep-selection-review.js";
import { createSweepSignatureReviewOperation } from "./sweep-signature-review-operation.js";

function extract(source, name) {
  const match = source.match(new RegExp(`(?:export )?function ${name}\\([^]*?\\n\\}`));
  assert.ok(match, `Missing ${name}`);
  return match[0].replace(/^export /, "");
}

// Test harness only. Real resolver/factory source and real generated probe;
// the registry issuer and secret store are artificial. No vendor registration.
export async function validateRegisteredSweepSignature(signatureDescriptor) {
  const bridge = fs.readFileSync(new URL("../../local-bridge-readonly.js", import.meta.url), "utf8");
  const parent = fs.readFileSync(new URL("./registered-sweep-signature-fixture-review.js", import.meta.url), "utf8");
  const source = [extract(bridge, "resolveJ2534RegisteredDtcSelection"),
    extract(bridge, "createJ2534RegisteredSweepSelectionHandoff"),
    extract(parent, "createRegisteredSweepSignatureFixtureReview")].join("\n");
  const fixture = createSweepSignatureFixtureSource(signatureDescriptor);
  for (const scenario of ["matched", "wrong_path", "wrong_hash", "wrong_architecture", "unissued",
    "expired_after_probe", "changed_after_probe", "permission_after_probe"]) {
    const secrets = new WeakMap(), descriptor = Object.freeze({});
    const original = { descriptorSource: "live_windows_registry", selectedDeviceId: "j2534-0123456789abcdef",
      libraryPath: fixture.selection.path, fingerprint: { device: 1, inode: 2, size: fixture.selection.size,
        mtime_ns: 3, ctime_ns: 4, sha256: fixture.selection.sha256 } };
    const current = { ...original, fingerprint: { ...original.fingerprint } };
    const metadata = { exact_readonly_api_ready: true, execution_enabled: false,
      sha256: fixture.selection.sha256, file_size: fixture.selection.size, driver_architecture: signatureDescriptor.architecture };
    if (scenario === "wrong_path") original.libraryPath = current.libraryPath = `${fixture.selection.path}.other`;
    if (scenario === "wrong_hash") metadata.sha256 = "B".repeat(64);
    if (scenario === "wrong_architecture") metadata.driver_architecture = signatureDescriptor.architecture === "x86" ? "x64" : "x86";
    secrets.set(descriptor, original);
    let starts = 0, offset = 0;
    const context = vm.createContext({ j2534RegisteredDriverDescriptorSecrets: secrets,
      createJ2534SweepSelectionHandoff, createSweepSelectionReviewFromHandoff, createSweepSignatureReviewOperation,
      performance: { now: () => performance.now() + offset },
      createJ2534RegisteredDriverDescriptor(options) {
        assert.equal(options.selectedDeviceId, original.selectedDeviceId);
        const issued = { ...metadata }; secrets.set(issued, current); return issued;
      },
      createSweepSignatureFixtureSource(pin) {
        const owned = createSweepSignatureFixtureSource(pin);
        return Object.freeze({ ...owned, async observe() {
          starts++;
          const completion = await owned.observe(); // Actual generated native probe.
          assert.equal(completion.execution_status, "worker_completed");
          assert.equal(completion.worker_exited, true);
          if (scenario === "expired_after_probe") offset = 5000;
          if (scenario === "changed_after_probe") current.fingerprint.sha256 = "C".repeat(64);
          if (scenario === "permission_after_probe") metadata.execution_enabled = true;
          return completion;
        } });
      }
    });
    vm.runInContext(source, context);
    const run = context.createRegisteredSweepSignatureFixtureReview({ signatureDescriptor,
      descriptor: scenario === "unissued" ? {} : descriptor,
      observe() { assert.fail("Injected observer"); }, handoff: { prepare() { assert.fail("Injected handoff"); } } });
    const result = await run();
    for (const flag of ["execution_enabled", "publisher_verified", "dependency_closure_verified"])
      assert.equal(result[flag], false);
    for (const secret of [signatureDescriptor.root, fixture.selection.path, original.selectedDeviceId])
      assert.ok(!JSON.stringify(result).includes(secret));
    if (scenario === "matched") {
      assert.equal(result.selection_bound, true);
      assert.equal(result.entry_signature.signature_status, "NotSigned");
      assert.equal(result.signature_completion_reason, "observation_only");
      assert.equal(result.reason, "catalog_empty");
    } else {
      assert.equal(Object.hasOwn(result, "entry_signature"), false);
      assert.equal(Object.hasOwn(result, "selection_bound"), false);
      assert.equal(result.reason, scenario.endsWith("after_probe")
        ? "sweep_review_selection_unavailable" : "sweep_signature_selection_unavailable");
    }
    assert.equal((await run()).reason, "sweep_signature_already_attempted");
    assert.equal(starts, scenario === "matched" || scenario.endsWith("after_probe") ? 1 : 0);
  }
  console.log(`${signatureDescriptor.architecture} registered sweep signature: 8 scenarios with artificial registry and real generated probe passed`);
}
