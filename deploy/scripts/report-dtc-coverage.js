import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataDir = path.join(projectRoot, "data");
const read = (file) => JSON.parse(fs.readFileSync(path.join(dataDir, file), "utf8"));
const dtcFiles = fs.readdirSync(dataDir)
  .filter((file) =>
    file === "obd-codes.json" ||
    file === "imported-verified-dtc.json" ||
    /^generic-obd-codes-modern(?:-2026(?:-part\d+)?)?\.json$/.test(file)
  )
  .sort();
const workflowFiles = [
  "diagnostic-workflows.json",
  "component-inspection-flows.json",
  "component-inspection-flows-exam-2026.json",
  "dtc-family-workflows-2026.json"
];
const individualCodes = [...new Set(dtcFiles.flatMap(read).map((item) => item.code).filter((code) => /^[PBCU][0-9A-F]{4}$/.test(code)))].sort();
const familyPatterns = [...new Set(workflowFiles.flatMap(read).flatMap((item) => item.dtc_codes || []).filter((code) => code.includes("X")))].sort();
const prefixCounts = Object.fromEntries(["P", "B", "C", "U"].map((prefix) => [prefix, individualCodes.filter((code) => code.startsWith(prefix)).length]));

console.log(`Verified individual DTC definitions: ${individualCodes.length}`);
console.log(`Family workflow patterns: ${familyPatterns.length}`);
console.log(`Individual definition counts: ${JSON.stringify(prefixCounts)}`);
console.log(`Family workflow coverage: ${familyPatterns.join(", ")}`);
console.log("Policy: individual names require verified source data; unknown codes fall back to family workflow and service-manual confirmation.");
