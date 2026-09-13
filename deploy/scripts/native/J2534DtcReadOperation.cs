#if J2534_DTC_DEVELOPMENT
using System;
using System.Runtime.InteropServices;

namespace VehicleDiagnosis.Native
{
    // Internal operations on an already opened, owned device, not an execution entry.
    // The caller owns the process lease, binding and result validation.
    internal static class J2534DtcReadOperation
    {
        // A result leaves this method only after the existing bounded native
        // shape check and ordered channel/device shutdown have both succeeded.
        // The caller must still dispose the owner and verify module release.
        internal static bool TryReadAndFinish(WindowsDtcReadLibrary library, J2534IdentityNative owner,
            uint device, uint channel, J2534DtcReadSelection selection,
            J2534ReceiveNative.ReadFunction read, out J2534ReceiveNative.Result result)
        {
            result = null;
            uint filter;
            J2534ReceiveNative.Result captured;
            if (!TryReadOnce(library, owner, device, channel, selection, read, out filter, out captured)) return false;
            // ERR_TIMEOUT may accompany fewer complete messages than requested.
            // This is shape validation only; the parent still checks ECU/service
            // and payload semantics after normal worker exit. No retry here.
            if ((captured.Status != 0 && captured.Status != 9)
                || captured.Messages.Length < 1 || captured.Messages.Length > 2
                || captured.ReportedCount != captured.Messages.Length) return false;
            if (!TryFinish(owner, device, channel, filter)) return false;
            result = captured;
            return true;
        }

        internal static bool TryConnect(WindowsDtcReadLibrary library, J2534IdentityNative owner,
            uint device, out uint channel, out J2534ReceiveNative.ReadFunction read)
        {
            channel = 0; read = null;
            if (library == null || owner == null) throw new InvalidOperationException("native_dtc_operation_invalid");
            read = (J2534ReceiveNative.ReadFunction)Marshal.GetDelegateForFunctionPointer(
                library.Resolve("PassThruReadMsgs"), typeof(J2534ReceiveNative.ReadFunction));
            var connect = (J2534IdentityNative.ConnectFunction)Marshal.GetDelegateForFunctionPointer(
                library.Resolve("PassThruConnect"), typeof(J2534IdentityNative.ConnectFunction));
            var disconnect = (J2534IdentityNative.DisconnectFunction)Marshal.GetDelegateForFunctionPointer(
                library.Resolve("PassThruDisconnect"), typeof(J2534IdentityNative.DisconnectFunction));
            return owner.Connect(device, 6, 0, 500000, connect, disconnect, out channel) == 0;
        }

        // Call only after the receive result passes the caller's validation.
        // Short circuit at the first failure; never guess a recovery sequence.
        internal static bool TryFinish(J2534IdentityNative owner, uint device, uint channel, uint filter)
        {
            if (owner == null) throw new InvalidOperationException("native_dtc_operation_invalid");
            if (owner.StopDtcReadFilter(device, channel, filter) != 0) return false;
            if (owner.Disconnect(device, channel) != 0) return false;
            return owner.Close(device) == 0;
        }

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
