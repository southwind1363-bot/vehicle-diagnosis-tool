import fs from "node:fs";
import path from "node:path";

const REQUIRED_ASSETS = ["index.html", "style.css", "script.js", "obd-readonly.js", "local-bridge-readonly.js", "manifest.webmanifest", "service-worker.js"];

function assetError(asset) {
  const error = new Error("workstation_assets_invalid");
  error.code = "workstation_assets_invalid";
  error.asset = asset;
  return error;
}

export function validateWorkstationAssets(directory) {
  let root;
  try { root = fs.realpathSync(directory); } catch (_) { throw assetError("offline-assets.json"); }
  const readAsset = (asset, limit = 64 * 1024 * 1024) => {
    try {
      const resolved = fs.realpathSync(path.join(root, asset));
      const relative = path.relative(root, resolved);
      if (!relative || relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) throw new Error();
      const beforeOpen = fs.statSync(resolved);
      if (!beforeOpen.isFile() || beforeOpen.size === 0 || beforeOpen.size > limit) throw new Error();
      const descriptor = fs.openSync(resolved, "r");
      try {
        const stat = fs.fstatSync(descriptor);
        if (!stat.isFile() || stat.size === 0 || stat.size > limit) throw new Error();
        // Bound allocation and detect files that change size during inspection.
        const bytes = Buffer.alloc(stat.size + 1);
        let size = 0;
        while (size < bytes.length) {
          const count = fs.readSync(descriptor, bytes, size, bytes.length - size, null);
          if (!count) break;
          size += count;
        }
        if (size !== stat.size) throw new Error();
        return bytes.subarray(0, size);
      } finally { fs.closeSync(descriptor); }
    } catch (_) { throw assetError(asset); }
  };
  let manifest;
  try { manifest = JSON.parse(readAsset("offline-assets.json", 1024 * 1024).toString("utf8")); }
  catch (_) { throw assetError("offline-assets.json"); }
  if (!manifest || typeof manifest.version !== "string" || !/^[a-z0-9][a-z0-9._-]{0,63}$/i.test(manifest.version)
    || !Number.isInteger(manifest.asset_count) || manifest.asset_count < 1 || manifest.asset_count > 2000
    || !Array.isArray(manifest.assets) || manifest.assets.length !== manifest.asset_count) throw assetError("offline-assets.json");
  const seen = new Set();
  for (const asset of manifest.assets) {
    if (typeof asset !== "string" || (asset !== "./" && (!/^[a-z0-9][a-z0-9._/-]*$/i.test(asset)
      || asset.split("/").some((part) => !part || part === "." || part === ".." || part.endsWith("."))))) throw assetError("offline-assets.json");
    const key = asset.toLowerCase();
    if (seen.has(key)) throw assetError("offline-assets.json");
    seen.add(key);
  }
  if (REQUIRED_ASSETS.some((asset) => !manifest.assets.includes(asset))) throw assetError("offline-assets.json");
  const sources = new Map();
  for (const asset of manifest.assets) {
    const file = asset === "./" ? "index.html" : asset;
    const bytes = readAsset(file);
    if (file === "script.js" || file === "service-worker.js") sources.set(file, bytes.toString("utf8"));
  }
  for (const [file, marker] of [["script.js", "APP_VERSION"], ["service-worker.js", "CACHE_VERSION"]]) {
    const versions = [...(sources.get(file) || "").matchAll(new RegExp(`const ${marker} = "([^"]+)";`, "g"))];
    if (versions.length !== 1 || versions[0][1] !== manifest.version) throw assetError(file);
  }
  return { version: manifest.version, assetCount: manifest.asset_count, assets: [...manifest.assets] };
}
