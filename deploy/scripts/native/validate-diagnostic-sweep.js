import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

assert.equal(process.platform, "win32");
const root = fs.mkdtempSync(path.join(os.tmpdir(), "diagnostic-sweep-"));
const sources = ["J2534DiagnosticSweepExchange.cs", "J2534DiagnosticSweepExchangeTests.cs",
  "J2534DiagnosticSweepOwned.cs", "J2534DiagnosticSweepOwnedTests.cs",
  "J2534DiagnosticSweepObservation.cs",
  "J2534Mode01Exchange.cs", "J2534Mode01Observation.cs", "J2534ReceiveNative.cs", "J2534IdentityNative.cs",
  "J2534ReadRequestNative.cs"];
for (const [arch, framework] of [["x86", "Framework"], ["x64", "Framework64"]]) {
  const compiler = path.join(process.env.SystemRoot || "C:\\Windows", "Microsoft.NET", framework, "v4.0.30319", "csc.exe");
  const exe = path.join(root, `sweep-${arch}.exe`);
  const run = (file, args) => spawnSync(file, args, { cwd: root, shell: false,
    windowsHide: true, encoding: "utf8", timeout: 15000, maxBuffer: 65536 });
  const built = run(compiler, ["/nologo", "/warnaserror", "/define:J2534_DTC_DEVELOPMENT;J2534_MODE01_DEVELOPMENT",
    `/platform:${arch}`, `/out:${exe}`, ...sources.map(name => fileURLToPath(new URL(name, import.meta.url)))]);
  assert.equal(built.status, 0, built.stdout + built.stderr);
  const result = run(exe, []);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.equal(result.stderr, "");
  console.log(arch, result.stdout.trim());
  const output = run(exe, ["--fixture-output"]);
  assert.equal(output.status, 0, output.stdout + output.stderr);
  assert.equal(output.stderr, "");
  const observation = JSON.parse(output.stdout);
  assert.deepEqual(Object.keys(observation).sort(), ["cleanup_confirmed", "dtc_reads", "fixture_only", "observations", "request_ecu"]);
  assert.equal(observation.fixture_only, true);
  assert.equal(observation.cleanup_confirmed, true);
  assert.equal(observation.request_ecu, 0x7e0);
  assert.deepEqual(observation.dtc_reads.map(item => item.service), [3, 7, 10]);
  assert.deepEqual(observation.observations.map(item => item.value), [90, 2000.25]);
  assert.deepEqual(observation.observations[0].supported_read, observation.observations[1].supported_read);
  const receipts = [...observation.dtc_reads.map(item => item.read_result), observation.observations[0].supported_read,
    ...observation.observations.map(item => item.value_read)];
  receipts.forEach((read, index) => {
    assert.equal(read.Status, 9); assert.equal(read.ReportedCount, 1);
    assert.equal(read.Messages[0].Timestamp, index + 1);
    assert.equal(read.Messages[0].ProtocolId, 6);
    assert.deepEqual(read.Messages[0].Data.slice(0, 4), [0, 0, 7, 232]);
  });
  console.log(arch, "six original receipts preserved in internal JSON (not parent-supervised)");
}
