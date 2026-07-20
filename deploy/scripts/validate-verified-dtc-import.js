import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const importer = path.join(projectRoot, "scripts", "import-verified-dtc-csv.js");
const fixture = path.join(projectRoot, "scripts", "fixtures", "verified-dtc-sample.csv");
const failures = [];

function runImport(...args) {
  const result = spawnSync(process.execPath, [importer, "--input", fixture, ...args], {
    cwd: projectRoot,
    encoding: "utf8"
  });
  return {
    status: result.status,
    output: `${result.stdout || ""}${result.stderr || ""}`
  };
}

function check(condition, message) {
  if (!condition) failures.push(message);
}

const valid = runImport(
  "--source", "Verified test source",
  "--source-url", "https://example.invalid/verified-dtc-sample",
  "--source-date", "2026-05-31"
);
check(valid.status === 0 && valid.output.includes("Dry run only"), "valid verified-DTC CSV dry run was rejected");

const insecureUrl = runImport(
  "--source", "Verified test source",
  "--source-url", "http://example.invalid/verified-dtc-sample",
  "--source-date", "2026-05-31"
);
check(insecureUrl.status !== 0 && insecureUrl.output.includes("HTTPS"), "insecure source URL was accepted");

const credentialUrl = runImport(
  "--source", "Verified test source",
  "--source-url", "https://user:secret@example.invalid/verified-dtc-sample",
  "--source-date", "2026-05-31"
);
check(credentialUrl.status !== 0 && credentialUrl.output.includes("認証情報"), "credential-bearing source URL was accepted");

const invalidDate = runImport(
  "--source", "Verified test source",
  "--source-url", "https://example.invalid/verified-dtc-sample",
  "--source-date", "2026-02-30"
);
check(invalidDate.status !== 0 && invalidDate.output.includes("実在する日付"), "invalid source date was accepted");

const futureDate = runImport(
  "--source", "Verified test source",
  "--source-url", "https://example.invalid/verified-dtc-sample",
  "--source-date", "2099-01-01"
);
check(futureDate.status !== 0 && futureDate.output.includes("将来日"), "future source date was accepted");

console.log(`Verified-DTC import checks: ${5 - failures.length}`);
console.log(`Errors: ${failures.length}`);
for (const failure of failures) console.error(`ERROR ${failure}`);
process.exit(failures.length ? 1 : 0);
