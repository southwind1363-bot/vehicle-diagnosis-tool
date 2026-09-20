import { createJ2534RegisteredMode01SelectionHandoff } from "../../local-bridge-readonly.js";
import { createJ2534SelectedMode01FixtureSupervisor } from "../j2534-mode01-fixture-supervisor.js";

// Development-only fixed generated fixtures, never an arbitrary driver launcher.
// The trusted fixture builder supplies the independent pin and fixed executable
// callback. Registry metadata cannot replace that pin or inject a handoff.
// No public entry, manufacturer approval, or package-review permission is added.
export function createRegisteredMode01FixtureSupervisor({ descriptor, pinned, spawnWorker,
  decodeLivePidResponse, buildDiagnosticScanSession }) {
  return createJ2534SelectedMode01FixtureSupervisor({
    handoff: createJ2534RegisteredMode01SelectionHandoff(), descriptor, pinned, spawnWorker,
    decodeLivePidResponse, buildDiagnosticScanSession
  });
}
