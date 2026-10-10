import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync(new URL("../script.js", import.meta.url), "utf8");
const html = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
const extract = (name) => source.match(new RegExp(`function ${name}\\([^)]*\\) \\{[\\s\\S]*?\\r?\\n\\}`))?.[0] || assert.fail(`Missing ${name}`);
let checks = 0;
const check = (condition, message) => { assert.ok(condition, message); checks += 1; };
function element() {
  return { children: [], dataset: {}, value: "", hidden: false, handlers: {}, textContent: "",
    appendChild(child) { this.children.push(child); }, addEventListener(name, handler) { this.handlers[name] = handler; },
    focus() { this.focused = true; }, scrollIntoView() {} };
}
const nodes = Object.fromEntries(["obdDtcFilter", "obdDtcSearch", "obdDtcSearchClear", "obdDtcFilterCount", "obdDtcFilterEmpty", "obdCode", "resultTitle"].map((id) => [id, element()]));
const subscriptions = [];
const dtcs = [
  { code: "P0300", ecu: "7E8", subcode: "11" },
  { code: "P0300", ecu_id: "7E9", sub_code: "12", ecu_name: "Engine B" },
  { code: "P0171", ecu: "7E8", oem_detail_code: "123" }
];
const snapshot = JSON.stringify(dtcs);
const vehicle = { maker: "Toyota", model: "retained vehicle" };
const observedArguments = [];
let diagnosisInput;
const coreContext = vm.createContext({window:{}});
vm.runInContext(fs.readFileSync(new URL("../obd-readonly.js",import.meta.url),"utf8"),coreContext);
const context = vm.createContext({
  window: coreContext.window,
  NO_DATA: "未記録",
  document: { querySelector: (selector) => nodes[selector.slice(1)], createElement: element },
  obdDetectedCodes: element(), MutationObserver: class { constructor(callback) { this.callback = callback; } observe(target, options) { subscriptions.push({ callback: this.callback, target, options }); } },
  buildSelectedObdVehicleProfile: () => ({ maker: "different selection" }), withReportedDtcEcu: (profile) => profile,
  findDtcDefinitionCandidates: () => [], evaluateDtcDefinitionCandidatesApplicability: () => ({ status: "unverified" }),
  buildDtcDefinitionScopeSummary: () => "", buildSourceSpecificDtcContext: () => ({ hasDefinitions: false }),
  selectApplicableDtcDefinition: () => null, getModernGenericMatches: () => [], describeUnregisteredDtc: () => "Unverified",
  evaluateDtcConcurrentRequirements: (_definition, observed) => { observedArguments.push(observed); return { required: [], missing: [] }; },
  describeDtcDefinitionApplicabilityReason: (_reason, fallback) => fallback,
  formatDtcReference: (code, subcode) => `${code}:${subcode}`, activateTab: () => {},
  getInput: () => ({ retainedMarker: "input" }), buildDiagnosis: (input) => { diagnosisInput = input; return {}; }, renderDiagnosis: () => {}
});
vm.runInContext(["initializeObdReadoutFilter", "initializeObdDtcFilter", "formatObdBridgeDtcStatusLabel", "getObdDisplayByteNumber", "getObdMonitorDisplayLabel", "formatObdLegacyControlReviewNote", "formatObdTemperatureConversion", "formatObdFreezeFrameValueLine", "formatObdBridgeReadoutValue", "formatObdBridgeCompositeValue", "buildObdDtcDisplayKey", "createObdDtcCard", "handleDetectedDtcClick", "scrollToObdSection"].map(extract).join("\n"), context);
context.initializeObdDtcFilter();
check(nodes.obdDtcFilter.hidden && subscriptions.length === 1, "DTC filter must wait for cards");
const cards = dtcs.map((dtc) => context.createObdDtcCard(dtc, dtcs, vehicle));
context.obdDetectedCodes.children = cards;
subscriptions[0].callback();
check(nodes.obdDtcFilterCount.textContent === "全3件を表示" && !nodes.obdDtcFilter.hidden, "DTC filter lost ECU/subcode-distinct rows");
const search = (query) => { nodes.obdDtcSearch.value = query; nodes.obdDtcSearch.handlers.input(); return cards.filter((card) => !card.hidden); };
for (const [query, expected] of [["p0300", 2], ["Ｐ０３００　７ｅ９", 1], ["11", 1], ["Engine B", 1], ["123", 1], ["P0420", 0], ["<script>", 0], ["", 3]]) {
  check(search(query).length === expected, `Incorrect DTC search for ${query}`);
  check(nodes.obdDtcFilterEmpty.hidden === (expected !== 0), `Incorrect no-match state for ${query}`);
}
check(JSON.stringify(dtcs) === snapshot && observedArguments.length === 3 && observedArguments.every((value) => value === dtcs) && !diagnosisInput,
  "Search modified diagnostic records, repeated applicability analysis or changed concurrent DTC inputs");
