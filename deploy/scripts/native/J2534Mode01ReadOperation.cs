#if J2534_DTC_DEVELOPMENT && J2534_MODE01_DEVELOPMENT
using System;
using System.Runtime.InteropServices;

namespace VehicleDiagnosis.Native
{
    // Internal operation on an already connected owned device. No discovery,
    // loading, process launch or new execution permission. Caller owns the lease
    // and must still require successful worker exit before using the observation.
    internal static class J2534Mode01ReadOperation
    {
        private static T Bind<T>(WindowsDtcReadLibrary library, string name) where T : class
        {
            return Marshal.GetDelegateForFunctionPointer(library.Resolve(name), typeof(T)) as T;
        }

        internal static bool TryReadAndFinish(WindowsDtcReadLibrary library, J2534IdentityNative owner,
            uint device, uint channel, J2534Mode01ReadSelection selection, out J2534Mode01Observation observation)
        {
            observation = null;
            if (library == null || owner == null || selection == null)
                throw new InvalidOperationException("native_mode01_operation_invalid");
            var request = new J2534ReadRequestNative(owner, device,
                Bind<J2534ReadRequestNative.WriteFunction>(library, "PassThruWriteMsgs"));
            var captured = request.ReadMode01ObservationAndFinish(channel, selection.RequestEcu, selection.Pid,
                Bind<J2534ReceiveNative.ReadFunction>(library, "PassThruReadMsgs"),
                Bind<J2534ReadRequestNative.StartFilterFunction>(library, "PassThruStartMsgFilter"),
                Bind<J2534ReadRequestNative.StopFilterFunction>(library, "PassThruStopMsgFilter"));
            // Preserve the existing single-attempt, ordered-cleanup and retention
            // rules. Never return partial values or guess a recovery sequence.
            if (captured == null || !owner.ReferenceReleased) return false;
            observation = captured;
            return true;
        }
    }
}
#endif
