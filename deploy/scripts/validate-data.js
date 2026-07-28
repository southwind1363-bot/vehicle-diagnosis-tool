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
  "obd-monitor-definitions.json",
  "obd-codes.json",
  "service-notes.json",
  "symptom-flows.json"
]);
// These legacy rows remain while the source-backed generic definitions supersede them at runtime.
const allowedLegacyDtcOverlaps = new Set([
  "P0101:", "P0128:", "P0172:", "P0201:", "P0401:", "P0441:",
  "P0456:", "P0507:", "P0562:", "P0606:", "P0700:", "P0715:"
]);
const monitorDefinitionRows = JSON.parse(fs.readFileSync(path.join(dataDir, "obd-monitor-definitions.json"), "utf8"));
const monitorDefinitionIds = new Set(monitorDefinitionRows.map((row) => row.id));
const monitorDefinitionsById = new Map(monitorDefinitionRows.map((row) => [row.id, row]));

function reportError(message) {
  errors.push(message);
}

function isDtc(code) {
  return /^[PBCU][0-9A-F]{4}$/.test(code);
}

function isDtcPattern(code) {
  return /^[PBCU][0-9A-FX]{4}$/.test(code) && code.includes("X");
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function isNonEmptyStringArray(value) {
  return Array.isArray(value) && value.length > 0 && value.every(isNonEmptyString);
}

function isDtcVehicleFilter(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  if (!isNonEmptyStringArray(value.makers) || !isNonEmptyStringArray(value.models)) return false;
  if (!Number.isInteger(value.year_from) || !Number.isInteger(value.year_to)) return false;
  if (value.scope_confirmation_required !== undefined && typeof value.scope_confirmation_required !== "boolean") return false;
  return value.year_from >= 1900 && value.year_to >= value.year_from && value.year_to <= 2100;
}

function dtcVehicleFiltersOverlap(left, right) {
  if (!isDtcVehicleFilter(left) || !isDtcVehicleFilter(right)) return true;
  const normalize = (value) => String(value || "").trim().toLocaleLowerCase("en-US");
  const leftMakers = new Set(left.makers.map(normalize));
  const leftModels = new Set(left.models.map(normalize));
  const sameMaker = right.makers.some((value) => leftMakers.has(normalize(value)));
  const sameModel = right.models.some((value) => leftModels.has(normalize(value)));
  const overlappingYears = Math.max(left.year_from, right.year_from) <= Math.min(left.year_to, right.year_to);
  return sameMaker && sameModel && overlappingYears;
}

function hasDisjointSourceSpecificDtcDefinitions(rows) {
  if (!Array.isArray(rows) || rows.length < 2) return false;
  if (!rows.every((row) => row.file === "imported-verified-dtc.json" && row.imported_definition_only === true && isDtcVehicleFilter(row.vehicle_filter))) return false;
  return rows.every((row, index) => rows.slice(index + 1).every((other) => !dtcVehicleFiltersOverlap(row.vehicle_filter, other.vehicle_filter)));
}

function isSourceUrl(value) {
  return isNonEmptyString(value) || isNonEmptyStringArray(value);
}

function sourceUrlList(value) {
  return Array.isArray(value) ? value : [value];
}

function hasHttpsSourceUrl(value) {
  return isSourceUrl(value) && sourceUrlList(value).every((url) => /^https:\/\//.test(url));
}

function hasGenericDtcPrimarySource(value) {
  return sourceUrlList(value).some((url) => isNonEmptyString(url)
    && /^https:\/\/(saemobilus\.sae\.org|webstore\.ansi\.org)\//.test(url.trim()));
}

function isIsoDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value || "");
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

  if (raw.includes("\uFFFD")) {
    reportError(`${file}: 文字崩れの可能性がある置換文字を含みます`);
  }

  const ids = new Set();
  const makers = new Set();
  const vehicleDetails = new Set();
  const vehicleYearRanges = new Set();
  const monitorAliases = new Map();
  for (const [index, row] of rows.entries()) {
    const label = `${file}[${index}]`;

    if (!row || typeof row !== "object" || Array.isArray(row)) {
      reportError(`${label}: 行がJSONオブジェクトではありません`);
      continue;
    }

    if ("source_url" in row && !isSourceUrl(row.source_url)) {
      reportError(`${label}: source_url は空でない文字列または文字列配列にしてください`);
    }

    if ("dtc_codes" in row && !Array.isArray(row.dtc_codes)) {
      reportError(`${label}: dtc_codes は配列にしてください`);
    }

    if (row.id) {
      if (ids.has(row.id)) reportError(`${label}: id ${row.id} が重複しています`);
      ids.add(row.id);
    }

    if (row.code) {
      if (!isDtc(row.code) && row.code !== "P1xxx") reportError(`${label}: DTC形式が不正です: ${row.code}`);
      const subcode = String(row.subcode || row.sub_code || "").trim().toUpperCase();
      if (subcode && !/^[0-9A-F]{1,4}$/.test(subcode)) reportError(`${label}: DTCサブコード形式が不正です: ${subcode}`);
      codeRows.push({
        file,
        code: row.code,
        subcode,
        id: row.id || "",
        imported_definition_only: row.imported_definition_only === true,
        vehicle_filter: row.vehicle_filter || null
      });
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

    if (/^generic-obd-codes-modern-2026(?:-part\d+)?\.json$/.test(file)) {
      if (!isDtc(row.code)) reportError(`${label}: generic 2026 DTC code is invalid`);
      if (!isNonEmptyString(row.title)) reportError(`${label}: generic 2026 DTC title is missing`);
      if (!isSourceUrl(row.source_url) || !hasGenericDtcPrimarySource(row.source_url)) {
        reportError(`${label}: generic 2026 DTC requires an SAE or ANSI primary-standard source_url`);
      }
      if (!isIsoDate(row.last_verified_date)) reportError(`${label}: generic 2026 DTC last_verified_date is invalid`);
      if (row.service_manual_required !== true) reportError(`${label}: generic 2026 DTC must require the service manual`);
    }

    if (file === "imported-verified-dtc.json") {
      if (!isDtc(row.code)) reportError(`${label}: verified imported DTC code is invalid`);
      if (!isNonEmptyString(row.title)) reportError(`${label}: verified imported DTC title is missing`);
      if (!isNonEmptyString(row.system)) reportError(`${label}: verified imported DTC system is missing`);
      if (!isNonEmptyStringArray(row.check_order)) reportError(`${label}: verified imported DTC check_order is missing`);
      if (!isSourceUrl(row.source_url) || !sourceUrlList(row.source_url).every((url) => /^https:\/\//.test(url))) {
        reportError(`${label}: verified imported DTC requires an HTTPS source_url`);
      }
      if (!isIsoDate(row.source_date)) reportError(`${label}: verified imported DTC source_date is invalid`);
      if (!isIsoDate(row.last_verified_date)) reportError(`${label}: verified imported DTC last_verified_date is invalid`);
      if (row.service_manual_required !== true) reportError(`${label}: verified imported DTC must require the service manual`);
      if (row.imported_definition_only !== true) reportError(`${label}: verified imported DTC must be definition-only`);
      if (row.applicability_note && !isDtcVehicleFilter(row.vehicle_filter)) {
        reportError(`${label}: applicability_note がある verified imported DTC には makers/models/year_from/year_to を持つ vehicle_filter が必要です`);
      }
      if (row.applicability_note && row.vehicle_filter?.scope_confirmation_required !== true) {
        reportError(`${label}: applicability_note がある verified imported DTC には scope_confirmation_required: true が必要です`);
      }
    }

    if (file === "vehicle-model-catalog-domestic-2026.json" || file === "vehicle-model-catalog-domestic-2004-2026.json") {
      if (!row.maker) reportError(`${label}: maker がありません`);
      if (makers.has(row.maker)) reportError(`${label}: maker ${row.maker} が重複しています`);
      makers.add(row.maker);
      if (!Array.isArray(row.models) || !row.models.length) reportError(`${label}: models がありません`);
      if (new Set(row.models || []).size !== (row.models || []).length) reportError(`${label}: models に重複があります`);
      if (!row.source_url) reportError(`${label}: source_url がありません`);
      if (!isNonEmptyStringArray(row.models)) reportError(`${label}: models に空または文字列以外の値があります`);
      if (row.detail_confirmation_required !== true) reportError(`${label}: detail_confirmation_required が true ではありません`);
    }

    if (file === "vehicle-input-options.json") {
      if (!row.maker) reportError(`${label}: maker がありません`);
      if (row.model) {
        const vehicleKey = `${row.maker}::${row.model}`;
        if (vehicleDetails.has(vehicleKey)) reportError(`${label}: ${vehicleKey} が重複しています`);
        vehicleDetails.add(vehicleKey);
        if (!Array.isArray(row.model_codes) || !row.model_codes.length) reportError(`${label}: model_codes がありません`);
        if (new Set(row.model_codes || []).size !== (row.model_codes || []).length) reportError(`${label}: model_codes に重複があります`);
        if (!Array.isArray(row.engine_codes) || !row.engine_codes.length) reportError(`${label}: engine_codes がありません`);
        if (new Set(row.engine_codes || []).size !== (row.engine_codes || []).length) reportError(`${label}: engine_codes に重複があります`);
        if (!isNonEmptyStringArray(row.model_codes)) reportError(`${label}: model_codes に空または文字列以外の値があります`);
        if (!isNonEmptyStringArray(row.engine_codes)) reportError(`${label}: engine_codes に空または文字列以外の値があります`);
      }
    }

    if (file === "vehicle-year-ranges-domestic-2026.json") {
      if (!row.maker) reportError(`${label}: maker がありません`);
      if (!row.model) reportError(`${label}: model がありません`);
      if (!Array.isArray(row.model_codes) || !row.model_codes.length) reportError(`${label}: model_codes がありません`);
      if (new Set(row.model_codes || []).size !== (row.model_codes || []).length) reportError(`${label}: model_codes に重複があります`);
      if (!Array.isArray(row.engine_codes) || !row.engine_codes.length) reportError(`${label}: engine_codes がありません`);
      if (new Set(row.engine_codes || []).size !== (row.engine_codes || []).length) reportError(`${label}: engine_codes に重複があります`);
      if (!isNonEmptyStringArray(row.model_codes)) reportError(`${label}: model_codes に空または文字列以外の値があります`);
      if (!isNonEmptyStringArray(row.engine_codes)) reportError(`${label}: engine_codes に空または文字列以外の値があります`);
      if (!Number.isInteger(row.year_from)) reportError(`${label}: year_from が整数ではありません`);
      if (row.year_to !== null && !Number.isInteger(row.year_to)) reportError(`${label}: year_to が整数または null ではありません`);
      if (row.year_to === null && !Number.isInteger(row.verified_through_year)) reportError(`${label}: 継続中の候補に verified_through_year がありません`);
      if (Number.isInteger(row.year_to) && row.year_from > row.year_to) reportError(`${label}: 年式範囲が逆転しています`);
      if (Number.isInteger(row.verified_through_year) && row.year_from > row.verified_through_year) reportError(`${label}: 検証済み年式範囲が逆転しています`);
      if (!row.source_url) reportError(`${label}: source_url がありません`);
      if (row.detail_confirmation_required !== true) reportError(`${label}: detail_confirmation_required が true ではありません`);
      const rangeKey = JSON.stringify([row.maker, row.model, row.model_codes, row.engine_codes, row.year_from, row.year_to]);
      if (vehicleYearRanges.has(rangeKey)) reportError(`${label}: 同一の年式範囲が重複しています`);
      vehicleYearRanges.add(rangeKey);
    }

    if (file === "obd-monitor-definitions.json") {
      if (!isNonEmptyString(row.label)) reportError(`${label}: label がありません`);
      if (!isNonEmptyString(row.category)) reportError(`${label}: category がありません`);
      if (!["number", "text"].includes(row.value_type)) reportError(`${label}: value_type が number/text ではありません`);
      if (!isNonEmptyStringArray(row.aliases)) reportError(`${label}: aliases がありません`);
      if (!["standard-generic", "extended-readonly-candidate"].includes(row.scope)) reportError(`${label}: scope が不正です`);
      if (!isNonEmptyString(row.support_note)) reportError(`${label}: support_note がありません`);
      if (!isNonEmptyString(row.source_ref)) reportError(`${label}: source_ref がありません`);
      if (row.scope === "standard-generic") {
        if (!/^[0-9A-F]{2}$/.test(row.service || "")) reportError(`${label}: standard-generic の service が不正です`);
        if (!/^[0-9A-F]{2}$/.test(row.pid || "")) reportError(`${label}: standard-generic の pid が不正です`);
      }
      if (row.scope === "extended-readonly-candidate" && (row.service !== null || row.pid !== null)) {
        reportError(`${label}: 拡張候補の service/pid は確定前のため null にしてください`);
      }
      for (const alias of row.aliases || []) {
        const normalizedAlias = alias.toLowerCase()
          .replace(/[（(].*?[）)]/g, "")
          .replace(/[_-]/g, " ")
          .replace(/\s+/g, " ")
          .trim();
        const existingId = monitorAliases.get(normalizedAlias);
        if (existingId && existingId !== row.id) {
          reportError(`${label}: alias ${alias} が ${existingId} と重複しています`);
        }
        monitorAliases.set(normalizedAlias, row.id);
      }
    }

    if (file === "obd-freeze-frame-items-2026.json") {
      if (!isNonEmptyString(row.monitor_id)) reportError(`${label}: monitor_id がありません`);
      if (!monitorDefinitionIds.has(row.monitor_id)) reportError(`${label}: 未登録の monitor_id ${row.monitor_id} があります`);
      const monitorDefinition = monitorDefinitionsById.get(row.monitor_id);
      if (monitorDefinition && monitorDefinition.pid !== row.pid) {
        reportError(`${label}: freeze-frame pid ${row.pid} does not match monitor definition pid ${monitorDefinition.pid}`);
      }
      if (!isNonEmptyString(row.label)) reportError(`${label}: label がありません`);
      if (row.service !== "02") reportError(`${label}: service は 02 にしてください`);
      if (!/^[0-9A-F]{2}$/.test(row.pid || "")) reportError(`${label}: pid が不正です`);
      if (!Number.isInteger(row.priority)) reportError(`${label}: priority が整数ではありません`);
      if (!isNonEmptyString(row.purpose)) reportError(`${label}: purpose がありません`);
      if (!isNonEmptyString(row.interpretation_note)) reportError(`${label}: interpretation_note がありません`);
      if (row.service_manual_required !== true) reportError(`${label}: service_manual_required が true ではありません`);
      if (!hasHttpsSourceUrl(row.source_url)) reportError(`${label}: freeze-frame source_url must be HTTPS`);
      if (!isIsoDate(row.source_date)) reportError(`${label}: freeze-frame source_date must be ISO date`);
    }

    if (file === "obd-readiness-monitors-2026.json") {
      if (!isNonEmptyString(row.label)) reportError(`${label}: label がありません`);
      if (!isNonEmptyString(row.category)) reportError(`${label}: category がありません`);
      if (!isNonEmptyStringArray(row.applies_to)) reportError(`${label}: applies_to がありません`);
      if (!isNonEmptyStringArray(row.status_values)) reportError(`${label}: status_values がありません`);
      if (!isNonEmptyString(row.diagnostic_use)) reportError(`${label}: diagnostic_use がありません`);
      if (!isNonEmptyString(row.not_complete_note)) reportError(`${label}: not_complete_note がありません`);
      if (row.service_manual_required !== true) reportError(`${label}: service_manual_required が true ではありません`);
      if (!hasHttpsSourceUrl(row.source_url)) reportError(`${label}: readiness source_url must be HTTPS`);
      if (!isIsoDate(row.source_date)) reportError(`${label}: readiness source_date must be ISO date`);
    }

    if (file === "obd-ecu-info-items-2026.json") {
      if (!isNonEmptyString(row.label)) reportError(`${label}: label がありません`);
      if (row.service !== "09") reportError(`${label}: service は 09 にしてください`);
      if (!/^[0-9A-F]{2}$/.test(row.info_type || "")) reportError(`${label}: info_type が不正です`);
      if (!["bitset", "text", "counter_set"].includes(row.value_type)) reportError(`${label}: value_type が不正です`);
      if (!isNonEmptyString(row.privacy_class)) reportError(`${label}: privacy_class がありません`);
      if (!isNonEmptyString(row.diagnostic_use)) reportError(`${label}: diagnostic_use がありません`);
      if (!isNonEmptyString(row.storage_policy)) reportError(`${label}: storage_policy がありません`);
      if (row.service_manual_required !== true) reportError(`${label}: service_manual_required が true ではありません`);
      if (!hasHttpsSourceUrl(row.source_url)) reportError(`${label}: ECU info source_url must be HTTPS`);
      if (!isIsoDate(row.source_date)) reportError(`${label}: ECU info source_date must be ISO date`);
    }

    if (file.startsWith("diagnostic-workflows") && "monitor_ids" in row) {
      if (!isNonEmptyStringArray(row.monitor_ids)) reportError(`${label}: monitor_ids がありません`);
      if (new Set(row.monitor_ids || []).size !== (row.monitor_ids || []).length) reportError(`${label}: monitor_ids に重複があります`);
      for (const monitorId of row.monitor_ids || []) {
        if (!monitorDefinitionIds.has(monitorId)) reportError(`${label}: 未登録の monitor_id ${monitorId} があります`);
      }
      if (!isNonEmptyStringArray(row.monitor_observation_conditions)) {
        reportError(`${label}: monitor_observation_conditions がありません`);
      }
      if (!isNonEmptyString(row.monitor_interpretation_note)) {
        reportError(`${label}: monitor_interpretation_note がありません`);
      }
    }

    if (file === "diagnostic-coverage-roadmap-2026.json") {
      if (!isNonEmptyString(row.label)) reportError(`${label}: label がありません`);
      if (!isNonEmptyString(row.coverage_area)) reportError(`${label}: coverage_area がありません`);
      if (!Number.isInteger(row.priority)) reportError(`${label}: priority が整数ではありません`);
      if (!isNonEmptyStringArray(row.next_actions)) reportError(`${label}: next_actions がありません`);
      if (!Array.isArray(row.blocked_until)) reportError(`${label}: blocked_until は配列にしてください`);
      if (row.service_manual_required !== true) reportError(`${label}: service_manual_required が true ではありません`);
    }

    if (file === "diagnostic-capability-status-2026.json") {
      if (!isNonEmptyString(row.label)) reportError(`${label}: label がありません`);
      if (!isNonEmptyString(row.target_level)) reportError(`${label}: target_level がありません`);
      if (!Number.isInteger(row.progress_percent) || row.progress_percent < 0 || row.progress_percent > 100) {
        reportError(`${label}: progress_percent は0-100の整数にしてください`);
      }
      if (!isNonEmptyStringArray(row.done)) reportError(`${label}: done がありません`);
      if (!isNonEmptyStringArray(row.missing)) reportError(`${label}: missing がありません`);
      if (!isNonEmptyString(row.safety_gate)) reportError(`${label}: safety_gate がありません`);
    }
  }
}

const vehicleInputRows = JSON.parse(fs.readFileSync(path.join(dataDir, "vehicle-input-options.json"), "utf8"));
const vehicleYearRows = JSON.parse(fs.readFileSync(path.join(dataDir, "vehicle-year-ranges-domestic-2026.json"), "utf8"));
const vehicleInputByKey = new Map(
  vehicleInputRows
    .filter((row) => row.model)
    .map((row) => [`${row.maker}::${row.model}`, row])
);

for (const [index, row] of vehicleYearRows.entries()) {
  const label = `vehicle-year-ranges-domestic-2026.json[${index}]`;
  const vehicleKey = `${row.maker}::${row.model}`;
  const inputOption = vehicleInputByKey.get(vehicleKey);
  if (!inputOption) {
    reportError(`${label}: vehicle-input-options.json に ${vehicleKey} がありません`);
    continue;
  }
  for (const modelCode of row.model_codes || []) {
    if (!inputOption.model_codes.includes(modelCode)) reportError(`${label}: ${vehicleKey} の型式 ${modelCode} が入力候補にありません`);
  }
  for (const engineCode of row.engine_codes || []) {
    if (!inputOption.engine_codes.includes(engineCode)) reportError(`${label}: ${vehicleKey} のエンジン型式 ${engineCode} が入力候補にありません`);
  }
}

const codeLocations = new Map();
for (const row of codeRows) {
  const codeKey = `${row.code}:${row.subcode || ""}`;
  const locations = codeLocations.get(codeKey) || [];
  locations.push(row);
  codeLocations.set(codeKey, locations);
}

for (const [code, rows] of codeLocations.entries()) {
  if (rows.length < 2) continue;
  const files = new Set(rows.map((row) => row.file));
  const allowedLegacyOverlap = allowedLegacyDtcOverlaps.has(code)
    && rows.length === 2
    && files.has("obd-codes.json")
    && [...files].some((file) => /^generic-obd-codes-modern(?:-2026(?:-part\d+)?)?\.json$/.test(file));
  if (!allowedLegacyOverlap && !hasDisjointSourceSpecificDtcDefinitions(rows)) {
    reportError(`${code}: 同一DTCとサブコードの定義が重複しています: ${rows.map((row) => `${row.file}:${row.id}`).join(", ")}`);
  }
}

console.log(`JSON files: ${jsonFiles.length}`);
console.log(`DTC records: ${codeRows.length}`);
console.log(`Errors: ${errors.length}`);
console.log(`Warnings: ${warnings.length}`);
warnings.forEach((warning) => console.log(`WARN ${warning}`));
errors.forEach((error) => console.error(`ERROR ${error}`));

if (errors.length) process.exit(1);
