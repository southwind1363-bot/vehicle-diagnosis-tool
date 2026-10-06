import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

export function runCompactTranscriptCases(api) {
  const spacedProfile = "iso15765_11bit_normal_h1_caf1_d0_s1_e0";
  const profile = "iso15765_11bit_normal_h1_caf1_d0_s0_e0";
  const cases = [];
  const parse = (command, transcript, completion = "complete") => {
    const input = { profile, command, transcript, completion };
    const result = api.parseElmReadOnlyRawTranscript(input);
    cases.push({ input, result });
    assert.equal(result.profile, profile);
    assert.equal(result.payloadSemanticsVerified, false);
    assert.equal(result.execution.canExecute, false);
    assert.equal(result.execution.wouldTransmit, false);
    assert(!Object.hasOwn(result, "transcript"));
    assert(Object.isFrozen(result) && Object.isFrozen(result.frames));
    return result;
  };
  const compact = text => text.replace(/^[0-9A-F]{3}(?: [0-9A-F]{2}){8}/gm, line => line.replaceAll(" ", ""));
  const positives = [
    ["03", "7E8 02 43 00 AA AA AA AA AA"],
    ["07", "7E8 04 47 01 01 33 AA AA AA"],
    ["0A", "7E8 02 4A 00 AA AA AA AA AA"],
    ["0101", "7E8 06 41 01 00 07 01 00 AA"],
    ["03", "7FF 03 7F 03 78 AA AA AA AA"],
    ["03", "SEARCHING...\nBUS INIT: OK\nNO DATA"],
    ["03", "7E8 10 09 43 01 02 03 04 05\n7E9 10 09 43 11 12 13 14 15\n7E8 21 06 07 08 AA BB CC DD\n7E9 21 16 17 18 AA BB CC DD"]
  ];
  const wrapped = ["7E8 10 76 43 00 00 00 00 00"];
  for (let index = 1; index <= 16; index++) wrapped.push(`7E8 2${(index & 15).toString(16).toUpperCase()} 00 00 00 00 00 00 00`);
  positives.push(["03", wrapped.join("\n")]);
  for (const [command, body] of positives) {
    for (const separator of ["\r", "\r\n"]) {
      const transcript = compact(body).replaceAll("\n", separator) + separator + ">";
      const actual = parse(command, transcript);
      const expected = api.parseElmReadOnlyRawTranscript({ profile: spacedProfile, command,
        transcript: body.replaceAll("\n", separator) + separator + ">", completion: "complete" });
      assert.equal(actual.completion, "complete");
      assert.equal(JSON.stringify({ ...actual, profile: spacedProfile }), JSON.stringify(expected));
    }
  }
  const valid = "7E8024300AAAAAAAAAA\r>";
  for (const [wire, code] of [
    ["7E8 02 43 00 AA AA AA AA AA\r>", "invalid_hex"],
    [valid.slice(1), "compact_frame"],
    ["0" + valid, "compact_frame"],
    [valid.replace("\r", "00\r"), "compact_frame"],
    ["800024300AAAAAAAAAA\r>", "invalid_can_id"],
    [valid.toLowerCase(), "unexpected_line"],
    [valid.replace("\r", "\n"), "bare_lf"],
    [valid.replace("\r>", ""), "incomplete_final_frame"],
    [valid.replace(">", ""), "missing_prompt"],
    [valid + "\r", "prompt_not_terminal"],
    ["03\r" + valid, "unexpected_command_echo"],
    ["NO DATA\r" + valid, "no_data_frame_conflict"],
    ["7E82143000000000000\r>", "orphan_consecutive_frame"],
    ["7E81009430000000000\r>", "incomplete_first_frame"],
    ["7E81009430000000000\r7E82200000000000000\r>", "consecutive_frame_sequence_error"],
    ["7E80043000000000000\r>", "invalid_single_frame_length"],
    ["7E80144000000000000\r>", "unexpected_response_service"],
    ["STOPPED\r>", "stopped"],
    ["\uFFFD\r>", "invalid_content"]
  ]) {
    const result = parse("03", wire);
    assert.equal(result.completion, "error");
    assert(result.errors.some(error => error.code === code), `${code}: ${wire}`);
  }
  const extended = "18DAF110" + "024300AAAAAAAAAA";
  assert.equal(extended.length, 24);
  assert(parse("03", extended + "\r>").errors.some(error => error.code === "unsupported_29bit_frame"));
  for (const completion of ["timeout", "disconnected", "error"]) assert.equal(parse("03", valid, completion).completion, completion);
  assert.equal(parse("03", "7E8024300AAAAAAAAAA\r".repeat(128) + ">").frames.length, 128);
  assert(parse("03", "7E8024300AAAAAAAAAA\r".repeat(129) + ">").errors.some(error => error.code === "can_line_overflow"));
  assert(parse("03", "\r".repeat(256) + ">").errors.some(error => error.code === "physical_line_overflow"));
  assert.throws(() => parse("03", "x".repeat(32769)), error => error.name === "RangeError");
  assert.throws(() => api.parseElmMode04RawTranscript({ profile, transcript: "7E80144000000000000\r>", completion: "complete" }),
    error => error.message === "invalid_elm_mode04_raw_transcript_profile");
  assert(api.parseElmReadOnlyRawTranscript({ profile: spacedProfile, command: "03", transcript: valid, completion: "complete" }).errors.some(error => error.code === "compact_frame"));
  console.log(`ELM compact read-only: ${cases.length} cases; S1 parity, malformed input, ISO-TP, bounds and Mode04 isolation passed`);
  return cases;
}

const runtime = vm.createContext({ window: {}, navigator: {} });
vm.runInContext(fs.readFileSync(new URL("../obd-readonly.js", import.meta.url), "utf8"), runtime);
runCompactTranscriptCases(runtime.window.ObdReadOnly);
