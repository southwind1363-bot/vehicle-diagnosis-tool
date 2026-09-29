import { buildJ2534IdentityProbeReadiness, discoverJ2534RegistryDrivers, getJ2534DiscoveryEnvironment, inspectJ2534RegistryQueries } from "../local-bridge-readonly.js";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

// CLI-only diagnostics. Failed reg.exe queries do not prove absence: status 1
// can mean either a missing key or denied access. Never classify localized stderr.
export function inspectJ2534Drivers({ platform = process.platform, queryRegistry = execFileSync } = {}) {
  const { registryText, queries: observations, complete } = inspectJ2534RegistryQueries({ platform, queryRegistry });
  const devices = discoverJ2534RegistryDrivers({ registryText, inspectLibraries: true });
  const environment = getJ2534DiscoveryEnvironment(devices);
  const readiness = buildJ2534IdentityProbeReadiness(devices);
  if (!complete) {
    environment.registration_status = "registry_discovery_incomplete";
    environment.driver_readiness_status = "registry_discovery_incomplete";
    environment.next_check = platform === "win32" ? "verify_registry_query_access_and_key_presence" : "inspect_on_windows";
    environment.open_review_status = "blocked";
    environment.open_review_blockers = ["registry_discovery_incomplete"];
  }

  return {
    inspection: "registry_and_static_dll_metadata",
    vehicle_communication_started: false,
    vehicle_command_enabled: false,
    ...environment,
    registry_query_status: complete ? "completed" : "incomplete",
    registry_queries: observations,
    registry_roots_checked: observations.filter(item => item.status === "completed").map(item => item.root),
    identity_probe_readiness: complete ? readiness : {
      ...readiness,
      blockers: ["registry_discovery_incomplete", ...readiness.blockers.filter(item => item !== "no_registered_driver")]
    },
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
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const summary = inspectJ2534Drivers();
  console.log(JSON.stringify(summary, null, 2));
  if (summary.registry_query_status !== "completed") process.exitCode = 2;
}
