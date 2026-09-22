#if J2534_DTC_DEVELOPMENT && J2534_MODE01_DEVELOPMENT
using System;
namespace VehicleDiagnosis.Native
{
    internal sealed partial class J2534ReadRequestNative
    {
        // Development-only intermediate result. No worker/public entry: a parent
        // must still verify normal worker exit before publishing these values.
        internal J2534Mode01PairExchange.Values ReadMode01PairAndFinish(uint channel, uint requestEcu,
            J2534ReceiveNative.ReadFunction read, StartFilterFunction start, StopFilterFunction stop)
        {
            if (read == null || start == null || stop == null) throw new ArgumentNullException("mode01_binding");
            var exchange = new J2534Mode01PairExchange(requestEcu);
            uint filter;
            if (PrepareDtcFilterOnce(channel, requestEcu, start, stop, out filter) != 0) return null;
            J2534Mode01PairExchange.Values captured = null;
            try {
                // The existing one-attempt gate owns the entire sequence; the
                // numeric return is only its success marker, never a PID value.
                double? completed = owner.RunOwnedMode01Acquisition(device, channel, requestEcu, delegate {
                    exchange.BeginSupportedRead();
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

    // Pure fixed sequence, not an I/O or publication permission. The eventual
    // owner/parent must still confirm cleanup and normal worker exit.
    internal sealed class J2534Mode01PairExchange
    {
        private readonly J2534Mode01Exchange coolant, rpm;
        private int state;
        private double coolantValue;
        private byte[] rpmRequest;
        internal J2534Mode01PairExchange(uint ecu)
        {
            coolant = new J2534Mode01Exchange(ecu, 5);
            rpm = new J2534Mode01Exchange(ecu, 12);
        }
        private void Require(int expected)
        {
            if (state == expected) return;
            Abort();
            throw new InvalidOperationException("mode01_pair_order_invalid");
        }
        internal void Abort()
        {
            state = 4; coolantValue = 0; rpmRequest = null;
        }
        internal byte[] BeginSupportedRead()
        {
            Require(0); state = 1;
            rpm.BeginSupportedRead();
            return coolant.BeginSupportedRead();
        }
        internal byte[] AcceptSupportedRead(J2534ReceiveNative.Result read)
        {
            Require(1); state = 4;
            // Both bits must be present in the same validated PID00 response
            // before either value request is made available.
            byte[] first = coolant.AcceptSupportedRead(read);
            byte[] second = rpm.AcceptSupportedRead(read);
            if (first == null || second == null) { Abort(); return null; }
            rpmRequest = second; state = 2;
            return first;
        }
        internal byte[] AcceptCoolantRead(J2534ReceiveNative.Result read)
        {
            Require(2); state = 4;
            double? value = coolant.AcceptValueRead(read);
            if (!value.HasValue) { Abort(); return null; }
            coolantValue = value.Value;
            byte[] next = rpmRequest; rpmRequest = null; state = 3;
            return next;
        }
        internal Values AcceptRpmRead(J2534ReceiveNative.Result read)
        {
            Require(3); state = 4;
            double? value = rpm.AcceptValueRead(read);
            if (!value.HasValue) { Abort(); return null; }
            var captured = new Values(coolantValue, value.Value);
            Abort();
            return captured;
        }
        // Intermediate values only; no partial-value getter and no retry/reset.
        internal sealed class Values
        {
            internal readonly double CoolantCelsius, Rpm;
            internal Values(double coolant, double rpm)
            { CoolantCelsius = coolant; Rpm = rpm; }
        }
    }
}
#endif
