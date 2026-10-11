// Isolated review patch. Not imported by the application.
export const proposedEcuAliasGuard = String.raw`  function hasConflictingJsonEcuAliases(input) {
    const pending = [input];
    while (pending.length) {
      const item = pending.pop();
      if (!item || typeof item !== "object") continue;
      if (!Array.isArray(item)) {
        const camel = item.sourceEcu;
        const snake = item.source_ecu;
        if (camel !== null && camel !== undefined && snake !== null && snake !== undefined) {
          if (typeof camel !== "string" || typeof snake !== "string"
            || !camel.trim() || !snake.trim()
            || camel.trim().toUpperCase() !== snake.trim().toUpperCase()) return true;
        }
      }
      for (const value of Object.values(item)) {
        if (value && typeof value === "object") pending.push(value);
      }
    }
    return false;
  }

`;

function once(source, before, after) {
  if (source.split(before).length !== 2) throw new Error('ECU alias proposal anchor missing or ambiguous');
  return source.replace(before, after);
}
export function applyEcuAliasImportProposal(source) {
  let result=source.replace(/\r\n/g,'\n');
  result=once(result,'  function buildDiagnosticScanSessionFromJson(value, options = {}) {',proposedEcuAliasGuard+'  function buildDiagnosticScanSessionFromJson(value, options = {}) {');
  return once(result,'    const nativeConnectorArchive = parsed && typeof parsed === "object" && !Array.isArray(parsed)',`    if (hasConflictingJsonEcuAliases(parsed)) return {
      accepted: false, ok: false, blocked: true,
      errors: ["source_ecu_alias_conflict"],
      vehicleCommandEnabled: false, vehicle_command_enabled: false,
      wouldTransmit: false, would_transmit: false, retainedRawText: false
    };
    const nativeConnectorArchive = parsed && typeof parsed === "object" && !Array.isArray(parsed)`);
}
export function applyEcuAliasImportUiProposal(source) {
  return once(source.replace(/\r\n/g,'\n'),
    '    const errors = Array.isArray(structuredImportSession.errors) ? structuredImportSession.errors.filter(Boolean) : [];',
    `    const errors = Array.isArray(structuredImportSession.errors) ? structuredImportSession.errors.filter(Boolean) : [];
    if (errors.includes("source_ecu_alias_conflict")) {
      setObdStage("results");
      obdImportStatus.textContent = "同じ箇所に記録された2つのECU番号が一致しないか、形式が不正なため、このJSONは取り込めません。元ファイルの取得元を確認してください。現在の読取結果は保持しています。";
      scrollToObdSection("obdImportStatus");
      return;
    }`);
}
