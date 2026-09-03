import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync(new URL("../script.js", import.meta.url), "utf8");
const extract = (name) => source.match(new RegExp(`function ${name}\\([^)]*\\) \\{[\\s\\S]*?\\r?\\n\\}`))?.[0] || assert.fail(`Missing ${name}`);
let checks = 0;
const check = (condition, message) => { assert.ok(condition, message); checks += 1; };
let displayed;
let displayedInsights;
const context = vm.createContext({
  NO_DATA: "未記録", obdMonitorStatus: {},
  renderObdMonitorValues: (values, insights) => { displayed = values; displayedInsights = insights; context.obdMonitorStatus.textContent = "LIVE_STATUS"; }
});
vm.runInContext(["renderObdBridgeMeasurementValues", "formatObdFreezeFrameValueLine", "formatObdFreezeFrameTriggerEntry", "formatObdBridgeReadoutValue", "formatObdBridgeCompositeValue"].map(extract).join("\n"), context);
const live = { monitorValues: [{ id: "rpm", value: 780 }], monitorInsights: [{ title: "live" }] };
const freeze = { monitorValues: [{ id: "rpm", value: 2500 }], monitorInsights: [{ title: "FF" }] };
const original = JSON.stringify({ live, freeze });
for (const liveSnapshot of [null, {}, { monitorValues: [] }, live]) {
  for (const freezeSnapshot of [null, {}, freeze]) {
    context.renderObdBridgeMeasurementValues(liveSnapshot, freezeSnapshot);
    check(liveSnapshot === live ? displayed === live.monitorValues && displayedInsights === live.monitorInsights : displayed.length === 0,
      "FF values replaced live values or empty readout left stale values");
    check(displayed !== freeze.monitorValues && displayedInsights !== freeze.monitorInsights, "FF data/insights leaked into live presentation");
    check((liveSnapshot !== live && freezeSnapshot === freeze) === context.obdMonitorStatus.textContent.includes("FF・ECU"), "FF-only readout lost its dedicated-view notice");
  }
}
check(JSON.stringify({ live, freeze }) === original, "Presentation changed source snapshots");
for (const [item, expected] of [
  [{ label: "RPM", value: 0, unit: "rpm", sourceEcu: "7E8", freezeFrameNumber: 0 }, "RPM: 0 rpm [7E8 / FF #0]"],
  [{ id: "rpm", value: 2000, source_ecu: "7E9", freeze_frame_number: 2 }, "rpm: 2000 [7E9 / FF #2]"],
  [{ id: "raw", value: "AA BB", decoded: false }, "raw: AA BB [ECU未記録 / FF番号未記録] / 未換算"],
  [{ id: "missing", value: null, freezeFrameNumber: null }, "missing: 未記録 [ECU未記録 / FF番号未記録]"],
  [{ id: "negative", value: -40, freezeFrameNumber: -1 }, "negative: -40 [ECU未記録 / FF番号未記録]"],
  [{ id: "empty", value: false, freezeFrameNumber: "" }, "empty: false [ECU未記録 / FF番号未記録]"],
  [{ id: "html", value: "<img src=x>", sourceEcu: "<ECU>" }, "html: <img src=x> [<ECU> / FF番号未記録]"]
]) {
  const before = JSON.stringify(item);
  check(context.formatObdFreezeFrameValueLine(item) === expected, "FF value lost its value/ECU/frame/raw status or inferred missing metadata");
  check(JSON.stringify(item) === before, "FF line formatter modified a readout item");
}
const details = extract("renderObdBridgeSessionDetails");
for (const field of ["frameNumber", "frame_number"]) {
  for (const value of [undefined, null, "", " ", "\t", false, true, [], [0], {}, -1, 256, 1.5, NaN, Infinity, "-1", "256", "1.5", "0x01", "1e1"]) {
    const entry = Object.freeze({ code: "p0300", reportedStatus: "stored", sourceEcu: "7E8", [field]: value });
    check(context.formatObdFreezeFrameTriggerEntry(entry) === "P0300 / stored / FF番号未記録 / 7E8", "Absent or invalid trigger frame became an observed frame number");
    check(Object.is(entry[field], value), "Trigger presentation changed original frame metadata");
  }
  for (const value of [0, 1, 255, "0", "01", "255", " 2 "]) {
    const entry = Object.freeze({ dtc: "P0301", reported_status: "pending", source_ecu: "7E9", [field]: value });
    check(context.formatObdFreezeFrameTriggerEntry(entry) === `P0301 / pending / #${Number(value)} / 7E9`, "Valid trigger frame, status, or ECU was lost");
  }
}
check(context.formatObdFreezeFrameTriggerEntry({ code: "P0300" }) === "P0300 / FF番号未記録", "Omitted trigger frame was presented as zero");
check(context.formatObdFreezeFrameTriggerEntry(null) === "起点DTC未記録", "Missing trigger entry was invented");
check(context.formatObdFreezeFrameTriggerEntry({ code: "P0300", frameNumber: false, frame_number: 2 }) === "P0300 / FF番号未記録", "Invalid primary frame was replaced by its alias");
const core = vm.createContext({ window: {} });
vm.runInContext(fs.readFileSync(new URL("../obd-readonly.js", import.meta.url), "utf8"), core);
for (const frame of [undefined, null, 0, 2]) {
  const snapshot = core.window.ObdReadOnly.normalizeFreezeFrameSnapshot({
    trigger_dtc_entries: [{ code: "P0300", source_ecu: "7E8", frame_number: frame }]
  });
  const before = JSON.stringify(snapshot);
  const restored = JSON.parse(before);
  const expected = `P0300 / ${frame == null ? "FF番号未記録" : `#${frame}`} / 7E8`;
  check(context.formatObdFreezeFrameTriggerEntry(snapshot.triggerDtcEntries[0]) === expected, "Normalized trigger display confused missing frame with frame zero");
  check(context.formatObdFreezeFrameTriggerEntry(restored.triggerDtcEntries[0]) === expected, "JSON-restored trigger display lost frame provenance");
  check(JSON.stringify(snapshot) === before && JSON.stringify(restored) === before, "Trigger formatting mutated normalized or restored data");
}
const block = details.slice(details.indexOf("  const freezeFrameValues ="), details.indexOf("  if (!sections.length)"));
const values = Array.from({ length: 8 }, (_, index) => ({ label: `Value${index}`, value: index, sourceEcu: `ECU${index % 4}`, freezeFrameNumber: index }));
Object.assign(context, {
  freezeFrameSnapshot: { monitorValues: values, triggerDtcEntries: Array.from({ length: 5 }, (_, i) => ({ code: `P000${i}` })),
    freezeFrameEcuSnapshots: Array.from({ length: 4 }, (_, i) => ({ sourceEcu: `ECU${i}`, capturedAt: `time${i}`, protocol: "CAN" })) },
  sections: [], getObdFreezeFrameTriggerEntries: (snapshot) => snapshot.triggerDtcEntries || [],
  summarizeObdExpectedItems: () => ({}), formatObdBridgeMonitorSummary: () => "8項目"
});
vm.runInContext(block, context);
const [title, lines] = context.sections[0];
check(title === "フリーズフレーム" && values.every((value) => lines.includes(context.formatObdFreezeFrameValueLine(value))), "Dedicated FF section truncated readout values");
check(lines.some((line) => line.includes("P0004")) && lines.some((line) => line.includes("ECU3: time3")), "FF section truncated trigger or ECU context");
check(lines.find((line) => line.startsWith("起点DTC:")).includes("FF番号未記録")
  && !lines.find((line) => line.startsWith("起点DTC:")).includes("#0"), "Dedicated FF display inferred a missing trigger frame");
check(extract("renderObdBridgeReadout").includes("renderObdBridgeMeasurementValues(livePidSnapshot, freezeFrameSnapshot)")
  && !source.includes("renderObdMonitorValues(freezeFrameValues"), "Bridge still routes FF values to live monitor");
check(details.includes("item.textContent = line;"), "Readout lines must be rendered as text");
console.log(`Freeze-frame display checks: ${checks} / Errors: 0`);
