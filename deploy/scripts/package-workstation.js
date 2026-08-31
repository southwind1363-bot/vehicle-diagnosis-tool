import fs from "node:fs";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { validateWorkstationAssets } from "./workstation-assets.js";
import { verifyWorkstationPackage } from "./verify-workstation-package.js";

const deployDirectory = fileURLToPath(new URL("../", import.meta.url));
const RUNTIME_FILES = ["start-workstation.cmd", "verify-workstation.cmd", "inspect-workstation-j2534.cmd", "scripts/inspect-workstation-j2534.js", "scripts/verify-workstation-package.js", "scripts/start-local-workstation.js", "scripts/workstation-assets.js", "scripts/j2534-readonly-worker.js", "scripts/j2534-native-quarantine.js", "scripts/j2534-registered-driver-native-preflight.js", "scripts/j2534-uds-readout-attempt-controller.js", "scripts/j2534-uds-transport-adapter-request.js", "scripts/j2534-uds-preparation-evidence.js"];

function exists(entry) {
  try { fs.lstatSync(entry); return true; } catch (error) { if (error.code === "ENOENT") return false; throw error; }
}

function rejectLinks(absolute) {
  if (absolute.startsWith("\\\\")) throw new Error("workstation_package_path_invalid");
  let current = path.parse(absolute).root;
  for (const part of path.relative(current, absolute).split(path.sep).filter(Boolean)) {
    current = path.join(current, part);
    if (exists(current) && fs.lstatSync(current).isSymbolicLink()) throw new Error("workstation_package_link_not_allowed");
  }
}

function rejectPrivatePath(relative) {
  if (relative.split("/").some((part) => /^(?:\.env(?:\..*)?|\.npmrc|\.git|\.codex|\.vercel|pet-runs)$/i.test(part) || /\.(?:log|pid|pem|key)$/i.test(part))) throw new Error("workstation_package_private_file");
}

export function validatePackagedDependencies(directory) {
  const root = fs.realpathSync(directory);
  const lock = JSON.parse(fs.readFileSync(path.join(root, "package-lock.json"), "utf8"));
  const owners = Object.keys(lock.packages);
  const dependencyRoot = path.join(root, "node_modules");
  for (const owner of owners) {
    const packageFile = path.join(root, owner, "package.json");
    const pkg = JSON.parse(fs.readFileSync(packageFile, "utf8"));
    const require = createRequire(packageFile);
    for (const name of Object.keys(pkg.dependencies ?? {})) {
      let entry;
      try { entry = require.resolve(name); }
      catch (error) {
        if (error.code !== "ERR_PACKAGE_PATH_NOT_EXPORTED") throw error;
        entry = require.resolve(`${name}/package.json`);
      }
      const resolved = fs.realpathSync(entry);
      const relative = path.relative(dependencyRoot, resolved);
      if (!relative || relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) throw new Error("workstation_package_external_dependency");
    }
  }
}

