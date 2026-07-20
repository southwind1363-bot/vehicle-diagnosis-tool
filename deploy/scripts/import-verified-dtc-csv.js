import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = parseArgs(process.argv.slice(2));
const requiredArgs = ["input", "source", "source-url", "source-date"];

for (const name of requiredArgs) {
  if (!args[name]) fail(`--${name} が必要です`);
}

const source = requireNonEmptyString(args.source, "--source");
const sourceUrl = normalizeSourceUrl(args["source-url"]);
const sourceDate = normalizeSourceDate(args["source-date"]);

const inputPath = path.resolve(process.cwd(), args.input);
const outputPath = path.resolve(projectRoot, args.output || "data/imported-verified-dtc.json");
const raw = fs.readFileSync(inputPath, "utf8").replace(/^\uFEFF/, "");
const rows = parseCsv(raw);

if (rows.length < 2) fail("CSVにヘッダーとデータ行が必要です");

const headers = rows[0].map(normalizeHeader);
const codeIndex = findHeader(headers, ["code", "dtc", "dtccode", "故障コード", "コード"]);
const titleIndex = findHeader(headers, ["title", "description", "dtcdescription", "definition", "定義", "名称"]);
const systemIndex = findHeader(headers, ["system", "category", "系統"]);

if (codeIndex < 0 || titleIndex < 0) {
  fail("CSVには code と title に相当する列が必要です");
}

const seen = new Set();
const imported = [];
const errors = [];

for (const [offset, row] of rows.slice(1).entries()) {
  const line = offset + 2;
  const code = String(row[codeIndex] || "").trim().toUpperCase();
  const title = String(row[titleIndex] || "").trim();
  const system = String(row[systemIndex] || "").trim();

  if (!code && !title) continue;
  if (!/^[PBCU][0-9A-F]{4}$/.test(code)) {
    errors.push(`line ${line}: DTC形式が不正です: ${code || "(empty)"}`);
    continue;
  }
  if (!title) {
    errors.push(`line ${line}: title が空です: ${code}`);
    continue;
  }
  if (seen.has(code)) {
    errors.push(`line ${line}: CSV内でDTCが重複しています: ${code}`);
    continue;
  }

  seen.add(code);
  imported.push({
    id: `verified-import-${code.toLowerCase()}`,
    code,
    title,
    system: system || "正式定義確認済み / 診断手順未登録",
    possible_causes: [],
    check_order: [
      "DTC消去前に状態、フリーズフレーム、同時DTCを保存する",
      "車種、年式、エンジン型式を確認する",
      "原因候補、端子番号、基準値、診断順はメーカー整備書で確認する"
    ],
    measurement_points: ["DTC状態", "フリーズフレーム", "同時DTC", "12V電圧"],
    common_mistakes: ["正式名称だけで原因部品を断定しない"],
    required_tools: ["対応スキャンツール", "メーカー整備書"],
    safety_notes: ["安全に関わる系統は作業を中止し、メーカー指定手順を優先する"],
    confidence: "定義確認済み・診断手順未登録",
    source,
    source_url: sourceUrl,
    source_date: sourceDate,
    last_verified_date: new Date().toISOString().slice(0, 10),
    service_manual_required: true,
    imported_definition_only: true
  });
}

if (errors.length) {
  errors.forEach((message) => console.error(`ERROR ${message}`));
  fail(`取込を中止しました。エラー: ${errors.length}件`);
}

console.log(`Input rows: ${rows.length - 1}`);
console.log(`Validated DTC definitions: ${imported.length}`);
console.log(`Output: ${outputPath}`);

if (!args.write) {
  console.log("Dry run only. JSONは変更していません。書き込む場合は --write を付けて再実行してください。");
  process.exit(0);
}

fs.writeFileSync(outputPath, `${JSON.stringify(imported, null, 2)}\n`, "utf8");
console.log("JSONを書き込みました。npm.cmd run validate:data を実行してください。");

function parseArgs(values) {
  const result = {};
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (!value.startsWith("--")) fail(`不明な引数です: ${value}`);
    const name = value.slice(2);
    if (name === "write") {
      result.write = true;
      continue;
    }
    const next = values[index + 1];
    if (!next || next.startsWith("--")) fail(`--${name} の値が必要です`);
    result[name] = next;
    index += 1;
  }
  return result;
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (quoted && char === '"' && next === '"') {
      cell += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (!quoted && char === ",") {
      row.push(cell);
      cell = "";
    } else if (!quoted && (char === "\n" || char === "\r")) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(cell);
      if (row.some((value) => value.trim())) rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }

  if (quoted) fail("CSVの引用符が閉じていません");
  row.push(cell);
  if (row.some((value) => value.trim())) rows.push(row);
  return rows;
}

function normalizeHeader(value) {
  return String(value || "").trim().toLowerCase().replace(/[\s_-]+/g, "");
}

function findHeader(headers, candidates) {
  return headers.findIndex((header) => candidates.map(normalizeHeader).includes(header));
}

function requireNonEmptyString(value, label) {
  const normalized = String(value || "").trim();
  if (!normalized) fail(`${label} は空にできません`);
  return normalized;
}

function normalizeSourceUrl(value) {
  const sourceUrl = requireNonEmptyString(value, "--source-url");
  let parsed;
  try {
    parsed = new URL(sourceUrl);
  } catch {
    fail("--source-url は有効な HTTPS URL にしてください");
  }
  if (parsed.protocol !== "https:" || !parsed.hostname || parsed.username || parsed.password) {
    fail("--source-url は認証情報を含まない HTTPS URL にしてください");
  }
  return parsed.toString();
}

function normalizeSourceDate(value) {
  const sourceDate = requireNonEmptyString(value, "--source-date");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(sourceDate)) {
    fail("--source-date は YYYY-MM-DD 形式で指定してください");
  }
  const date = new Date(`${sourceDate}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== sourceDate) {
    fail("--source-date は実在する日付にしてください");
  }
  if (date.getTime() > Date.now()) {
    fail("--source-date は将来日にできません");
  }
  return sourceDate;
}

function fail(message) {
  console.error(`ERROR ${message}`);
  process.exit(1);
}
