// Development-only bridge into the existing session format. No UI/driver route.
// A missing or failed read is never passed to the session builder as empty DTCs.
export function createJ2534FixtureSessionBuilder(buildDiagnosticScanSession) {
  if (typeof buildDiagnosticScanSession !== "function") throw new TypeError("session_builder_required");
  return function build(completion) {
    try {
      if (completion?.execution_status !== "worker_completed" || completion.worker_started !== true
        || completion.worker_exited !== true || completion.termination_requested !== false
        || completion.termination_signal_sent !== false || !Array.isArray(completion.errors)
        || completion.errors.length !== 0) return null;
      const result = completion.parsed_result;
      if (result?.fixture_only !== true || result.vehicle_communication !== false
        || result.status !== "decoded" || result.reason !== null
        || result.snapshot?.schema_version !== "dtc_snapshot_v1"
        || result.snapshot.dtc_readout_status !== "reported"
        || result.snapshot.source !== "j2534_development_read"
        || !Array.isArray(result.snapshot.dtcs)) return null;
      const session = buildDiagnosticScanSession({ source: "j2534_development_read", dtcSnapshot: result.snapshot });
      if (!session || session.source !== "j2534_development_read") return null;
      return { fixture_only: true, vehicle_communication: false, session };
    } catch { return null; } // No raw data or exception details leave this boundary.
  };
}
