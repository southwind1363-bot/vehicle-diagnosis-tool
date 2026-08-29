import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

const MANIFEST = "package-integrity.json";
const MAX_FILE_BYTES = 64 * 1024 * 1024;

function fail(code, file = "") {
  throw Object.assign(new Error(code), { code, file });
}

function packageFile(root, relative) {
  if (typeof relative !== "string" || !/^[a-z0-9@._/-]+$/i.test(relative)
    || relative.split("/").some((part) => !part || part === "." || part === ".." || part.endsWith("."))) {
    fail("package_integrity_path_invalid");
  }
  let current = root;
  for (const part of relative.split("/")) {
    current = path.join(current, part);
    let stat;
    try { stat = fs.lstatSync(current); }
    catch { fail("package_integrity_file_missing", relative); }
    if (stat.isSymbolicLink()) fail("package_integrity_link_not_allowed", relative);
  }
  const stat = fs.statSync(current);
  if (!stat.isFile() || stat.size > MAX_FILE_BYTES) fail("package_integrity_file_invalid", relative);
  return { absolute: current, size: stat.size };
}

// This detects copy damage against the bundled manifest, not publisher authenticity.
export function verifyWorkstationPackage(directory) {
  const root = path.resolve(directory);
  if (!fs.lstatSync(root).isDirectory() || fs.lstatSync(root).isSymbolicLink()) fail("package_integrity_root_invalid");
  const manifestFile = packageFile(root, MANIFEST);
  if (manifestFile.size > 4 * 1024 * 1024) fail("package_integrity_manifest_invalid");
  let manifest;
  try { manifest = JSON.parse(fs.readFileSync(manifestFile.absolute, "utf8")); }
  catch { fail("package_integrity_manifest_invalid"); }
  if (manifest?.schemaVersion !== "workstation_package_integrity_v1" || manifest.algorithm !== "sha256"
    || typeof manifest.appVersion !== "string" || !/^\d+\.\d+\.\d+$/.test(manifest.appVersion)
    || !Array.isArray(manifest.files) || !manifest.files.length || manifest.files.length > 20000) fail("package_integrity_manifest_invalid");
  const seen = new Set();
  let totalBytes = 0;
  for (const entry of manifest.files) {
    if (!entry || typeof entry.path !== "string" || entry.path.toLowerCase() === MANIFEST
      || seen.has(entry.path.toLowerCase()) || !Number.isSafeInteger(entry.size) || entry.size < 0 || entry.size > MAX_FILE_BYTES
      || typeof entry.sha256 !== "string" || !/^[a-f0-9]{64}$/.test(entry.sha256)) fail("package_integrity_manifest_invalid");
    seen.add(entry.path.toLowerCase());
    totalBytes += entry.size;
    if (totalBytes > 1024 * 1024 * 1024) fail("package_integrity_manifest_invalid");
  }
  for (const required of ["index.html", "script.js", "obd-readonly.js", "offline-assets.json", "package.json", "package-lock.json",
    "package-info.json", "start-workstation.cmd", "verify-workstation.cmd", "inspect-workstation-j2534.cmd",
    "scripts/inspect-workstation-j2534.js", "scripts/verify-workstation-package.js",
    "scripts/j2534-registered-driver-native-preflight.js", "scripts/native/j2534-preflight-workers.json",
    "scripts/native/j2534-registered-driver-preflight-x86.exe", "scripts/native/j2534-registered-driver-preflight-x64.exe"]) {
    if (!seen.has(required)) fail("package_integrity_manifest_incomplete", required);
  }
  for (const entry of manifest.files) {
    const file = packageFile(root, entry.path);
    if (file.size !== entry.size) fail("package_integrity_size_mismatch", entry.path);
    const hash = createHash("sha256").update(fs.readFileSync(file.absolute)).digest("hex");
    if (hash !== entry.sha256) fail("package_integrity_hash_mismatch", entry.path);
  }
  let info;
  let assets;
  try {
    info = JSON.parse(fs.readFileSync(path.join(root, "package-info.json"), "utf8"));
    assets = JSON.parse(fs.readFileSync(path.join(root, "offline-assets.json"), "utf8"));
  } catch { fail("package_integrity_metadata_invalid"); }
  if (info?.appVersion !== manifest.appVersion || assets?.version !== manifest.appVersion
    || info.fileCount !== manifest.files.length + 1) fail("package_integrity_metadata_invalid");
  return { appVersion: manifest.appVersion, fileCount: manifest.files.length, totalBytes };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = verifyWorkstationPackage(fileURLToPath(new URL("../", import.meta.url)));
    console.log(`Package files match: ${result.appVersion} / ${result.fileCount} files / ${result.totalBytes} bytes.`);
    console.log("Copy integrity only. Not a signature, vehicle compatibility, or permission to transmit.");
  } catch (error) {
    console.error(`Package verification failed: ${error.code?.startsWith("package_integrity_") ? error.code : "package_unreadable"}${error.file ? ` (${error.file})` : ""}`);
    console.error("Restore the complete package from the original build before using it. No files were changed.");
    process.exitCode = 1;
  }
}
