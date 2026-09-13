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
    public static int Main()
    {
        try {
            string root = AppDomain.CurrentDomain.BaseDirectory;
            string path = Path.Combine(root, "owned-dtc-data", "owned-receive.dll");
            foreach (string invalid in new string[] { null, "", "ABC", new String('G', 64) })
                Rejected(delegate { WindowsDtcReadLibrary.Load(path, invalid); }, "native_dtc_digest_invalid");
            Rejected(delegate { WindowsDtcReadLibrary.Load(path, new String('0', 64)); }, "native_dtc_binding_failed");
            string missing = Path.Combine(root, "success.dll"); // Three identity exports only.
            Rejected(delegate { WindowsDtcReadLibrary.Load(missing, Digest(missing)); }, "native_dtc_binding_failed");
            var library = WindowsDtcReadLibrary.Load(path, Digest(path));
            foreach (string name in new string[] { null, "", "PassThruIoctl", "PassThruStartPeriodicMsg", "passthruopen" })
                Rejected(delegate { library.Resolve(name); }, "native_export_not_allowed");
            if (library.Resolve("PassThruReadMsgs") == IntPtr.Zero || !library.Release(true) || library.Retained
                || !library.Release(false)) throw new Exception("release_failed");
            try { library.Resolve("PassThruOpen"); throw new Exception("released_resolved"); }
            catch (ObjectDisposedException) { }
            var retained = WindowsDtcReadLibrary.Load(path, Digest(path));
            if (retained.Release(false) || !retained.Retained || retained.Release(true)) throw new Exception("retention_failed");
            Console.WriteLine("DTC library digest/export/lifetime checks passed; generated DLL only");
            return 0;
        } catch { Console.Error.WriteLine("dtc_library_checks_failed"); return 1; }
    }
}
#endif
