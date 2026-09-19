#if J2534_DTC_DEVELOPMENT && J2534_MODE01_DEVELOPMENT
using System;
using System.IO;
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
    internal static int Main(string[] args)
    {
        if (args.Length != 1 || (args[0] != "--generated-mode01" && args[0] != "--generated-mode01-out-of-order")) return 2;
        try {
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
                var observation = request.ReadMode01ObservationAndFinish(channel, 0x7e0, 5,
                    Bind<J2534ReceiveNative.ReadFunction>(library, "PassThruReadMsgs"),
                    Bind<J2534ReadRequestNative.StartFilterFunction>(library, "PassThruStartMsgFilter"),
                    Bind<J2534ReadRequestNative.StopFilterFunction>(library, "PassThruStopMsgFilter"));
                if (observation == null || !owner.ReferenceReleased) return 5;
                Console.Write(observation.ToFixtureJson());
            }
            return 0;
        } catch { return 1; }
    }
}
#endif
