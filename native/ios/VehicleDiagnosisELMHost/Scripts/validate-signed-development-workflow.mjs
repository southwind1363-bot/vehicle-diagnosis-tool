import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const hostDirectory = path.resolve(scriptDirectory, "..");
const repoRoot = path.resolve(hostDirectory, "..", "..", "..");
const workflow = fs.readFileSync(path.join(repoRoot, ".github", "workflows", "ios-signed-development-host.yml"), "utf8");
const script = fs.readFileSync(path.join(scriptDirectory, "build-signed-development-ipa.sh"), "utf8");

let checks = 0;
let errors = 0;
function check(condition, message) {
  checks += 1;
  if (!condition) {
    errors += 1;
    console.error(`ERROR: ${message}`);
  }
}

check(/^on:\r?\n  workflow_dispatch:\r?$/m.test(workflow), "signed workflow must be manually dispatched");
check(!/^  (push|pull_request|schedule):/m.test(workflow), "signed workflow must not run from push, pull request, or schedule");
check(workflow.includes("environment: ios-device-signing"), "signed workflow must use the protected signing environment");
check(workflow.includes("concurrency:") && workflow.includes("cancel-in-progress: false"), "signed workflow must serialize without cancelling an active signing job");
for (const secret of [
  "IOS_DEVELOPMENT_CERTIFICATE_P12_BASE64",
  "IOS_DEVELOPMENT_CERTIFICATE_PASSWORD",
  "IOS_DEVELOPMENT_PROVISIONING_PROFILE_BASE64",
]) {
  check(workflow.includes(`secrets.${secret}`), `${secret} must come from GitHub secrets`);
}
check(workflow.includes("retention-days: 3"), "signed development artifact retention must remain short");
check(script.startsWith("#!/bin/bash\nset -euo pipefail"), "signing script must use strict shell mode");
check(script.includes("trap cleanup EXIT") && script.includes('security delete-keychain "$keychain_path"'), "temporary signing keychain must be deleted on every exit");
check(script.includes('rm -f "$installed_profile"'), "temporary provisioning profile must be deleted on every exit");
check(script.includes('application_identifier != expected_identifier'), "provisioning profile must exactly match the bundle identifier");
check(script.includes('entitlements.get("get-task-allow") is not True'), "only a development provisioning profile may be used");
check(script.includes("Provisioning profile has no registered iPhone devices"), "profile must contain registered devices");
check(script.includes("codesign --verify --deep --strict"), "built and packaged apps must be verified with codesign");
check(script.includes('"vehicle_command_enabled": False') && script.includes('"read_only": True'), "signed manifest must retain the read-only vehicle boundary");
check(script.includes('"target_device_installation_verified": False'), "CI must not claim installation on the target iPhone");
check(!script.includes("set -x"), "signing script must not enable secret-expanding shell trace");

console.log(`iOS signed development workflow checks: ${checks}`);
console.log(`Errors: ${errors}`);
process.exitCode = errors === 0 ? 0 : 1;
