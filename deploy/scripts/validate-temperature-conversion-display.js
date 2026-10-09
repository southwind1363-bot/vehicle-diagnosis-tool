import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { proposeTemperatureConversion } from "./fixtures/temperature-pid-conversion-proposal.js";
const source = fs.readFileSync(new URL("../script.js", import.meta.url), "utf8");
const code = source.match(/function formatObdTemperatureConversion\([^)]*\) \{[\s\S]*?\r?\n\}/)?.[0];
assert.ok(code);
const context = vm.createContext({}); vm.runInContext(code, context);
const format = context.formatObdTemperatureConversion;
let checks = 0;
const check = (condition) => { assert.ok(condition); checks++; };
for (const [pid, id, count] of [["67", "engine_coolant_temp_sensors", 2], ["68", "intake_air_temp_sensors", 6]]) {
  for (let mask = 0; mask < 256; mask++) {
    const payload = [mask, ...Array.from({ length: count }, (_, i) => 40 + i)];
    const raw = payload.map(byte => byte.toString(16).padStart(2, "0")).join(" ");
    const row = Object.freeze({ id, pid, value: raw, decoded: false });
    const before = JSON.stringify(row), text = format(row);
    const proposed = proposeTemperatureConversion(pid, payload);
    check(proposed.values.slice(1).every(value => text.includes(`: ${value.value} °C`)));
    check((text.match(/°C/g) || []).length === proposed.values.length - 1);
    check(JSON.stringify(row) === before);
  }
  for (let index = 0; index < count; index++) for (let byte = 0; byte < 256; byte++) {
    const payload = [1 << index, ...Array(count).fill(0)]; payload[index + 1] = byte;
    const text = format({ id, pid, value: payload.map(b => b.toString(16).padStart(2, "0")).join(" "), decoded: false });
    const label = pid === "67" ? `冷却水温${index + 1}` : `吸気温 B${Math.floor(index / 3) + 1} S${index % 3 + 1}`;
    check(text.includes(`${label}: ${byte - 40} °C`) && (text.match(/°C/g) || []).length === 1);
  }
  for (const value of [null, 85, "", "03 28", "03 28 7D 00 00 00 00 00", "03 0x28 7D", "03 2G 7D", "<img>", [3, 40, 125]]) {
    check(!format({ id, pid, value, decoded: false }).includes("°C"));
  }
  check(format({ id, pid, value: 85 }) === "");
  check(format({ id: "unrelated", pid, value: "03 28 7D", decoded: false }) === "");
}
check(format({ id: "engine_coolant_temp_sensors", pid: "67", value: " 03\t28 7d ", undecodedRaw: true }).includes("冷却水温2: 85 °C"));
console.log(`Temperature conversion display: ${checks} checks passed; display-only, immutable RAW`);
