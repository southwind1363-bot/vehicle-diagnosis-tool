#if J2534_DTC_DEVELOPMENT && J2534_MODE01_DEVELOPMENT
using System;
using System.Globalization;
using System.Text;
namespace VehicleDiagnosis.Native
{
    // Internal fixture transport only, never a saved diagnosis or exit receipt.
    internal sealed class J2534DiagnosticSweepObservation
    {
        internal readonly uint RequestEcu;
        internal readonly J2534DiagnosticSweepExchange.Capture Capture;
        internal readonly J2534Mode01Observation Coolant, Rpm;
        private readonly J2534ReceiveNative.Result[] dtc;
        internal J2534DiagnosticSweepObservation(uint ecu, J2534DiagnosticSweepExchange.Capture capture,
            J2534ReceiveNative.Result[] receipts)
        {
            if (capture == null || receipts == null || receipts.Length != 6)
                throw new ArgumentException("sweep_observation_incomplete");
            RequestEcu = ecu; Capture = capture;
            dtc = new J2534ReceiveNative.Result[3];
            for (int i = 0; i < 3; i++) dtc[i] = J2534Mode01Observation.Copy(receipts[i]);
            Coolant = new J2534Mode01Observation(ecu, 5, capture.CoolantCelsius, receipts[3], receipts[4]);
            Rpm = new J2534Mode01Observation(ecu, 12, capture.Rpm, receipts[3], receipts[5]);
        }
        internal J2534ReceiveNative.Result DtcRead(int index) { return J2534Mode01Observation.Copy(dtc[index]); }
        internal string ToFixtureJson()
        {
            var json = new StringBuilder("{\"fixture_only\":true,\"cleanup_confirmed\":true,\"request_ecu\":");
            json.Append(RequestEcu.ToString(CultureInfo.InvariantCulture)).Append(",\"dtc_reads\":[");
            for (int i = 0; i < 3; i++) {
                if (i != 0) json.Append(',');
                json.Append("{\"service\":").Append(new int[] { 3, 7, 10 }[i]).Append(",\"read_result\":");
                J2534Mode01Observation.AppendRead(json, dtc[i]); json.Append('}');
            }
            return json.Append("],\"observations\":[").Append(Coolant.ToFixtureJson()).Append(',')
                .Append(Rpm.ToFixtureJson()).Append("]}").ToString();
        }
    }
}
#endif
