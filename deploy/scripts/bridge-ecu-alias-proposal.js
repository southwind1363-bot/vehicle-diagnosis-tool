// Review-only patches. Not loaded by the application.
function once(source, anchor, replacement) {
 if(source.split(anchor).length!==2)throw new Error('Bridge ECU proposal anchor missing or ambiguous');
 return source.replace(anchor,replacement);
}
export function applyBridgeEcuCoreProposal(source) {
 return once(source.replace(/\r\n/g,'\n'),'    normalizeBridgeLivePidSnapshot,','    normalizeBridgeLivePidSnapshot,\n    hasConflictingJsonEcuAliases,');
}
export function applyBridgeEcuUiProposal(source) {
 let result=source.replace(/\r\n/g,'\n');
 result=once(result,'    onSuccess(response);',
 '    if (!isSafeLocalBridgeIntent(intent) && window.ObdReadOnly.hasConflictingJsonEcuAliases(response)) {\n      throw new Error("source_ecu_alias_conflict");\n    }\n    onSuccess(response);');
 return once(result,'  if (codes.includes("bridge_response_invalid"))',
 '  if (codes.includes("source_ecu_alias_conflict")) return "応答内の同じ箇所に記録された2つのECU番号が一致しないか、形式が不正なため、今回の結果は採用していません。現在の読取結果を保持しています。取得元の応答内容を確認してください。";\n  if (codes.includes("bridge_response_invalid"))');
}
