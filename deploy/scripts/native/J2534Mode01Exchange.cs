#if J2534_DTC_DEVELOPMENT
using System;

namespace VehicleDiagnosis.Native
{
    // Development-only single acquisition. No driver, timer, retry or public entry.
    // The caller must supply only a complete ISO15765 payload after native shape,
    // owner, channel and worker-completion checks. This is not an I/O permission.
    internal sealed class J2534Mode01Exchange
    {
        private readonly uint ecu;
        private readonly byte pid;
        private int state;
        internal J2534Mode01Exchange(uint ecu, byte pid)
        {
            if (ecu < 0x7e0 || ecu > 0x7e7 || (pid != 0x05 && pid != 0x0c))
                throw new ArgumentException("mode01_request_not_allowed");
            this.ecu = ecu;
            this.pid = pid;
        }

        private byte[] Request(byte requestedPid)
        {
            // J2534 ISO15765 data: big-endian CAN address, SID, PID.
            return new byte[] { 0, 0, (byte)(ecu >> 8), (byte)ecu, 1, requestedPid };
        }

        internal byte[] BeginSupportedRead()
        {
            if (state != 0) throw new InvalidOperationException("mode01_already_attempted");
            state = 1;
            return Request(0);
        }

        internal byte[] AcceptSupportedResponse(uint responseEcu, byte[] payload)
        {
            if (state != 1) throw new InvalidOperationException("mode01_support_not_pending");
            state = 4; // Every rejected or unsupported response ends this attempt.
            if (responseEcu != ecu + 8 || payload == null || payload.Length != 6
                || payload[0] != 0x41 || payload[1] != 0) return null;
            uint supported = ((uint)payload[2] << 24) | ((uint)payload[3] << 16)
                | ((uint)payload[4] << 8) | payload[5];
            if ((supported & (1u << (32 - pid))) == 0) return null;
            state = 2;
            return Request(pid);
        }

        internal double? AcceptValueResponse(uint responseEcu, byte[] payload)
        {
            if (state != 2) throw new InvalidOperationException("mode01_value_not_pending");
            state = 4;
            int size = pid == 0x0c ? 4 : 3;
            if (responseEcu != ecu + 8 || payload == null || payload.Length != size
                || payload[0] != 0x41 || payload[1] != pid) return null;
            // Zero is acquired data, not a missing-result sentinel.
            return pid == 0x0c ? ((payload[2] * 256 + payload[3]) / 4.0) : payload[2] - 40.0;
        }

        // Consumes the actual bounded receive representation, not queue acceptance.
        // These are intermediate observations; publication still requires normal
        // worker exit and confirmed cleanup. Caller owns this exchange serially.
        internal byte[] AcceptSupportedRead(J2534ReceiveNative.Result result)
        {
            uint source;
            byte[] payload = ExtractResponse(result, out source);
            return AcceptSupportedResponse(source, payload);
        }

        internal double? AcceptValueRead(J2534ReceiveNative.Result result)
        {
            uint source;
            byte[] payload = ExtractResponse(result, out source);
            return AcceptValueResponse(source, payload);
        }

        private byte[] ExtractResponse(J2534ReceiveNative.Result result, out uint source)
        {
            source = 0;
            if (result == null || (result.Status != 0 && result.Status != 9)
                || result.Messages == null || result.Messages.Length < 1 || result.Messages.Length > 2
                || result.ReportedCount != (uint)result.Messages.Length) return null;
            byte[] response = null;
            bool indicated = false;
            foreach (var message in result.Messages) {
                if (message == null || message.ProtocolId != 6 || message.TxFlags != 0
                    || message.Data == null || message.Data.Length < 4 || message.Data.Length > 10
                    || (message.ExtraDataIndex != 0 && message.ExtraDataIndex != message.Data.Length)) return null;
                byte[] data = message.Data;
                uint address = ((uint)data[0] << 24) | ((uint)data[1] << 16) | ((uint)data[2] << 8) | data[3];
                if (address != ecu + 8) return null;
                if (message.RxStatus == 2) {
                    if (data.Length != 4 || indicated || response != null) return null;
                    indicated = true;
                    continue;
                }
                if (message.RxStatus != 0 || response != null) return null;
                response = new byte[data.Length - 4];
                Array.Copy(data, 4, response, 0, response.Length);
                source = address;
            }
            return response;
        }
    }
}
#endif
