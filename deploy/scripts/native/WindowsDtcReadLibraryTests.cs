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
            string architecture = IntPtr.Size == 4 ? "x86" : "x64";
            string hash = Digest(path);
            long size = new FileInfo(path).Length;
            foreach (string badPath in new string[] { null, "", "relative.dll", "C:relative.dll", "\\\\server\\share\\driver.dll" })
                Rejected(delegate { new J2534DtcReadSelection(badPath, hash, size, architecture, 0x7e0, 3); }, "native_dtc_selection_invalid");
            foreach (string badHash in new string[] { null, "", "ABC", new String('G', 64), " " + hash })
                Rejected(delegate { new J2534DtcReadSelection(path, badHash, size, architecture, 0x7e0, 3); }, "native_dtc_selection_invalid");
            foreach (uint ecu in new uint[] { 0, 0x7df, 0x7e8, UInt32.MaxValue })
                Rejected(delegate { new J2534DtcReadSelection(path, hash, size, architecture, ecu, 3); }, "native_dtc_selection_invalid");
            foreach (uint service in new uint[] { 0, 1, 4, 8, 0x2e, UInt32.MaxValue })
                Rejected(delegate { new J2534DtcReadSelection(path, hash, size, architecture, 0x7e0, service); }, "native_dtc_selection_invalid");
            foreach (long badSize in new long[] { -1, 0 })
                Rejected(delegate { new J2534DtcReadSelection(path, hash, badSize, architecture, 0x7e0, 3); }, "native_dtc_selection_invalid");
            foreach (string badArchitecture in new string[] { null, "", "arm64", "X64" })
                Rejected(delegate { new J2534DtcReadSelection(path, hash, size, badArchitecture, 0x7e0, 3); }, "native_dtc_selection_invalid");
            foreach (var field in typeof(J2534DtcReadSelection).GetFields(System.Reflection.BindingFlags.Instance | System.Reflection.BindingFlags.NonPublic))
                if (!field.IsInitOnly) throw new Exception("mutable_selection");
            for (uint ecu = 0x7e0; ecu <= 0x7e7; ecu++) foreach (uint service in new uint[] { 3, 7, 10 }) {
                var selected = new J2534DtcReadSelection(path, hash.ToLowerInvariant(), size, architecture, ecu, service);
                if (selected.RequestEcu != ecu || selected.Service != service || selected.Sha256 != hash || selected.Path != path
                    || selected.Size != size || selected.Architecture != architecture) throw new Exception("selection_changed");
            }
            Rejected(delegate { WindowsDtcReadLibrary.LoadSelected(null); }, "native_dtc_selection_invalid");
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
            Rejected(delegate { WindowsDtcReadLibrary.LoadSelected(new J2534DtcReadSelection(path, hash, 1, architecture, 0x7e0, 3)); }, "native_dtc_verified_binding_failed");
            Rejected(delegate { WindowsDtcReadLibrary.LoadVerified(path, Digest(path), new FileInfo(path).Length, IntPtr.Size == 4 ? "x64" : "x86"); }, "native_dtc_verified_binding_failed");
            if (verifiedCalls != 0) throw new Exception("rejected_input_reached_callback");
            string missing = Path.Combine(root, "success.dll"); // Three identity exports only.
            Rejected(delegate { Load(missing, Digest(missing)); }, "native_dtc_verified_binding_failed");
            var library = WindowsDtcReadLibrary.LoadSelected(new J2534DtcReadSelection(path, hash.ToLowerInvariant(), size, architecture, 0x7e0, 3));
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
