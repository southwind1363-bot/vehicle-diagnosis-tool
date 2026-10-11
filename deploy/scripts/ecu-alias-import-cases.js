const row=(id,value,extra={})=>({id,pid:id==='stft_b1'?'06':id==='ltft_b1'?'07':'42',value,unit:id==='control_module_voltage'?'V':'%',...extra});
const voltage=extra=>row('control_module_voltage',9,extra);
const wrap=rows=>({live_pid_snapshot:{monitor_values:rows}});
const conflict={sourceEcu:'7E8',source_ecu:'7E9'};
export const ecuAliasCases=[
 {id:'row-conflict',input:wrap([voltage(conflict)]),reject:true},
 {id:'false-trim',input:wrap([row('stft_b1',10,conflict),row('ltft_b1',10,{sourceEcu:'7E9'})]),reject:true},
 {id:'header-conflict',input:{live_pid_snapshot:{...conflict,monitor_values:[voltage({})]}},reject:true},
 {id:'child-conflict',input:{live_pid_snapshot:{ecu_snapshots:[{...conflict,monitor_values:[voltage({})]}]}},reject:true},
 {id:'report-wrapper',input:{report:{session:wrap([voltage(conflict)])}},reject:true},
 {id:'export-wrapper',input:{schema_version:'bridge_session_export_v1',session:wrap([voltage(conflict)])},reject:true},
 {id:'top-level-array',input:[voltage(conflict)],reject:true},
 {id:'freeze-frame',input:{freeze_frame_snapshot:{monitor_values:[{...voltage(conflict),freeze_frame_number:0}]}},reject:true},
 {id:'metadata-conflict',input:{...wrap([voltage({sourceEcu:'7E8'})]),metadata:{...conflict}},reject:true},
 {id:'dual-nonstring',input:wrap([voltage({sourceEcu:2024,source_ecu:'2024'})]),reject:true},
 {id:'dual-empty',input:wrap([voltage({sourceEcu:' ',source_ecu:'7E8'})]),reject:true},
 {id:'same-aliases',input:wrap([voltage({sourceEcu:'7E8',source_ecu:'7E8'})]),reject:false},
 {id:'case-space',input:wrap([voltage({sourceEcu:' 7e8 ',source_ecu:'7E8'})]),reject:false},
 {id:'one-alias',input:wrap([voltage({source_ecu:'7E8'})]),reject:false},
 {id:'null-alias',input:wrap([voltage({sourceEcu:null,source_ecu:'7E8'})]),reject:false},
 {id:'no-alias',input:wrap([voltage({})]),reject:false},
 {id:'separate-ecus',input:wrap([voltage({sourceEcu:'7E8'}),voltage({sourceEcu:'7E9'})]),reject:false},
 // Explicit boundary: this proposal compares only the two named aliases,
 // within one object; other aliases and parent/child relationships are deferred.
 {id:'other-alias-deferred',input:wrap([voltage({sourceEcu:'7E8',ecu:'7E9'})]),reject:false},
 {id:'parent-child-deferred',input:{live_pid_snapshot:{sourceEcu:'7E8',monitor_values:[voltage({sourceEcu:'7E9'})]}},reject:false}
];
