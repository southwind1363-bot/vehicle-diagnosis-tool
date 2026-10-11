import {ecuAliasCases} from './ecu-alias-import-cases.js';
export const bridgeEcuAliasCases=ecuAliasCases.map(test=>{
 const input=test.input;
 const data=Array.isArray(input)?{values:input}:input.live_pid_snapshot?{...input,...input.live_pid_snapshot}:input.freeze_frame_snapshot?{...input,...input.freeze_frame_snapshot}:input;
 return {id:test.id,reject:test.reject,response:{request_id:'review-response',ok:true,blocked:false,would_transmit:false,errors:[],data}};
});
bridgeEcuAliasCases.push({id:'outer-envelope-conflict',reject:true,response:{...bridgeEcuAliasCases[0].response,data:{values:[]},sourceEcu:'7E8',source_ecu:'7E9'}});
export const readIntents=['read_stored_dtc','read_pending_dtc','read_permanent_dtc','read_freeze_frame','read_supported_pids','read_ecu_info','read_onboard_monitor','read_readiness','read_live_pid_snapshot'];