const chosen = search("p0300 7e9")[0];
const button = chosen.children.find((child) => child.dataset.dtcCode);
context.handleDetectedDtcClick({ target: { closest: () => button } });
check(nodes.obdCode.value === "P0300:12" && diagnosisInput.vehicleProfile === vehicle && diagnosisInput.retainedMarker === "input",
  "Filtered detail action lost its original subcode, vehicle or existing input fields");
nodes.obdDtcSearchClear.handlers.click();
check(nodes.obdDtcSearch.focused && nodes.obdDtcSearchClear.disabled && cards.every((card) => !card.hidden), "DTC clear did not restore all cards/focus");
search("P0300");
context.obdDetectedCodes.children = [context.createObdDtcCard({ code: "P0420" }, [], vehicle)];
subscriptions[0].callback();
check(nodes.obdDtcFilterCount.textContent === "絞込中: 0 / 1件" && !nodes.obdDtcFilterEmpty.hidden, "Replacement result ignored filter state");
context.obdDetectedCodes.children = [];
subscriptions[0].callback();
check(nodes.obdDtcFilter.hidden && nodes.obdDtcSearch.value === "" && nodes.obdDtcFilterEmpty.hidden, "Empty DTC list kept stale search state");
check(source.includes("initializeObdDtcFilter();") && html.includes('aria-controls="obdDetectedCodes"') && html.includes('aria-label="DTC検索を解除"'), "Missing DTC search initialization/accessibility");
check(!extract("initializeObdReadoutFilter").includes("obdDevSession"), "Display filter must not access the saved diagnostic session");
for (const hasRows of [true, false]) {
  let scrolled;
  const target = (name, children = []) => ({ children, closest: (selector) => selector === "#obdReadoutSurface" ? {} : null, scrollIntoView: () => { scrolled = name; } });
  const targets = { obdDetectedCodes: target("cards", hasRows ? [{}] : []), obdDtcFilter: { ...target("search"), hidden: !hasRows },
    obdImportStatus: target("status"), "obd-panel": { classList: { contains: () => true } } };
  const nav = vm.createContext({ document: { getElementById: (id) => targets[id] }, obdAccessUnlocked: true, renderObdStageView: () => {} });
  vm.runInContext(extract("scrollToObdSection"), nav);
  nav.scrollToObdSection("obdDetectedCodes");
  check(scrolled === (hasRows ? "search" : "status"), "DTC navigation hid search or empty-readout status");
}
const stateCases = [
  [{ status: "stored" }, "保存DTC", null],
  [{ status: "pending" }, "保留DTC", null],
  [{ status: "permanent" }, "永久DTC", null],
  [{}, "DTC状態不明", null],
  [{ status: "unknown", reportedStatus: "pending" }, "DTC状態不明", "pending"],
  [{ status: "stored", reported_status: "permanent" }, "保存DTC", "permanent"],
  [{ status: "pending", reportedStatus: " PENDING " }, "保留DTC", null],
  [{ status: "active", reportedStatus: "Current" }, "DTC状態不明 / 分類値: active", "Current"],
  [{ status: "unknown", statusByte: "FF" }, "DTC状態不明", null],
  [{ kind: "pending" }, "保留DTC", null],
  [{ dtc_status: "permanent" }, "永久DTC", null],
  [{ dtcStatus: " Stored " }, "保存DTC", null],
  [{ status: "stored", kind: "pending" }, "保存DTC", null],
  [{ status: " ", reportedStatus: "permanent" }, "DTC状態不明", "permanent"],
  [{ status: "<img src=x>" }, "DTC状態不明 / 分類値: <img src=x>", null]
];
for (const [fields, label, reported] of stateCases) {
  const dtc = { code: "P0300", ecu: "7E8", ...fields };
  const before = JSON.stringify(dtc);
  const card = context.createObdDtcCard(dtc, [dtc], vehicle);
  const state = card.children.find((child) => child.className === "obd-dtc-readout-state");
  const report = card.children.find((child) => child.textContent.startsWith("診断機報告ステータス:"));
  check(state?.textContent === label && card.dataset.dtcSearch.includes(label.split(" / ")[0]), "DTC state missing, inferred or not searchable");
  check(reported ? report?.textContent === `診断機報告ステータス: ${reported}` : !report, "Conflicting report was hidden or identical report duplicated");
  check(JSON.stringify(dtc) === before, "Rendering DTC state changed its source record");
}
const stateRecords = ["stored", "pending", "permanent"].map((status) => ({ code: "P0300", ecu: "7E8", status }));
const stateCards = stateRecords.map((record) => context.createObdDtcCard(record, stateRecords, vehicle));
context.obdDetectedCodes.children = stateCards;
subscriptions[0].callback();
check(new Set(stateRecords.map((record) => context.buildObdDtcDisplayKey(record))).size === 3 && nodes.obdDtcFilterCount.textContent === "全3件を表示", "State-distinct DTCs merged or lost from count");
for (const [query, index] of [["保存", 0], ["保留", 1], ["永久", 2], ["P0300 7e8 pending", 1]]) {
  nodes.obdDtcSearch.value = query;
  nodes.obdDtcSearch.handlers.input();
  check(stateCards.filter((card) => !card.hidden).length === 1 && !stateCards[index].hidden && nodes.obdDtcFilterCount.textContent === "絞込中: 1 / 3件", "State search selected the wrong DTC instance");
}
for (const [matches, expected] of [
  [[{}], "FF番号未記録"],
  [[{ frameNumber: null }], "FF番号未記録"],
  [[{ frameNumber: 0 }], "#0"],
  [[{ frame_number: "255" }], "#255"],
  [[{ frameNumber: 2 }, { frame_number: "2" }], "#2"],
  [[{ frameNumber: 1 }, {}], "#1, FF番号未記録"],
  [[{ frameNumber: false, frame_number: 2 }], "FF番号未記録"],
  [[{ frameNumber: [] }, { frameNumber: -1 }, { frameNumber: 256 }, { frameNumber: " " }], "FF番号未記録"]
]) {
  const dtc = { code: "P0300", ecu: "7E8", freezeFrameMatchCount: matches.length, freezeFrameMatches: matches };
  const before = JSON.stringify(dtc);
  const previousDiagnosisInput = diagnosisInput;
  const card = context.createObdDtcCard(dtc, [dtc], vehicle);
  const line = card.children.find((child) => child.textContent.startsWith("フリーズフレーム:"));
  check(line?.textContent === `フリーズフレーム: DTC / サブコード / ECU 一致確認済み (${expected})`, "Matched FF display fabricated a frame or concealed missing frame metadata");
  check(JSON.stringify(dtc) === before && diagnosisInput === previousDiagnosisInput, "FF label changed match evidence or triggered diagnosis");
}
const summarySource = extract("renderObdDeveloperSessionSummary");
const extendedCountLine = summarySource.split(/\r?\n/).find((line) => line.trim().startsWith("const udsDtcExtendedDataRecordCount ="));
check(Boolean(extendedCountLine), "Missing extended-record display count");
for (const field of ["extendedDataRecordNumber", "extended_data_record_number"]) {
  for (const [value, expected] of [[null, 0], [undefined, 0], ["", 0], [" ", 0], [false, 0], [true, 0], [[], 0], [[0], 0], [256, 0], [-1, 0], [1.5, 0], ["0x01", 0], [0, 1], ["0", 1], [255, 1], [" 2 ", 1]]) {
    const dtcs = [{ code: "P0300", [field]: value }];
    const before = JSON.stringify(dtcs);
    context.dtcSnapshot = { dtcs };
    const count = vm.runInContext(`(() => { ${extendedCountLine}\nreturn udsDtcExtendedDataRecordCount; })()`, context);
    check(count === expected && JSON.stringify(dtcs) === before, "Extended-record count invented an observation or changed DTC input");
  }
}

