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
    }
}
#endif
