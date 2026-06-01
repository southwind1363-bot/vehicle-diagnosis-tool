import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataDir = path.join(projectRoot, "data");
const jsonFiles = fs.readdirSync(dataDir).filter((name) => name.endsWith(".json")).sort();
const errors = [];
const warnings = [];
const codeRows = [];
const legacySourceOptionalFiles = new Set([
  "dtc-scope-rules.json",
  "exam-reference-catalog.json",
  "exam-review-queue-2026.json",
  "obd-codes.json",
  "service-notes.json",
  "symptom-flows.json"
]);

function reportError(message) {
  errors.push(message);
}

function isDtc(code) {
  return /^[PBCU][0-9A-F]{4}$/.test(code);
}

function isDtcPattern(code) {
  return /^[PBCU][0-9A-FX]{4}$/.test(code) && code.includes("X");
}

for (const file of jsonFiles) {
  const raw = fs.readFileSync(path.join(dataDir, file), "utf8");
  let rows;

  try {
    rows = JSON.parse(raw);
  } catch (error) {
    reportError(`${file}: JSONを解析できません: ${error.message}`);
    continue;
  }

  if (!Array.isArray(rows)) {
    reportError(`${file}: JSON配列ではありません`);
    continue;
  }

  if (raw.includes("?")) {
    reportError(`${file}: 文字崩れの可能性がある ? を含みます`);
  }

  const ids = new Set();
  const makers = new Set();
  for (const [index, row] of rows.entries()) {
    const label = `${file}[${index}]`;

    if (row.id) {
      if (ids.has(row.id)) reportError(`${label}: id ${row.id} が重複しています`);
      ids.add(row.id);
    }

    if (row.code) {
      if (!isDtc(row.code) && row.code !== "P1xxx") reportError(`${label}: DTC形式が不正です: ${row.code}`);
      codeRows.push({ file, code: row.code, id: row.id || "" });
    }

    for (const code of row.dtc_codes || []) {
      if (!isDtc(code) && !isDtcPattern(code)) reportError(`${label}: 参照DTC形式が不正です: ${code}`);
    }

    if (row.service_manual_required === false) {
      warnings.push(`${label}: service_manual_required が false です`);
    }

    if (!legacySourceOptionalFiles.has(file)) {
      if (!row.source) reportError(`${label}: source がありません`);
      if (!row.source_date) reportError(`${label}: source_date がありません`);
    }

    if (file === "vehicle-model-catalog-domestic-2026.json") {
      if (!row.maker) reportError(`${label}: maker がありません`);
      if (makers.has(row.maker)) reportError(`${label}: maker ${row.maker} が重複しています`);
      makers.add(row.maker);
      if (!Array.isArray(row.models) || !row.models.length) reportError(`${label}: models がありません`);
      if (new Set(row.models || []).size !== (row.models || []).length) reportError(`${label}: models に重複があります`);
      if (!row.source_url) reportError(`${label}: source_url がありません`);
      if (row.detail_confirmation_required !== true) reportError(`${label}: detail_confirmation_required が true ではありません`);
    }

    if (file === "vehicle-year-ranges-domestic-2026.json") {
      if (!row.maker) reportError(`${label}: maker がありません`);
      if (!row.model) reportError(`${label}: model がありません`);
      if (!Array.isArray(row.model_codes) || !row.model_codes.length) reportError(`${label}: model_codes がありません`);
      if (!Number.isInteger(row.year_from)) reportError(`${label}: year_from が整数ではありません`);
      if (row.year_to !== null && !Number.isInteger(row.year_to)) reportError(`${label}: year_to が整数または null ではありません`);
      if (row.year_to === null && !Number.isInteger(row.verified_through_year)) reportError(`${label}: 継続中の候補に verified_through_year がありません`);
      if (Number.isInteger(row.year_to) && row.year_from > row.year_to) reportError(`${label}: 年式範囲が逆転しています`);
      if (!row.source_url) reportError(`${label}: source_url がありません`);
      if (row.detail_confirmation_required !== true) reportError(`${label}: detail_confirmation_required が true ではありません`);
    }
  }
}

const codeLocations = new Map();
for (const row of codeRows) {
  const locations = codeLocations.get(row.code) || [];
  locations.push(`${row.file}:${row.id}`);
  codeLocations.set(row.code, locations);
}

for (const [code, locations] of codeLocations.entries()) {
  if (locations.length > 2) warnings.push(`${code}: 複数データ層に ${locations.length} 件あります: ${locations.join(", ")}`);
}

console.log(`JSON files: ${jsonFiles.length}`);
console.log(`DTC records: ${codeRows.length}`);
console.log(`Errors: ${errors.length}`);
console.log(`Warnings: ${warnings.length}`);
warnings.forEach((warning) => console.log(`WARN ${warning}`));
errors.forEach((error) => console.error(`ERROR ${error}`));

if (errors.length) process.exit(1);
