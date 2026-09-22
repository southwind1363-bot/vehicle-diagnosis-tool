#if J2534_DTC_DEVELOPMENT && J2534_MODE01_DEVELOPMENT && J2534_MODE01_PAIR_FIXTURE
using System;
using System.IO;
using System.Runtime.InteropServices;
using VehicleDiagnosis.Native;

// Fixed generated PE only. No registry descriptor or user-selected DLL input.
internal static class J2534Mode01PairFixtureWorker
{
    private static T Bind<T>(WindowsDtcReadLibrary library, string name) where T : class
    { return Marshal.GetDelegateForFunctionPointer(library.Resolve(name), typeof(T)) as T; }
    internal static int Main(string[] args)
    {
        if (args.Length != 1 || args[0] != "--generated-mode01-pair") return 2;
        J2534DtcExecutionLease lease = null;
        bool cleaned = false;
        try {
            if (!J2534DtcExecutionLease.TryAcquire(out lease)) return 8;
#if PREFLIGHT_FIXTURE_TESTS
            J2534RegisteredDriverPreflight.FixtureHandleVerified = delegate(string verifiedPath) { };
#endif
            var library = WindowsDtcReadLibrary.LoadVerified(
                Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "mode01.dll"),
                Mode01PairFixtureDigest.Value, Mode01PairFixtureDigest.Size, IntPtr.Size == 8 ? "x64" : "x86");
            using (var owner = new J2534IdentityNative(library)) {
                uint device, channel;
                if (owner.Open(out device) != 0) return 3;
                if (owner.Connect(device, 6, 0, 500000,
                    Bind<J2534IdentityNative.ConnectFunction>(library, "PassThruConnect"),
                    Bind<J2534IdentityNative.DisconnectFunction>(library, "PassThruDisconnect"), out channel) != 0) return 4;
                var request = new J2534ReadRequestNative(owner, device,
                    Bind<J2534ReadRequestNative.WriteFunction>(library, "PassThruWriteMsgs"));
                var observation = request.ReadMode01PairObservationAndFinish(channel, 0x7e0,
                    Bind<J2534ReceiveNative.ReadFunction>(library, "PassThruReadMsgs"),
                    Bind<J2534ReadRequestNative.StartFilterFunction>(library, "PassThruStartMsgFilter"),
                    Bind<J2534ReadRequestNative.StopFilterFunction>(library, "PassThruStopMsgFilter"));
                if (observation == null) return 5;
                cleaned = true;
                Console.Write(observation.ToFixtureJson());
            }
            return 0;
        } catch { return 1; }
        finally { if (lease != null) lease.Complete(cleaned); }
    }
}
#endif
