import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import os from "node:os";
import path from "node:path";
import { createDtcSelectedPackageReview } from "./native/dtc-selected-package-review.js";
import { createJ2534DtcSelectionHandoff } from "./j2534-dtc-selection-handoff.js";
import { createJ2534Mode01SelectionHandoff } from "./j2534-mode01-selection-handoff.js";
import { createRegisteredMode01PackageReview } from "./native/mode01-selected-package-review.js";
import { createRegisteredMode01FixtureSupervisor } from "./native/mode01-registered-fixture-supervisor.js";
import { createJ2534SelectedMode01FixtureSupervisor } from "./j2534-mode01-fixture-supervisor.js";

const source = fs.readFileSync(new URL("../local-bridge-readonly.js", import.meta.url), "utf8");
const names = ["resolveJ2534RegisteredDtcSelection", "createJ2534RegisteredDtcSelectionHandoff", "createJ2534RegisteredMode01SelectionHandoff"];
const code = names.map(name => {
  const match = source.match(new RegExp(`(?:export )?function ${name}\\([^)]*\\) \\{[\\s\\S]*?\\r?\\n\\}`));
  assert.ok(match, `Missing ${name}`); return match[0].replace(/^export /, "");
}).join("\n");
let checks = 0;
function setup() {
  const secrets = new WeakMap(), descriptor = Object.freeze({});
  const original = { descriptorSource: "live_windows_registry", selectedDeviceId: "j2534-0123456789abcdef",
    libraryPath: "C:\\synthetic\\driver.dll", fingerprint: { device: 1, inode: 2, size: 4096, mtime_ns: 3, ctime_ns: 4, sha256: "a".repeat(64) } };
  secrets.set(descriptor, original);
  const state = { time: 100, calls: 0, current: { ...original, fingerprint: { ...original.fingerprint } },
    metadata: { exact_readonly_api_ready: true, execution_enabled: false, sha256: "a".repeat(64), file_size: 4096, driver_architecture: "x64" } };
  const context = vm.createContext({ j2534RegisteredDriverDescriptorSecrets: secrets, createJ2534DtcSelectionHandoff, createJ2534Mode01SelectionHandoff,
    performance: { now: () => state.time },
    createJ2534RegisteredDriverDescriptor(options) {
      state.calls++; assert.equal(options.enabled, true); assert.equal(options.selectedDeviceId, original.selectedDeviceId);
      const current = { ...state.metadata }; if (state.current) secrets.set(current, state.current); return current;
    } });
  vm.runInContext(code, context);
  state.api = context.createJ2534RegisteredDtcSelectionHandoff(); state.descriptor = descriptor; state.original = original;
  state.mode01 = context.createJ2534RegisteredMode01SelectionHandoff();
  return state;
}
const request = { request_ecu: 0x7e0, service: 3 };
// Actual host factory rejects an unissued clone before any registry/file work.
const unissuedReview = createRegisteredMode01PackageReview().inspect({}, { request_ecu: 2016, pid: 5 }, null, null);
assert.equal(unissuedReview.reason, "selection_unavailable");
assert.equal(unissuedReview.execution_enabled, false);
for (const pid of [5, 12]) {
  const s = setup(), intent = { request_ecu: 0x7e7, pid };
  const ticket = s.mode01.prepare(s.descriptor, intent);
  assert.equal(JSON.stringify(ticket), "{}");
  assert.equal(s.mode01.prepare({ ...s.descriptor }, intent), null);
  assert.equal(s.calls, 1);
  const result = s.mode01.consume(ticket);
  assert.equal(result.path, s.original.libraryPath); assert.equal(result.pid, pid);
  assert.equal(result.request_ecu, 0x7e7); assert.equal(result.service, 1);
  assert.equal(s.calls, 2); assert.equal(s.mode01.consume(ticket), null);
  assert.ok(Object.isFrozen(result));
}
for (const mutate of [s => s.current = null, s => s.current.descriptorSource = "test_fixture_registry",
  s => s.current.libraryPath += ".changed", s => s.metadata.execution_enabled = true,
  s => s.metadata.exact_readonly_api_ready = false, s => s.time += 5000,
  ...["device", "inode", "size", "mtime_ns", "ctime_ns", "sha256"].map(k => s => s.current.fingerprint[k] = "changed")]) {
  const s = setup(), ticket = s.mode01.prepare(s.descriptor, { request_ecu: 0x7e0, pid: 5 });
  mutate(s); assert.equal(s.mode01.consume(ticket), null); assert.equal(s.mode01.consume(ticket), null);
}
{
  const s = setup(); s.original.descriptorSource = "test_fixture_registry";
  assert.equal(s.mode01.prepare(s.descriptor, { request_ecu: 0x7e0, pid: 5 }), null);
  assert.equal(s.calls, 0);
}
console.log("Registered Mode01 resolver: 46 checks / synthetic private store only; no registry, DLL or vehicle access");
// Compose the actual factory with the extracted host resolver and artificial
// private store. The real factory is also exercised with an unissued descriptor.
const fixtureSource = fs.readFileSync(new URL("./native/mode01-registered-fixture-supervisor.js", import.meta.url), "utf8");
const fixtureFactory = fixtureSource.match(/export function createRegisteredMode01FixtureSupervisor[^]*?\n\}/)[0].replace(/^export /, "");
for (const pid of [5, 12]) {
  for (const scenario of ["matched", "expired", "changed", "wrong_pin", "unissued"]) {
    const s = setup(); let launches = 0, args;
    const context = vm.createContext({ createJ2534SelectedMode01FixtureSupervisor,
      createJ2534RegisteredMode01SelectionHandoff: () => s.mode01 });
    vm.runInContext(fixtureFactory, context);
    const factory = scenario === "unissued" ? createRegisteredMode01FixtureSupervisor : context.createRegisteredMode01FixtureSupervisor;
    const pinned = { path: s.original.libraryPath, sha256: (scenario === "wrong_pin" ? "B" : "A").repeat(64),
      size: 4096, architecture: "x64", request_ecu: 2016, pid };
    const run = factory({ descriptor: s.descriptor, pinned,
      // Extra caller metadata must not replace the internal host handoff.
      handoff: { prepare() { throw new Error("injected handoff"); } },
      decodeLivePidResponse() { throw new Error("no response expected"); },
      buildDiagnosticScanSession() { throw new Error("no session expected"); },
      spawnWorker(value) { launches++; args = value; throw new Error("synthetic spawn failure"); } });
    if (scenario === "expired") s.time += 5000;
    if (scenario === "changed") s.current.fingerprint.inode++;
    const result = await run();
    assert.equal(result.session, null);
    assert.equal(result.vehicle_communication, false);
    assert.equal(launches, scenario === "matched" ? 1 : 0);
    assert.equal(s.calls, scenario === "unissued" ? 0 : scenario === "expired" ? 1 : 2);
    if (scenario === "matched") {
      assert.ok(Object.isFrozen(args));
      assert.deepEqual(args, ["--generated-mode01", pinned.path, pinned.sha256, "4096", "x64", "2016", String(pid)]);
    }
    assert.equal((await run()).reason, "fixture_already_consumed");
    assert.ok(!JSON.stringify(result).includes(pinned.path));
  }
}
console.log("Registered Mode01 fixed supervisor: 10 composition cases passed; synthetic store and spawn callback only, no process/registry/DLL/vehicle");
{
  const s = setup(), ticket = s.api.prepare(s.descriptor, request);
  assert.equal(JSON.stringify(ticket), "{}"); assert.equal(s.calls, 1);
  const result = s.api.consume(ticket);
  assert.equal(result.path, s.original.libraryPath); assert.equal(result.service, 3); assert.equal(s.calls, 2);
  assert.equal(s.api.consume(ticket), null); checks += 6;
}
for (const mutate of [
  s => s.current = null,
  s => s.current.descriptorSource = "test_fixture_registry",
  s => s.current.selectedDeviceId = "j2534-ffffffffffffffff",
  s => s.current.libraryPath = "C:\\synthetic\\other.dll",
  s => s.metadata.exact_readonly_api_ready = false,
  s => s.metadata.execution_enabled = true,
  ...["device", "inode", "size", "mtime_ns", "ctime_ns", "sha256"].map(key => s => s.current.fingerprint[key] = "changed")
]) {
  const s = setup(), ticket = s.api.prepare(s.descriptor, request); mutate(s);
  assert.equal(s.api.consume(ticket), null); assert.equal(s.api.consume(ticket), null); checks += 2;
}
{
  const s = setup();
  assert.equal(s.api.prepare({ ...s.descriptor }, request), null); assert.equal(s.calls, 0);
  s.original.descriptorSource = "test_fixture_registry";
  assert.equal(s.api.prepare(s.descriptor, request), null); assert.equal(s.calls, 0); checks += 4;
}
if (process.platform === "win32") {
  const s = setup(), root = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), "registered-review-")));
  const file = path.join(root, "driver.dll"); fs.writeFileSync(file, "abc");
  const hash = "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad";
  for (const record of [s.original, s.current]) {
    record.libraryPath = file; record.fingerprint.size = 3; record.fingerprint.sha256 = hash;
  }
  s.metadata.sha256 = hash; s.metadata.file_size = 3;
  const review = createDtcSelectedPackageReview({ handoff: s.api });
  const metadata = { vendor: "Synthetic", version: "test", architecture: "x64", entry: "driver.dll",
    source_url: "https://example.invalid/package.zip" };
  const value = review.inspect(s.descriptor, request, root, metadata);
  assert.equal(value.selected_entry_matches, true); assert.equal(value.execution_enabled, false);
  assert.equal(s.calls, 2); assert.ok(!JSON.stringify(value).includes(root));
  s.current.libraryPath = path.join(root, "other.dll");
  assert.equal(review.inspect(s.descriptor, request, root, metadata).reason, "selection_unavailable"); checks += 5;

  // Exercise the new composition with the extracted real resolver and an
  // artificial secret store. No real registry or vendor files are consulted.
  s.current.libraryPath = file;
  const modeSource = fs.readFileSync(new URL("./native/mode01-selected-package-review.js", import.meta.url), "utf8");
  const factory = modeSource.match(/export function createRegisteredMode01PackageReview[^]*?\n\}/)[0].replace(/^export /, "");
  const modeContext = vm.createContext({ createDtcSelectedPackageReview,
    createJ2534RegisteredMode01SelectionHandoff: () => s.mode01 });
  vm.runInContext(factory, modeContext);
  const modeReview = modeContext.createRegisteredMode01PackageReview();
  for (const pid of [5, 12]) {
    const observed = modeReview.inspect(s.descriptor, { request_ecu: 2016, pid }, root, metadata);
    assert.equal(observed.selected_entry_matches, true);
    assert.equal(observed.execution_status, "blocked");
    assert.equal(observed.execution_enabled, false);
    assert.equal(observed.publisher_verified, false);
    assert.equal(observed.dependency_closure_verified, false);
    assert.ok(!JSON.stringify(observed).includes(root));
    assert.ok(observed.execution_blockers.includes("execution_not_authorized"));
  }
  const catalogReview = modeContext.createRegisteredMode01PackageReview({ catalog: [{ ...metadata,
    files: [{ name: "driver.dll", size: 3, sha256: hash }] }] });
  const syntheticValid = JSON.stringify({ observation_status: "observed_only", signature_status: "Valid",
    signature_type: "Authenticode", signer_certificate_sha256: "A".repeat(64), file_sha256: hash,
    publisher_verified: false, dependency_closure_verified: false, execution_enabled: false });
  const matched = catalogReview.inspect(s.descriptor, { request_ecu: 2016, pid: 12 }, root, metadata, syntheticValid);
  assert.equal(matched.status, "metadata_match_only");
  assert.equal(matched.entry_signature.signature_status, "Valid");
  assert.deepEqual(matched.execution_blockers, ["publisher_unverified", "dependency_closure_unverified", "execution_not_authorized"]);
  assert.equal(matched.execution_enabled, false);
  const beforeInvalid = s.calls;
  assert.equal(modeReview.inspect(s.descriptor, { request_ecu: 2016, pid: 4 }, root, metadata).reason, "selection_unavailable");
  assert.equal(s.calls, beforeInvalid);
  s.current.fingerprint.sha256 = "changed";
  assert.equal(modeReview.inspect(s.descriptor, { request_ecu: 2016, pid: 5 }, root, metadata).reason, "selection_unavailable");
  console.log("Mode01 registered package composition: matched inventory remains blocked; invalid PID and changed identity rejected; private paths omitted");
} else console.log("Registered package filesystem integration: skipped (requires Windows paths)");
console.log(`Registered DTC selection resolver: ${checks} checks / extracted bridge code, synthetic registry/store only / no DLL or vehicle I/O`);
