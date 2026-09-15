import path from "node:path";
import { pathToFileURL } from "node:url";
import { collectVendorPackageInventory } from "./vendor-package-inventory.js";
import { createVendorPackageReview } from "./vendor-package-review.js";
import { validateVendorSignatureResult } from "./vendor-signature-result.js";

const metadataKeys = ["vendor", "version", "architecture", "source_url", "entry"];
const messages = Object.freeze({
  invalid_arguments: "引数の数または形式が不正です。フォルダーの検査は行っていません。実行は許可されません。",
  invalid_metadata: "宣言された配布物情報の形式が不正です。フォルダーの検査は行っていません。実行は許可されません。",
  inventory_unavailable: "フォルダーの完全な一覧・ハッシュを確認できませんでした。パス、読取権限、対応形式・上限を確認してください。実行は許可されません。",
  catalog_empty: "ファイル一覧を取得しましたが、照合する登録情報がありません。実行は許可されません。",
  metadata_mismatch: "ファイル一覧を取得しましたが、宣言情報またはファイル構成・内容が登録情報と一致しません。実行は許可されません。",
  metadata_match_only: "登録情報との一致のみ確認しました。公式配布元・署名・依存関係は未確認で、実行は許可されません。"
});
const failure = reason => Object.freeze({ status: "unverified", inventory_observed: false, reason,
  execution_enabled: false, publisher_verified: false, dependency_closure_verified: false,
  message: messages[reason] });

// Private development API. Catalog is never taken from the CLI or inspected folder.
export function createVendorFolderReview(catalog = []) {
  const review = createVendorPackageReview(catalog);
  const catalogEmpty = catalog.length === 0;
  return Object.freeze({
    inspect(root, metadata, signatureReport = undefined) {
      let copy;
      try {
        if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)
          || Object.keys(metadata).length !== metadataKeys.length
          || !metadataKeys.every(key => Object.hasOwn(metadata, key))) return failure("invalid_metadata");
        copy = Object.fromEntries(metadataKeys.map(key => [key, metadata[key]]));
        // Validate declared metadata before touching the selected folder. A synthetic
        // placeholder validates shape only; it is never used as observed evidence.
        createVendorPackageReview([{ ...copy, files: [{ name: copy.entry, size: 1, sha256: "0".repeat(64) }] }]);
      } catch { return failure("invalid_metadata"); }
      try {
        const files = collectVendorPackageInventory(root);
        const result = review.compare({ ...copy, files });
        // Bind an optional main-DLL report to bytes observed in this inventory,
        // never to a hash supplied alongside the report. This does not execute
        // a signature provider, validate dependencies or grant publisher trust.
        const signature = signatureReport === undefined ? {} : {
          entry_signature: validateVendorSignatureResult(signatureReport,
            files.find(file => file.name.toLowerCase() === copy.entry.toLowerCase())?.sha256)
        };
        const reason = result.status === "metadata_match_only" ? "metadata_match_only"
          : catalogEmpty ? "catalog_empty" : "metadata_mismatch";
        return Object.freeze({ ...result, inventory_observed: true, file_count: files.length,
          total_bytes: files.reduce((total, file) => total + file.size, 0),
          reason, message: messages[reason], ...signature });
      } catch { return failure("inventory_unavailable"); }
    }
  });
}

// Explicit development command; no discovery, saved results, DLL load or retries.
// Strict positional arguments prevent silently ignoring a different requested target.
export function runVendorFolderReview(args) {
  if (!Array.isArray(args) || args.length !== 6 || !args.every(arg => typeof arg === "string" && arg.length)) return failure("invalid_arguments");
  const [root, vendor, version, architecture, source_url, entry] = args;
  return createVendorFolderReview().inspect(root, { vendor, version, architecture, source_url, entry });
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const result = runVendorFolderReview(process.argv.slice(2));
  process.stdout.write(`${JSON.stringify(result)}\n`);
  // This is NOT a deployment or execution readiness check. Even observed inventory
  // is not a positive approval; CLI's production catalog remains empty.
  process.exitCode = result.inventory_observed ? 0 : 1;
}
