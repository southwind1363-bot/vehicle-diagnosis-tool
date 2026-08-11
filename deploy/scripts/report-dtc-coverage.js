import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataDir = path.join(projectRoot, "data");
const read = (file) => JSON.parse(fs.readFileSync(path.join(dataDir, file), "utf8"));
const dtcFiles = fs.readdirSync(dataDir)
  .filter((file) =>
    // Legacy supplemental rows are not counted as verified individual definitions.
    file === "obd-codes.json" ||
    file === "imported-verified-dtc.json" ||
    /^generic-obd-codes-modern-2026(?:-part\d+)?\.json$/.test(file)
  )
  .sort();
const workflowFiles = [
  "diagnostic-workflows.json",
  "component-inspection-flows.json",
  "component-inspection-flows-exam-2026.json",
  "dtc-family-workflows-2026.json"
];
const individualRows = dtcFiles.flatMap(read)
  .filter((item) => /^[PBCU][0-9A-F]{4}$/.test(item?.code || ""));
const individualCodes = [...new Set(individualRows.map((item) => item.code))].sort();
const individualDefinitionKeys = [...new Set(individualRows.map((item) => {
  const subcode = String(item.subcode || item.sub_code || "").trim().toUpperCase();
  return `${item.code}:${subcode}`;
}))].sort();
const familyPatterns = [...new Set(workflowFiles.flatMap(read).flatMap((item) => item.dtc_codes || []).filter((code) => code.includes("X")))].sort();
const prefixCounts = Object.fromEntries(["P", "B", "C", "U"].map((prefix) => [prefix, individualCodes.filter((code) => code.startsWith(prefix)).length]));
const definitionPrefixCounts = Object.fromEntries(["P", "B", "C", "U"].map((prefix) => [prefix, individualDefinitionKeys.filter((key) => key.startsWith(prefix)).length]));
const subcodeDefinitionCount = individualDefinitionKeys.filter((key) => !key.endsWith(":")).length;

console.log(`Verified individual DTC definitions: ${individualDefinitionKeys.length}`);
console.log(`Verified individual DTC parent codes: ${individualCodes.length}`);
console.log(`Verified DTC subcode definitions: ${subcodeDefinitionCount}`);
console.log(`Family workflow patterns: ${familyPatterns.length}`);
console.log(`Individual parent-code counts: ${JSON.stringify(prefixCounts)}`);
console.log(`Individual definition counts: ${JSON.stringify(definitionPrefixCounts)}`);
console.log(`Family workflow coverage: ${familyPatterns.join(", ")}`);
console.log("Policy: individual names require verified source data; unknown codes fall back to family workflow and service-manual confirmation.");
