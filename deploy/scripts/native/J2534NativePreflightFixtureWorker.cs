using System;
using System.Globalization;
using System.IO;
using VehicleDiagnosis.Native;

internal static class J2534NativePreflightFixtureWorker
{
    private static readonly string[] Scenarios = {
        "success", "sha-mismatch", "size-mismatch", "machine-mismatch",
        "wrong-architecture", "runtime-machine-mismatch", "malformed-pe", "empty",
        "oversized", "relative-path", "junction", "share-lock"
    };
    private static bool fixtureWriteBlocked, fixtureRenameBlocked, fixtureDeleteBlocked, fixtureHandleReleased;

    private static string Bool(bool value) { return value ? "true" : "false"; }
    private static bool SafeToken(string value)
    {
        if (value == null || value.Length < 8 || value.Length > 64) return false;
        for (int i = 0; i < value.Length; i++)
            if (!((value[i] >= 'a' && value[i] <= 'z') || (value[i] >= 'A' && value[i] <= 'Z')
                || (value[i] >= '0' && value[i] <= '9') || value[i] == '-' || value[i] == '_')) return false;
        return true;
    }
    private static string JsonArray(string[] values)
    {
        if (values == null || values.Length == 0) return "[]";
        return "[\"" + String.Join("\",\"", values) + "\"]";
    }

    private static string Envelope(string nonce, string deviceId, RegisteredDriverPreflightResult result)
    {
        return "{\"contract_version\":\"j2534-native-preflight-fixture-v1\",\"request_nonce\":\"" + nonce
            + "\",\"selected_device_id\":\"" + deviceId + "\",\"verification_status\":\"" + result.Status
            + "\",\"blockers\":" + JsonArray(result.Blockers) + ",\"fixed_drive_verified\":" + Bool(result.FixedDriveVerified)
            + ",\"final_path_matches\":" + Bool(result.FinalPathMatches) + ",\"file_identity_stable\":" + Bool(result.FileIdentityStable)
            + ",\"sha256_matches\":" + Bool(result.Sha256Matches) + ",\"size_matches\":" + Bool(result.SizeMatches)
            + ",\"architecture_matches\":" + Bool(result.ArchitectureMatches)
            + ",\"runtime_architecture_matches\":" + Bool(result.RuntimeArchitectureMatches)
            + ",\"dll_load_attempted\":" + Bool(result.DllLoadAttempted)
            + ",\"get_proc_address_attempted\":" + Bool(result.GetProcAddressAttempted)
            + ",\"pass_thru_open_attempted\":" + Bool(result.PassThruOpenAttempted)
            + ",\"vehicle_connection_attempted\":" + Bool(result.VehicleConnectionAttempted)
            + ",\"vehicle_command_enabled\":" + Bool(result.VehicleCommandEnabled)
            + ",\"execution_enabled\":" + Bool(result.ExecutionEnabled)
            + ",\"fixture_write_blocked\":" + Bool(fixtureWriteBlocked)
            + ",\"fixture_rename_blocked\":" + Bool(fixtureRenameBlocked)
            + ",\"fixture_delete_blocked\":" + Bool(fixtureDeleteBlocked)
            + ",\"fixture_handle_released\":" + Bool(fixtureHandleReleased)
            + ",\"fixture_identity_mutation_rejected\":" + Bool(J2534RegisteredDriverPreflight.FixtureIdentityMutationRejected()) + "}";
    }

    private static void VerifyShareLock(string path)
    {
        string moved = path + ".moved";
        try { using (FileStream stream = new FileStream(path, FileMode.Open, FileAccess.Write, FileShare.ReadWrite | FileShare.Delete)) { } }
        catch (IOException) { fixtureWriteBlocked = true; }
        try { File.Move(path, moved); }
        catch (IOException) { fixtureRenameBlocked = true; }
        try { File.Delete(path); }
        catch (IOException) { fixtureDeleteBlocked = true; }
    }

    public static int Main(string[] args)
    {
        if (args.Length != 7 || args[0] != "--fixture" || Array.IndexOf(Scenarios, args[1]) < 0
            || args[2].Length != 64 || !SafeToken(args[5]) || !SafeToken(args[6])) return 2;
        long expectedSize;
        if (!Int64.TryParse(args[3], NumberStyles.None, CultureInfo.InvariantCulture, out expectedSize)) return 2;
        string scenario = args[1];
        string expectedSha = args[2];
        string expectedArchitecture = args[4];
        string fileName = scenario == "wrong-architecture" || scenario == "runtime-machine-mismatch" ? "wrong-architecture.dll"
            : scenario == "malformed-pe" ? "malformed.dll"
            : scenario == "empty" ? "empty.dll"
            : scenario == "oversized" ? "oversized.dll"
            : "success.dll";
        string privatePath = scenario == "relative-path" ? "..\\driver.dll"
            : scenario == "junction" ? Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "junction", "success.dll")
            : Path.Combine(AppDomain.CurrentDomain.BaseDirectory, fileName);
        if (scenario == "sha-mismatch") expectedSha = (expectedSha[0] == '0' ? "1" : "0") + expectedSha.Substring(1);
        if (scenario == "size-mismatch") expectedSize++;
        if (scenario == "machine-mismatch") expectedArchitecture = expectedArchitecture == "x86" ? "x64" : "x86";
        if (scenario == "runtime-machine-mismatch") expectedArchitecture = expectedArchitecture == "x86" ? "x64" : "x86";
        try
        {
            if (scenario == "share-lock") J2534RegisteredDriverPreflight.FixtureHandleVerified = VerifyShareLock;
            RegisteredDriverPreflightResult result = J2534RegisteredDriverPreflight.Verify(
                privatePath, expectedSha, expectedSize, expectedArchitecture);
            J2534RegisteredDriverPreflight.FixtureHandleVerified = null;
            if (scenario == "share-lock")
            {
                try { using (FileStream stream = new FileStream(privatePath, FileMode.Open, FileAccess.ReadWrite, FileShare.Read)) { fixtureHandleReleased = true; } }
                catch { fixtureHandleReleased = false; }
            }
            Console.Out.Write(Envelope(args[5], args[6], result));
            return 0;
        }
        catch { return 1; }
    }
}
