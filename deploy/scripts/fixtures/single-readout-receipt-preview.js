// Presentation only: trusted derived receipt summaries, never execution authority.
export function formatSingleReadoutReceiptPreview(result) {
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
    const receipt = raw.readouts[index];
    if (receipt.noDataReported) lines.push("  NO DATA報告あり。故障コード0件とは判断できません。");
    // Translate only known derived codes. Never expose raw responses or unknown identifiers.
    if (receipt.errorCodes.includes("missing_prompt")) lines.push("  確認点: 応答の終端記号を確認できません。");
    if (receipt.errorCodes.some(code => code !== "missing_prompt")) lines.push("  確認点: 応答形式に未確認の問題があります。");
    if (row.blockerIds.includes("dtc_payload_conflict")) lines.push("  確認点: DTC応答の件数・内容に不整合があります。");
    if (row.blockerIds.includes("readiness_payload_conflict")) lines.push("  確認点: レディネス応答の長さ・内容に不整合があります。");
    lines.push("  保留: 対象ECUの範囲は未確認");
  });
  return Object.freeze({ ok: true, reason: null, text: lines.join("\n") });
}
