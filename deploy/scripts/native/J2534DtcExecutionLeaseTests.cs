#if J2534_DTC_DEVELOPMENT && NATIVE_RECEIVE_FIXTURE_TESTS
using System;
using VehicleDiagnosis.Native;

internal static class J2534DtcExecutionLeaseTests
{
    public static int Main(string[] args)
    {
        if (args.Length != 1 || (args[0] != "active" && args[0] != "retained" && args[0] != "released")) return 2;
        J2534DtcExecutionLease lease;
        if (!J2534DtcExecutionLease.TryAcquire(out lease)) return 3;
        try {
            if (args[0] != "active") lease.Complete(args[0] == "released");
            // Completion cannot be changed later, nor reacquired recursively.
            if (args[0] == "retained") lease.Complete(true);
            J2534DtcExecutionLease duplicate;
            if (J2534DtcExecutionLease.TryAcquire(out duplicate)) return 4;
            GC.Collect(); GC.WaitForPendingFinalizers();
            Console.WriteLine("READY"); Console.Out.Flush();
            return Console.ReadLine() == "done" ? 0 : 5;
        } finally { lease.Complete(args[0] != "retained"); }
    }
}
#endif
