// Development-only trusted-parent boundary. Never accept these arguments from
// a public import route: completion must come from the supervising process.
const exact = (o, keys) => o && typeof o === "object" && !Array.isArray(o)
  && Object.keys(o).length === keys.length && keys.every(k => Object.hasOwn(o, k));
const uint = n => Number.isInteger(n) && n >= 0 && n <= 0xffffffff;
const unavailable = () => ({ status: "unavailable", snapshot: null });

function payload(read, ecu) {
  if (!exact(read, ["Status", "ReportedCount", "Messages"]) || ![0, 9].includes(read.Status)
    || !Array.isArray(read.Messages) || read.Messages.length < 1 || read.Messages.length > 2
    || read.ReportedCount !== read.Messages.length) throw new Error();
  let value = null, started = false;
  for (const m of read.Messages) {
    if (!exact(m, ["ProtocolId", "RxStatus", "TxFlags", "Timestamp", "ExtraDataIndex", "Data"])
      || ![m.ProtocolId, m.RxStatus, m.TxFlags, m.Timestamp, m.ExtraDataIndex].every(uint)
      || m.ProtocolId !== 6 || m.TxFlags !== 0 || !Array.isArray(m.Data)
      || m.Data.length < 4 || m.Data.length > 10
      || !m.Data.every(b => Number.isInteger(b) && b >= 0 && b <= 255)
      || ![0, m.Data.length].includes(m.ExtraDataIndex)) throw new Error();
    const [a, b, c, d] = m.Data;
    if (a * 16777216 + b * 65536 + c * 256 + d !== ecu + 8) throw new Error();
    if (m.RxStatus === 2) {
      if (started || value || m.Data.length !== 4) throw new Error();
      started = true; continue;
    }
    if (m.RxStatus !== 0 || value) throw new Error();
    value = m.Data.slice(4);
  }
  if (!value) throw new Error();
  return value;
}

export function createJ2534Mode01ResultConverter(decodeLivePidResponse) {
  if (typeof decodeLivePidResponse !== "function") throw new TypeError("live_decoder_required");
  function decodeOutput(stdout, expected) {
    try {
      if (typeof stdout !== "string" || stdout.length > 8192
        || !exact(expected, ["request_ecu", "pid"]) || !uint(expected.request_ecu)
        || expected.request_ecu < 0x7e0 || expected.request_ecu > 0x7e7 || ![5, 12].includes(expected.pid)) return unavailable();
      const input = JSON.parse(stdout);
      if (!exact(input, ["fixture_only", "cleanup_confirmed", "request_ecu", "pid", "value", "supported_read", "value_read"])
        || input.fixture_only !== true || input.cleanup_confirmed !== true
        || input.request_ecu !== expected.request_ecu || input.pid !== expected.pid) return unavailable();
      const supported = payload(input.supported_read, expected.request_ecu);
      const value = payload(input.value_read, expected.request_ecu);
      const pid = expected.pid;
      if (supported.length !== 6 || supported[0] !== 65 || supported[1] !== 0
        || !(supported[2 + Math.floor((pid - 1) / 8)] & (1 << (7 - (pid - 1) % 8)))
        || value.length !== (pid === 5 ? 3 : 4) || value[0] !== 65 || value[1] !== pid) return unavailable();
      const numeric = pid === 5 ? value[2] - 40 : (value[2] * 256 + value[3]) / 4;
      if (input.value !== numeric) return unavailable();
      const snapshot = decodeLivePidResponse({ bytes: value, protocol: "ISO15765",
        source_ecu: (expected.request_ecu + 8).toString(16).toUpperCase() });
      if (snapshot?.live_pid_readout_status !== "reported" || snapshot.monitor_values?.length !== 1
        || snapshot.vehicle_command_enabled !== false || snapshot.would_transmit !== false) return unavailable();
      // Explicit origin prevents the common decoder's local_bridge default from
      // presenting artificial observations as actual vehicle reads.
      snapshot.source = "j2534_development_read";
      // Only the validated PID00 payload, not the mutable raw evidence, crosses
      // into the common supported-PID decoder. It proves page 00 for this ECU
      // only; a continuation bit does not mean page 20 has been read.
      const supportedPidResponse = Object.freeze({ bytes: Object.freeze([...supported]),
        source: "j2534_development_read", protocol: "ISO15765",
        source_ecu: (expected.request_ecu + 8).toString(16).toUpperCase() });
      return { status: "decoded", snapshot, supportedPidResponse, evidence: input };
    } catch { return unavailable(); }
  }
  function convert(completion, expected) {
    if (!completion || completion.status !== 0 || completion.signal !== null || completion.error
      || completion.stderr !== "") return unavailable();
    return decodeOutput(completion.stdout, expected);
  }
  // Only for results from the trusted bounded parent configured to reject stderr.
  // Do not fabricate a synchronous exit status from asynchronous output.
  convert.fromSupervisedCompletion = function (completion, expected) {
    if (completion?.execution_status !== "worker_completed" || completion.worker_started !== true
      || completion.worker_exited !== true || completion.termination_requested !== false
      || completion.termination_signal_sent !== false || !Array.isArray(completion.errors)
      || completion.errors.length !== 0 || !exact(completion.parsed_result, ["stdout"])) return unavailable();
    return decodeOutput(completion.parsed_result.stdout, expected);
  };
  return convert;
}
