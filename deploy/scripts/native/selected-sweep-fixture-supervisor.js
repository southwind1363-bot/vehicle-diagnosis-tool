import { createJ2534SelectedSweepFixtureSupervisor } from "../j2534-selected-sweep-fixture-supervisor.js";
import { createJ2534RegisteredSweepSelectionHandoff } from "../../local-bridge-readonly.js";
import { createSelectedDiagnosticSweepFixtureSpawn } from "./mode01-fixture-spawn.js";

// Trusted generated-fixture harness only. Selection confirms the inspected
// build; it cannot choose another executable or expand the fixed request.
export function createSelectedNativeSweepFixtureSupervisor({ handoff, descriptor, spawnDescriptor,
  decodeDtcResponse, decodeLivePidResponse, buildDiagnosticScanSession, normalizeBridgeLivePidSnapshot }) {
  const spawn = createSelectedDiagnosticSweepFixtureSpawn(spawnDescriptor);
  const pin = spawn.pinned;
  const args = Object.freeze(["--selected-generated-diagnostic-sweep", pin.path, pin.sha256,
    String(pin.size), pin.architecture, String(pin.request_ecu), "03,07,0A", "00,05,0C"]);
  return createJ2534SelectedSweepFixtureSupervisor({ handoff, descriptor, pinned: pin,
    spawnWorker: () => spawn(args), decodeDtcResponse, decodeLivePidResponse,
    buildDiagnosticScanSession, normalizeBridgeLivePidSnapshot });
}

// No caller-provided handoff, spawn or pin can replace the private resolver.
export function createRegisteredSelectedNativeSweepFixtureSupervisor({ descriptor, spawnDescriptor,
  decodeDtcResponse, decodeLivePidResponse, buildDiagnosticScanSession, normalizeBridgeLivePidSnapshot }) {
  return createSelectedNativeSweepFixtureSupervisor({
    handoff: createJ2534RegisteredSweepSelectionHandoff(), descriptor, spawnDescriptor,
    decodeDtcResponse, decodeLivePidResponse, buildDiagnosticScanSession, normalizeBridgeLivePidSnapshot });
}
