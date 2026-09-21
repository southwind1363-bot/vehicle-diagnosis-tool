#if J2534_DTC_DEVELOPMENT && J2534_MODE01_DEVELOPMENT
using System;
using VehicleDiagnosis.Native;

internal static class J2534Mode01ReadSelectionTests
{
    private static int checks;
    private static void Check(bool ok) { if (!ok) throw new Exception("selection_check_failed"); checks++; }
    private static void Reject(Action action, string expected)
    {
        try { action(); } catch (InvalidOperationException error) { Check(error.Message == expected); return; }
        throw new Exception("selection_not_rejected");
    }
    internal static int Main(string[] args)
    {
        string path = args[0], hash = args[1], arch = args[3];
        long size = Int64.Parse(args[2]);
        foreach (uint ecu in new uint[] { 0x7e0, 0x7e7 }) foreach (uint pid in new uint[] { 5, 12 }) {
            var selected = new J2534Mode01ReadSelection(path, hash.ToLowerInvariant(), size, arch, ecu, pid);
            var ipc = new string[] { path, hash, args[2], arch, ecu.ToString(), pid.ToString() };
            Check(selected.MatchesArguments(ipc, 0));
            Check(selected.Sha256 == hash && selected.Pid == pid && selected.RequestEcu == ecu);
            Check(!selected.MatchesArguments(null, 0));
            Check(!selected.MatchesArguments(ipc, -1));
            Check(!selected.MatchesArguments(ipc, 1));
            ipc[5] = "0"; Check(!selected.MatchesArguments(ipc, 0));
        }
        foreach (uint pid in new uint[] { 0, 3, 7, 10, 13, 256, UInt32.MaxValue })
            Reject(delegate { new J2534Mode01ReadSelection(path, hash, size, arch, 0x7e0, pid); }, "native_mode01_selection_invalid");
        foreach (uint ecu in new uint[] { 0x7df, 0x7e8, UInt32.MaxValue })
            Reject(delegate { new J2534Mode01ReadSelection(path, hash, size, arch, ecu, 5); }, "native_mode01_selection_invalid");
        Reject(delegate { new J2534Mode01ReadSelection("relative.dll", hash, size, arch, 0x7e0, 5); }, "native_mode01_selection_invalid");
        Reject(delegate { new J2534Mode01ReadSelection(path, "bad", size, arch, 0x7e0, 5); }, "native_mode01_selection_invalid");
        Reject(delegate { new J2534Mode01ReadSelection(path, hash, 0, arch, 0x7e0, 5); }, "native_mode01_selection_invalid");
        Reject(delegate { new J2534Mode01ReadSelection(path, hash, size, "arm64", 0x7e0, 5); }, "native_mode01_selection_invalid");
        // Valid metadata is not a successful preflight. These fail before loading.
        Reject(delegate { new J2534Mode01ReadSelection(path, hash, size + 1, arch, 0x7e0, 5).LoadVerified(); }, "native_dtc_verified_binding_failed");
        Reject(delegate { new J2534Mode01ReadSelection(path, new string('0', 64), size, arch, 0x7e0, 5).LoadVerified(); }, "native_dtc_verified_binding_failed");
        Reject(delegate { new J2534Mode01ReadSelection(path, hash, size, arch == "x86" ? "x64" : "x86", 0x7e0, 5).LoadVerified(); }, "native_dtc_verified_binding_failed");
        Reject(delegate { new J2534DtcReadSelection(path, hash, size, arch, 0x7e0, 1); }, "native_dtc_selection_invalid");
        Console.WriteLine("Mode01 native selection checks: " + checks);
        return 0;
    }
}
#endif
