// Development-only JSON boundary. Not a driver host, public import route, or
// proof of execution: the caller must obtain completion from the bounded parent.
const exact = (value, keys) => value && typeof value === "object" && !Array.isArray(value)
  && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
const uint = value => Number.isInteger(value) && value >= 0 && value <= 0xffffffff;
const unavailable = reason => ({ status: "unavailable", reason, snapshot: null });

export function createJ2534DtcResultConverter(decodeDtcResponse) {
  if (typeof decodeDtcResponse !== "function") throw new TypeError("dtc_decoder_required");
  return function convert(json) {
    try {
      if (typeof json !== "string" || json.length > 400000) return unavailable("invalid_envelope");
      const input = JSON.parse(json);
      if (!exact(input, ["schema_version", "worker_status", "cleanup_confirmed", "request_ecu", "service", "read_result"])
        || input.schema_version !== "j2534-dtc-read-v1"
        || !Number.isInteger(input.request_ecu) || input.request_ecu < 0x7e0 || input.request_ecu > 0x7e7
        || ![3, 7, 10].includes(input.service)) return unavailable("invalid_envelope");
      if (input.worker_status !== "worker_completed" || input.cleanup_confirmed !== true)
        return unavailable("worker_not_completed");
      const read = input.read_result;
      if (!exact(read, ["Status", "ReportedCount", "Messages"]) || !Number.isInteger(read.Status)
        || !Array.isArray(read.Messages) || read.Messages.length > 16
        || read.ReportedCount !== read.Messages.length) return unavailable("invalid_read_result");
      // ERR_TIMEOUT can mean fewer records than requested, not an incomplete
      // diagnostic message. Both statuses must pass every payload check below.
      if (read.Status !== 0 && read.Status !== 9) return unavailable("read_not_complete");
      let payload = null, started = false;
      for (const message of read.Messages) {
        if (!exact(message, ["ProtocolId", "RxStatus", "TxFlags", "Timestamp", "ExtraDataIndex", "Data"])
          || ![message.ProtocolId, message.RxStatus, message.TxFlags, message.Timestamp, message.ExtraDataIndex].every(uint)
          || message.ProtocolId !== 6 || message.TxFlags !== 0
          || !Array.isArray(message.Data) || message.Data.length < 4 || message.Data.length > 4099
          || !message.Data.every(byte => Number.isInteger(byte) && byte >= 0 && byte <= 255)
          || ![0, message.Data.length].includes(message.ExtraDataIndex)) return unavailable("invalid_message");
        const bytes = message.Data;
        const ecu = bytes[0] * 0x1000000 + bytes[1] * 0x10000 + bytes[2] * 0x100 + bytes[3];
        if (ecu !== input.request_ecu + 8) return unavailable("response_ecu_mismatch");
        if (message.RxStatus === 2) {
          if (bytes.length !== 4 || started) return unavailable("invalid_start_indicator");
          started = true; continue;
        }
        // Echo, TxDone, extended addressing and unknown status bits unsupported.
        if (message.RxStatus !== 0) return unavailable("unsupported_receive_status");
        if (payload !== null) return unavailable("multiple_responses");
        payload = bytes.slice(4); started = false;
      }
      if (started || payload === null) return unavailable("response_missing");
      if (payload[0] !== input.service + 0x40) return unavailable("response_service_mismatch");
      if (payload.length < 3 || payload.length % 2 !== 1) return unavailable("invalid_dtc_payload");
      let padding = false;
      for (let i = 1; i < payload.length; i += 2) {
        if (payload[i] === 0 && payload[i + 1] === 0) padding = true;
        else if (padding) return unavailable("invalid_dtc_padding");
      }
      // Reuse the existing decoder and snapshot format; no diagnostic ranking,
      // saved-data migration, raw frame retention, or hardware verification flag.
      const snapshot = decodeDtcResponse({ bytes: payload,
        source: "j2534_development_read", source_ecu: (input.request_ecu + 8).toString(16).toUpperCase(),
        intent: input.service === 3 ? "read_stored_dtc" : input.service === 7 ? "read_pending_dtc" : "read_permanent_dtc",
        protocol: "ISO15765" });
      if (snapshot?.schema_version !== "dtc_snapshot_v1" || snapshot.dtc_readout_status !== "reported"
        || !Array.isArray(snapshot.dtcs)) return unavailable("invalid_decoder_result");
      return { status: "decoded", reason: null, snapshot };
    } catch { return unavailable("conversion_failed"); }
  };
}
