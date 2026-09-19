import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { createJ2534Mode01ResultConverter } from "./j2534-mode01-result-converter.js";
const context = vm.createContext({ window: {}, navigator: {} });
vm.runInContext(fs.readFileSync(new URL("../obd-readonly.js", import.meta.url), "utf8"), context);
const obd = context.window.ObdReadOnly;
obd.configureMonitorDefinitions(JSON.parse(fs.readFileSync(new URL("../data/obd-monitor-definitions.json", import.meta.url), "utf8")));
const convert = createJ2534Mode01ResultConverter(obd.decodeLivePidResponse);
const read = bytes => ({ Status: 9, ReportedCount: 1, Messages: [{ ProtocolId: 6, RxStatus: 0, TxFlags: 0,
  Timestamp: 7, ExtraDataIndex: 0, Data: [0, 0, 7, 232, ...bytes] }] });
const sample = (pid = 5) => ({ fixture_only: true, cleanup_confirmed: true, request_ecu: 2016, pid,
  value: pid === 5 ? 90 : 2000, supported_read: read([65, 0, 8, 16, 0, 0]),
  value_read: read(pid === 5 ? [65, 5, 130] : [65, 12, 31, 64]) });
const completion = input => ({ status: 0, signal: null, error: null, stderr: "", stdout: JSON.stringify(input) });
let checks = 0;
for (const pid of [5, 12]) {
  const input = sample(pid), before = JSON.stringify(input);
  const result = convert(completion(input), { request_ecu: 2016, pid });
  assert.equal(result.status, "decoded");
  assert.equal(result.snapshot.source, "j2534_development_read");
  assert.equal(result.snapshot.monitor_values.length, 1);
  assert.equal(result.evidence.value_read.Status, 9);
  assert.equal(JSON.stringify(input), before); checks += 5;
}
for (const mutate of [x => x.cleanup_confirmed = false, x => x.fixture_only = false,
  x => x.value = 91, x => x.pid = 12, x => x.supported_read.Messages[0].Data[6] = 0,
  x => x.value_read.Status = 16, x => x.value_read.ReportedCount = 0,
  x => x.value_read.Messages[0].Data[3] = 233, x => x.value_read.Messages[0].Data.push(0),
  x => x.value_read.Messages[0].RxStatus = 8, x => x.value_read.Messages[0].TxFlags = 64,
  x => x.value_read.Messages[0].ExtraDataIndex = 4, x => x.extra = true]) {
  const input = sample(); mutate(input);
  assert.equal(convert(completion(input), { request_ecu: 2016, pid: 5 }).snapshot, null); checks++;
}
for (const change of [{ status: 1 }, { status: null }, { signal: "SIGTERM" }, { error: {} }, { stderr: "error" }, { stdout: "x".repeat(8193) }]) {
  assert.equal(convert({ ...completion(sample()), ...change }, { request_ecu: 2016, pid: 5 }).snapshot, null); checks++;
}
const zero = sample(); zero.value = 0; zero.value_read.Messages[0].Data[6] = 40;
assert.equal(convert(completion(zero), { request_ecu: 2016, pid: 5 }).status, "decoded"); checks++;
console.log(`Mode01 result checks: ${checks}; synthetic completions, no driver or vehicle`);
