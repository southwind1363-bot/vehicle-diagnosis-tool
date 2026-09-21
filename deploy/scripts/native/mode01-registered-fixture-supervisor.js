import { createJ2534RegisteredMode01SelectionHandoff } from "../../local-bridge-readonly.js";
import { createJ2534SelectedMode01FixtureSupervisor } from "../j2534-mode01-fixture-supervisor.js";
import { createMode01FixtureSpawn } from "./mode01-fixture-spawn.js";

// Development-only fixed generated fixtures, never an arbitrary driver launcher.
// The trusted fixture builder supplies independent selection and build pins.
// Registry metadata cannot replace those pins or inject a handoff/launcher.
// No public entry, manufacturer approval, or package-review permission is added.
export function createRegisteredMode01FixtureSupervisor({ descriptor, pinned, spawnDescriptor,
  decodeLivePidResponse, buildDiagnosticScanSession }) {
  const spawnWorker = createMode01FixtureSpawn(spawnDescriptor);
  return createJ2534SelectedMode01FixtureSupervisor({
    handoff: createJ2534RegisteredMode01SelectionHandoff(), descriptor, pinned, spawnWorker,
    decodeLivePidResponse, buildDiagnosticScanSession
  });
}
