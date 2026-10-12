// Historical review patch against 3.13.680, applied in 3.13.681. Not imported by production or regression tests.
import {coreReadoutKinds} from './core-readout-ecu-alias-cases.js';
export function applyCoreReadoutEcuAliasProposal(source){const failure='{ ok: false, blocked: true, would_transmit: false, errors: ["source_ecu_alias_conflict"], data: {} }';for(const spec of coreReadoutKinds){const bridge='normalizeBridge'+spec.kind+'Snapshot';for(const [name,param,body] of [[bridge,'response','response = '+failure+';'],[spec.decode,'input','return '+bridge+'('+failure+');']]){const anchor='  function '+name+'('+param+' = {}) {';if(source.split(anchor).length!==2)throw new Error(name);source=source.replace(anchor,anchor+'\n    if (hasConflictingJsonEcuAliases('+param+')) {\n      '+body+'\n    }');}}return source;}
export function applyCoreReadoutEcuAliasUiProposal(source){
 const replace=(anchor,value)=>{if(source.split(anchor).length!==2)throw new Error('UI anchor');source=source.replace(anchor,value);};
 const errorAnchor='      if (code === "vci_not_detected") return "VCI未検出";';replace(errorAnchor,'      if (code === "source_ecu_alias_conflict") return "同じ箇所のECU番号が不一致または形式不正";\n'+errorAnchor);
 const anchor='  metrics.forEach(([label, value, state, targetId, fallbackTargetId, detail = ""]) => {';
 replace(anchor,`  const ecuAliasRefusedLabels = [];
  for (const [label, snapshot, statusKey] of [
    ["DTC", dtcSnapshot, "dtcReadoutStatus"],
    ["フリーズフレーム", freezeFrameSnapshot, "freezeFrameReadoutStatus"],
    ["レディネス", readinessSnapshot, "readinessReadoutStatus"],
    ["ECU情報", ecuInfoSnapshot, "ecuInfoReadoutStatus"],
    ["対応PID", supportedPidMatrix, "supportedPidReadoutStatus"],
    ["Mode06", onboardMonitorSnapshot, "onboardMonitorReadoutStatus"]
  ]) {
    const errors = snapshot?.errorCodes || snapshot?.error_codes || [];
    const snakeStatusKey = statusKey.replace(/[A-Z]/g, (letter) => "_" + letter.toLowerCase());
    if ((snapshot?.[statusKey] || snapshot?.[snakeStatusKey]) !== "blocked" || !Array.isArray(errors) || !errors.includes("source_ecu_alias_conflict")) continue;
    ecuAliasRefusedLabels.push(label);
    const metric = metrics.find((row) => row[0] === label);
    metric[1] = "—";
    metric[2] = { label: "読取拒否", tone: "missing" };
    metric[5] = "同じ箇所のECU番号が不一致または形式不正";
  }
`+anchor);
 const end='  obdSimpleResultSummary.hidden = false;';replace(end,`  if (ecuAliasRefusedLabels.length) {
    obdSimpleResultBadge.textContent = "読取拒否あり";
    obdSimpleResultNote.textContent += " " + ecuAliasRefusedLabels.join("・") + "はECU番号の不一致または形式不正により拒否された記録です。取得元の応答内容を確認してください。";
  }
`+end);return source;
}
