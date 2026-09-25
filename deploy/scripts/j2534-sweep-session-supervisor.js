// Development-only session handoff; no public entry or driver launcher.
import { createJ2534SweepFixtureSupervisor } from "./j2534-sweep-fixture-supervisor.js";

export function createJ2534SweepSessionSupervisor({ buildDiagnosticScanSession, normalizeBridgeLivePidSnapshot, ...options }) {
  if (typeof buildDiagnosticScanSession !== "function") throw new TypeError("session_builder_required");
  if (typeof normalizeBridgeLivePidSnapshot !== "function") throw new TypeError("live_normalizer_required");
  const run = createJ2534SweepFixtureSupervisor(options);
  return async function acquire(input) {
    const outcome = await run(input);
    let session = null;
    try {
      if (outcome.status === "completed") {
        const livePidSnapshot = normalizeBridgeLivePidSnapshot({ ok: true, blocked: false,
          protocol: "ISO15765", monitor_values: outcome.results.live.flatMap(item => item.snapshot.monitor_values),
          live_pid_readout_status: "reported", vehicle_command_enabled: false, would_transmit: false });
        livePidSnapshot.source = "j2534_development_read";
        const candidate = buildDiagnosticScanSession({ source: "j2534_development_read",
          storedDtcSnapshot: outcome.results.dtc[0].snapshot,
          pendingDtcSnapshot: outcome.results.dtc[1].snapshot,
          permanentDtcSnapshot: outcome.results.dtc[2].snapshot,
          livePidSnapshot, supportedPidResponse: outcome.results.live[0].supportedPidResponse });
        if (candidate?.source === "j2534_development_read" && candidate.vehicleCommandEnabled === false
          && candidate.livePidSnapshot?.monitorValues?.length === 2
          && candidate.dtcSnapshot?.dtc_readout_status === "reported") session = candidate;
      }
    } catch {} // Never expose a partial session or private exception.
    return { ...outcome, session, results: session ? outcome.results : null,
      status: session ? "completed" : "unavailable",
      reason: session ? null : outcome.reason || "fixture_session_unavailable" };
  };
}
