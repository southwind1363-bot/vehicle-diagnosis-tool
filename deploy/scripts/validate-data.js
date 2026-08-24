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

function isDtcVehicleModelYearScope(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value)
    && isNonEmptyStringArray(value.models)
    && Number.isInteger(value.year_from)
    && Number.isInteger(value.year_to)
    && value.year_from >= 1900
    && value.year_to >= value.year_from
    && value.year_to <= 2100);
}

function getDtcVehicleFilterScopes(value) {
  const scopedRanges = Array.isArray(value?.model_year_scopes)
    ? value.model_year_scopes
    : Array.isArray(value?.modelYearScopes) ? value.modelYearScopes : null;
  if (scopedRanges) return scopedRanges;
  return [{ models: value?.models, year_from: value?.year_from, year_to: value?.year_to }];
}

function isDtcVehicleFilter(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  if (!isNonEmptyStringArray(value.makers)) return false;
  if (value.scope_confirmation_required !== undefined && typeof value.scope_confirmation_required !== "boolean") return false;
  const scopes = getDtcVehicleFilterScopes(value);
  return scopes.length > 0 && scopes.every(isDtcVehicleModelYearScope);
}

function getDtcVehicleFilterModelCodes(value) {
  const modelCodes = Array.isArray(value?.model_codes)
    ? value.model_codes
    : Array.isArray(value?.modelCodes) ? value.modelCodes : [value?.model_code ?? value?.modelCode ?? value?.chassis_code ?? value?.chassisCode];
  return modelCodes.filter(isNonEmptyString);
}

function dtcVehicleFiltersOverlap(left, right) {
  if (!isDtcVehicleFilter(left) || !isDtcVehicleFilter(right)) return true;
  const normalize = (value) => String(value || "").trim().toLocaleLowerCase("en-US");
  const normalizeModel = (value) => normalize(value).replace(/[\s_-]+/g, "");
  const leftMakers = new Set(left.makers.map(normalize));
  const sameMaker = right.makers.some((value) => leftMakers.has(normalize(value)));
  if (!sameMaker) return false;
  const leftModelCodes = new Set(getDtcVehicleFilterModelCodes(left).map(normalizeModel));
  const rightModelCodes = getDtcVehicleFilterModelCodes(right).map(normalizeModel);
  const sameModelCode = !leftModelCodes.size || !rightModelCodes.length || rightModelCodes.some((value) => leftModelCodes.has(value));
  if (!sameModelCode) return false;
  return getDtcVehicleFilterScopes(left).some((leftScope) => {
    const leftModels = new Set(leftScope.models.map(normalizeModel));
    return getDtcVehicleFilterScopes(right).some((rightScope) => {
      const sameModel = rightScope.models.some((value) => leftModels.has(normalizeModel(value)));
      const overlappingYears = Math.max(leftScope.year_from, rightScope.year_from) <= Math.min(leftScope.year_to, rightScope.year_to);
      return sameModel && overlappingYears;
    });
  });
}

function hasDisjointSourceSpecificDtcDefinitions(rows) {
  if (!Array.isArray(rows) || rows.length < 2) return false;
  if (!rows.every((row) => row.file === "imported-verified-dtc.json" && row.imported_definition_only === true && isDtcVehicleFilter(row.vehicle_filter))) return false;
  return rows.every((row, index) => rows.slice(index + 1).every((other) => !dtcVehicleFiltersOverlap(row.vehicle_filter, other.vehicle_filter)));
}

const disjointSourceSpecificDtcFixture = [
  { file: "imported-verified-dtc.json", imported_definition_only: true, vehicle_filter: { makers: ["Test"], models: ["Model"], year_from: 2025, year_to: 2025, scope_confirmation_required: true } },
  { file: "imported-verified-dtc.json", imported_definition_only: true, vehicle_filter: { makers: ["Test"], models: ["Model"], year_from: 2026, year_to: 2026, scope_confirmation_required: true } }
];
if (!hasDisjointSourceSpecificDtcDefinitions(disjointSourceSpecificDtcFixture)
  || hasDisjointSourceSpecificDtcDefinitions([
    ...disjointSourceSpecificDtcFixture.slice(0, 1),
    { file: "imported-verified-dtc.json", imported_definition_only: true, vehicle_filter: { makers: ["Test"], models: ["Model"], year_from: 2025, year_to: 2026, scope_confirmation_required: true } }
  ])) {
  reportError("Source-specific DTC overlap validation is not enforcing disjoint vehicle-year scopes");
}

