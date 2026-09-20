#if J2534_DTC_DEVELOPMENT && J2534_MODE01_DEVELOPMENT
using System;
using System.IO;
using System.Globalization;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using VehicleDiagnosis.Native;

// Test-only fixed generated DLL, not an installed-driver or public worker entry.
internal static class J2534Mode01FixtureWorker
{
    private sealed class Library : IIdentityLibrary
    {
        private IntPtr module;
        private readonly FileStream file;
        [DllImport("kernel32.dll", CharSet = CharSet.Unicode, ExactSpelling = true)]
        private static extern IntPtr LoadLibraryExW(string path, IntPtr file, uint flags);
        [DllImport("kernel32.dll", CharSet = CharSet.Ansi, ExactSpelling = true)]
        private static extern IntPtr GetProcAddress(IntPtr library, string name);
        [DllImport("kernel32.dll", ExactSpelling = true)]
        [return: MarshalAs(UnmanagedType.Bool)]
        private static extern bool FreeLibrary(IntPtr library);
        internal Library()
        {
            string path = WindowsIdentityLibrary.ValidatePath(Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "mode01.dll"));
            file = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.Read);
            if (file.Length != Mode01FixtureDigest.Size) throw new InvalidOperationException("fixture_size_rejected");
            using (var sha = SHA256.Create()) {
                if (BitConverter.ToString(sha.ComputeHash(file)).Replace("-", "") != Mode01FixtureDigest.Value)
                    throw new InvalidOperationException("fixture_digest_rejected");
            }
            module = LoadLibraryExW(path, IntPtr.Zero, 0x900);
            if (module == IntPtr.Zero) throw new InvalidOperationException("fixture_load_failed");
        }
        public IntPtr Resolve(string name)
        {
            if (Array.IndexOf(new string[] { "PassThruOpen", "PassThruReadVersion", "PassThruClose", "PassThruConnect",
                "PassThruDisconnect", "PassThruStartMsgFilter", "PassThruStopMsgFilter", "PassThruWriteMsgs", "PassThruReadMsgs" }, name) < 0)
                throw new InvalidOperationException("fixture_export_rejected");
            var address = GetProcAddress(module, name);
            if (address == IntPtr.Zero) throw new InvalidOperationException("fixture_export_missing");
            return address;
        }
        public bool Release(bool allowed)
        {
            if (!allowed || module == IntPtr.Zero || !FreeLibrary(module)) return false;
            module = IntPtr.Zero; file.Dispose(); return true;
        }
    }
    private static T Bind<T>(Library library, string name) where T : class
    { return Marshal.GetDelegateForFunctionPointer(library.Resolve(name), typeof(T)) as T; }
    private static bool MatchesSelection(string[] args)
    {
        // Arguments cannot select a new file or expand the compile-time request.
        // Compare before acquiring a lease, opening a file or loading the fixture.
        if (args == null || args.Length != 7
            || (args[0] != "--generated-mode01" && args[0] != "--generated-mode01-out-of-order")) return false;
        long size; uint ecu, pid;
        return args[1] == Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "mode01.dll")
            && String.Equals(args[2], Mode01FixtureDigest.Value, StringComparison.OrdinalIgnoreCase)
            && Int64.TryParse(args[3], NumberStyles.None, CultureInfo.InvariantCulture, out size)
            && size == Mode01FixtureDigest.Size
            && args[4] == (IntPtr.Size == 8 ? "x64" : "x86")
            && UInt32.TryParse(args[5], NumberStyles.None, CultureInfo.InvariantCulture, out ecu) && ecu == 0x7e0
            && UInt32.TryParse(args[6], NumberStyles.None, CultureInfo.InvariantCulture, out pid) && pid == Mode01FixtureDigest.Pid;
    }
    internal static int Main(string[] args)
    {
        if (!MatchesSelection(args)) return 2;
        J2534DtcExecutionLease lease = null;
        bool cleanupConfirmed = false;
        try {
            // Reuse the existing single-acquisition/uncertain-cleanup rules.
            // Never load even the generated fixture while another owner holds it.
            if (!J2534DtcExecutionLease.TryAcquire(out lease)) return 8;
            var library = new Library();
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
                var observation = request.ReadMode01ObservationAndFinish(channel, 0x7e0, Mode01FixtureDigest.Pid,
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
