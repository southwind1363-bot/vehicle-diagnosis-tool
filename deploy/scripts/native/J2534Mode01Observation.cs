#if J2534_DTC_DEVELOPMENT && J2534_MODE01_DEVELOPMENT
using System.Globalization;
using System.Text;
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
        // Development fixture transport only. Parent must independently confirm process exit.
        internal string ToFixtureJson()
        {
            var json = new StringBuilder("{\"fixture_only\":true,\"cleanup_confirmed\":true,\"request_ecu\":");
            json.Append(RequestEcu.ToString(CultureInfo.InvariantCulture));
            json.Append(",\"pid\":").Append(Pid.ToString(CultureInfo.InvariantCulture));
            json.Append(",\"value\":").Append(Value.ToString("R", CultureInfo.InvariantCulture));
            json.Append(",\"supported_read\":"); AppendRead(json, supported);
            json.Append(",\"value_read\":"); AppendRead(json, valueRead);
            return json.Append('}').ToString();
        }
        private static void AppendRead(StringBuilder json, J2534ReceiveNative.Result read)
        {
            json.Append("{\"Status\":").Append(read.Status.ToString(CultureInfo.InvariantCulture));
            json.Append(",\"ReportedCount\":").Append(read.ReportedCount.ToString(CultureInfo.InvariantCulture));
            json.Append(",\"Messages\":[");
            for (int i = 0; i < read.Messages.Length; i++) {
                if (i != 0) json.Append(',');
                var m = read.Messages[i];
                json.Append("{\"ProtocolId\":").Append(m.ProtocolId.ToString(CultureInfo.InvariantCulture));
                json.Append(",\"RxStatus\":").Append(m.RxStatus.ToString(CultureInfo.InvariantCulture));
                json.Append(",\"TxFlags\":").Append(m.TxFlags.ToString(CultureInfo.InvariantCulture));
                json.Append(",\"Timestamp\":").Append(m.Timestamp.ToString(CultureInfo.InvariantCulture));
                json.Append(",\"ExtraDataIndex\":").Append(m.ExtraDataIndex.ToString(CultureInfo.InvariantCulture));
                json.Append(",\"Data\":[");
                for (int j = 0; j < m.Data.Length; j++) {
                    if (j != 0) json.Append(',');
                    json.Append(m.Data[j].ToString(CultureInfo.InvariantCulture));
                }
                json.Append("]}");
            }
            json.Append("]}");
        }
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