// DTC-linked FF display must not collapse equal values from distinct evidence.
const linkedBase = { id: 'engine_speed', label: 'エンジン回転数', value: 0, unit: 'rpm', decoded: true, frameNumber: 0, sourceEcu: '7E8' };
const linkedRefs = [linkedBase, { ...linkedBase, frameNumber: 1 }, { ...linkedBase, sourceEcu: '7E9' },
  { ...linkedBase, value: '01 02', decoded: false }, { ...linkedBase, decoded: false }, { ...linkedBase }];
const linkedDtc = { code: 'P0300', ecu: '7E8', freezeFrameMatchCount: 1,
  freezeFrameMatches: [{ frameNumber: 0, freezeFrameValueRefs: linkedRefs }] };
const linkedBefore = JSON.stringify(linkedDtc);
const linkedCard = context.createObdDtcCard(linkedDtc, [linkedDtc], vehicle);
const linkedLine = linkedCard.children.find(child => child.textContent.startsWith('FF実測:')).textContent;
for (const fragment of ['0 rpm [7E8 / FF #0]', '0 rpm [7E8 / FF #1]', '0 rpm [7E9 / FF #0]',
  'RAW 01 02 [7E8 / FF #0] / 未換算', 'RAW 0 [7E8 / FF #0] / 未換算'])
  check(linkedLine.includes(fragment), 'DTC-linked FF lost context or RAW boundary: ' + fragment);
