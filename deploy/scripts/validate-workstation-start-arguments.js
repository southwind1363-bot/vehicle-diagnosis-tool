import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const starter = fileURLToPath(new URL("./start-local-workstation.js", import.meta.url));
const launcher = fileURLToPath(new URL("../start-workstation.cmd", import.meta.url));
let checks = 0;
const starters = [starter, ...(process.env.START_ARGUMENT_PACKAGE
  ? [path.join(path.dirname(process.env.START_ARGUMENT_PACKAGE), "scripts/start-local-workstation.js")] : [])];
for (const target of starters) {
for (const args of [["other-folder"], [""], ["--open-browser", "other-folder"], ["--no-browser", "--no-browser"]]) {
  // Replay guard prevents any listener if argument validation regresses.
  const result = spawnSync(process.execPath, [target, ...args], { encoding: "utf8", timeout: 10000,
    windowsHide: true, env: { ...process.env, LOCAL_BRIDGE_REPLAY_LOG: "argument-test-do-not-read" } });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /unsupported_arguments/);
  assert.equal(result.stdout, "");
  checks++;
}
}
if (process.platform === "win32") {
  for (const target of [launcher, fileURLToPath(new URL("../start-packaged-workstation.cmd", import.meta.url)), ...(process.env.START_ARGUMENT_PACKAGE ? [process.env.START_ARGUMENT_PACKAGE] : [])]) {
  for (const suffix of [' other-folder', ' ""', ' --no-pause other-folder', ' --no-pause ""', ' --no-browser --no-pause']) {
    const result = spawnSync(process.env.ComSpec || "cmd.exe", ["/d", "/s", "/c", `""${target}"${suffix}"`], {
      encoding: "utf8", timeout: 10000, windowsHide: true, windowsVerbatimArguments: true,
      input: "\n", env: { ...process.env, PATH: "" }
    });
    assert.equal(result.status, 1);
    assert.match(result.stdout, /unsupported_arguments/);
    assert.ok(!result.stdout.includes("Node.js was not found"));
    checks++;
  }
  }
}
console.log(`Workstation startup argument checks: ${checks}`);
