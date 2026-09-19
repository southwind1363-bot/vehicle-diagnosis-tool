#if J2534_DTC_DEVELOPMENT && J2534_MODE01_DEVELOPMENT
namespace VehicleDiagnosis.Native
{
    // Internal handoff evidence, not a saved diagnosis or worker-exit assertion.
    // Own the native copies and never expose a mutable reference to them.
    internal sealed class J2534Mode01Observation
    {
        internal readonly uint RequestEcu;
        internal readonly byte Pid;
        internal readonly double Value;
        private readonly J2534ReceiveNative.Result supported, valueRead;
        internal J2534Mode01Observation(uint ecu, byte pid, double value,
            J2534ReceiveNative.Result supported, J2534ReceiveNative.Result valueRead)
        {
            RequestEcu = ecu; Pid = pid; Value = value;
            this.supported = Copy(supported); this.valueRead = Copy(valueRead);
        }
        internal J2534ReceiveNative.Result SupportedRead { get { return Copy(supported); } }
        internal J2534ReceiveNative.Result ValueRead { get { return Copy(valueRead); } }
        private static J2534ReceiveNative.Result Copy(J2534ReceiveNative.Result source)
        {
            var messages = new J2534ReceiveNative.Message[source.Messages.Length];
            for (int i = 0; i < messages.Length; i++) {
                var m = source.Messages[i];
                messages[i] = new J2534ReceiveNative.Message { ProtocolId = m.ProtocolId,
                    RxStatus = m.RxStatus, TxFlags = m.TxFlags, Timestamp = m.Timestamp,
                    ExtraDataIndex = m.ExtraDataIndex, Data = (byte[])m.Data.Clone() };
            }
            return new J2534ReceiveNative.Result { Status = source.Status,
                ReportedCount = source.ReportedCount, Messages = messages };
        }
    }
}
#endif