const disjointModelCodeDtcFixture = [
  { file: "imported-verified-dtc.json", imported_definition_only: true, vehicle_filter: { makers: ["Test"], models: ["Model"], model_codes: ["AA1"], year_from: 2025, year_to: 2025, scope_confirmation_required: true } },
  { file: "imported-verified-dtc.json", imported_definition_only: true, vehicle_filter: { makers: ["Test"], models: ["Model"], model_codes: ["BB2"], year_from: 2025, year_to: 2025, scope_confirmation_required: true } }
];
if (!hasDisjointSourceSpecificDtcDefinitions(disjointModelCodeDtcFixture)
  || hasDisjointSourceSpecificDtcDefinitions([
    ...disjointModelCodeDtcFixture.slice(0, 1),
    { file: "imported-verified-dtc.json", imported_definition_only: true, vehicle_filter: { makers: ["Test"], models: ["Model"], model_codes: ["AA1"], year_from: 2025, year_to: 2025, scope_confirmation_required: true } }
  ])) {
  reportError("Source-specific DTC overlap validation is not enforcing disjoint model-code scopes");
}

function hasScopedGenericSourceSpecificDtcDefinitions(rows) {
  if (!Array.isArray(rows) || rows.length < 2) return false;
  const genericRows = rows.filter((row) => row.file === "obd-codes.json"
    || /^generic-obd-codes-modern(?:-2026(?:-part\d+)?)?\.json$/.test(row.file));
  const sourceSpecificRows = rows.filter((row) => row.file === "imported-verified-dtc.json"
    && row.imported_definition_only === true
    && isDtcVehicleFilter(row.vehicle_filter)
    && row.vehicle_filter.scope_confirmation_required === true);
  return genericRows.length === 1
    && sourceSpecificRows.length === rows.length - 1
    && sourceSpecificRows.every((row, index) => sourceSpecificRows.slice(index + 1).every((other) => !dtcVehicleFiltersOverlap(row.vehicle_filter, other.vehicle_filter)));
}

const scopedGenericDtcOverlapFixture = [
  { file: "generic-obd-codes-modern-2026-part1.json", imported_definition_only: false, vehicle_filter: null },
  { file: "imported-verified-dtc.json", imported_definition_only: true, vehicle_filter: { makers: ["Test"], models: ["Model"], year_from: 2024, year_to: 2024, scope_confirmation_required: true } }
];
if (!hasScopedGenericSourceSpecificDtcDefinitions(scopedGenericDtcOverlapFixture)
  || hasScopedGenericSourceSpecificDtcDefinitions([
    ...scopedGenericDtcOverlapFixture.slice(0, 1),
    { file: "imported-verified-dtc.json", imported_definition_only: true, vehicle_filter: { makers: ["Test"], models: ["Model"], year_from: 2024, year_to: 2024, scope_confirmation_required: false } }
  ])
  || hasScopedGenericSourceSpecificDtcDefinitions([
    ...scopedGenericDtcOverlapFixture,
    { file: "imported-verified-dtc.json", imported_definition_only: true, vehicle_filter: { makers: ["Test"], models: ["Model"], year_from: 2024, year_to: 2024, scope_confirmation_required: true } }
  ])
  || hasScopedGenericSourceSpecificDtcDefinitions([
    ...scopedGenericDtcOverlapFixture,
    { file: "generic-obd-codes-modern-2026-part2.json", imported_definition_only: false, vehicle_filter: null }
  ])
  || hasScopedGenericSourceSpecificDtcDefinitions([
    ...scopedGenericDtcOverlapFixture,
    { file: "obd-codes.json", imported_definition_only: false, vehicle_filter: null }
  ])) {
  reportError("Scoped generic/source-specific DTC overlap validation is not enforcing its safety boundary");
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
    && (/^https:\/\/saemobilus\.sae\.org\/standards\/j2012(?:da)?_/.test(url.trim())
      || /^https:\/\/webstore\.ansi\.org\/standards\/sae\/sae2012/.test(url.trim())));
}

