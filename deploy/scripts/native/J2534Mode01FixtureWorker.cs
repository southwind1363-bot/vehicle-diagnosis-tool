#if J2534_DTC_DEVELOPMENT && J2534_MODE01_DEVELOPMENT
using System;
using System.IO;
using System.Runtime.InteropServices;
using VehicleDiagnosis.Native;

// Test-only fixed generated DLL, not an installed-driver or public worker entry.
internal static class J2534Mode01FixtureWorker
{
    private static T Bind<T>(WindowsDtcReadLibrary library, string name) where T : class
    { return Marshal.GetDelegateForFunctionPointer(library.Resolve(name), typeof(T)) as T; }
    private static J2534Mode01ReadSelection MatchSelection(string[] args)
    {
        // Arguments cannot select a new file or expand the compile-time request.
        // Compare before acquiring a lease, opening a file or loading the fixture.
        if (args == null || args.Length != 7
            || (args[0] != "--generated-mode01" && args[0] != "--generated-mode01-out-of-order")) return null;
        var selection = new J2534Mode01ReadSelection(Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "mode01.dll"),
            Mode01FixtureDigest.Value, Mode01FixtureDigest.Size, IntPtr.Size == 8 ? "x64" : "x86", 0x7e0, Mode01FixtureDigest.Pid);
        return selection.MatchesArguments(args, 1) ? selection : null;
    }
    internal static int Main(string[] args)
    {
        var selection = MatchSelection(args);
        if (selection == null) return 2;
        J2534DtcExecutionLease lease = null;
        bool cleanupConfirmed = false;
        try {
            // Reuse the existing single-acquisition/uncertain-cleanup rules.
            // Never load even the generated fixture while another owner holds it.
            if (!J2534DtcExecutionLease.TryAcquire(out lease)) return 8;
#if PREFLIGHT_FIXTURE_TESTS
            J2534RegisteredDriverPreflight.FixtureHandleVerified = delegate(string verifiedPath) { };
#endif
            var library = selection.LoadVerified();
            using (var owner = new J2534IdentityNative(library)) {
                uint device, channel;
                if (owner.Open(out device) != 0) return 3;
                if (owner.Connect(device, 6, 0, 500000,
                    Bind<J2534IdentityNative.ConnectFunction>(library, "PassThruConnect"),
                    Bind<J2534IdentityNative.DisconnectFunction>(library, "PassThruDisconnect"), out channel) != 0) return 4;
                if (args[0] == "--generated-mode01-out-of-order") {
                    // Fixed fixture must reject the wrong state before dereferencing buffers.
                    int rejected = Bind<J2534ReadRequestNative.WriteFunction>(library, "PassThruWriteMsgs")(
                        channel, IntPtr.Zero, IntPtr.Zero, 0);
                    return rejected == -8 ? 6 : 7;
                }
                var request = new J2534ReadRequestNative(owner, device, Bind<J2534ReadRequestNative.WriteFunction>(library, "PassThruWriteMsgs"));
                var observation = request.ReadMode01ObservationAndFinish(channel, selection.RequestEcu, selection.Pid,
                    Bind<J2534ReceiveNative.ReadFunction>(library, "PassThruReadMsgs"),
                    Bind<J2534ReadRequestNative.StartFilterFunction>(library, "PassThruStartMsgFilter"),
                    Bind<J2534ReadRequestNative.StopFilterFunction>(library, "PassThruStopMsgFilter"));
                if (observation == null || !owner.ReferenceReleased) return 5;
                cleanupConfirmed = true;
                Console.Write(observation.ToFixtureJson());
            }
            return 0;
        } catch { return 1; }
        finally { if (lease != null) lease.Complete(cleanupConfirmed); }
    }
}
#endif
