import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync(new URL("../script.js", import.meta.url), "utf8");
const html = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
const names = ["renderObdReadoutVehicle", "formatVehicleProfileLabel", "formatVehicleApplicabilitySummary"];
const code = names.map((name) => source.match(new RegExp(`function ${name}\\([^)]*\\) \\{[\\s\\S]*?\\r?\\n\\}`))?.[0] || assert.fail(`Missing ${name}`)).join("\n");
let checks = 0;
const check = (condition, message) => { assert.ok(condition, message); checks += 1; };
class Element {
  constructor(tag) { this.tag = tag; this.children = []; this.textContent = ""; }
  set innerHTML(_value) { assert.fail("Vehicle information must be rendered as text"); }
  append(...items) { this.children.push(...items); }
  appendChild(item) { this.children.push(item); }
  replaceChildren() { this.children = []; }
}
const summary = new Element("dl");
const currentSelection = { value: "CURRENT VEHICLE B" };
const context = vm.createContext({
  document: { getElementById: (id) => id === "obdReadoutVehicle" ? summary : null, createElement: (tag) => new Element(tag) },
  obdVehicleInput: currentSelection,
  buildSelectedObdVehicleProfile: () => assert.fail("Result display must not substitute the current selection")
});
vm.runInContext(code, context);
const fields = () => Object.fromEntries(summary.children.map((group) => [group.children[0].textContent, group.children[1].textContent]));
for (const [profileKey, applicabilityKey, modelKey, engineKey] of [
  ["vehicleProfile", "vehicleApplicability", "modelCode", "engineCode"],
  ["vehicle_profile", "vehicle_applicability", "model_code", "engine_code"]
]) {
  const session = { [profileKey]: { maker: "Maker A", model: "Model A", [modelKey]: "AAA-123", year: 2019, [engineKey]: "ENGINE-A" }, [applicabilityKey]: { status: "unknown" } };
  const before = JSON.stringify(session);
  context.renderObdReadoutVehicle(session);
  check(!summary.hidden && summary.children.length === 5, "Result vehicle fields were not displayed");
  const expected = fields();
  check(expected["読取結果の車両"] === "Maker A Model A" && expected["型式"] === "AAA-123" && expected["年式"] === "2019" && expected["エンジン型式"] === "ENGINE-A", "Stored vehicle fields changed or were replaced by current selection");
  check(expected["車種適合"] === "未判定", "Vehicle identity alone must not establish applicability");
  currentSelection.value = "CURRENT VEHICLE C";
  context.renderObdReadoutVehicle(session);
  check(JSON.stringify(fields()) === JSON.stringify(expected) && JSON.stringify(session) === before, "Selection or repeated rendering rewrote the result vehicle");
}
context.renderObdReadoutVehicle({});
check(Object.values(fields()).filter((value) => value === "未記録").length === 4 && fields()["車種適合"] === "未判定", "Missing fields must remain explicitly unrecorded");
context.renderObdReadoutVehicle({ vehicleProfile: { label: "<img src=x onerror=alert(1)>" }, vehicleApplicability: { status: "matched" } });
check(fields()["読取結果の車両"] === "<img src=x onerror=alert(1)>" && fields()["車種適合"] === "適合候補あり", "Text escaped incorrectly or candidate applicability was promoted to confirmed");
for (const preview of [{ previewMode: true }, { preview_mode: true }, { source: "interface_preview" }, { source_type: "interface_preview" }]) {
  context.renderObdReadoutVehicle({ ...preview, vehicleProfile: { model: "Preview" } });
  check(fields()["プレビューの車両（未読取）"] === "Preview", "Connection preview was displayed as an acquired vehicle");
}
for (const empty of [null, undefined, [], "invalid"]) {
  context.renderObdReadoutVehicle(empty);
  check(summary.hidden && summary.children.length === 0, "Clearing a session left stale vehicle identity visible");
}
check(html.split('id="obdReadoutVehicle"').length === 2 && html.indexOf('id="obdReadoutVehicle"') > html.indexOf('id="obdStageResultsView"'), "Vehicle summary must be unique and in the results stage");
check(source.includes("renderObdReadoutVehicle(obdDevSession.lastSession);"), "Vehicle display must refresh with active session export controls");
console.log(`Readout vehicle checks: ${checks} / Errors: 0`);
