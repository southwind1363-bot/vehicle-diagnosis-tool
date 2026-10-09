// Development-only transformation of a supplied source string, never the on-disk app.
export const pid69RawDefinition = Object.freeze({
  id: "egr_system_pid69_raw", label: "EGRシステム応答 PID69", unit: "", category: "排出ガス",
  value_type: "text", service: "01", pid: "69", scope: "standard-generic",
  aliases: ["EGRシステム応答 PID69"], source_ref: "SAE-J1979DA-201110",
  support_note: "7バイトの未換算RAW。指令・実値・偏差への換算と対象車両の適合は未確認。"
});

export function applyPid69RawProposal(source) {
  const edits = [
    ['else if (pid === "69") return decodeCommandedEgrAndError(pid, a, b);', 'else if (pid === "69") return buildUndecodedPidValue(monitorDefinitions.find((item) => item.id === "egr_system_pid69_raw"), pid, dataBytes);'],
    ['"59", "5D", "5E", "63", "69"', '"59", "5D", "5E", "63"'],
    ['if (pid === "68") return 7;', 'if (pid === "68" || pid === "69") return 7;']
  ];
  for (const [before, after] of edits) {
    if (source.split(before).length !== 2) throw new Error("proposal_source_changed");
    source = source.replace(before, after);
  }
  return source;
}
