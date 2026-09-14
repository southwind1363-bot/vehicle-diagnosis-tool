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
            byte[] image = File.ReadAllBytes(path);
            int optional = BitConverter.ToInt32(image, 60) + 24;
            int directories = BitConverter.ToUInt16(image, optional) == 0x10b ? 96 : 112;
            using (var input = new MemoryStream(image)) {
                input.Position = 7;
                WindowsDtcReadLibrary.RequireNoDeclaredDependencies(input);
                if (input.Position != 7 || !input.CanRead) throw new Exception("dependency_check_changed_stream");
            }
            foreach (int index in new int[] { 1, 11, 12, 13, 14 }) foreach (int field in new int[] { 0, 4 }) {
                byte[] changed = (byte[])image.Clone(); changed[optional + directories + index * 8 + field] = 1;
                using (var input = new MemoryStream(changed)) {
                    input.Position = 7;
                    Rejected(delegate { WindowsDtcReadLibrary.RequireNoDeclaredDependencies(input); }, "native_dtc_dependencies_unverified");
                    if (input.Position != 7 || !input.CanRead) throw new Exception("dependency_rejection_changed_stream");
                }
            }
            foreach (int length in new int[] { 0, 63, optional + directories + 127 }) {
                using (var input = new MemoryStream(image, 0, length))
                    Rejected(delegate { WindowsDtcReadLibrary.RequireNoDeclaredDependencies(input); }, "native_dtc_dependencies_unverified");
            }
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
                string[] handoff = { path, hash.ToLowerInvariant(), size.ToString(System.Globalization.CultureInfo.InvariantCulture),
                    architecture, ecu.ToString(System.Globalization.CultureInfo.InvariantCulture), service.ToString(System.Globalization.CultureInfo.InvariantCulture) };
                if (!selected.MatchesArguments(handoff, 0)) throw new Exception("handoff_rejected");
                string[] prefixed = new string[8]; Array.Copy(handoff, 0, prefixed, 2, 6);
                if (!selected.MatchesArguments(prefixed, 2)) throw new Exception("prefixed_handoff_rejected");
                foreach (int offset in new int[] { -1, 1, Int32.MaxValue })
                    if (selected.MatchesArguments(handoff, offset)) throw new Exception("invalid_offset_accepted");
                if (selected.MatchesArguments(null, 0) || selected.MatchesArguments(new string[5], 0)
                    || selected.MatchesArguments(new string[7], 0)) throw new Exception("invalid_shape_accepted");
                for (int index = 0; index < 6; index++) {
                    string original = handoff[index];
                    foreach (string invalid in new string[] { null, "", " " + original, original + " ", "other", "4294967296", "9223372036854775808" }) {
                        handoff[index] = invalid;
                        if (selected.MatchesArguments(handoff, 0)) throw new Exception("changed_handoff_accepted");
                    }
                    handoff[index] = original;
                }
                if (!selected.MatchesArguments(handoff, 0)) throw new Exception("selection_mutated_by_handoff");
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
            int loadCalls = 0;
            WindowsDtcReadLibrary.FixtureBeforeLoad = delegate {
                loadCalls++;
                throw new Exception("dependency_reached_os_loader"); // Stop even if the gate regresses.
            };
            int dependencyCases = 0;
            foreach (int index in new int[] { 1, 11, 12, 13, 14 }) foreach (int field in new int[] { 0, 4 }) {
                byte[] changed = (byte[])image.Clone();
                changed[optional + directories + index * 8 + field] = 1;
                string candidate = Path.Combine(root, "dependency-check-" + Guid.NewGuid().ToString("N") + ".dll");
                bool created = false;
                try {
                    using (var output = new FileStream(candidate, FileMode.CreateNew, FileAccess.Write, FileShare.None)) {
                        created = true; output.Write(changed, 0, changed.Length);
                    }
                    int before = verifiedCalls;
                    Rejected(delegate { Load(candidate, Digest(candidate)); }, "native_dtc_verified_binding_failed");
                    if (verifiedCalls != before + 1 || loadCalls != 0)
                        throw new Exception("dependency_rejected_at_wrong_boundary");
                    dependencyCases++;
                } finally { if (created) File.Delete(candidate); }
            }
            WindowsDtcReadLibrary.FixtureBeforeLoad = delegate { loadCalls++; };
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
            if (verifiedCalls != dependencyCases + 3 || loadCalls != 3) throw new Exception("verified_callback_count_wrong");
            Console.WriteLine("DTC declared dependency loader gate: " + dependencyCases + " rejected before OS loading");
            Console.WriteLine("DTC library digest/export/lifetime checks passed; generated DLL only");
            return 0;
        } catch { Console.Error.WriteLine("dtc_library_checks_failed"); return 1; }
    }
}
#endif
