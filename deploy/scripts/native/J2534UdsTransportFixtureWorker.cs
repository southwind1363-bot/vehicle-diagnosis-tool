using System;
using System.Text.RegularExpressions;
using System.Threading;

internal static class J2534UdsTransportFixtureWorker
{
    private static readonly string[] Scenarios = {
        "positive", "positive-29bit", "negative", "pending", "timeout", "transport-error", "cancelled",
        "hang", "overflow", "stderr", "crash", "result-then-hang"
    };

    private static string Candidate(string scenario, string attempt, string target, string response, string did)
    {
        string common = "{\"operation\":\"format_uds_read_transport_result\",\"readout_attempt_id\":\"" + attempt
            + "\",\"target_ecu\":\"" + target + "\",\"expected_response_ecu\":\"" + response
            + "\",\"response_wait_ms\":1500,";
        if (scenario == "positive" || scenario == "positive-29bit")
            return common + "\"source_ecu\":\"" + response + "\",\"response_count\":1,\"requested_data_identifier\":\"" + did + "\","
                + "\"response_data_identifier\":\"" + did + "\",\"payload_byte_count\":6}";
        if (scenario == "negative" || scenario == "pending")
            return common + "\"source_ecu\":\"" + response + "\",\"response_count\":1,\"negative_requested_service\":\"22\","
                + "\"negative_response_code\":\"" + (scenario == "pending" ? "78" : "31") + "\"}";
        string status = scenario == "transport-error" ? "transport_error" : scenario;
        return common + "\"transport_status\":\"" + status + "\",\"response_count\":0}";
    }

    private static string Envelope(string scenario, string nonce, string device, string attempt, string target, string response, string did)
    {
        return "{\"schema_version\":\"j2534-uds-transport-fixture-v1\",\"fixture_only\":true,\"native_fixture_executed\":true,"
            + "\"vendor_dll_executed\":false,\"vehicle_connection_attempted\":false,\"vehicle_communication_started\":false,"
            + "\"execution_enabled\":false,\"would_transmit\":false,\"vehicle_command_enabled\":false,"
            + "\"architecture\":\"" + (IntPtr.Size == 4 ? "x86" : "x64") + "\",\"pointer_bits\":" + (IntPtr.Size * 8)
            + ",\"scenario\":\"" + scenario + "\",\"operation_nonce\":\"" + nonce + "\",\"selected_device_id\":\"" + device
            + "\",\"readout_attempt_id\":\"" + attempt + "\",\"target_ecu\":\"" + target
            + "\",\"expected_response_ecu\":\"" + response + "\",\"requested_data_identifier\":\"" + did
            + "\",\"transport_result_candidate\":" + Candidate(scenario, attempt, target, response, did) + "}";
    }

    public static int Main(string[] args)
    {
        if (args.Length != 8 || args[0] != "--fixture" || Array.IndexOf(Scenarios, args[1]) < 0
            || !Regex.IsMatch(args[2], "^[a-f0-9]{32}$") || !Regex.IsMatch(args[3], "^[A-Za-z0-9_.:-]{1,80}$")
            || !Regex.IsMatch(args[4], "^j2534-uds-[a-f0-9]{32}$")
            || !Regex.IsMatch(args[5], "^(7E[0-9A-F]|18DA[0-9A-F]{4})$")
            || !Regex.IsMatch(args[6], "^(7E[0-9A-F]|18DA[0-9A-F]{4})$")
            || !Regex.IsMatch(args[7], "^[0-9A-F]{4}$")) return 2;
        if (args[1] == "hang") { Thread.Sleep(Timeout.Infinite); return 0; }
        if (args[1] == "overflow") { Console.Out.Write(new string('X', 5000)); return 0; }
        if (args[1] == "stderr") { Console.Error.Write("reject"); return 0; }
        if (args[1] == "crash") return 23;
        if (args[1] == "result-then-hang") {
            Console.Out.Write(Envelope("positive", args[2], args[3], args[4], args[5], args[6], args[7]));
            Console.Out.Flush();
            Thread.Sleep(Timeout.Infinite);
            return 0;
        }
        Console.Out.Write(Envelope(args[1], args[2], args[3], args[4], args[5], args[6], args[7]));
        return 0;
    }
}