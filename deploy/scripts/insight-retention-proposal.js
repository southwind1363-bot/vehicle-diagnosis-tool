// Isolated review patch. Never imported by the application.
export const proposedInsightMerge = String.raw`  function mergeRecordedMonitorInsights(recorded, recalculated) {
    const merged = [...recorded];
    for (const insight of recalculated) {
      const keys = Object.keys(insight);
      const alreadyRecorded = merged.some(item => item && typeof item === "object" && !Array.isArray(item)
        && Object.keys(item).length === keys.length
        && keys.every(key => Object.prototype.hasOwnProperty.call(item, key) && item[key] === insight[key]));
      if (!alreadyRecorded) merged.push(insight);
    }
    return merged;
  }
`;

export function applyInsightRetentionProposal(source) {
  let next = source.replace(/\r\n/g, '\n');
  const replacements = [
    [`    const monitorInsights = [...new Map([
      ...explicitMonitorInsights,
      ...analyzeMonitorValues(monitorValues)
    ].map((item, index) => [item?.id || item?.title || \`monitor_insight_\${index}\`, item])).values()];`,
    '    const monitorInsights = mergeRecordedMonitorInsights(explicitMonitorInsights, analyzeMonitorValues(monitorValues));'],
    [`    const monitorInsights = [...new Map([
      ...bridgeMonitorInsights.map((item) => [
        item?.id || item?.title || JSON.stringify(item),
        item
      ]),
      ...recalculatedMonitorInsights.map((item) => [
        item?.id || item?.title || JSON.stringify(item),
        item
      ])
    ]).values()];`,
    '    const monitorInsights = mergeRecordedMonitorInsights(bridgeMonitorInsights, recalculatedMonitorInsights);'],
    ['  function analyzeMonitorValues(values = []) {', proposedInsightMerge + '\n  function analyzeMonitorValues(values = []) {']
  ];
  for (const [before, after] of replacements) {
    if (next.split(before).length !== 2) throw new Error('Insight retention proposal anchor missing or ambiguous');
    next = next.replace(before, after);
  }
  return next;
}
