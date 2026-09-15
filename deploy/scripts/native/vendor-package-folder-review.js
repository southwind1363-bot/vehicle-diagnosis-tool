import path from "node:path";
import { pathToFileURL } from "node:url";
import { collectVendorPackageInventory } from "./vendor-package-inventory.js";
import { createVendorPackageReview } from "./vendor-package-review.js";

const metadataKeys = ["vendor", "version", "architecture", "source_url", "entry"];
const failure = () => Object.freeze({ status: "unverified", inventory_observed: false,
  execution_enabled: false, publisher_verified: false, dependency_closure_verified: false,
  message: "配布物を確認できませんでした。実行は許可されません。" });

// Private development API. Catalog is never taken from the CLI or inspected folder.
export function createVendorFolderReview(catalog = []) {
  const review = createVendorPackageReview(catalog);
  return Object.freeze({
    inspect(root, metadata) {
      try {
        if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)
          || Object.keys(metadata).length !== metadataKeys.length
          || !metadataKeys.every(key => Object.hasOwn(metadata, key))) return failure();
        const copy = Object.fromEntries(metadataKeys.map(key => [key, metadata[key]]));
        // Validate declared metadata before touching the selected folder. A synthetic
        // placeholder validates shape only; it is never used as observed evidence.
        createVendorPackageReview([{ ...copy, files: [{ name: copy.entry, size: 1, sha256: "0".repeat(64) }] }]);
        const files = collectVendorPackageInventory(root);
        const result = review.compare({ ...copy, files });
        return Object.freeze({ ...result, inventory_observed: true, file_count: files.length,
          total_bytes: files.reduce((total, file) => total + file.size, 0),
          message: result.status === "metadata_match_only"
            ? "登録情報との一致のみ確認しました。公式配布元・署名・依存関係は未確認で、実行は許可されません。"
            : "ファイル一覧を取得しましたが、登録情報との一致は未確認です。実行は許可されません。" });
      } catch { return failure(); }
    }
  });
}

// Explicit development command; no discovery, saved results, DLL load or retries.
// Strict positional arguments prevent silently ignoring a different requested target.
export function runVendorFolderReview(args) {
  if (!Array.isArray(args) || args.length !== 6 || !args.every(arg => typeof arg === "string" && arg.length)) return failure();
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
