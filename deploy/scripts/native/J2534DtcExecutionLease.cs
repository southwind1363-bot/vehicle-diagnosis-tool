#if J2534_DTC_DEVELOPMENT
using System.Collections.Generic;
using System.Threading;

namespace VehicleDiagnosis.Native
{
    // One acquisition attempt per isolated process. Never retry or force-release
    // an existing owner's mutex. Uncertain cleanup stays rooted until exit.
    internal sealed class J2534DtcExecutionLease
    {
        private static int attempted;
        private static readonly List<J2534GlobalMutexLease> retained = new List<J2534GlobalMutexLease>();
        private readonly J2534GlobalMutexLease mutex;
        private readonly int threadId;
        private int completed;
        private J2534DtcExecutionLease(J2534GlobalMutexLease value)
        { mutex = value; threadId = Thread.CurrentThread.ManagedThreadId; }

        internal static bool TryAcquire(out J2534DtcExecutionLease lease)
        {
            lease = null;
            if (Interlocked.Exchange(ref attempted, 1) != 0) return false;
            J2534GlobalMutexLease value;
            if (!J2534GlobalMutexLease.TryAcquire(out value)) return false;
            lease = new J2534DtcExecutionLease(value);
            return true;
        }

        internal void Complete(bool cleanupConfirmed)
        {
            if (Interlocked.Exchange(ref completed, 1) != 0) return;
            if (cleanupConfirmed && Thread.CurrentThread.ManagedThreadId == threadId) mutex.Dispose();
            else { lock (retained) retained.Add(mutex); }
        }
    }
}
#endif
