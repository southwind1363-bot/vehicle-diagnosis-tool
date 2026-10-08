// Closed, artificial samples; no caller-provided records or transport.
export function createSingleReadoutSample(scenario) {
  if (!["normal", "compact", "no_data", "conflict", "missing_prompt", "codes_present", "mixed_sources", "mixed_conflict", "negative_response"].includes(scenario)) throw new TypeError("unknown_single_readout_sample");
  const profile = scenario === "compact" ? "iso15765_11bit_normal_h1_caf1_d0_s0_e0" : "iso15765_11bit_normal_h1_caf1_d0_s1_e0";
  const receipts = ["03", "07", "0A", "0101"].map((command, index) => {
    let transcript = index === 3 ? "7E8 06 41 01 00 07 01 00 AA\r>"
      : `7E8 02 ${["43", "47", "4A"][index]} 00 AA AA AA AA AA\r>`;
    if (scenario === "codes_present" && index < 3) {
      // Fixed artificial P0133 / P0300 / P0420 payloads, not a vehicle diagnosis.
      transcript = `7E8 04 ${["43", "47", "4A"][index]} 01 ${["01 33", "03 00", "04 20"][index]} AA AA AA\r>`;
    }
    if (["mixed_sources", "mixed_conflict"].includes(scenario)) {
      if (index === 0) transcript = transcript.replace(">", "7E9 04 43 01 01 33 AA AA AA\r>");
      if (index === 1) transcript = transcript.replace(">", "7E9 02 47 00 AA AA AA AA AA\r>");
      if (index === 2) transcript = "NO DATA\r>";
      if (index === 3) transcript = transcript.replace(">", "7E9 06 41 01 00 07 00 00 AA\r>");
    }
    if (scenario === "mixed_conflict") {
      if (index === 0) transcript = transcript.replace(">", "7E9 02 43 00 AA AA AA AA AA\r>");
      if (index === 3) transcript = transcript.replace(">", "7E9 06 41 01 00 07 01 00 AA\r>");
    }
    if (scenario === "no_data") transcript = "NO DATA\r>";
    if (scenario === "negative_response") {
      const negative = `7E9 03 7F ${command.slice(0, 2)} 11 AA AA AA AA\r>`;
      transcript = index === 0 ? transcript.replace(">", negative) : negative;
    }
    if (scenario === "conflict" && index === 0) transcript = transcript.replace(">", "7E8 04 43 01 01 01 AA AA AA\r>");
    if (scenario === "missing_prompt" && index === 3) transcript = transcript.replace(">", "");
    if (scenario === "compact") transcript = transcript.replaceAll(" ", "");
    return Object.freeze({ command, transcript });
  });
  return Object.freeze({ profile, receipts: Object.freeze(receipts) });
}
