import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {isDeepStrictEqual} from 'node:util';
import {createHash} from 'node:crypto';

const source = fs.readFileSync(new URL('../obd-readonly.js', import.meta.url), 'utf8');
const fixture = JSON.parse(fs.readFileSync(new URL('./fixtures/insight-retention-legacy-3.13.673.json', import.meta.url), 'utf8'));
const definitions = JSON.parse(fs.readFileSync(new URL('../data/obd-monitor-definitions.json', import.meta.url), 'utf8'));
const load = code => {
  const context = vm.createContext({window:{}});
  vm.runInContext('Date = class extends Date { constructor(...args) { super(...(args.length ? args : [1791712800000])); } static now() { return 1791712800000; } };',context);
  vm.runInContext(code, context);
  context.window.ObdReadOnly.configureMonitorDefinitions(definitions);
  return context.window.ObdReadOnly;
};
const after = load(source);
const plain = value => JSON.parse(JSON.stringify(value));
let checks = 0;
const equal = (actual, expected, message) => { assert.ok(isDeepStrictEqual(plain(actual), plain(expected)), message); checks++; };
const check = (value, message) => { assert.ok(value, message); checks++; };
const withoutInsights = value => {
  if (Array.isArray(value)) return value.map(withoutInsights);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).filter(([key])=>!['monitorInsights','monitor_insights'].includes(key)).map(([key,item])=>[key,withoutInsights(item)]));
};

const digest = value => createHash('sha256').update(JSON.stringify(withoutInsights(value))).digest('hex');

const selectedId = process.argv.find(value=>value.startsWith('--case='))?.slice(7);
const selectedCases = selectedId ? fixture.cases.filter(test=>test.id===selectedId) : fixture.cases;
assert.ok(selectedCases.length,'selected fixture exists');
for (const test of selectedCases) {
  const input = plain(test.input), original = JSON.stringify(input);
  equal(after.normalizeBridgeLivePidSnapshot(input).monitorValues, test.oldMonitorValues, test.id + ': frozen values');

  for (const alias of ['monitorInsights', 'monitor_insights', 'insights']) {
    const snapshot = after.normalizeBridgeLivePidSnapshot({values:input.values,[alias]:input.monitorInsights});
    equal(digest(snapshot), test.oldNormalizationRestSha256, test.id + ': normalization outside insights unchanged');
    equal(snapshot.monitorInsights.slice(0,input.monitorInsights.length), input.monitorInsights, test.id + ': every supplied row retained in order');
    equal(snapshot.monitor_insights, snapshot.monitorInsights, test.id + ': alias coherence');
    // The generated rows must be present without inferring origin from a matching title.
    for (const generated of after.analyzeMonitorValues(snapshot.monitorValues)) {
      check(snapshot.monitorInsights.some(row => JSON.stringify(Object.entries(row).sort()) === JSON.stringify(Object.entries(generated).sort())), test.id + ': generated insight present');
    }
    let repeated = snapshot;
    for (let round=0;round<4;round++) {
      repeated = after.normalizeBridgeLivePidSnapshot(repeated);
      equal(repeated.monitorInsights, snapshot.monitorInsights, test.id + ': no normalization growth');
    }
  }

  for (const alias of ['monitorInsights','monitor_insights']) {
    const merged = after.mergeDiagnosticInputs({bridgeImport:{monitorValues:input.values,[alias]:input.monitorInsights}});
    equal(digest(merged), test.oldMergeRestSha256, test.id + ': merge outside insights unchanged');
    equal(merged.monitorInsights.slice(0,input.monitorInsights.length),input.monitorInsights,test.id + ': merge keeps supplied prefix');
    equal(merged.monitorInsights,merged.monitor_insights,test.id + ': merge aliases');
    equal(after.mergeDiagnosticInputs({bridgeImport:merged}).monitorInsights,merged.monitorInsights,test.id + ': merge idempotence');
  }

  let session = after.buildDiagnosticScanSession({livePidSnapshot:input});
  const savedRows = plain(session.livePidSnapshot.monitorInsights);
  equal(savedRows.slice(0,input.monitorInsights.length),input.monitorInsights,test.id + ': session keeps supplied rows');
  for (let round=0;round<3;round++) {
    session = after.buildDiagnosticScanSessionFromJson(JSON.stringify(after.buildBridgeSessionExportPayload(session)));
    equal(session.livePidSnapshot.monitorInsights,savedRows,test.id + ': archive repeat retains rows without growth');
  }
  const bridge = after.buildBridgeDiagnosticImport({livePidSnapshot:input});
  const composed = after.mergeDiagnosticInputs({bridgeImport:bridge});
  equal(composed.monitorInsights.slice(0,input.monitorInsights.length),input.monitorInsights,test.id + ': composed import keeps supplied rows');
  equal(JSON.stringify(input),original,test.id + ': input is unchanged');
  console.log(test.id + ': retention and repeated archive checks passed');
}
const collision = fixture.cases.find(test=>test.id==='same-title');
check(!collision.oldInsights.some(row=>row.detail==='保存時の原文A'),'old overwrite reproduced');
for(const id of ['exact-computed','reordered-keys','duplicate-records']) {
  const test=fixture.cases.find(row=>row.id===id);
  equal(after.normalizeBridgeLivePidSnapshot(test.input).monitorInsights.length,test.input.monitorInsights.length,id+': append suppressed only for exact generated content');
}
console.log(`Insight retention production regression: ${checks} checks passed / ${selectedCases.length} cases; production code and frozen legacy evidence, no vehicle I/O`);
