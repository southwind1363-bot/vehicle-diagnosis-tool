import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";

const same = (a, b) => ["dev", "ino", "size", "mtimeMs", "ctimeMs", "nlink"].every(k => a[k] === b[k]);
function inspect(file, digest) {
  const stat = fs.lstatSync(file);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || stat.size < 1
    || stat.size > 64 * 1024 * 1024 || fs.realpathSync(file) !== file) throw 0;
  const fd = fs.openSync(file, "r");
  try {
    if (!same(stat, fs.fstatSync(fd))) throw 0;
    const hash = createHash("sha256"), bytes = Buffer.alloc(65536);
    for (let offset = 0; offset < stat.size;) {
      const count = fs.readSync(fd, bytes, 0, Math.min(bytes.length, stat.size - offset), offset);
      if (!count) throw 0;
      hash.update(bytes.subarray(0, count)); offset += count;
    }
    if (!same(stat, fs.fstatSync(fd)) || !same(stat, fs.lstatSync(file)) || hash.digest("hex") !== digest) throw 0;
    return stat;
  } finally { fs.closeSync(fd); }
}
function noConfig(file) {
  try { fs.lstatSync(`${file}.config`); }
  catch (error) { if (error?.code === "ENOENT") return; throw error; }
  throw 0;
}

// Trusted build harness only; never a registry/vendor launcher. Digests prove
// build identity, not publisher approval. Rechecking is not an OS isolation
// boundary or protection against every sidecar or a race after checking.
export function createMode01FixtureSpawn({ root, worker_sha256, fixture_sha256, architecture, pid }) {
  try {
    if (process.platform !== "win32" || typeof root !== "string" || !["x86", "x64"].includes(architecture)
      || ![5, 12].includes(pid) || ![worker_sha256, fixture_sha256].every(v => typeof v === "string" && /^[a-f0-9]{64}$/.test(v))
      || path.dirname(root) !== fs.realpathSync(os.tmpdir()) || !/^mode01-native-[A-Za-z0-9]+$/.test(path.basename(root))
      || fs.realpathSync(root) !== root) throw 0;
    const directory = fs.lstatSync(root);
    if (!directory.isDirectory() || directory.isSymbolicLink()) throw 0;
    const worker = path.join(root, "mode01-worker.exe"), fixture = path.join(root, "mode01.dll");
    const workerStat = inspect(worker, worker_sha256), fixtureStat = inspect(fixture, fixture_sha256);
    noConfig(worker);
    const expected = Object.freeze(["--generated-mode01", fixture, fixture_sha256.toUpperCase(),
      String(fixtureStat.size), architecture, "2016", String(pid)]);
    const windows = process.env.SystemRoot || "C:\\Windows";
    let consumed = false;
    return args => {
      if (consumed) throw new Error("mode01_fixture_spawn_consumed");
      consumed = true;
      try {
        if (!Array.isArray(args) || args.length !== expected.length || !expected.every((v, i) => args[i] === v)) throw 0;
        const current = fs.lstatSync(root);
        if (!current.isDirectory() || current.isSymbolicLink() || current.dev !== directory.dev
          || current.ino !== directory.ino || fs.realpathSync(root) !== root) throw 0;
        if (!same(workerStat, inspect(worker, worker_sha256)) || !same(fixtureStat, inspect(fixture, fixture_sha256))) throw 0;
        noConfig(worker);
      } catch { throw new Error("mode01_fixture_spawn_rejected"); }
      return spawn(worker, expected, { cwd: root, shell: false, windowsHide: true, stdio: ["ignore", "pipe", "pipe"],
        env: { SystemRoot: windows, WINDIR: windows, TEMP: root, TMP: root } });
    };
  } catch { throw new Error("mode01_fixture_descriptor_invalid"); }
}
