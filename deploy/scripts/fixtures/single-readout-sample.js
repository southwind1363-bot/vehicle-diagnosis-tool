// Closed, artificial samples; no caller-provided records or transport.
export function createSingleReadoutSample(scenario) {
  if (!["normal", "compact", "no_data", "conflict", "missing_prompt"].includes(scenario)) throw new TypeError("unknown_single_readout_sample");
  const profile = scenario === "compact" ? "iso15765_11bit_normal_h1_caf1_d0_s0_e0" : "iso15765_11bit_normal_h1_caf1_d0_s1_e0";
  const receipts = ["03", "07", "0A", "0101"].map((command, index) => {
    let transcript = index === 3 ? "7E8 06 41 01 00 07 01 00 AA\r>"
      : `7E8 02 ${["43", "47", "4A"][index]} 00 AA AA AA AA AA\r>`;
    if (scenario === "no_data") transcript = "NO DATA\r>";
    if (scenario === "conflict" && index === 0) transcript = transcript.replace(">", "7E8 04 43 01 01 01 AA AA AA\r>");
    if (scenario === "missing_prompt" && index === 3) transcript = transcript.replace(">", "");
    if (scenario === "compact") transcript = transcript.replaceAll(" ", "");
    return Object.freeze({ command, transcript });
  });
  return Object.freeze({ profile, receipts: Object.freeze(receipts) });
}
