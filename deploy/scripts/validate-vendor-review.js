import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

// Portable, non-transmitting checks only. Do not run native compilation, real
// registry discovery, untracked PowerShell scripts or vendor executables here.
const tests = ["vendor-package-review", "vendor-package-folder-review", "vendor-signature-result",
  "native-signature-result", "signature-observation-worker", "dtc-selected-package-review"];
const files = tests.map(name => fileURLToPath(new URL(`./native/${name}.test.js`, import.meta.url)));
const result = spawnSync(process.execPath, ["--test", ...files], {
  shell: false, windowsHide: true, stdio: "inherit", timeout: 60000
});
if (result.error || result.signal !== null || result.status !== 0) {
  throw new Error("vendor_review_validation_failed");
}
