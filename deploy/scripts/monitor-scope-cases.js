const v = (value, sourceEcu, route = {}) => ({id:'control_module_voltage',pid:'42',value,unit:'V',...(sourceEcu ? {sourceEcu}:{}),...route});
const trim = (id, sourceEcu, route = {}) => ({id,pid:id==='stft_b1'?'06':'07',value:10,unit:'%',...(sourceEcu ? {sourceEcu}:{}),...route});
export const scopeCases = [
  {id:'different-ecu-low-first',rows:[v(9,'7E8'),v(14,'7E9')],low:1,fuel:0},
  {id:'different-ecu-low-last',rows:[v(14,'7E9'),v(9,'7E8')],low:1,fuel:0},
  ...['networkBus','networkChannel','gatewayRoute'].map(field=>({id:'different-'+field,rows:[v(9,'7E8',{[field]:'a'}),v(14,'7E8',{[field]:'b'})],low:1,fuel:0})),
  {id:'cross-ecu-trim',rows:[trim('stft_b1','7E8'),trim('ltft_b1','7E9')],low:0,fuel:0},
  {id:'cross-route-trim',rows:[trim('stft_b1','7E8',{networkBus:'a'}),trim('ltft_b1','7E8',{networkBus:'b'})],low:0,fuel:0},
  {id:'same-scope-trim',rows:[trim('stft_b1','7E8',{networkBus:'CAN'}),trim('ltft_b1','7e8',{network_bus:'can'})],low:0,fuel:1},
  {id:'missing-route-trim',rows:[trim('stft_b1','7E8'),trim('ltft_b1','7E8',{networkBus:'a'})],low:0,fuel:0},
  {id:'missing-ecu-mixed',rows:[trim('stft_b1'),trim('ltft_b1'),v(14,'7E8')],low:0,fuel:0},
  {id:'legacy-no-scope',rows:[trim('stft_b1'),trim('ltft_b1')],low:0,fuel:1},
  {id:'route-conflict',rows:[v(9,'7E8',{networkBus:'a',network_bus:'b'}),v(14,'7E8')],low:0,fuel:0},
  {id:'ecu-conflict',rows:[{...v(9,'7E8'),source_ecu:'7E9'},v(14,'7E8')],low:0,fuel:0},
  {id:'separator-routes',rows:[trim('stft_b1','7E8',{networkBus:'a|b',networkChannel:'c'}),trim('ltft_b1','7E8',{networkBus:'a',networkChannel:'b|c'})],low:0,fuel:0},
  {id:'raw-other-ecu',rows:[v(9,'7E8'),{...v(9,'7E9'),decoded:false}],low:1,fuel:0},
  {id:'raw-same-ecu',rows:[v(9,'7E8'),{...v(9,'7E8'),decoded:false}],low:0,fuel:0},
  {id:'later-scope-after-six',rows:Array.from({length:8},(_,i)=>v(9,'ECU'+i)),low:8,fuel:0},
  {id:'all-conflicting',rows:[v(9,'7E8',{networkScopeConflict:true})],low:0,fuel:0},
  {id:'unknown-low-mixed',rows:[v(9),v(14),v(14,'7E8')],low:1,fuel:0}
];
