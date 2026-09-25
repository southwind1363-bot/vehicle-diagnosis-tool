#if J2534_DTC_DEVELOPMENT && J2534_MODE01_DEVELOPMENT && J2534_SWEEP_FIXTURE && J2534_SELECTED_SWEEP_FIXTURE
using System;
using System.Globalization;
using System.IO;

// Separate development entry: metadata is a consistency check, not permission
// to load a caller-selected DLL. The existing adjacent, compile-pinned fixture
// worker remains the only execution target and retains its preflight/lease.
internal static class J2534SelectedSweepFixtureWorker
{
    internal static int Main(string[] args)
    {
        try {
            if (args == null || args.Length != 8 ||
                args[0] != "--selected-generated-diagnostic-sweep" ||
                !String.Equals(args[1], Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "sweep.dll"), StringComparison.Ordinal) ||
                !String.Equals(args[2], SweepFixtureDigest.Value, StringComparison.Ordinal) ||
                args[3] != SweepFixtureDigest.Size.ToString(CultureInfo.InvariantCulture) ||
                args[4] != (IntPtr.Size == 8 ? "x64" : "x86") ||
                args[5] != "2016" || args[6] != "03,07,0A" || args[7] != "00,05,0C") return 2;
            return J2534DiagnosticSweepFixtureWorker.Main(new string[] { "--generated-diagnostic-sweep" });
        } catch { return 1; }
    }
}
#endif
