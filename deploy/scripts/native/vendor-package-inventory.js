import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";

// Development review only: a point-in-time observation, never a loader lease.
const same = (a, b) => ["dev", "ino", "size", "mtimeMs", "ctimeMs"].every(key => a[key] === b[key]);
const validPart = name => /^[a-zA-Z0-9_-][a-zA-Z0-9_.-]*$/.test(name)
  && !name.endsWith(".") && !/^(con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/i.test(name);

export function collectVendorPackageInventory(root) {
  try {
    if (typeof root !== "string" || !path.isAbsolute(root) || root !== path.resolve(root)
      || root === path.parse(root).root || root.startsWith("\\\\")) throw new Error();
    const canonicalRoot = fs.realpathSync.native(root);
    if (canonicalRoot !== root) throw new Error();
    const files = [], checkpoints = [], names = new Set();
    let entries = 0, totalBytes = 0;
    function inspect(target) {
      const stat = fs.lstatSync(target);
      if (stat.isSymbolicLink() || fs.realpathSync.native(target) !== target) throw new Error();
      return stat;
    }
    function visit(directory, relative, depth) {
      if (depth > 16) throw new Error();
      const before = inspect(directory);
      if (!before.isDirectory()) throw new Error();
      checkpoints.push([directory, before]);
      for (const name of fs.readdirSync(directory).sort()) {
        if (++entries > 512 || !validPart(name)) throw new Error();
        const relativeName = relative ? `${relative}/${name}` : name;
        if (relativeName.length > 240 || names.has(relativeName.toLowerCase())) throw new Error();
        names.add(relativeName.toLowerCase());
        const target = path.join(directory, name), stat = inspect(target);
        if (stat.isDirectory()) { visit(target, relativeName, depth + 1); continue; }
        if (!stat.isFile() || stat.nlink !== 1 || !Number.isSafeInteger(stat.size)
          || stat.size < 1 || stat.size > 64 * 1024 * 1024) throw new Error();
        totalBytes += stat.size;
        if (totalBytes > 256 * 1024 * 1024) throw new Error();
        const fd = fs.openSync(target, fs.constants.O_RDONLY);
        let digest;
        try {
          if (!same(stat, fs.fstatSync(fd))) throw new Error();
          const hash = createHash("sha256"), buffer = Buffer.alloc(64 * 1024);
          let offset = 0;
          while (offset < stat.size) {
            const count = fs.readSync(fd, buffer, 0, Math.min(buffer.length, stat.size - offset), offset);
            if (!count) throw new Error();
            hash.update(buffer.subarray(0, count)); offset += count;
          }
          if (!same(stat, fs.fstatSync(fd)) || !same(stat, inspect(target))) throw new Error();
          digest = hash.digest("hex").toUpperCase();
        } finally { fs.closeSync(fd); }
        checkpoints.push([target, stat]);
        files.push(Object.freeze({ name: relativeName, size: stat.size, sha256: digest }));
      }
    }
    visit(root, "", 0);
    if (!files.length || checkpoints.some(([target, stat]) => !same(stat, inspect(target)))) throw new Error();
    return Object.freeze(files);
  } catch {
    // Never return partial observations, absolute paths or operating-system errors.
    throw new Error("vendor_inventory_unverified");
  }
}
