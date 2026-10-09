// Development-only proposal. Not imported by the app or any transport.
// SAE J1979-DA OCT2011 Tables B83/B84; see TEMPERATURE-PID-CONVERSION-REVIEW.md.
export const proposedTemperatureDefinitions = Object.freeze([
  ...[1, 2].map((sensor) => ({ id: `coolant_temp_sensor_${sensor}`, label: `冷却水温センサー${sensor}`, pid: "67" })),
  ...[1, 2].flatMap((bank) => [1, 2, 3].map((sensor) => ({ id: `intake_air_temp_b${bank}s${sensor}`, label: `吸気温 B${bank} S${sensor}`, pid: "68" })))
].map((row) => Object.freeze({ ...row, unit: "°C", category: "温度", value_type: "number", service: "01", scope: "standard-generic", aliases: [row.label], source_ref: "SAE-J1979DA-201110", support_note: "センサー位置・値の意味は対象車両の整備書で確認。故障判定には使用しない。" })));

export function proposeTemperatureConversion(pid, payload) {
  const definitions = proposedTemperatureDefinitions.filter((row) => row.pid === pid);
  const result = { proposalOnly: true, vehicleCommandEnabled: false, wouldTransmit: false, reason: null, values: [] };
  if (!definitions.length) return { ...result, reason: "unsupported_pid" };
  if (!Array.isArray(payload) || payload.length !== definitions.length + 1
    || Array.from(payload).some((byte) => !Number.isInteger(byte) || byte < 0 || byte > 255)) {
    return { ...result, reason: "invalid_payload" };
  }
  const raw = { id: pid === "67" ? "engine_coolant_temp_sensors" : "intake_air_temp_sensors", pid,
    value: payload.map((byte) => byte.toString(16).toUpperCase().padStart(2, "0")).join(" "), decoded: false, note: "未換算RAW値" };
  result.values.push(raw);
  const mask = (1 << definitions.length) - 1;
  // Unknown reserved bits are not interpreted under the older verified definition.
  if ((payload[0] & ~mask) !== 0) return { ...result, reason: "reserved_support_bits" };
  for (let index = 0; index < definitions.length; index++) {
    if ((payload[0] & (1 << index)) === 0) continue;
    result.values.push({ id: definitions[index].id, pid, value: payload[index + 1] - 40, unit: "°C", decoded: true });
  }
  result.reason = payload[0] === 0 ? "no_supported_sensors" : "conversion_proposed";
  return result;
}
