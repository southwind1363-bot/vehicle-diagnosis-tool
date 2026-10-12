export const coreReadoutKinds=[
 {kind:'Dtc',decode:'decodeObdDtcResponse',slot:'dtcSnapshot',status:'dtcReadoutStatus',raw:'43 03 00',data:{dtcs:[{code:'P0300'}]}},
 {kind:'FreezeFrame',decode:'decodeFreezeFrameResponse',slot:'freezeFrameSnapshot',status:'freezeFrameReadoutStatus',raw:'42 0C 00 0F A0',data:{values:[{pid:'0C',value:1000,unit:'rpm'}]}},
 {kind:'Readiness',decode:'decodeReadinessResponse',slot:'readinessSnapshot',status:'readinessReadoutStatus',raw:'41 01 00 07 00 00',data:{monitors:[{id:'misfire',supported:true,complete:true}]}},
 {kind:'EcuInfo',decode:'decodeEcuInfoResponse',slot:'ecuInfoSnapshot',status:'ecuInfoReadoutStatus',raw:'49 04 01 43 41 4C 2D 31',data:{items:[{id:'calibration_id',value:'CAL-1'}]}},
 {kind:'OnboardMonitor',decode:'decodeOnboardMonitorResponse',slot:'onboardMonitorSnapshot',status:'onboardMonitorReadoutStatus',raw:'46 01 01 00 05 00 01 00 09',data:{tests:[{test_id:'01',component_id:'01',value:5,min:1,max:9}]}},
 {kind:'SupportedPid',decode:'decodeSupportedPidResponse',slot:'supportedPidMatrix',status:'supportedPidReadoutStatus',raw:'41 00 80 00 00 00',data:{supported_pids:['01']}}
];
export const coreReadoutEcuCases=[];
for(const spec of coreReadoutKinds)for(const type of ['decode','bridge']){const api=type==='decode'?spec.decode:'normalizeBridge'+spec.kind+'Snapshot';const seed=type==='decode'?{raw:spec.raw}:{ok:true,blocked:false,data:spec.data};for(const [name,extra,reject] of [
 ['conflict',{sourceEcu:'7E8',source_ecu:'7E9'},true],['empty-alias',{sourceEcu:'',source_ecu:'7E9'},true],['invalid-alias',{sourceEcu:7,source_ecu:'7'},true],['metadata-conflict',{metadata:{sourceEcu:'7E8',source_ecu:'7E9'}},true],['nested-conflict',{unused:[{sourceEcu:'7E8',source_ecu:'7E9'}]},true],
 ['normal',{},false],['one-alias',{sourceEcu:'7E8'},false],['same-aliases',{sourceEcu:'7E8',source_ecu:'7E8'},false],['space-case',{sourceEcu:' 7e8 ',source_ecu:'7E8'},false],['null-alias',{sourceEcu:null,source_ecu:'7E8'},false],['other-aliases',{sourceEcu:'7E8',ecu:'7E9'},false],['separate-objects',{metadata:[{sourceEcu:'7E8'},{source_ecu:'7E9'}]},false]
])coreReadoutEcuCases.push({...spec,api,id:spec.kind+'-'+type+'-'+name,input:{...seed,...extra},reject});}
