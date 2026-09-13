#if J2534_DTC_DEVELOPMENT && NATIVE_RECEIVE_FIXTURE_TESTS
using System;
using System.IO;
using System.Security.Cryptography;
using VehicleDiagnosis.Native;

internal static class WindowsDtcReadLibraryTests
{
    private static string Digest(string path)
    {
        using (var file = File.OpenRead(path))
        using (var sha = SHA256.Create())
            return BitConverter.ToString(sha.ComputeHash(file)).Replace("-", "");
    }
    private static void Rejected(Action action, string reason)
    {
        try { action(); }
        catch (InvalidOperationException error) { if (error.Message == reason) return; throw; }
        throw new Exception("expected_rejection");
    }
    private static WindowsDtcReadLibrary Load(string path, string digest)
    {
        return WindowsDtcReadLibrary.LoadVerified(path, digest, new FileInfo(path).Length, IntPtr.Size == 4 ? "x86" : "x64");
    }
    public static int Main()
    {
        try {
            string root = AppDomain.CurrentDomain.BaseDirectory;
            string path = Path.Combine(root, "owned-dtc-data", "owned-receive.dll");
            int verifiedCalls = 0;
            J2534RegisteredDriverPreflight.FixtureHandleVerified = delegate(string heldPath) {
                verifiedCalls++;
                bool blocked = false;
                try { using (var stream = new FileStream(heldPath, FileMode.Open, FileAccess.Write, FileShare.ReadWrite | FileShare.Delete)) { } }
                catch (IOException) { blocked = true; }
                if (!blocked) throw new Exception("verified_file_not_held");
            };
            foreach (string invalid in new string[] { null, "", "ABC", new String('G', 64) })
                Rejected(delegate { Load(path, invalid); }, "native_dtc_verified_binding_failed");
            Rejected(delegate { Load(path, new String('0', 64)); }, "native_dtc_verified_binding_failed");
            Rejected(delegate { WindowsDtcReadLibrary.LoadVerified(path, Digest(path), 1, IntPtr.Size == 4 ? "x86" : "x64"); }, "native_dtc_verified_binding_failed");
            Rejected(delegate { WindowsDtcReadLibrary.LoadVerified(path, Digest(path), new FileInfo(path).Length, IntPtr.Size == 4 ? "x64" : "x86"); }, "native_dtc_verified_binding_failed");
            if (verifiedCalls != 0) throw new Exception("rejected_input_reached_callback");
            string missing = Path.Combine(root, "success.dll"); // Three identity exports only.
            Rejected(delegate { Load(missing, Digest(missing)); }, "native_dtc_verified_binding_failed");
            var library = Load(path, Digest(path).ToLowerInvariant());
            foreach (string name in new string[] { null, "", "PassThruIoctl", "PassThruStartPeriodicMsg", "passthruopen" })
                Rejected(delegate { library.Resolve(name); }, "native_export_not_allowed");
            if (library.Resolve("PassThruReadMsgs") == IntPtr.Zero || !library.Release(true) || library.Retained
                || !library.Release(false)) throw new Exception("release_failed");
            try { library.Resolve("PassThruOpen"); throw new Exception("released_resolved"); }
            catch (ObjectDisposedException) { }
            var retained = Load(path, Digest(path));
            if (retained.Release(false) || !retained.Retained || retained.Release(true)) throw new Exception("retention_failed");
            if (verifiedCalls != 3) throw new Exception("verified_callback_count_wrong");
            Console.WriteLine("DTC library digest/export/lifetime checks passed; generated DLL only");
            return 0;
        } catch { Console.Error.WriteLine("dtc_library_checks_failed"); return 1; }
    }
}
#endif