const genericDtcPrimarySourceFixture = "https://saemobilus.sae.org/standards/j2012_202509-diagnostic-trouble-code-definitions";
const genericDtcDigitalAnnexFixture = "https://saemobilus.sae.org/standards/j2012da_202510-digital-annex-diagnostic-trouble-code-definitions-failure-type-byte-definitions";
const genericDtcNonDefinitionFixture = "https://saemobilus.sae.org/standards/j1979da_202607-j1979-da-digital-annex-e-e-diagnostic-test-modes";
if (!hasGenericDtcPrimarySource(genericDtcPrimarySourceFixture)
  || !hasGenericDtcPrimarySource([genericDtcDigitalAnnexFixture, "https://www.autel.com/example.pdf"])
  || hasGenericDtcPrimarySource(genericDtcNonDefinitionFixture)
  || hasGenericDtcPrimarySource("https://www.autel.com/example.pdf")) {
  reportError("Generic DTC primary-source validation must require J2012 or J2012DA definitions");
}

function hasNhtsaArchiveSource(value) {
  return isSourceUrl(value) && sourceUrlList(value).every((url) => isNonEmptyString(url)
    && /^https:\/\/(www\.|static\.)nhtsa\.gov\//.test(url.trim()));
}

function isIsoDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year
    && parsed.getUTCMonth() === month - 1
    && parsed.getUTCDate() === day;
}

function validateDtcStandardsReferenceRows(rows, file) {
  const validationErrors = [];
  const addError = (message) => validationErrors.push(`${file}: ${message}`);
  const j2012daRows = [];

  for (const [index, row] of rows.entries()) {
    const label = `[${index}]`;
    for (const field of ["id", "title", "reference_type", "summary", "source"]) {
      if (!isNonEmptyString(row?.[field])) addError(`${label} ${field} is missing`);
    }
    if (!isNonEmptyString(row?.source_url)) {
      addError(`${label} source_url must be one official HTTPS URL`);
    } else {
      try {
        const sourceUrl = new URL(row.source_url);
        if (sourceUrl.protocol !== "https:") addError(`${label} source_url must use HTTPS`);
        if (String(row.id || "").startsWith("sae-")
          && (sourceUrl.hostname !== "saemobilus.sae.org" || !sourceUrl.pathname.startsWith("/standards/"))) {
          addError(`${label} SAE reference must use the official SAE Mobilus standards URL`);
        }
        if (String(row.id || "").startsWith("naltec-")
          && !["obd.naltec.go.jp", "www.obd.naltec.go.jp"].includes(sourceUrl.hostname)) {
          addError(`${label} NALTEC reference must use the official OBD inspection portal URL`);
        }
      } catch {
        addError(`${label} source_url is invalid`);
      }
    }
    if (!isIsoDate(row?.source_date)) addError(`${label} source_date must be an ISO calendar date`);
    if (!isIsoDate(row?.last_verified_date)) addError(`${label} last_verified_date must be an ISO calendar date`);
    if (isIsoDate(row?.source_date) && isIsoDate(row?.last_verified_date)
      && row.last_verified_date < row.source_date) {
      addError(`${label} last_verified_date predates source_date`);
    }
    if (row?.service_manual_required !== true) addError(`${label} service_manual_required must be true`);
    if (String(row?.id || "").startsWith("sae-j2012da-")) j2012daRows.push({ row, index });
  }

  const currentRows = j2012daRows.filter(({ row }) => row.edition_status === "current");
  const historicalRows = j2012daRows.filter(({ row }) => row.edition_status === "historical");
  const invalidStatusRows = j2012daRows.filter(({ row }) => !["current", "historical"].includes(row.edition_status));
  if (j2012daRows.length && currentRows.length !== 1) {
    addError(`J2012DA must have exactly one current edition; found ${currentRows.length}`);
  }
  for (const { index } of invalidStatusRows) addError(`[${index}] J2012DA edition_status must be current or historical`);

  const current = currentRows[0]?.row;
  const currentEdition = current?.title?.match(/\b(J2012DA_\d{6})\b/)?.[1] || "";
  if (current && !currentEdition) addError(`[${currentRows[0].index}] current J2012DA title must include its edition code`);
  for (const { row, index } of currentRows) {
    if (row.superseded_by !== undefined) addError(`[${index}] current J2012DA must not declare superseded_by`);
  }

  for (const { row, index } of j2012daRows) {
    const edition = row.title?.match(/\b(J2012DA_\d{6})\b/)?.[1] || "";
    if (!edition) addError(`[${index}] J2012DA title must include its edition code`);
    if (edition && isNonEmptyString(row.source_url) && !row.source_url.toLowerCase().includes(edition.toLowerCase())) {
      addError(`[${index}] J2012DA source_url does not match ${edition}`);
    }
  }
  for (const { row, index } of historicalRows) {
    if (!currentEdition || row.superseded_by !== currentEdition) {
      addError(`[${index}] historical J2012DA superseded_by must reference ${currentEdition || "the current edition"}`);
    }
    if (current && isIsoDate(row.source_date) && isIsoDate(current.source_date) && row.source_date >= current.source_date) {
      addError(`[${index}] historical J2012DA source_date must predate the current edition`);
    }
  }

  return validationErrors;
}

