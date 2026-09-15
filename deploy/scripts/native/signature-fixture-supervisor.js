import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { createSignatureObservationWorker } from "./signature-observation-worker.js";

const hash = file => createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const keys = (value, expected) => value && typeof value === "object" && !Array.isArray(value)
  && Object.keys(value).length === expected.length && expected.every(key => Object.hasOwn(value, key));
const requireAbsent = file => {
  try { fs.lstatSync(file); }
  catch (error) { if (error?.code === "ENOENT") return; throw error; }
  throw new Error("signature_fixture_configuration_present");
};

// Generated-fixture parent only. A digest supplied by a trusted build harness is
// not a publisher identity. No public CLI, registry discovery or vendor launch.
export function createSignatureFixtureSupervisor(descriptor) {
  try {
    if (process.platform !== "win32" || !keys(descriptor, ["root", "architecture", "worker_sha256", "fixture_sha256"])) throw 0;
    const { root, architecture, worker_sha256, fixture_sha256 } = descriptor;
    if (typeof root !== "string" || !["x86", "x64"].includes(architecture)
      || ![worker_sha256, fixture_sha256].every(value => typeof value === "string" && /^[a-f0-9]{64}$/.test(value))
      || fs.realpathSync(root) !== root || path.dirname(root) !== fs.realpathSync(os.tmpdir())
      || !/^signature-probe-[A-Za-z0-9]+$/.test(path.basename(root))) throw 0;
    const directory = fs.lstatSync(root);
    if (!directory.isDirectory() || directory.isSymbolicLink()) throw 0;
    const pinned = [[`probe-${architecture}.exe`, worker_sha256], [`unsigned-${architecture}.dll`, fixture_sha256]].map(([name, digest]) => {
      const file = path.join(root, name), stat = fs.lstatSync(file);
      if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || stat.size < 1 || stat.size > 64 * 1024 * 1024
        || fs.realpathSync(file) !== file || hash(file) !== digest) throw 0;
      return Object.freeze({ file, digest, size: stat.size, dev: stat.dev, ino: stat.ino });
    });
    const windows = process.env.SystemRoot || "C:\\Windows";
    const configuration = `${pinned[0].file}.config`;
    // This fixed probe needs no application configuration. Do not read or adopt
    // an adjacent file, directory or link as an implicit runtime policy.
    requireAbsent(configuration);
    return createSignatureObservationWorker({ expectedFileSha256: fixture_sha256,
      spawnWorker() {
        const current = fs.lstatSync(root);
        if (!current.isDirectory() || current.isSymbolicLink() || fs.realpathSync(root) !== root
          || current.dev !== directory.dev || current.ino !== directory.ino) throw 0;
        for (const item of pinned) {
          const stat = fs.lstatSync(item.file);
          if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || fs.realpathSync(item.file) !== item.file
            || stat.dev !== item.dev || stat.ino !== item.ino || stat.size !== item.size || hash(item.file) !== item.digest) throw 0;
        }
        requireAbsent(configuration);
        // Do not inherit profiler/startup-hook variables from the host environment.
        return spawn(pinned[0].file, [pinned[1].file, pinned[1].digest], {
          cwd: root, shell: false, windowsHide: true, stdio: ["ignore", "pipe", "pipe"],
          env: { SystemRoot: windows, WINDIR: windows, TEMP: root, TMP: root }
        });
      }
    });
  } catch { throw new Error("signature_fixture_descriptor_invalid"); }
}
