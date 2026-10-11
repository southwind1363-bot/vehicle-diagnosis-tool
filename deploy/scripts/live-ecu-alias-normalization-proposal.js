// Historical review patch for the 3.13.677 baseline. Applied to production in 3.13.678.
// Not imported by the application or production regression validators.
function once(source,anchor,replacement){
 if(source.split(anchor).length!==2)throw new Error('Live ECU proposal anchor missing or ambiguous');
 return source.replace(anchor,replacement);
}
export function applyLiveEcuAliasProposal(source){
 let result=source.replace(/\r\n/g,'\n');
 result=once(result,'  function normalizeBridgeLivePidSnapshot(response = {}) {',
 '  function normalizeBridgeLivePidSnapshot(response = {}) {\n    if (hasConflictingJsonEcuAliases(response)) {\n      response = { ok: false, blocked: true, would_transmit: false, errors: ["source_ecu_alias_conflict"], data: {} };\n    }');
 const start=result.indexOf('  function hasConflictingJsonEcuAliases(input) {');
 const end=result.indexOf('\n  function buildDiagnosticScanSessionFromJson',start);
 if(start<0||end<0)throw new Error('checker boundary');
 let guard=result.slice(start,end);
 guard=once(guard,'    const pending = [input];','    const pending = [input];\n    const visited = new WeakSet();');
 guard=once(guard,'      if (!item || typeof item !== "object") continue;',
 '      if (!item || typeof item !== "object" || visited.has(item)) continue;\n      visited.add(item);');
 return result.slice(0,start)+guard+result.slice(end);
}

export function applyLiveEcuAliasUiProposal(source){
 const text=source.replace(/\r\n/g,'\n');
 const start=text.indexOf('function renderObdDeveloperSessionSummary(session = null) {');
 const end=text.indexOf('\nfunction ',start+1);if(start<0||end<0)throw new Error('UI boundary');
 const original=text.slice(start,end);
 const anchor='  const livePidSnapshot = session?.livePidSnapshot || session?.live_pid_snapshot || null;';
 const updated=once(original,anchor,anchor+'\n  const liveEcuErrors = livePidSnapshot?.errorCodes || livePidSnapshot?.error_codes || [];\n  if ((livePidSnapshot?.livePidReadoutStatus || livePidSnapshot?.live_pid_readout_status) === "blocked"\n    && !(livePidSnapshot?.monitorValues || livePidSnapshot?.monitor_values || []).length\n    && Array.isArray(liveEcuErrors) && liveEcuErrors.includes("source_ecu_alias_conflict")) {\n    obdMonitorStatus.textContent = "このライブ記録は、同じ箇所の2つのECU番号が一致しないか形式が不正なため、読取拒否として記録されています。取得元の応答内容を確認してください。";\n  }');
 return text.slice(0,start)+updated+text.slice(end);
}
