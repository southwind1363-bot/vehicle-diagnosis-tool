import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import os from "node:os";
import path from "node:path";
import { createDtcSelectedPackageReview } from "./native/dtc-selected-package-review.js";
import { createJ2534DtcSelectionHandoff } from "./j2534-dtc-selection-handoff.js";

const source = fs.readFileSync(new URL("../local-bridge-readonly.js", import.meta.url), "utf8");
const names = ["resolveJ2534RegisteredDtcSelection", "createJ2534RegisteredDtcSelectionHandoff"];
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
  const context = vm.createContext({ j2534RegisteredDriverDescriptorSecrets: secrets, createJ2534DtcSelectionHandoff,
    performance: { now: () => state.time },
    createJ2534RegisteredDriverDescriptor(options) {
      state.calls++; assert.equal(options.enabled, true); assert.equal(options.selectedDeviceId, original.selectedDeviceId);
      const current = { ...state.metadata }; if (state.current) secrets.set(current, state.current); return current;
    } });
  vm.runInContext(code, context);
  state.api = context.createJ2534RegisteredDtcSelectionHandoff(); state.descriptor = descriptor; state.original = original;
  return state;
}
const request = { request_ecu: 0x7e0, service: 3 };
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
} else console.log("Registered package filesystem integration: skipped (requires Windows paths)");
console.log(`Registered DTC selection resolver: ${checks} checks / extracted bridge code, synthetic registry/store only / no DLL or vehicle I/O`);
