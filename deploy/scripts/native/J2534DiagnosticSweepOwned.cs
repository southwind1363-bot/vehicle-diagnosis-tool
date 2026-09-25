#if J2534_DTC_DEVELOPMENT && J2534_MODE01_DEVELOPMENT
using System;
namespace VehicleDiagnosis.Native
{
    internal sealed partial class J2534ReadRequestNative
    {
        // Internal capture only. Not a worker result or permission to load a DLL.
        // The existing acquisition gate is held for the whole six-request sweep.
        internal J2534DiagnosticSweepExchange.Capture ReadDiagnosticSweepAndFinish(uint channel, uint requestEcu,
            J2534ReceiveNative.ReadFunction read, StartFilterFunction start, StopFilterFunction stop)
        {
            if (read == null || start == null || stop == null) throw new ArgumentNullException("sweep_binding");
            var exchange = new J2534DiagnosticSweepExchange(requestEcu);
            uint filter;
            if (PrepareDtcFilterOnce(channel, requestEcu, start, stop, out filter) != 0) return null;
            J2534DiagnosticSweepExchange.Capture captured = null;
            try {
                double? completed = owner.RunOwnedMode01Acquisition(device, channel, requestEcu, delegate {
                    exchange.Begin();
                    foreach (byte service in new byte[] { 3, 7, 10 }) {
                        if (WriteFixed(channel, requestEcu, service, null) != 0) return null;
                        var response = new J2534ReceiveNative(read).ReadMode01StageOnce(channel);
                        if (exchange.AcceptDtcRead(service, response) == null) return null;
                    }
                    if (WriteFixed(channel, requestEcu, 1, 0) != 0) return null;
                    if (exchange.AcceptSupportedRead(new J2534ReceiveNative(read).ReadMode01StageOnce(channel)) == null) return null;
                    if (WriteFixed(channel, requestEcu, 1, 5) != 0) return null;
                    if (exchange.AcceptCoolantRead(new J2534ReceiveNative(read).ReadMode01StageOnce(channel)) == null) return null;
                    if (WriteFixed(channel, requestEcu, 1, 12) != 0) return null;
                    captured = exchange.AcceptRpmRead(new J2534ReceiveNative(read).ReadMode01StageOnce(channel));
                    return captured == null ? (double?)null : 1;
                });
                if (!completed.HasValue || captured == null) return null;
                if (owner.StopDtcReadFilter(device, channel, filter) != 0) return null;
                if (owner.Disconnect(device, channel) != 0) return null;
                if (owner.Close(device) != 0) return null;
                owner.Dispose();
                return owner.ReferenceReleased ? captured : null;
            }
            finally { exchange.Abort(); captured = null; }
        }
    }
}
#endif
