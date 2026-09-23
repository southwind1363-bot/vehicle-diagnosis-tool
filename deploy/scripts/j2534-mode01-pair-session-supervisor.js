import { createJ2534Mode01PairFixtureSupervisor } from "./j2534-mode01-pair-fixture-supervisor.js";

// Development-only fixed fixture handoff. No arbitrary outcome import, disk
// persistence, public entry point, or driver selection is exposed here.
export function createJ2534Mode01PairSessionSupervisor({ buildDiagnosticScanSession, normalizeBridgeLivePidSnapshot, ...options }) {
  if (typeof buildDiagnosticScanSession !== "function") throw new TypeError("session_builder_required");
  if (typeof normalizeBridgeLivePidSnapshot !== "function") throw new TypeError("live_normalizer_required");
  const run = createJ2534Mode01PairFixtureSupervisor(options);
  return async function acquire(input) {
    const outcome = await run(input);
    let session = null;
    try {
      if (outcome.status === "completed") {
        const values = outcome.results.flatMap(item => item.snapshot.monitor_values);
        const snapshot = normalizeBridgeLivePidSnapshot({ ok: true, blocked: false, protocol: "ISO15765",
            monitor_values: values, live_pid_readout_status: "reported",
            vehicle_command_enabled: false, would_transmit: false });
        // The bridge normalizer defaults to local_bridge; retain the same
        // explicit development provenance as the individual PID converter.
        snapshot.source = "j2534_development_read";
        const candidate = buildDiagnosticScanSession({ source: "j2534_development_read",
          livePidSnapshot: snapshot,
          supportedPidResponse: outcome.results[0].supportedPidResponse });
        if (candidate?.source === "j2534_development_read"
          && candidate.vehicleCommandEnabled === false
          && candidate.livePidSnapshot?.monitorValues?.length === 2) session = candidate;
      }
    } catch { /* No partial session is returned if common normalization fails. */ }
    return { ...outcome, session, results: session ? outcome.results : null,
      status: session ? "completed" : "unavailable",
      reason: session ? null : outcome.reason || "fixture_session_unavailable" };
  };
}
