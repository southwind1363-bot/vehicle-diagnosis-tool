import { createJ2534Mode01ResultConverter } from "./j2534-mode01-result-converter.js";

// Development-only handoff from a trusted parent's actual process completion.
// No public import, persistence write, driver invocation, or session merging.
export function createJ2534Mode01SessionBuilder({ decodeLivePidResponse, buildDiagnosticScanSession }) {
  const convert = createJ2534Mode01ResultConverter(decodeLivePidResponse);
  if (typeof buildDiagnosticScanSession !== "function") throw new TypeError("session_builder_required");
  function fromResult(result) {
    try {
      if (result.status !== "decoded") return null;
      const session = buildDiagnosticScanSession({ source: "j2534_development_read", livePidSnapshot: result.snapshot,
        supportedPidResponse: result.supportedPidResponse });
      if (!session || session.source !== "j2534_development_read") return null;
      return { fixture_only: true, vehicle_communication: false, session };
    } catch { return null; }
  }
  function build(completion, expected) { return fromResult(convert(completion, expected)); }
  build.fromSupervisedCompletion = (completion, expected) => fromResult(convert.fromSupervisedCompletion(completion, expected));
  return build;
}
