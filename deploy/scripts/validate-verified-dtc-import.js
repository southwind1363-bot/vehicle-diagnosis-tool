import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const importer = path.join(projectRoot, "scripts", "import-verified-dtc-csv.js");
const fixture = path.join(projectRoot, "scripts", "fixtures", "verified-dtc-sample.csv");
const subcodeFixture = path.join(projectRoot, "scripts", "fixtures", "verified-dtc-subcode-sample.csv");
const invalidSubcodeFixture = path.join(projectRoot, "scripts", "fixtures", "verified-dtc-subcode-invalid.csv");
const scopedFixture = path.join(projectRoot, "scripts", "fixtures", "verified-dtc-scoped-sample.csv");
const invalidScopeFixture = path.join(projectRoot, "scripts", "fixtures", "verified-dtc-scoped-invalid.csv");
const failures = [];
let checks = 0;

function runImport(input, ...args) {
  const result = spawnSync(process.execPath, [importer, "--input", input, ...args], {
    cwd: projectRoot,
    encoding: "utf8"
  });
  return {
    status: result.status,
    output: `${result.stdout || ""}${result.stderr || ""}`
  };
}

function check(condition, message) {
  checks += 1;
  if (!condition) failures.push(message);
}

const valid = runImport(fixture,
  "--source", "Verified test source",
  "--source-url", "https://example.invalid/verified-dtc-sample",
  "--source-date", "2026-05-31"
);
check(valid.status === 0 && valid.output.includes("Dry run only"), "valid verified-DTC CSV dry run was rejected");

const insecureUrl = runImport(fixture,
  "--source", "Verified test source",
  "--source-url", "http://example.invalid/verified-dtc-sample",
  "--source-date", "2026-05-31"
);
check(insecureUrl.status !== 0 && insecureUrl.output.includes("HTTPS"), "insecure source URL was accepted");

const credentialUrl = runImport(fixture,
  "--source", "Verified test source",
  "--source-url", "https://user:secret@example.invalid/verified-dtc-sample",
  "--source-date", "2026-05-31"
);
check(credentialUrl.status !== 0 && credentialUrl.output.includes("認証情報"), "credential-bearing source URL was accepted");

const invalidDate = runImport(fixture,
  "--source", "Verified test source",
  "--source-url", "https://example.invalid/verified-dtc-sample",
  "--source-date", "2026-02-30"
);
check(invalidDate.status !== 0 && invalidDate.output.includes("実在する日付"), "invalid source date was accepted");

const futureDate = runImport(fixture,
  "--source", "Verified test source",
  "--source-url", "https://example.invalid/verified-dtc-sample",
  "--source-date", "2099-01-01"
);
check(futureDate.status !== 0 && futureDate.output.includes("将来日"), "future source date was accepted");

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "verified-dtc-import-"));
try {
  const output = path.join(tempDir, "subcodes.json");
  const subcodeImport = runImport(subcodeFixture,
    "--source", "Verified test source",
    "--source-url", "https://example.invalid/verified-dtc-sample",
    "--source-date", "2026-05-31",
    "--output", output,
    "--write"
  );
  let definitions = [];
  try {
    definitions = JSON.parse(fs.readFileSync(output, "utf8"));
  } catch {
    definitions = [];
  }
  check(subcodeImport.status === 0 && definitions.length === 2, "valid subcode CSV import was rejected");
  check(definitions.some((row) => row.code === "B0001" && row.subcode === "11" && row.id === "verified-import-b0001-11"), "subcode column was not retained as a distinct DTC definition");
  check(definitions.some((row) => row.code === "B0001" && row.subcode === "12" && row.id === "verified-import-b0001-12"), "DTC suffix subcode was not retained as a distinct DTC definition");

  const scopedOutput = path.join(tempDir, "scoped.json");
  const scopedImport = runImport(scopedFixture,
    "--source", "Verified scoped test source",
    "--source-url", "https://example.invalid/verified-dtc-scoped-sample",
    "--source-date", "2026-05-31",
    "--output", scopedOutput,
    "--write"
  );
  let scopedDefinitions = [];
  try {
    scopedDefinitions = JSON.parse(fs.readFileSync(scopedOutput, "utf8"));
  } catch {
    scopedDefinitions = [];
  }
  check(scopedImport.status === 0 && scopedDefinitions[0]?.vehicle_filter?.makers?.join(",") === "Honda" && scopedDefinitions[0]?.vehicle_filter?.models?.join(",") === "CR-V,HR-V" && scopedDefinitions[0]?.vehicle_filter?.year_from === 2023 && scopedDefinitions[0]?.vehicle_filter?.scope_confirmation_required === true, "scoped verified-DTC CSV did not retain required vehicle applicability");
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true });
}

const invalidSubcode = runImport(invalidSubcodeFixture,
  "--source", "Verified test source",
  "--source-url", "https://example.invalid/verified-dtc-sample",
  "--source-date", "2026-05-31"
);
check(invalidSubcode.status !== 0 && invalidSubcode.output.includes("一致しません"), "conflicting DTC suffix and subcode column were accepted");
check(invalidSubcode.status !== 0 && invalidSubcode.output.includes("重複"), "duplicate DTC and subcode pair was accepted");
const invalidScope = runImport(invalidScopeFixture,
  "--source", "Verified scoped test source",
  "--source-url", "https://example.invalid/verified-dtc-scoped-invalid",
  "--source-date", "2026-05-31"
);
check(invalidScope.status !== 0 && invalidScope.output.includes("scope_confirmation_required"), "scoped DTC without confirmation requirement was accepted");

console.log(`Verified-DTC import checks: ${checks - failures.length}`);
console.log(`Errors: ${failures.length}`);
for (const failure of failures) console.error(`ERROR ${failure}`);
process.exit(failures.length ? 1 : 0);