if (!isIsoDate("2024-02-29") || isIsoDate("2025-02-29") || isIsoDate("2026-13-01") || isIsoDate("2026-04-31")) {
  reportError("ISO date validation must reject non-calendar source and verification dates");
}

const dtcStandardsReferenceFixture = [
  {
    id: "sae-j2012da-current-test",
    title: "SAE J2012DA_202607 Digital Annex",
    reference_type: "licensed_dataset",
    edition_status: "current",
    summary: "fixture",
    source: "SAE International",
    source_url: "https://saemobilus.sae.org/standards/j2012da_202607-fixture",
    source_date: "2026-07-29",
    last_verified_date: "2026-08-22",
    service_manual_required: true
  },
  {
    id: "sae-j2012da-historical-test",
    title: "SAE J2012DA_202510 Digital Annex",
    reference_type: "licensed_dataset",
    edition_status: "historical",
    superseded_by: "J2012DA_202607",
    summary: "fixture",
    source: "SAE International",
    source_url: "https://saemobilus.sae.org/standards/j2012da_202510-fixture",
    source_date: "2025-10-24",
    last_verified_date: "2026-08-22",
    service_manual_required: true
  }
];
const validDtcStandardsFixtureErrors = validateDtcStandardsReferenceRows(dtcStandardsReferenceFixture, "fixture");
const invalidDtcStandardsFixture = dtcStandardsReferenceFixture.map((row) => ({ ...row }));
invalidDtcStandardsFixture[0].source_url = "http://example.com/j2012da_202607";
invalidDtcStandardsFixture[1].edition_status = "current";
invalidDtcStandardsFixture[1].superseded_by = "J2012DA_202510";
const invalidDtcStandardsFixtureErrors = validateDtcStandardsReferenceRows(invalidDtcStandardsFixture, "fixture");
const invalidDtcStandardsHistoryFixture = dtcStandardsReferenceFixture.map((row) => ({ ...row }));
invalidDtcStandardsHistoryFixture[1].superseded_by = "J2012DA_202510";
invalidDtcStandardsHistoryFixture[1].source_date = "2026-07-29";
invalidDtcStandardsHistoryFixture[1].source_url = "https://saemobilus.sae.org/standards/j2012da_202607-fixture";
const invalidDtcStandardsHistoryErrors = validateDtcStandardsReferenceRows(invalidDtcStandardsHistoryFixture, "fixture");
if (validDtcStandardsFixtureErrors.length
  || !invalidDtcStandardsFixtureErrors.some((message) => message.includes("official SAE Mobilus"))
  || !invalidDtcStandardsFixtureErrors.some((message) => message.includes("exactly one current edition"))
  || !invalidDtcStandardsFixtureErrors.some((message) => message.includes("must not declare superseded_by"))
  || !invalidDtcStandardsHistoryErrors.some((message) => message.includes("superseded_by must reference"))
  || !invalidDtcStandardsHistoryErrors.some((message) => message.includes("must predate the current edition"))
  || !invalidDtcStandardsHistoryErrors.some((message) => message.includes("source_url does not match"))) {
  reportError("DTC standards reference validation must enforce official source and edition lineage");
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
  const freezeFramePids = new Set();
  const freezeFramePriorities = new Set();
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
      if (!hasHttpsSourceUrl(row.source_url) || !hasGenericDtcPrimarySource(row.source_url)) {
        reportError(`${label}: generic 2026 DTC requires an HTTPS SAE J2012/J2012DA or ANSI J2012 primary-standard source_url`);
      }
      if (!isIsoDate(row.source_date)) reportError(`${label}: generic 2026 DTC source_date is invalid`);
      if (!isIsoDate(row.last_verified_date)) reportError(`${label}: generic 2026 DTC last_verified_date is invalid`);
      if (isIsoDate(row.source_date) && isIsoDate(row.last_verified_date) && row.last_verified_date < row.source_date) {
        reportError(`${label}: generic 2026 DTC last_verified_date predates source_date`);
      }
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
      if (!hasNhtsaArchiveSource(row.source_url)) {
        reportError(`${label}: verified imported DTC requires an NHTSA archive source_url`);
      }
      if (!isIsoDate(row.source_date)) reportError(`${label}: verified imported DTC source_date is invalid`);
      if (!isIsoDate(row.last_verified_date)) reportError(`${label}: verified imported DTC last_verified_date is invalid`);
      if (isIsoDate(row.source_date) && isIsoDate(row.last_verified_date) && row.last_verified_date < row.source_date) {
        reportError(`${label}: verified imported DTC last_verified_date predates source_date`);
      }
      if (row.service_manual_required !== true) reportError(`${label}: verified imported DTC must require the service manual`);
      if (row.imported_definition_only !== true) reportError(`${label}: verified imported DTC must be definition-only`);
      if (row.applicability_note && !isDtcVehicleFilter(row.vehicle_filter)) {
        reportError(`${label}: applicability_note がある verified imported DTC には makers と有効な vehicle_filter 年式範囲が必要です`);
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

    if (file === "pid-reference-thresholds-2026.json") {
      const scope = row.vehicle_scope;
      if (!isNonEmptyString(row.id)) reportError(`${label}: id がありません`);
      if (!isNonEmptyString(row.pid_id) || !monitorDefinitionIds.has(row.pid_id)) reportError(`${label}: pid_id がOBDモニター辞書にありません`);
      if (!isNonEmptyString(row.unit)) reportError(`${label}: unit がありません`);
      if (row.comparison_type !== "absolute_delta_max") reportError(`${label}: comparison_type が不正です`);
      if (!Number.isFinite(row.absolute_delta_max) || row.absolute_delta_max < 0) reportError(`${label}: absolute_delta_max が不正です`);
      if (row.reference_semantics !== "post_repair_absolute_delta") reportError(`${label}: reference_semantics が不正です`);
      if (!scope || !isNonEmptyStringArray(scope.makers) || !isNonEmptyStringArray(scope.models) || !isNonEmptyStringArray(scope.engine_codes)) reportError(`${label}: vehicle_scope のメーカー・車種・エンジンが不足しています`);
      if (!Number.isInteger(scope?.year_from) || !Number.isInteger(scope?.year_to) || scope.year_from > scope.year_to) reportError(`${label}: vehicle_scope の年式範囲が不正です`);
      if (!isNonEmptyStringArray(row.observation_conditions) || row.observation_conditions.some((value) => !["cold", "warm", "symptom_reproduced", "post_repair"].includes(value))) reportError(`${label}: observation_conditions が不正です`);
      if (row.required_operating_state !== undefined) {
        const operatingState = row.required_operating_state;
        if (!operatingState || typeof operatingState !== "object" || Array.isArray(operatingState)) {
          reportError(`${label}: required_operating_state が不正です`);
        } else {
          const hasMotion = operatingState.vehicle_motion !== undefined;
          const hasTransmission = operatingState.transmission_positions !== undefined;
          const hasAccessoryLoad = operatingState.accessory_load !== undefined;
          if (!hasMotion && !hasTransmission && !hasAccessoryLoad) reportError(`${label}: required_operating_state に条件がありません`);
          if (hasMotion && !["stationary", "moving"].includes(operatingState.vehicle_motion)) reportError(`${label}: vehicle_motion が不正です`);
          if (hasTransmission && (!isNonEmptyStringArray(operatingState.transmission_positions) || operatingState.transmission_positions.some((value) => !["park", "neutral", "drive", "reverse", "other"].includes(value)))) reportError(`${label}: transmission_positions が不正です`);
          if (hasAccessoryLoad && !["off", "on"].includes(operatingState.accessory_load)) reportError(`${label}: accessory_load が不正です`);
        }
      }
      if (row.required_measurements !== undefined) {
        if (!Array.isArray(row.required_measurements) || row.required_measurements.length > 8) {
          reportError(`${label}: required_measurements が不正です`);
        } else {
          const measurementKeys = new Set();
          for (const measurement of row.required_measurements) {
            const measurementLabel = `${label}: required_measurements`;
            if (!isNonEmptyString(measurement?.pid_id) || !monitorDefinitionIds.has(measurement.pid_id)) reportError(`${measurementLabel}: pid_id がOBDモニター辞書にありません`);
            if (!isNonEmptyString(measurement?.unit)) reportError(`${measurementLabel}: unit がありません`);
            if (!Number.isFinite(measurement?.min_value) || !Number.isFinite(measurement?.max_value) || measurement.min_value > measurement.max_value) reportError(`${measurementLabel}: 値範囲が不正です`);
            const measurementKey = `${measurement?.pid_id}|${String(measurement?.unit || "").toLowerCase()}`;
            if (measurementKeys.has(measurementKey)) reportError(`${measurementLabel}: ${measurementKey} が重複しています`);
            measurementKeys.add(measurementKey);
          }
        }
      }
      if (!isNonEmptyString(row.source_url) || !row.source_url.startsWith("https://")) reportError(`${label}: HTTPS source_url がありません`);
      if (!isNonEmptyString(row.source_locator)) reportError(`${label}: source_locator がありません`);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(row.source_date || "")) reportError(`${label}: source_date が不正です`);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(row.last_verified_date || "")) reportError(`${label}: last_verified_date が不正です`);
      if (!isNonEmptyString(row.applicability_note)) reportError(`${label}: applicability_note がありません`);
    }

    if (file === "obd-freeze-frame-items-2026.json") {
      if (!isNonEmptyString(row.monitor_id)) reportError(`${label}: monitor_id がありません`);
      if (!monitorDefinitionIds.has(row.monitor_id)) reportError(`${label}: 未登録の monitor_id ${row.monitor_id} があります`);
      const monitorDefinition = monitorDefinitionsById.get(row.monitor_id);
      if (monitorDefinition && monitorDefinition.pid !== row.pid) {
        reportError(`${label}: freeze-frame pid ${row.pid} does not match monitor definition pid ${monitorDefinition.pid}`);
      }
      if (freezeFramePids.has(row.pid)) reportError(`${label}: freeze-frame pid ${row.pid} is duplicated`);
      freezeFramePids.add(row.pid);
      if (freezeFramePriorities.has(row.priority)) reportError(`${label}: freeze-frame priority ${row.priority} is duplicated`);
      freezeFramePriorities.add(row.priority);
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

  if (file === "dtc-standards-reference-2026.json") {
    validateDtcStandardsReferenceRows(rows, file).forEach(reportError);
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
  if (!allowedLegacyOverlap && !hasDisjointSourceSpecificDtcDefinitions(rows) && !hasScopedGenericSourceSpecificDtcDefinitions(rows)) {
    reportError(`${code}: 同一DTCとサブコードの定義が重複しています: ${rows.map((row) => `${row.file}:${row.id}`).join(", ")}`);
  }
}

const coverageDtcFiles = new Set(jsonFiles.filter((file) => file === "obd-codes.json"
  || file === "imported-verified-dtc.json"
  || /^generic-obd-codes-modern-2026(?:-part\d+)?\.json$/.test(file)));
const coverageDtcRows = codeRows.filter((row) => coverageDtcFiles.has(row.file) && isDtc(row.code));
const coverageDefinitionKeys = new Set(coverageDtcRows.map((row) => `${row.code}:${row.subcode || ""}`));
const coverageParentCodes = new Set(coverageDtcRows.map((row) => row.code));
const powertrainDefinitionCount = [...coverageDefinitionKeys].filter((key) => key.startsWith("P")).length;
const powertrainParentCodeCount = [...coverageParentCodes].filter((code) => code.startsWith("P")).length;
const networkDefinitionCount = [...coverageDefinitionKeys].filter((key) => key.startsWith("U")).length;
const networkParentCodeCount = [...coverageParentCodes].filter((code) => code.startsWith("U")).length;
const importedBodyRows = codeRows.filter((row) => row.file === "imported-verified-dtc.json" && /^B/.test(row.code));
const importedBodySourceDefinitionCount = importedBodyRows.length;
const bodyDefinitionCount = [...coverageDefinitionKeys].filter((key) => key.startsWith("B")).length;
const bodyParentCodeCount = [...coverageParentCodes].filter((code) => code.startsWith("B")).length;
const importedChassisRows = codeRows.filter((row) => row.file === "imported-verified-dtc.json" && /^C/.test(row.code));
const importedChassisSourceDefinitionCount = importedChassisRows.length;
const chassisDefinitionCount = [...coverageDefinitionKeys].filter((key) => key.startsWith("C")).length;
const chassisParentCodeCount = [...coverageParentCodes].filter((code) => code.startsWith("C")).length;
const coverageRoadmap = JSON.parse(fs.readFileSync(path.join(dataDir, "diagnostic-coverage-roadmap-2026.json"), "utf8"));
const diagnosticCapabilityStatus = JSON.parse(fs.readFileSync(path.join(dataDir, "diagnostic-capability-status-2026.json"), "utf8"));
const bodyCoverageRoadmap = coverageRoadmap.find((row) => row.id === "coverage-body-b");
const chassisCoverageRoadmap = coverageRoadmap.find((row) => row.id === "coverage-chassis-c");
const genericDtcCapability = diagnosticCapabilityStatus.find((row) => row.id === "capability-generic-obd2-dtc");
const powertrainCoverageRoadmap = coverageRoadmap.find((row) => row.id === "coverage-generic-powertrain-p");
const networkCoverageRoadmap = coverageRoadmap.find((row) => row.id === "coverage-network-u");
const powertrainParentCountLabel = `P\u7cfb\u89aaDTC ${powertrainParentCodeCount}\u4ef6`;
const powertrainDefinitionCountLabel = `\u500b\u5225DTC\u5b9a\u7fa9${powertrainDefinitionCount}\u4ef6`;
const networkParentCountLabel = `U\u7cfb\u89aaDTC ${networkParentCodeCount}\u4ef6`;
const networkDefinitionCountLabel = `\u500b\u5225DTC\u5b9a\u7fa9${networkDefinitionCount}\u4ef6`;
if (!powertrainCoverageRoadmap || !String(powertrainCoverageRoadmap.current_count_note || "").includes(powertrainParentCountLabel) || !String(powertrainCoverageRoadmap.current_count_note || "").includes(powertrainDefinitionCountLabel)) {
  reportError("Powertrain DTC roadmap count does not match the data set");
}
if (!networkCoverageRoadmap || !String(networkCoverageRoadmap.current_count_note || "").includes(networkParentCountLabel) || !String(networkCoverageRoadmap.current_count_note || "").includes(networkDefinitionCountLabel)) {
  reportError("Network DTC roadmap count does not match the data set");
}
if (!bodyCoverageRoadmap || !String(bodyCoverageRoadmap.current_count_note || "").includes(`親DTC ${bodyParentCodeCount}件`) || !String(bodyCoverageRoadmap.current_count_note || "").includes(`出典定義${importedBodySourceDefinitionCount}件`) || !String(bodyCoverageRoadmap.current_count_note || "").includes(`一意サブコード定義${bodyDefinitionCount}件`)) {
  reportError("B系ロードマップのDTC件数が実データ集計と一致しません");
}
if (!chassisCoverageRoadmap || !String(chassisCoverageRoadmap.current_count_note || "").includes(`親DTC ${chassisParentCodeCount}件`) || !String(chassisCoverageRoadmap.current_count_note || "").includes(`個別DTC定義${chassisDefinitionCount}件`) || !String(chassisCoverageRoadmap.current_count_note || "").includes(`出典限定${importedChassisSourceDefinitionCount}件`)) {
  reportError("C系ロードマップのDTC件数が実データ集計と一致しません");
}
if (!genericDtcCapability || !String(genericDtcCapability.current_basis || "").includes(`P系${powertrainParentCodeCount}件`) || !String(genericDtcCapability.current_basis || "").includes(`U系${networkParentCodeCount}件`) || !String(genericDtcCapability.current_basis || "").includes(`B系${bodyParentCodeCount}件`) || !String(genericDtcCapability.current_basis || "").includes(`C系${chassisParentCodeCount}件`) || !String(genericDtcCapability.current_basis || "").includes(`個別DTC定義${coverageDefinitionKeys.size}件`)) {
  reportError("汎用OBD2 DTC能力表示の件数が実データ集計と一致しません");
}

console.log(`JSON files: ${jsonFiles.length}`);
console.log(`DTC records: ${codeRows.length}`);
console.log(`Errors: ${errors.length}`);
console.log(`Warnings: ${warnings.length}`);
warnings.forEach((warning) => console.log(`WARN ${warning}`));
errors.forEach((error) => console.error(`ERROR ${error}`));

if (errors.length) process.exit(1);
