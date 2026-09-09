import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import vm from "node:vm";

const source = fs.readFileSync(new URL("./verify-workstation-package.js", import.meta.url), "utf8");
const helper = source.match(/function readPackageBytes\(file, relative\) \{[\s\S]*?\n\}/)?.[0];
assert.ok(helper, "Production bounded reader missing");
const directory = fs.mkdtempSync(path.join(os.tmpdir(), "package-bounded-read-"));
const target = path.join(directory, "synthetic.bin");
try {
  for (const scenario of ["normal", "short-reads", "grow-before-open", "grow-during-read", "shrink-during-read", "read-error"]) {
    fs.writeFileSync(target, Buffer.from("original"));
    let closed = 0, bytesRead = 0, changed = false;
    const testFs = { ...fs,
      openSync(...args) {
        if (scenario === "grow-before-open") fs.appendFileSync(target, "extra");
        return fs.openSync(...args);
      },
      readSync(fd, buffer, offset, length, position) {
        if (!changed) {
          changed = true;
          if (scenario === "grow-during-read") fs.appendFileSync(target, Buffer.alloc(1024 * 1024));
          if (scenario === "shrink-during-read") fs.truncateSync(target, 2);
          if (scenario === "read-error") throw new Error("synthetic_read_failure");
        }
        const count = fs.readSync(fd, buffer, offset, scenario === "short-reads" ? Math.min(length, 2) : length, position);
        bytesRead += count;
        return count;
      },
      closeSync(fd) { closed += 1; return fs.closeSync(fd); }
    };
    const read = vm.runInNewContext(`(${helper})`, { fs: testFs, Buffer,
      fail(code, file) { throw Object.assign(new Error(code), { code, file }); }
    });
    const invoke = () => read({ absolute: target, size: 8 }, "synthetic.bin");
    if (["normal", "short-reads"].includes(scenario)) assert.equal(invoke().toString(), "original");
    else if (scenario === "read-error") assert.throws(invoke, /synthetic_read_failure/);
    else assert.throws(invoke, error => error.code === "package_integrity_size_mismatch" && error.file === "synthetic.bin");
    assert.equal(closed, 1, `${scenario}: descriptor not closed`);
    assert.ok(bytesRead <= 9, `${scenario}: read exceeded inspected size plus one byte`);
    const expectedSize = scenario === "grow-before-open" ? 13 : scenario === "grow-during-read" ? 8 + 1024 * 1024 : scenario === "shrink-during-read" ? 2 : 8;
    assert.equal(fs.statSync(target).size, expectedSize, "Reader modified fixture");
  }
  console.log("Package bounded reads: growth, truncation, short reads and handle cleanup passed");
} finally {
  fs.unlinkSync(target);
  fs.rmdirSync(directory);
}
