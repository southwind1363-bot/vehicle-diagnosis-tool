// Development-only metadata comparison. No filesystem, network or DLL I/O.
// A match is NOT publisher verification, dependency closure or execution consent.
const fields = (value, keys) => value && typeof value === "object" && !Array.isArray(value)
  && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
const label = value => typeof value === "string" && value.length > 0 && value.length <= 160
  && value.trim() === value && !/[\x00-\x1f\x7f]/.test(value);

function inventory(files) {
  if (!Array.isArray(files) || files.length < 1 || files.length > 512) return null;
  const result = new Map();
  for (const file of files) {
    if (!fields(file, ["name", "size", "sha256"]) || typeof file.name !== "string"
      || file.name.length > 240 || !Number.isSafeInteger(file.size) || file.size < 1
      || typeof file.sha256 !== "string" || !/^[a-fA-F0-9]{64}$/.test(file.sha256)) return null;
    // Conservative portable relative names; reject Windows aliases and traversal.
    const parts = file.name.split("/");
    if (parts.some(part => !/^[a-zA-Z0-9_-][a-zA-Z0-9_.-]*$/.test(part)
      || part.endsWith(".") || /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/i.test(part))) return null;
    const name = file.name.toLowerCase();
    if (result.has(name)) return null;
    result.set(name, Object.freeze({ size: file.size, sha256: file.sha256.toUpperCase() }));
  }
  return result;
}

function snapshot(value) {
  if (!fields(value, ["vendor", "version", "architecture", "source_url", "entry", "files"])
    || !label(value.vendor) || !label(value.version) || !["x86", "x64"].includes(value.architecture)
    || typeof value.source_url !== "string" || typeof value.entry !== "string") return null;
  const url = new URL(value.source_url);
  if (url.protocol !== "https:" || url.username || url.password || url.hash || url.search
    || url.href !== value.source_url) return null;
  const files = inventory(value.files);
  const entry = value.entry.toLowerCase();
  if (!files || !entry.endsWith(".dll") || !files.has(entry)) return null;
  return { vendor: value.vendor, version: value.version, architecture: value.architecture,
    source_url: value.source_url, entry, files };
}

// Catalog is supplied only by development code, never by a UI or imported session.
// Deliberately empty by default. Real manufacturer records require separate review.
export function createVendorPackageReview(catalog = []) {
  let records;
  try {
    if (!Array.isArray(catalog) || catalog.length > 128) throw new Error();
    records = Array.from(catalog, snapshot);
    if (records.some(record => !record)) throw new Error();
  } catch { throw new Error("vendor_review_catalog_invalid"); }
  return Object.freeze({
    compare(candidate) {
      let matched = false;
      try {
        const current = snapshot(candidate);
        matched = !!current && records.some(record =>
          ["vendor", "version", "architecture", "source_url", "entry"].every(key => record[key] === current[key])
          && record.files.size === current.files.size
          && [...record.files].every(([name, file]) => {
            const observed = current.files.get(name);
            return observed && observed.size === file.size && observed.sha256 === file.sha256;
          }));
      } catch { /* Malformed metadata never matches and never leaks supplied data. */ }
      return Object.freeze({ status: matched ? "metadata_match_only" : "unverified",
        execution_enabled: false, publisher_verified: false, dependency_closure_verified: false });
    }
  });
}
