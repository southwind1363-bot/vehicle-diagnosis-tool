#if NATIVE_RECEIVE_FIXTURE_TESTS
using System;
using System.Collections;
using System.IO;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using VehicleDiagnosis.Native;

// Isolated integration harness only. Never included in the workstation worker.
// Expected digest is compiled by the validator, not supplied by a caller.
internal static class J2534OwnedReceiveFixtureWorker
{
    private sealed class FixtureLibrary : IIdentityLibrary
    {
        private IntPtr module;
        private bool disposed;
        internal bool Retained;
        [DllImport("kernel32.dll", CharSet = CharSet.Unicode, ExactSpelling = true)]
        private static extern IntPtr LoadLibraryExW(string path, IntPtr file, uint flags);
        [DllImport("kernel32.dll", CharSet = CharSet.Ansi, ExactSpelling = true)]
        private static extern IntPtr GetProcAddress(IntPtr library, string name);

        internal FixtureLibrary()
        {
            string path = WindowsIdentityLibrary.ValidatePath(Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "owned-receive.dll"));
            // Deny replacement/deletion from digest verification through loading.
            using (var file = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.Read))
            using (var sha = SHA256.Create())
            {
                if (BitConverter.ToString(sha.ComputeHash(file)).Replace("-", "") != OwnedReceiveFixtureDigest.Value)
                    throw new InvalidOperationException("fixture_digest_rejected");
                module = LoadLibraryExW(path, IntPtr.Zero, 0x00000900);
            }
            if (module == IntPtr.Zero) throw new InvalidOperationException("fixture_load_failed");
        }
        public IntPtr Resolve(string name)
        {
            if (disposed) throw new ObjectDisposedException("fixture_library");
            if (name != "PassThruOpen" && name != "PassThruClose" && name != "PassThruReadVersion" && name != "PassThruReadMsgs")
                throw new InvalidOperationException("fixture_export_rejected");
            return GetProcAddress(module, name);
        }
        public bool Release(bool allowUnload)
        {
            // No unload path in this fixture harness, even on early failure.
            disposed = true;
            Retained = true;
            return false;
        }
    }

    public static int Main(string[] args)
    {
        if (args.Length != 1 || args[0] != "--fixture-owned-receive") return 2;
        try
        {
            foreach (DictionaryEntry entry in Environment.GetEnvironmentVariables())
            {
                string key = Convert.ToString(entry.Key).ToUpperInvariant();
                if (key.StartsWith("COR_") || key.StartsWith("CORECLR_") || key.StartsWith("COMPLUS_") || key == "NODE_OPTIONS" || key == "NODE_PATH") return 3;
            }
            var library = new FixtureLibrary();
            using (var owner = new J2534IdentityNative(library))
            {
                uint device;
                if (owner.Open(out device) != 0) return 1;
                var read = (J2534ReceiveNative.ReadFunction)Marshal.GetDelegateForFunctionPointer(
                    library.Resolve("PassThruReadMsgs"), typeof(J2534ReceiveNative.ReadFunction));
                // Synthetic fixture channel only. No PassThruConnect or vehicle.
                var receiver = new J2534ReceiveNative(owner, device, read);
                var result = receiver.ReadOnce(0xf1234567, 3);
                if (result.Status != 0 || result.ReportedCount != 2 || result.Messages.Length != 2
                    || result.Messages[0].Data.Length != 4 || result.Messages[0].Data[0] != 1
                    || result.Messages[0].Data[3] != 4 || result.Messages[1].Data.Length != 0
                    || result.Messages[1].RxStatus != 2) return 1;
                // Deliberately no Close: channel cleanup has not been established.
            }
            if (!library.Retained) return 1;
            Console.Out.Write("{\"fixture_only\":true,\"pointer_bits\":" + (IntPtr.Size * 8)
                + ",\"received_count\":2,\"module_retained\":true,\"cleanup_confirmed\":false,\"vehicle_communication\":false}");
            return 0;
        }
        catch { return 1; } // No native data, paths, or exception text on either stream.
    }
}
#endif
