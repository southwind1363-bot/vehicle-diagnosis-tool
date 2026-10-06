// Fixed development samples only. No clear event, external receipt, storage or transport.
import { createReadOnlyReceiptCapture } from "./readonly-receipt-capture.js";

export function createSingleReadoutPreviewSession(api, scenario = "normal") {
  if (!["normal", "no_data", "conflict", "missing_prompt"].includes(scenario)) throw new TypeError("unknown_single_readout_sample");
  const owner = createReadOnlyReceiptCapture(api);
  const ticket = owner.begin();
  try {
    ["03", "07", "0A", "0101"].forEach((command, index) => {
      let transcript = index === 3 ? "7E8 06 41 01 00 07 01 00 AA\r>"
        : `7E8 02 ${["43", "47", "4A"][index]} 00 AA AA AA AA AA\r>`;
      if (scenario === "no_data") transcript = "NO DATA\r>";
      if (scenario === "conflict" && index === 0) transcript = transcript.replace(">", "7E8 04 43 01 01 01 AA AA AA\r>");
      if (scenario === "missing_prompt" && index === 3) transcript = transcript.replace(">", "");
      const started = owner.startCommand(ticket, command, "iso15765_11bit_normal_h1_caf1_d0_s1_e0", index * 2);
      if (!started.ok) throw new Error("single_readout_sample_unavailable");
      // Artificial chunks and times for the fixed sample; no serial reception is implied.
      for (let offset = 0; offset < transcript.length; offset += 7) {
        if (!owner.append(started.ticket, transcript.slice(offset, offset + 7)).ok) throw new Error("single_readout_sample_unavailable");
      }
      if (!owner.endCommand(started.ticket, index * 2 + 1, "complete").ok) throw new Error("single_readout_sample_unavailable");
    });
    if (!owner.finish(ticket, "complete").ok) throw new Error("single_readout_sample_unavailable");
    return Object.freeze({
      inspect() {
        const result = owner.inspect(ticket);
        if (!result.ok) return Object.freeze({ ok: false, reason: result.reason, text: null });
        const summary = result.summary, raw = summary.rawTranscriptValidation;
        const semantics = raw?.semanticObservation;
        if (summary.status !== "finished" || !semantics || semantics.readouts.length !== 4) {
          return Object.freeze({ ok: false, reason: "semantic_observation_unavailable", text: null });
        }
        const titles = ["保存DTC", "保留DTC", "恒久DTC", "readiness"];
        const labels = {
          source_positive_empty_observed: "報告元からコード0件の応答（車両全体の0件は未確認）",
          source_positive_nonempty_observed: "故障コードを含む応答（この見本ではコード詳細を表示しません）",
          source_positive_reported: "readiness応答あり（全項目完了の判定ではありません）",
          missing_or_unproven: "正応答を確認できません",
          indeterminate: "判定保留（応答の矛盾・不足または受信品質を確認してください）"
        };
        const lines = ["模擬の一回分の記録（実車の読取結果ではありません）",
          "取得元・対象車両・ECUの網羅性は未確認です。消去前後の比較ではありません。",
          "表示文章は実行許可に使えません。車両送信なし。",
          `応答形式: ${raw.status === "parsed" ? "固定profileで解析済み（内容や実車適合の保証ではありません）" : "確認できません"}`];
        semantics.readouts.forEach((row, index) => {
          lines.push(`${titles[index]}: ${Object.hasOwn(labels, row.observation) ? labels[row.observation] : "確認できません"}`);
          if (raw.readouts[index].noDataReported) lines.push("  NO DATA報告あり。故障コード0件とは判断できません。");
          lines.push("  保留: 対象ECUの範囲は未確認");
        });
        return Object.freeze({ ok: true, reason: null, text: lines.join("\n") });
      },
      dispose() { owner.invalidate(); }
    });
  } catch (error) { owner.invalidate(); throw error; }
}
