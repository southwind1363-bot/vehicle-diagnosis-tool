import {directImportEcuCases} from './direct-import-ecu-alias-cases.js';
export const remainingEcuCases=[];
for(const api of ['buildBridgeSessionSummary','buildBridgeSessionExportPayload'])for(const t of directImportEcuCases)remainingEcuCases.push({id:api+'-'+t.id,api,input:t.parts,reject:t.reject});
const bad={sourceEcu:'7E8',source_ecu:'7E9'};
for(const [id,input,reject] of [
 ['raw-conflict',{...bad,raw:'41 42 36 B0'},true],['response-conflict',{...bad,response:'41 42 36 B0'},true],['bytes-conflict',{...bad,bytes:[65,66,54,176]},true],
 ['ignored-metadata',{raw:'41 42 36 B0',metadata:bad},true],['invalid-type',{raw:'41 42 36 B0',sourceEcu:7,source_ecu:'7'},true],
 ['normal-raw',{raw:'41 42 36 B0',sourceEcu:'7E8'},false],['normal-zero',{raw:'41 42 00 00'},false],['normal-aliases',{raw:'41 42 36 B0',sourceEcu:' 7e8 ',source_ecu:'7E8'},false],
 ['normal-string','41 42 36 B0',false],['normal-bytes',[65,66,54,176],false],['normal-null-alias',{raw:'41 42 36 B0',sourceEcu:null,source_ecu:'7E8'},false],['empty',{},false]
])remainingEcuCases.push({id:'decode-'+id,api:'decodeLivePidResponse',input,reject});
