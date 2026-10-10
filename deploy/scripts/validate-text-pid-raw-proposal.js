import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

// Isolated proposal only. Never changes the production decoder or sends data.
const pids = ['65', '66', '7B', '7D', '7E', '85', '88', '8B', '91'];
const source = fs.readFileSync(new URL('../obd-readonly.js', import.meta.url), 'utf8');
const anchor = 'else if (definition.valueType === "text") value = formatRawPidBytes(dataBytes);';
assert.equal(source.split(anchor).length, 2);
const proposed = source.replace(anchor, `else if (${JSON.stringify(pids)}.includes(pid)) return buildUndecodedPidValue(definition, pid, dataBytes);\n    ${anchor}`);
const defs = JSON.parse(fs.readFileSync(new URL('../data/obd-monitor-definitions.json', import.meta.url), 'utf8'));
const load = text => {
  const c = vm.createContext({ window: {} }); vm.runInContext(text, c);
  c.window.ObdReadOnly.configureMonitorDefinitions(defs); return c.window.ObdReadOnly;
};
const current = load(source), proposal = load(proposed);
let checks = 0;
const check = (value, message) => { assert.ok(value, message); checks++; };
for (const [pid, length] of [['65',2], ['66',5], ['7B',7], ['7D',1], ['7E',1], ['85',10], ['88',13], ['8B',7], ['91',5]]) {
  const bytes = Array(length).fill('28').join(' ');
  const input = { live_pid_response: { raw: `41 ${pid} ${bytes}`, source_ecu: '7E8' }, freeze_frame_response: { raw: `42 ${pid} 02 ${bytes}`, source_ecu: '7E8' } };
  const before = current.buildDecodedObdScanSession(input), after = proposal.buildDecodedObdScanSession(input);
  const oldArchive = JSON.stringify(current.buildBridgeSessionExportPayload(before));
  const restoredOld = proposal.buildDiagnosticScanSessionFromJson(oldArchive);
  const newArchive = JSON.stringify(proposal.buildBridgeSessionExportPayload(after));
  const restoredNew = proposal.buildDiagnosticScanSessionFromJson(newArchive);
  const olderReader = current.buildDiagnosticScanSessionFromJson(newArchive);
  for (const key of ['livePidSnapshot', 'freezeFrameSnapshot']) {
    const old = before[key].monitorValues[0];
    check(old.decoded === true && old.valueType === 'text', `${pid}: baseline classification`);
    for (const result of [after, restoredNew, olderReader]) {
      const row = result[key].monitorValues[0];
      check(result[key].monitorValues.length === 1 && row.value === bytes && row.id === old.id, `${pid}: identity/value`);
      check(row.decoded === false && row.valueType === 'raw_hex', `${pid}: proposed classification`);
      check(result[key].monitorValueSummary.undecodedRawCount === 1 && result[key].monitorValueSummary.decodedCount === 0, `${pid}: proposed counts`);
      check(row.sourceEcu === old.sourceEcu && row.freezeFrameNumber === old.freezeFrameNumber, `${pid}: provenance`);
    }
    const kept = restoredOld[key].monitorValues[0];
    check(kept.value === old.value && kept.id === old.id && kept.valueType === 'text' && kept.decoded === true, `${pid}: old text archive changed`);
  }
  check(after.vehicleCommandEnabled === false && after.wouldTransmit === false, `${pid}: transmission`);
}
// Run the full byte-position/truncation/text/archive suite against the isolated proposal.
let regression = fs.readFileSync(new URL('./validate-compound-pid-payload.js', import.meta.url), 'utf8');
regression = regression.replace(/^import .*;\r?\n/gm, '')
  .replace('fs.readFileSync(new URL("../obd-readonly.js", import.meta.url), "utf8")', 'proposedSource')
  .replace('JSON.parse(fs.readFileSync(new URL("../data/obd-monitor-definitions.json", import.meta.url), "utf8"))', 'definitions')
  .replace(/const textPids = new Set\([^\n]+\);/, 'const textPids = new Set();');
vm.runInNewContext(regression, { assert, vm, console, proposedSource: proposed, definitions: defs });
console.log(`Text PID RAW proposal: ${checks} contract/old-new archive checks passed; isolated VM only, production unchanged`);
