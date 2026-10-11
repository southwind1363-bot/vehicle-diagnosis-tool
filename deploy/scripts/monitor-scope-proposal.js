// Isolated review patch; never imported by the application.
export const proposedMonitorScope = String.raw`  function getMonitorAnalysisScope(row) {
      const aliases = ["sourceEcu", "source_ecu", "ecu", "ecu_id", "ecuId", "address", "module", "module_id", "moduleId"];
      const inputs = aliases.filter(key => Object.prototype.hasOwnProperty.call(row, key))
        .map(key => row[key]).filter(value => value !== null && value !== undefined);
      const invalid = inputs.some(value => typeof value !== "string" || !value.trim() || value.trim().length > 80);
      const ecus = [...new Set(inputs.filter(value => typeof value === "string")
        .map(value => value.trim().toUpperCase()))];
      const scope = normalizeReadoutNetworkScope(row);
      const ecu = ecus[0] || null;
      const route = [scope.networkBus, scope.networkChannel, scope.gatewayRoute]
        .map(value => value === null ? null : value.normalize("NFKC").toLowerCase());
      return { ecu, route, conflict: invalid || ecus.length > 1 || scope.conflict };
  }

  function analyzeMonitorValues(values = []) {
    if (!values.length) return [];
    const groups = new Map();
    let excluded = 0;
    for (const row of values) {
      const { ecu, route, conflict } = getMonitorAnalysisScope(row);
      if (conflict) { excluded++; continue; }
      const key = JSON.stringify([ecu, ...route]);
      if (!groups.has(key)) groups.set(key, { ecu, route, rows: [] });
      groups.get(key).rows.push(row);
    }
    const mixed = groups.size > 1 || excluded > 0;
    const result = [];
    if (mixed) result.push({
      level: "info", title: "ECU・通信経路を分けて分析",
      detail: "記録のECUと通信経路が一致する範囲で参考情報を再計算しました。出所の一致は同時測定や実車適合の証明ではありません。" + (excluded ? " 出所が矛盾・不正な" + excluded + "行は分析から除外しました。" : ""),
      nextStep: "対象ECU・通信経路と測定条件を確認して比較する"
    });
    for (const group of groups.values()) {
      const unknownMixed = mixed && group.ecu === null;
      const display = value => value === null ? "未記録" : JSON.stringify(value);
      const label = "対象: ECU " + display(group.ecu) + " / バス " + display(group.route[0])
        + " / チャンネル " + display(group.route[1]) + " / ゲートウェイ経路 " + display(group.route[2]) + "。";
      // An unknown ECU in a mixed record is not a shared origin. Keep only
      // independent single-value cautions; never combine its rows.
      const insights = unknownMixed
        ? group.rows.flatMap(row => analyzeMonitorValuesWithinScope([row]).filter(item => item.level === "caution"))
        : analyzeMonitorValuesWithinScope(group.rows);
      if (unknownMixed) insights.unshift({level: "info", title: "ECU未記録の相関分析を保留",
        detail: "ECU未記録の値は同じ取得元と確認できないため、複数項目を組み合わせていません。",
        nextStep: "取得元を確認し、ECU・通信経路を記録する"});
      const labeled = mixed || group.ecu !== null || group.route.some(value => value !== null);
      result.push(...insights.map(item => labeled ? { ...item, detail: label + " " + item.detail } : item));
    }
    // No global six-row cap: a later scope must not hide its cautions.
    return result;
  }

`;

export function applyMonitorScopeProposal(source) {
  const normalized = source.replace(/\r\n/g, '\n');
  const anchor = '  function analyzeMonitorValues(values = []) {';
  if (normalized.split(anchor).length !== 2) throw new Error('Monitor scope proposal anchor missing or ambiguous');
  let result=normalized.replace(anchor, proposedMonitorScope + '  function analyzeMonitorValuesWithinScope(values = []) {');
  const old='      monitorById.set(item.id, selectPreferredMonitorValue(monitorById.get(item.id), candidate));';
  if(result.split(old).length!==3)throw new Error('Two merge anchors required');
  const loop='    scannerAnalysis.monitorValues.forEach((item) => {';
  if(result.split(loop).length!==2)throw new Error('Scanner merge anchor required');
  result=result.replace(loop, '    const hasIdentifiedMonitorSource = [...scannerAnalysis.monitorValues, ...bridgeMonitorValues].some(item => Boolean(getMonitorAnalysisScope(item).ecu));\n' + loop);
  result=result.replaceAll(old, `      const scope = getMonitorAnalysisScope(item);
      const key = scope.conflict || (hasIdentifiedMonitorSource && !scope.ecu) ? Symbol("unresolved monitor scope") : JSON.stringify([item.id, scope.ecu, ...scope.route]);
      monitorById.set(key, selectPreferredMonitorValue(monitorById.get(key), candidate));`);
  const resolved='    const observedSourceEcus = [...new Set(monitorValues.map((item) => item.sourceEcu || item.source_ecu || null).filter(Boolean))];\n    const resolvedSourceEcu = sourceEcu || (observedSourceEcus.length === 1 ? observedSourceEcus[0] : null);';
  if(result.split(resolved).length!==2)throw new Error('Snapshot ECU resolution anchor required');
  result=result.replace(resolved, resolved.replace('observedSourceEcus.length === 1 ?', 'observedSourceEcus.length === 1 && monitorValues.every(item => item.sourceEcu || item.source_ecu) ?'));
  return result;
}
