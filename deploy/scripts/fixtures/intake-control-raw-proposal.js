// Isolated development proposal. Never writes or imports the production application.
export const intakeControlRawDefinitions = [
  ["6A", "intake_air_flow_pid6a_raw", "吸気流量制御応答 PID6A"],
  ["6C", "throttle_control_pid6c_raw", "スロットル制御応答 PID6C"]
].map(([pid, id, label]) => Object.freeze({
  id, pid, label, unit: "", category: "吸気", value_type: "text", service: "01",
  scope: "standard-generic", aliases: [label], source_ref: "SAE-J1979DA-201110",
  support_note: "5バイトの未換算RAW。A/B指令・実位置への換算と車両適合は未確認。"
}));

export function applyIntakeControlRawProposal(source) {
  const edits = [
    ['"5A", "5B", "6A", "6C", "A5"', '"5A", "5B", "A5"'],
    ['"61", "62", "6A", "6C", "84"', '"61", "62", "84"'],
    ['if (pid === "64") return 5;', 'if (["64", "6A", "6C"].includes(pid)) return 5;'],
    ['else if (pid === "84") value = a - 40;', `else if (["6A", "6C"].includes(pid)) {
      const id = pid === "6A" ? "intake_air_flow_pid6a_raw" : "throttle_control_pid6c_raw";
      const rawDefinition = monitorDefinitions.find((item) => item.id === id);
      return rawDefinition ? buildUndecodedPidValue(rawDefinition, pid, dataBytes) : null;
    }
    else if (pid === "84") value = a - 40;`]
  ];
  for (const [before, after] of edits) {
    if (source.split(before).length !== 2) throw new Error("proposal_source_changed");
    source = source.replace(before, after);
  }
  return source;
}
