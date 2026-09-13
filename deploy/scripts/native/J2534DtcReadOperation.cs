#if J2534_DTC_DEVELOPMENT
using System;
using System.Runtime.InteropServices;

namespace VehicleDiagnosis.Native
{
    // Internal operation on an already owned channel, not an execution entry.
    // The caller owns the process lease, binding and validated cleanup sequence.
    internal static class J2534DtcReadOperation
    {
        internal static bool TryReadOnce(WindowsDtcReadLibrary library, J2534IdentityNative owner,
            uint device, uint channel, J2534DtcReadSelection selection,
            J2534ReceiveNative.ReadFunction read, out uint filter, out J2534ReceiveNative.Result result)
        {
            filter = 0; result = null;
            if (library == null || owner == null || selection == null || read == null)
                throw new InvalidOperationException("native_dtc_operation_invalid");
            var start = (J2534ReadRequestNative.StartFilterFunction)Marshal.GetDelegateForFunctionPointer(
                library.Resolve("PassThruStartMsgFilter"), typeof(J2534ReadRequestNative.StartFilterFunction));
            var stop = (J2534ReadRequestNative.StopFilterFunction)Marshal.GetDelegateForFunctionPointer(
                library.Resolve("PassThruStopMsgFilter"), typeof(J2534ReadRequestNative.StopFilterFunction));
            var write = (J2534ReadRequestNative.WriteFunction)Marshal.GetDelegateForFunctionPointer(
                library.Resolve("PassThruWriteMsgs"), typeof(J2534ReadRequestNative.WriteFunction));
            var request = new J2534ReadRequestNative(owner, device, write);
            if (request.PrepareDtcFilterOnce(channel, selection.RequestEcu, start, stop, out filter) != 0) return false;
            if (request.DispatchDtcReadOnce(channel, selection.RequestEcu, selection.Service) != 0) return false;
            // Acceptance only permits one receive. It does not mean a successful
            // diagnosis; the caller must validate the result and confirm cleanup.
            var receiver = new J2534ReceiveNative(owner, device, read);
            result = receiver.ReadDtcResponseOnce(channel, 3);
            return true;
        }
    }
}
#endif
