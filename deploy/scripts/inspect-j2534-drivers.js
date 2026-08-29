import { buildJ2534IdentityProbeReadiness, discoverJ2534RegistryDrivers, getJ2534DiscoveryEnvironment } from "../local-bridge-readonly.js";

const devices = discoverJ2534RegistryDrivers({
  enabled: true,
  inspectLibraries: true
});
const environment = getJ2534DiscoveryEnvironment(devices);

const summary = {
  inspection: "registry_and_static_dll_metadata",
  vehicle_communication_started: false,
  vehicle_command_enabled: false,
  ...environment,
  identity_probe_readiness: buildJ2534IdentityProbeReadiness(devices),
  detected_count: devices.length,
  devices: devices.map((device) => ({
    id: device.id,
    label: device.label,
    vendor: device.vendor,
    adapter_family: device.adapter_family,
    driver_status: device.driver_status,
    driver_library_inspection_status: device.driver_library_inspection_status,
    driver_library_architecture: device.driver_library_architecture,
    driver_library_bitness: device.driver_library_bitness,
    bridge_runtime_architecture: device.bridge_runtime_architecture,
    bridge_runtime_bitness: device.bridge_runtime_bitness,
    driver_runtime_compatible: device.driver_runtime_compatible,
    driver_runtime_compatibility_status: device.driver_runtime_compatibility_status,
    driver_required_api_ready: device.driver_required_api_ready,
    driver_readonly_api_ready: device.driver_readonly_api_ready,
    driver_missing_readonly_apis: device.driver_missing_readonly_apis,
    connected: false,
    vehicle_command_enabled: false
  }))
};

console.log(JSON.stringify(summary, null, 2));
