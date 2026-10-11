import {bridgeEcuAliasCases} from './bridge-ecu-alias-cases.js';
const voltage=value=>({id:'control_module_voltage',pid:'42',value,unit:'V',sourceEcu:'7E8'});
export const liveEcuAliasCases=bridgeEcuAliasCases.map(t=>({...t}));
liveEcuAliasCases.push(
 {id:'raw-header-conflict',reject:true,response:{ok:true,blocked:false,sourceEcu:'7E8',source_ecu:'7E9',raw:'41 42 36 B0'}},
 {id:'canonical-values-conflict',reject:true,response:{monitorValues:[{...voltage(14),source_ecu:'7E9'}]}},
 {id:'stored-insight-conflict',reject:true,response:{monitor_values:[voltage(14)],monitorInsights:[{title:'保存した注記',detail:'元の文章',sourceEcu:'7E8',source_ecu:'7E9'}]}},
 {id:'mixed-valid-and-conflict',reject:true,response:{monitor_values:[voltage(14),{...voltage(9),source_ecu:'7E9'}]}},
 {id:'normal-zero',reject:false,response:{monitor_values:[voltage(0)]}},
 {id:'normal-raw',reject:false,response:{sourceEcu:'7E8',raw:'41 42 36 B0'}},
 {id:'normal-blocked',reject:false,response:{ok:false,blocked:true,errors:['sample_mode_no_vehicle_readout'],data:{}}}
);
