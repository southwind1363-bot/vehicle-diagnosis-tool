import {liveEcuAliasCases} from './live-ecu-alias-normalization-cases.js';
const conflict={sourceEcu:'7E8',source_ecu:'7E9'};
export const directImportEcuCases=liveEcuAliasCases.map(t=>({id:t.id,reject:t.reject,parts:{livePidResponse:t.response}}));
for(const key of ['livePidSnapshot','live_pid_snapshot','live_pid_response'])directImportEcuCases.push({id:key+'-raw',reject:true,parts:{[key]:{...conflict,raw:'41 42 36 B0'}}});
directImportEcuCases.push(
 {id:'top-values',reject:true,parts:{monitorValues:[{id:'control_module_voltage',value:14,...conflict}]}},
 {id:'outer-metadata',reject:true,parts:{livePidResponse:{raw:'41 42 36 B0'},metadata:conflict}},
 {id:'mixed-dtc',reject:true,parts:{livePidResponse:{...conflict,raw:'41 42 36 B0'},dtcSnapshot:{codes:['P0300']},vehicleProfile:{make:'test-maker'}}},
 {id:'dtc-conflict',reject:true,parts:{livePidResponse:{raw:'41 42 36 B0'},dtcSnapshot:{codes:['P0300'],...conflict}}},
 {id:'normal-mixed',reject:false,parts:{livePidResponse:{raw:'41 42 36 B0',sourceEcu:'7E8'},dtcSnapshot:{codes:['P0300']}}},
 {id:'normal-empty',reject:false,parts:{}}
);