check(linkedLine.split('エンジン回転数:').length - 1 === 5, 'Distinct evidence collapsed or identical duplicate retained');
check(!linkedLine.includes('01 02 rpm'), 'Physical unit attached to RAW');
check(JSON.stringify(linkedDtc) === linkedBefore, 'DTC-linked references changed during display');
for (const [frameNumber, expected] of [[null, 'FF番号未記録'], [false, 'FF番号未記録'], [256, 'FF番号未記録'], ['255', 'FF #255']]) {
  const row = { ...linkedBase, frameNumber, sourceEcu: null };
  const card = context.createObdDtcCard({ ...linkedDtc, freezeFrameMatches: [{ freeze_frame_value_refs: [row] }] }, [], vehicle);
  const line = card.children.find(child => child.textContent.startsWith('FF実測:')).textContent;
  check(line.includes('[ECU未記録 / ' + expected + ']'), 'DTC-linked reference invented ECU/frame');
}
const limitedCard = context.createObdDtcCard({ ...linkedDtc, freezeFrameMatches: [{
  freezeFrameValueRefs: Array.from({ length: 7 }, (_, frameNumber) => ({ ...linkedBase, frameNumber })) }] }, [], vehicle);
const limitedLine = limitedCard.children.find(child => child.textContent.startsWith('FF実測:')).textContent;
check(limitedLine.includes('FF #5') && !limitedLine.includes('FF #6') && limitedLine.endsWith(' / ほか'), 'DTC-linked display limit lost');


const routeBase={code:'P0171',ecu:'7E8',status:'stored'};
for(const [a,b] of [[{networkBus:'CAN|A'},{networkBus:'CAN A'}], [{networkBus:'CAN',networkChannel:'-'},{networkBus:'CAN'}], [{gatewayRoute:'a|b'},{gatewayRoute:'a b'}], [{},{networkBus:'CAN'}]]) {
 check(context.buildObdDtcDisplayKey({...routeBase,...a})!==context.buildObdDtcDisplayKey({...routeBase,...b}),'Different network scopes collapsed in display');
}
check(context.buildObdDtcDisplayKey({...routeBase,networkBus:' ＣＡＮ '})===context.buildObdDtcDisplayKey({...routeBase,network_bus:'can'}),'Canonical network aliases split in display');
const scopedCard=context.createObdDtcCard({...routeBase,networkBus:'CAN|A',networkChannel:'1',gatewayRoute:'GW-A'},[],vehicle);
const scopedState=scopedCard.children.find(child=>child.className==='obd-dtc-readout-state');
for(const text of ['バス: CAN|A','チャネル: 1','経路: GW-A']){
 check(scopedState.textContent.includes(text),'Missing scope label: '+text);
 check(scopedCard.dataset.dtcSearch.includes(text),'Scope absent from search: '+text);
}
const conflictCard=context.createObdDtcCard({...routeBase,networkBus:'A',network_bus:'B'},[],vehicle);
check(conflictCard.children.some(child=>child.textContent.includes('通信経路: 情報に矛盾あり')),'Scope conflict hidden');

console.log(`DTC filter checks: ${checks} / Errors: 0`);
