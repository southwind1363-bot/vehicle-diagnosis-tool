using System;
using System.Threading;

namespace VehicleDiagnosis.Native
{
    internal sealed class J2534GlobalMutexLease : IDisposable
    {
        internal const string Name = "Global\\VehicleDiagnosisTool.J2534.IdentityProbe.v1";
        private Mutex mutex;
        private bool owned;

        private J2534GlobalMutexLease(Mutex value, bool acquired)
        {
            mutex = value;
            owned = acquired;
        }

        internal static bool TryAcquire(out J2534GlobalMutexLease lease)
        {
            lease = null;
            Mutex value = null;
            try
            {
                value = new Mutex(false, Name);
                bool acquired;
                try { acquired = value.WaitOne(0, false); }
                catch (AbandonedMutexException) { acquired = true; }
                if (!acquired) { value.Dispose(); return false; }
                lease = new J2534GlobalMutexLease(value, true);
                return true;
            }
            catch
            {
                if (value != null) value.Dispose();
                return false;
            }
        }

        public void Dispose()
        {
            Mutex value = mutex;
            mutex = null;
            if (value == null) return;
            try { if (owned) value.ReleaseMutex(); }
            finally { owned = false; value.Dispose(); }
        }
    }
}
