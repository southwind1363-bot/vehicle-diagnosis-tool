using System;
using System.IO;
using System.Text;
using System.Threading;
using System.Collections;
using VehicleDiagnosis.Native;

internal static class J2534NativeFixtureWorker
{
    private static readonly string[] Scenarios = { "success", "open-failure", "overrun", "hang", "crash", "result-then-hang" };
    private static string Step(bool attempted, int? status)
    { return "{\"attempted\":" + (attempted ? "true" : "false") + ",\"status_code\":" + (status.HasValue ? status.Value.ToString() : "null") + "}"; }
    private static string Text(byte[] bytes)
    {
        if (bytes == null || bytes.Length != 80) throw new InvalidOperationException("native_fixture_version_invalid");
        int end = Array.IndexOf(bytes, (byte)0);
        if (end < 1 || end > 79) throw new InvalidOperationException("native_fixture_version_invalid");
        for (int i = 0; i < end; i++) if (bytes[i] < 0x20 || bytes[i] > 0x7e || bytes[i] == 0x22 || bytes[i] == 0x5c)
            throw new InvalidOperationException("native_fixture_version_invalid");
        return Encoding.ASCII.GetString(bytes, 0, end);
    }
    private static string Envelope(string scenario, string status, string errors, string open, string read, string close,
        string cleanup, string moduleReference, string versions)
    {
        return "{\"schema_version\":\"j2534-native-fixture-worker-v1\",\"fixture_only\":true,\"native_fixture_executed\":true,"
            + "\"vendor_dll_executed\":false,\"vehicle_communication\":false,\"architecture\":\"" + (IntPtr.Size == 4 ? "x86" : "x64")
            + "\",\"pointer_bits\":" + (IntPtr.Size * 8) + ",\"scenario\":\"" + scenario + "\",\"lifecycle\":{\"status\":\""
            + status + "\",\"errors\":" + errors + ",\"steps\":{\"open\":" + open + ",\"read_version\":" + read + ",\"close\":"
            + close + "},\"cleanup_status\":\"" + cleanup + "\",\"module_reference\":\"" + moduleReference + "\",\"versions\":" + versions + "}}";
    }
    private static int Run(string scenario)
    {
        string dllScenario = scenario == "result-then-hang" ? "success" : scenario;
        WindowsIdentityLibrary library = WindowsIdentityLibrary.Load(Path.Combine(AppDomain.CurrentDomain.BaseDirectory, dllScenario + ".dll"));
        J2534IdentityNative binding = new J2534IdentityNative(library);
        uint deviceId;
        int open = binding.Open(out deviceId);
        if (open != 0)
        {
            binding.Dispose();
            Console.Out.Write(Envelope(scenario, "open_failed", "[\"open_status_failed\"]", Step(true, open), Step(false, null), Step(false, null),
                "not_required", library.ReferenceReleased ? "released" : "retained", "null"));
            return 0;
        }
        try
        {
            NativeVersions versions = binding.ReadVersion(deviceId);
            string values = "{\"firmware\":\"" + Text(versions.Firmware) + "\",\"dll\":\"" + Text(versions.Dll) + "\",\"api\":\"" + Text(versions.Api) + "\"}";
            int close = binding.Close(deviceId);
            binding.Dispose();
            if (close != 0) throw new InvalidOperationException("native_fixture_close_failed");
            string output = Envelope(scenario, "completed", "[]", Step(true, open), Step(true, versions.Status), Step(true, close),
                "confirmed", library.ReferenceReleased ? "released" : "retained", values);
            Console.Out.Write(output);
            if (scenario == "result-then-hang") { Console.Out.Flush(); Thread.Sleep(Timeout.Infinite); }
            return 0;
        }
        catch (InvalidOperationException error)
        {
            if (error.Message != "native_version_buffer_overrun") throw;
            binding.Dispose();
            if (library.ReferenceReleased) throw new InvalidOperationException("native_fixture_corrupt_reference_released");
            Console.Out.Write(Envelope(scenario, "corrupted", "[\"native_version_buffer_overrun\"]", Step(true, open), Step(true, null), Step(false, null),
                "unconfirmed", "retained", "null"));
            return 0;
        }
    }
    public static int Main(string[] args)
    {
        if (args.Length != 2 || args[0] != "--fixture" || Array.IndexOf(Scenarios, args[1]) < 0) return 2;
        try {
            foreach (DictionaryEntry entry in Environment.GetEnvironmentVariables())
            {
                string key = Convert.ToString(entry.Key).ToUpperInvariant();
                if (key.StartsWith("COR_") || key.StartsWith("CORECLR_") || key.StartsWith("COMPLUS_") || key == "NODE_OPTIONS" || key == "NODE_PATH") return 3;
            }
            return Run(args[1]);
        }
        catch { return 1; }
    }
}