export function packageWorkstation(options = {}) {
  const sourcePath = path.resolve(options.sourceDirectory ?? deployDirectory);
  rejectLinks(sourcePath);
  const source = fs.realpathSync(sourcePath);
  const safeSource = (relative) => {
    rejectPrivatePath(relative);
    if (!/^[a-z0-9@._/-]+$/i.test(relative) || relative.split("/").some((part) => !part || part === "." || part === "..")) throw new Error("workstation_package_path_invalid");
    let current = source;
    for (const part of relative.split("/")) {
      current = path.join(current, part);
      if (fs.lstatSync(current).isSymbolicLink()) throw new Error("workstation_package_link_not_allowed");
    }
    const canonical = fs.realpathSync(current);
    const confined = path.relative(source, canonical);
    if (!confined || confined === ".." || confined.startsWith(`..${path.sep}`) || path.isAbsolute(confined)) throw new Error("workstation_package_path_invalid");
    return canonical;
  };
  const manifest = JSON.parse(fs.readFileSync(safeSource("offline-assets.json"), "utf8"));
  const pkg = JSON.parse(fs.readFileSync(safeSource("package.json"), "utf8"));
  const lock = JSON.parse(fs.readFileSync(safeSource("package-lock.json"), "utf8"));
  const status = validateWorkstationAssets(source);
  if (pkg.type !== "module" || typeof pkg.dependencies?.express !== "string" || lock.lockfileVersion !== 3 || !lock.packages?.[""] || !lock.packages["node_modules/express"]
    || JSON.stringify(pkg.dependencies) !== JSON.stringify(lock.packages[""].dependencies)
    || pkg.name !== lock.packages[""].name || pkg.version !== lock.packages[""].version) throw new Error("workstation_package_lock_mismatch");
  const dependencies = Object.entries(lock.packages).filter(([name]) => name !== "");
  for (const [name, entry] of dependencies) {
    if (!name.startsWith("node_modules/") || entry.link || typeof entry.version !== "string") throw new Error("workstation_package_dependency_invalid");
    const url = new URL(entry.resolved);
    if (url.origin !== "https://registry.npmjs.org" || url.username || url.password || url.search || url.hash) throw new Error("workstation_package_registry_not_allowed");
    const installed = JSON.parse(fs.readFileSync(safeSource(`${name}/package.json`), "utf8"));
    if (installed.version !== entry.version) throw new Error("workstation_package_dependency_version_mismatch");
  }
  const output = path.resolve(options.outputDirectory ?? path.join(source, "workstation-packages"));
  if (output === source || path.dirname(output) === output) throw new Error("workstation_package_output_invalid");
  const outputRelative = path.relative(source, output);
  if (!outputRelative.startsWith(`..${path.sep}`) && outputRelative !== ".." && !path.isAbsolute(outputRelative)
    && outputRelative !== "workstation-packages") throw new Error("workstation_package_output_invalid");
  rejectLinks(output);
  fs.mkdirSync(output, { recursive: true });
  if (fs.lstatSync(output).isSymbolicLink()) throw new Error("workstation_package_output_invalid");
  const outputRoot = fs.realpathSync(output);
  const destination = path.join(outputRoot, `vehicle-diagnosis-tool-${status.version}`);
  if (exists(destination)) throw new Error("workstation_package_exists");
  const lockPath = path.join(outputRoot, `.workstation-${status.version}.lock`);
  let lockDescriptor;
  try { lockDescriptor = fs.openSync(lockPath, "wx"); }
  catch (error) { if (error.code === "EEXIST") throw new Error("workstation_package_busy"); throw error; }
  let staging;
  let published = false;
  let fileCount = 0;
  const integrityFiles = [];
  const recordFile = (relative) => {
    const bytes = fs.readFileSync(path.join(staging, relative));
    integrityFiles.push({ path: relative, size: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") });
  };
  const copyFile = (relative) => {
    const from = safeSource(relative);
    const stat = fs.statSync(from);
    if (!stat.isFile() || stat.size > 64 * 1024 * 1024) throw new Error("workstation_package_file_invalid");
    const target = path.join(staging, relative);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(from, target, fs.constants.COPYFILE_EXCL);
    recordFile(relative);
    fileCount += 1;
  };
  const copyDependency = (relative, depth = 0) => {
    if (depth > 20) throw new Error("workstation_package_dependency_depth");
    for (const entry of fs.readdirSync(safeSource(relative), { withFileTypes: true })) {
      if (entry.name === "node_modules") continue;
      const child = `${relative}/${entry.name}`;
      if (entry.isDirectory()) copyDependency(child, depth + 1);
      else copyFile(child);
    }
  };
  const compileNativePreflightWorkers = () => {
    if (process.platform !== "win32") throw new Error("workstation_package_native_compiler_unsupported");
    const windows = process.env.SystemRoot || process.env.WINDIR || "C:\\Windows";
    const sources = [safeSource("scripts/native/J2534RegisteredDriverPreflight.cs"), safeSource("scripts/native/J2534AuthenticodeVerifier.cs"), safeSource("scripts/native/J2534GlobalMutexLease.cs"), safeSource("scripts/native/J2534RegisteredDriverPreflightWorker.cs")];
    const nativeOutput = path.join(staging, "scripts", "native");
    fs.mkdirSync(nativeOutput, { recursive: true });
    const workers = {};
    for (const [architecture, framework] of [["x86", "Framework"], ["x64", "Framework64"]]) {
      const compiler = fs.realpathSync(path.join(windows, "Microsoft.NET", framework, "v4.0.30319", "csc.exe"));
      const file = `j2534-registered-driver-preflight-${architecture}.exe`;
      const output = path.join(nativeOutput, file);
      execFileSync(compiler, ["/nologo", "/target:exe", `/platform:${architecture}`, "/optimize+", "/warnaserror+",
        "/reference:System.Runtime.Serialization.dll", `/out:${output}`, ...sources], {
        cwd: nativeOutput, windowsHide: true, shell: false, timeout: 30000, maxBuffer: 65536,
        env: { SystemRoot: windows, WINDIR: windows, TEMP: process.env.TEMP || nativeOutput, TMP: process.env.TMP || nativeOutput }
      });
      const bytes = fs.readFileSync(output);
      workers[architecture] = { file, size: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") };
      recordFile(`scripts/native/${file}`); fileCount += 1;
    }
    fs.writeFileSync(path.join(nativeOutput, "j2534-preflight-workers.json"), JSON.stringify({
      schema_version: "j2534-native-preflight-workers-v1", workers
    }, null, 2) + "\n", { flag: "wx" });
    recordFile("scripts/native/j2534-preflight-workers.json"); fileCount += 1;
  };
  try {
    if (exists(destination)) throw new Error("workstation_package_exists");
    staging = fs.mkdtempSync(path.join(outputRoot, ".workstation-staging-"));
    const assets = new Set(["offline-assets.json", ...manifest.assets.map((asset) => asset === "./" ? "index.html" : asset), ...RUNTIME_FILES]);
    for (const asset of assets) {
      if (asset.split("/").some((part) => part.toLowerCase() === "node_modules")) throw new Error("workstation_package_asset_invalid");
      copyFile(asset);
    }
    for (const [name] of dependencies) copyDependency(name);
    copyFile("package-lock.json");
    compileNativePreflightWorkers();
    const checkedStart = "node scripts/verify-workstation-package.js && node scripts/start-local-workstation.js";
    fs.writeFileSync(path.join(staging, "package.json"), JSON.stringify({ name: pkg.name, version: pkg.version, type: "module", private: true,
      scripts: { start: checkedStart, "workstation:dev": checkedStart, "verify:package": "node scripts/verify-workstation-package.js" }, dependencies: pkg.dependencies }, null, 2) + "\n", { flag: "wx" });
    fs.writeFileSync(path.join(staging, "README.txt"), `自動車整備ツール ${status.version}\n\nNode.js 22以降とnpmを事前に導入し、フォルダー全体を移してください。Node.js 24 LTSを推奨します。\nstart-workstation.cmdを開き、表示された診断画面URLへアクセスしてください。\n依存ライブラリは同梱済みです。起動時のnpm installやインターネット接続は不要です。\n終了は起動画面でqを入力してEnter。接続キーは外部共有しないでください。\nNode本体・VCIドライバー・個人の保存データは同梱していません。\n車両送信の権限や実車適合は元の版から変更していません。\n`, { flag: "wx" });
    validateWorkstationAssets(staging);
    validatePackagedDependencies(staging);
    fs.appendFileSync(path.join(staging, "README.txt"), "\n移行後はverify-workstation.cmdを開いてファイル内容を検査できます。追加の導入や通信はありません。\n不一致・欠落時は元のパッケージを一式移し直してください。自動修復はしません。\n同梱一覧との一致検査であり、署名・真正性・実車適合の証明ではありません。一覧外の追加ファイルは検査しません。\n");
    fs.appendFileSync(path.join(staging, "README.txt"), "通常のstart-workstation.cmd起動とnpm startでは、検査成功後にサーバーを起動します。\n検査一覧やpackage-info.jsonを削除せず、フォルダー一式を保管してください。\n");
    fs.appendFileSync(path.join(staging, "README.txt"), "\nJ2534接続準備はinspect-workstation-j2534.cmdを開いて確認してください。登録ドライバーとDLLの静的検査結果を日本語で表示し、選択した番号は専用workerで非実行検査できます。\nVCI・車両を接続する必要はありません。DLLロード、PassThruOpen、実機通信、診断データ保存、外部送信は行いません。worker終了未確認時だけ再試行防止の隔離状態を端末内に保存し、自動解除しません。検査合格でも実車適合や接続成功の証明ではありません。匿名化JSONは inspect-workstation-j2534.cmd --evidence-json --no-pause で取得でき、DLLパス、名称、device ID、nonceを含みません。取得済みJSONは type 証拠.json | inspect-workstation-j2534.cmd --validate-evidence-stdin --no-pause で32KB上限と意味整合を検証できます。production identityとECU/DID scopeの非送信request準備証拠は inspect-workstation-j2534.cmd --prepare-uds-request 番号 要求ECU 応答ECU DID --no-pause で取得できます。\n");
    const info = { appVersion: status.version, dependencyCount: dependencies.length, includesNode: false, fileCount: fileCount + 4 };
    fs.writeFileSync(path.join(staging, "package-info.json"), JSON.stringify(info, null, 2) + "\n", { flag: "wx" });
    for (const relative of ["package.json", "README.txt", "package-info.json"]) recordFile(relative);
    fs.writeFileSync(path.join(staging, "package-integrity.json"), JSON.stringify({ schemaVersion: "workstation_package_integrity_v1", algorithm: "sha256",
      appVersion: status.version, files: integrityFiles.sort((a, b) => a.path.localeCompare(b.path, "en")) }, null, 2) + "\n", { flag: "wx" });
    verifyWorkstationPackage(staging);
    if (exists(destination)) throw new Error("workstation_package_exists");
    fs.renameSync(staging, destination);
    published = true;
    return { directory: destination, ...info };
  } finally {
    try {
      if (!published && staging) {
        rejectLinks(staging);
        if (path.dirname(fs.realpathSync(staging)) !== outputRoot || !path.basename(staging).startsWith(".workstation-staging-")) throw new Error("workstation_package_cleanup_invalid");
        fs.rmSync(staging, { recursive: true, force: true });
      }
    } finally {
      const owned = fs.fstatSync(lockDescriptor);
      fs.closeSync(lockDescriptor);
      const current = fs.lstatSync(lockPath);
      if (current.isSymbolicLink() || current.dev !== owned.dev || current.ino !== owned.ino) throw new Error("workstation_package_cleanup_invalid");
      fs.unlinkSync(lockPath);
    }
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = packageWorkstation();
    console.log(`オフライン移行用フォルダー: ${result.directory}`);
    console.log(`版: ${result.appVersion} / 依存ライブラリ: ${result.dependencyCount} / Node.js 22以降とnpmの事前導入が必要です（24 LTS推奨）。`);
  } catch (error) {
    console.error(`移行用フォルダーを作成できません: ${error.code === "workstation_assets_invalid" ? "配布資材を確認してください" : error.message.startsWith("workstation_package_") ? error.message : "資材または依存ライブラリの読込に失敗しました"}`);
    process.exitCode = 1;
  }
}
