#if J2534_DTC_DEVELOPMENT && J2534_MODE01_DEVELOPMENT
using System;
namespace VehicleDiagnosis.Native
{
    // Pure development sequence only. Inputs are complete ISO15765 payloads,
    // not raw frames. No driver calls, public entry or cleanup/exit assertion.
    internal sealed class J2534DiagnosticSweepExchange
    {
        private readonly uint ecu;
        private readonly J2534Mode01Exchange coolant, rpm;
        private readonly byte[][] dtc = new byte[3][];
        private int state;
        private double coolantValue;
        internal J2534DiagnosticSweepExchange(uint ecu)
        {
            coolant = new J2534Mode01Exchange(ecu, 5);
            rpm = new J2534Mode01Exchange(ecu, 12);
            this.ecu = ecu;
        }
        private void Require(int expected)
        {
            if (state == expected) return;
            Abort(); throw new InvalidOperationException("diagnostic_sweep_order_invalid");
        }
        internal void Abort()
        {
            state = 7; coolantValue = 0;
            for (int i = 0; i < dtc.Length; i++) dtc[i] = null;
        }
        private byte[] Request(byte service)
        { return new byte[] { 0, 0, (byte)(ecu >> 8), (byte)ecu, service }; }
        internal byte[] Begin()
        { Require(0); state = 1; return Request(3); }
        // Native receipt adapter: a timeout status is usable only when a single
        // complete response passes the same payload checks as status zero.
        internal byte[] AcceptDtcRead(byte service, J2534ReceiveNative.Result read)
        {
            if (read == null || (read.Status != 0 && read.Status != 9)
                || read.Messages == null || read.Messages.Length < 1 || read.Messages.Length > 2
                || read.ReportedCount != (uint)read.Messages.Length) { Abort(); return null; }
            byte[] payload = null;
            bool indicated = false;
            foreach (var message in read.Messages) {
                if (message == null || message.ProtocolId != 6 || message.TxFlags != 0
                    || message.Data == null || message.Data.Length < 4 || message.Data.Length > 4099
                    || (message.ExtraDataIndex != 0 && message.ExtraDataIndex != message.Data.Length))
                { Abort(); return null; }
                byte[] data = message.Data;
                uint source = ((uint)data[0] << 24) | ((uint)data[1] << 16) | ((uint)data[2] << 8) | data[3];
                if (source != ecu + 8) { Abort(); return null; }
                if (message.RxStatus == 2 && data.Length == 4 && !indicated && payload == null)
                { indicated = true; continue; }
                if (message.RxStatus != 0 || payload != null) { Abort(); return null; }
                payload = new byte[data.Length - 4];
                Array.Copy(data, 4, payload, 0, payload.Length);
            }
            return AcceptDtcResponse(service, ecu + 8, payload);
        }
        internal byte[] AcceptDtcResponse(byte service, uint source, byte[] payload)
        {
            int index = service == 3 ? 0 : service == 7 ? 1 : service == 10 ? 2 : -1;
            if (index < 0) { Abort(); throw new InvalidOperationException("diagnostic_sweep_service_invalid"); }
            Require(index + 1); state = 7;
            if (source != ecu + 8 || payload == null || payload.Length < 3
                || payload.Length > 4095 || payload.Length % 2 != 1 || payload[0] != service + 0x40)
            { Abort(); return null; }
            bool padding = false;
            for (int i = 1; i < payload.Length; i += 2) {
                if (payload[i] == 0 && payload[i + 1] == 0) padding = true;
                else if (padding) { Abort(); return null; }
            }
            dtc[index] = (byte[])payload.Clone();
            state = index + 2;
            if (index < 2) return Request(index == 0 ? (byte)7 : (byte)10);
            rpm.BeginSupportedRead();
            return coolant.BeginSupportedRead();
        }
        internal byte[] AcceptSupportedResponse(uint source, byte[] payload)
        {
            Require(4); state = 7;
            byte[] first = coolant.AcceptSupportedResponse(source, payload);
            byte[] second = rpm.AcceptSupportedResponse(source, payload);
            if (first == null || second == null) { Abort(); return null; }
            state = 5; return first;
        }
        internal byte[] AcceptSupportedRead(J2534ReceiveNative.Result read)
        {
            uint source;
            byte[] payload = coolant.ExtractResponse(read, out source);
            return AcceptSupportedResponse(source, payload);
        }
        internal byte[] AcceptCoolantRead(J2534ReceiveNative.Result read)
        {
            uint source;
            byte[] payload = coolant.ExtractResponse(read, out source);
            return AcceptCoolantResponse(source, payload);
        }
        internal Capture AcceptRpmRead(J2534ReceiveNative.Result read)
        {
            uint source;
            byte[] payload = rpm.ExtractResponse(read, out source);
            return AcceptRpmResponse(source, payload);
        }
        internal byte[] AcceptCoolantResponse(uint source, byte[] payload)
        {
            Require(5); state = 7;
            double? value = coolant.AcceptValueResponse(source, payload);
            if (!value.HasValue) { Abort(); return null; }
            coolantValue = value.Value; state = 6;
            return new byte[] { 0, 0, (byte)(ecu >> 8), (byte)ecu, 1, 12 };
        }
        internal Capture AcceptRpmResponse(uint source, byte[] payload)
        {
            Require(6); state = 7;
            double? value = rpm.AcceptValueResponse(source, payload);
            if (!value.HasValue) { Abort(); return null; }
            var result = new Capture(dtc, coolantValue, value.Value);
            Abort(); return result;
        }
        // Intermediate only: caller still needs native receipt checks, cleanup,
        // parent normal-exit verification and existing result conversion.
        internal sealed class Capture
        {
            private readonly byte[][] receipts;
            internal readonly double CoolantCelsius, Rpm;
            internal Capture(byte[][] data, double coolant, double rpm)
            {
                receipts = new byte[3][];
                for (int i = 0; i < 3; i++) receipts[i] = (byte[])data[i].Clone();
                CoolantCelsius = coolant; Rpm = rpm;
            }
            internal byte[] DtcPayload(int index) { return (byte[])receipts[index].Clone(); }
        }
    }
}
#endif
