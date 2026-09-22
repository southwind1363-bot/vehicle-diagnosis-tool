#if J2534_DTC_DEVELOPMENT && J2534_MODE01_DEVELOPMENT
using System;
namespace VehicleDiagnosis.Native
{
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
