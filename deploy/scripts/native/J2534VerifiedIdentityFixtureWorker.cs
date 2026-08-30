using System;
using System.Collections;
using System.Globalization;
using System.IO;
using System.Text;
using System.Threading;
using VehicleDiagnosis.Native;

internal static class J2534VerifiedIdentityFixtureWorker
{
    private static bool writeBlocked, renameBlocked, deleteBlocked, callbackCompleted;
    private static string lifecycleStatus = "not_started";
    private static string moduleReference = "not_loaded";
    private static string firmware, dll, api;

    private static string Bool(bool value) { return value ? "true" : "false"; }
    private static string JsonArray(string[] values)
    {
        return values == null || values.Length == 0 ? "[]" : "[\"" + String.Join("\",\"", values) + "\"]";
    }
    private static string Text(byte[] bytes)
    {
        if (bytes == null || bytes.Length != 80) throw new InvalidOperationException("fixture_version_invalid");
        int end = Array.IndexOf(bytes, (byte)0);
        if (end < 1 || end > 79) throw new InvalidOperationException("fixture_version_invalid");
        for (int i = 0; i < end; i++)
            if (bytes[i] < 0x20 || bytes[i] > 0x7e || bytes[i] == 0x22 || bytes[i] == 0x5c)
                throw new InvalidOperationException("fixture_version_invalid");
        return Encoding.ASCII.GetString(bytes, 0, end);
    }
    private static void ConfirmShareLock(string path)
    {
        string moved = path + ".moved";
        try { using (FileStream stream = new FileStream(path, FileMode.Open, FileAccess.Write, FileShare.ReadWrite | FileShare.Delete)) { } }
        catch (IOException) { writeBlocked = true; }
        try { File.Move(path, moved); }
        catch (IOException) { renameBlocked = true; }
        try { File.Delete(path); }
        catch (IOException) { deleteBlocked = true; }
    }
    private static void RunIdentity(string path, bool hold)
    {
        ConfirmShareLock(path);
        WindowsIdentityLibrary library = WindowsIdentityLibrary.Load(path);
        try
        {
            using (J2534IdentityNative binding = new J2534IdentityNative(library))
            {
                uint deviceId;
                int openStatus = binding.Open(out deviceId);
                if (openStatus != 0) throw new InvalidOperationException("fixture_open_failed");
                NativeVersions versions = binding.ReadVersion(deviceId);
                if (versions.Status != 0) throw new InvalidOperationException("fixture_read_failed");
                firmware = Text(versions.Firmware); dll = Text(versions.Dll); api = Text(versions.Api);
                if (binding.Close(deviceId) != 0) throw new InvalidOperationException("fixture_close_failed");
            }
            moduleReference = library.ReferenceReleased ? "released" : "retained";
            if (moduleReference != "released") throw new InvalidOperationException("fixture_module_retained");
            lifecycleStatus = "completed";
            callbackCompleted = true;
            if (hold) Thread.Sleep(1200);
        }
        catch
        {
            moduleReference = library.ReferenceReleased ? "released" : "retained";
            throw;
        }
    }
    private static string Envelope(string nonce, string deviceId, RegisteredDriverPreflightResult result,
        string mutexStatus, string handleStatus)
    {
        return "{\"contract_version\":\"j2534-verified-identity-fixture-v1\",\"request_nonce\":\"" + nonce
            + "\",\"selected_device_id\":\"" + deviceId + "\",\"verification_status\":\"" + result.Status
            + "\",\"blockers\":" + JsonArray(result.Blockers) + ",\"global_mutex_status\":\"" + mutexStatus
            + "\",\"verified_file_handle_status\":\"" + handleStatus + "\",\"identity_lifecycle_status\":\"" + lifecycleStatus
            + "\",\"callback_completed\":" + Bool(callbackCompleted) + ",\"fixture_write_blocked\":" + Bool(writeBlocked)
            + ",\"fixture_rename_blocked\":" + Bool(renameBlocked) + ",\"fixture_delete_blocked\":" + Bool(deleteBlocked)
            + ",\"module_reference\":\"" + moduleReference + "\",\"versions\":{\"firmware\":\"" + firmware
            + "\",\"dll\":\"" + dll + "\",\"api\":\"" + api + "\"},\"vendor_dll_executed\":false"
            + ",\"vehicle_communication\":false,\"vehicle_command_enabled\":false}";
    }
    private static bool SafeToken(string value)
    {
        if (value == null || value.Length < 8 || value.Length > 64) return false;
        for (int i = 0; i < value.Length; i++)
            if (!Char.IsLetterOrDigit(value[i]) && value[i] != '-' && value[i] != '_') return false;
        return true;
    }
    public static int Main(string[] args)
    {
        if (args.Length != 7 || args[0] != "--fixture" || (args[1] != "success" && args[1] != "hold")
            || args[2].Length != 64 || !SafeToken(args[5]) || !SafeToken(args[6])) return 2;
        foreach (DictionaryEntry entry in Environment.GetEnvironmentVariables())
        {
            string key = Convert.ToString(entry.Key).ToUpperInvariant();
            if (key.StartsWith("COR_") || key.StartsWith("CORECLR_") || key.StartsWith("COMPLUS_")
                || key == "NODE_OPTIONS" || key == "NODE_PATH") return 3;
        }
        long size;
        if (!Int64.TryParse(args[3], NumberStyles.None, CultureInfo.InvariantCulture, out size)) return 2;
        J2534GlobalMutexLease lease;
        if (!J2534GlobalMutexLease.TryAcquire(out lease)) return 4;
        try
        {
            RegisteredDriverPreflightResult result;
            using (lease)
            {
                string path = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "success.dll");
                J2534RegisteredDriverPreflight.FixtureHandleVerified = null;
                result = J2534RegisteredDriverPreflight.VerifyWhileHandleHeld(path, args[2], size, args[4],
                    verifiedPath => RunIdentity(verifiedPath, args[1] == "hold"));
                Console.Out.Write(Envelope(args[5], args[6], result, "held_for_identity_lifecycle",
                    callbackCompleted ? "held_through_identity_lifecycle" : "not_confirmed"));
            }
            return result.Status == "verified_non_executable" && callbackCompleted ? 0 : 1;
        }
        catch { return 1; }
    }
}
