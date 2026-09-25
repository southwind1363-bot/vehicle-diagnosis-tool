import { createJ2534RegisteredSweepSelectionHandoff } from "../../local-bridge-readonly.js";
import { createJ2534SelectedSweepFixtureSupervisor } from "../j2534-selected-sweep-fixture-supervisor.js";
import { createDiagnosticSweepFixtureSpawn } from "./mode01-fixture-spawn.js";

// Development-only generated build. Neither registry selection nor injected
// callbacks may authorize another executable, DLL, ECU or request sequence.
export function createRegisteredSweepFixtureSupervisor({ descriptor, pinned, spawnDescriptor,
  decodeDtcResponse, decodeLivePidResponse, buildDiagnosticScanSession, normalizeBridgeLivePidSnapshot }) {
  const spawnWorker = createDiagnosticSweepFixtureSpawn(spawnDescriptor);
  return createJ2534SelectedSweepFixtureSupervisor({
    handoff: createJ2534RegisteredSweepSelectionHandoff(), descriptor, pinned, spawnWorker,
    decodeDtcResponse, decodeLivePidResponse, buildDiagnosticScanSession, normalizeBridgeLivePidSnapshot
  });
}
