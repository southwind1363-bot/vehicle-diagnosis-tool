import { createJ2534RegisteredMode01PairSelectionHandoff } from "../../local-bridge-readonly.js";
import { createJ2534SelectedMode01PairFixtureSupervisor } from "../j2534-selected-mode01-pair-fixture-supervisor.js";
import { createMode01PairFixtureSpawn } from "./mode01-fixture-spawn.js";

// Development-only composition. Independent generated build pins remain mandatory.
// Neither a registry descriptor nor caller-supplied callbacks authorize another
// executable, vendor DLL, ECU or PID. No public route imports this factory.
export function createRegisteredMode01PairFixtureSupervisor({ descriptor, pinned, spawnDescriptor,
  decodeLivePidResponse, buildDiagnosticScanSession, normalizeBridgeLivePidSnapshot }) {
  const spawnWorker = createMode01PairFixtureSpawn(spawnDescriptor);
  return createJ2534SelectedMode01PairFixtureSupervisor({
    handoff: createJ2534RegisteredMode01PairSelectionHandoff(), descriptor, pinned, spawnWorker,
    decodeLivePidResponse, buildDiagnosticScanSession, normalizeBridgeLivePidSnapshot
  });
}
