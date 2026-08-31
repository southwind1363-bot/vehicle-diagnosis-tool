using System;

internal static class J2534UdsTransportFixtureWorker
{
    private static readonly string[] Scenarios = {
        "positive", "positive-29bit", "negative", "pending", "timeout", "transport-error", "cancelled"
    };

    private static string Candidate(string scenario)
    {
        string attempt = "native-fixture-" + scenario + "-001";
        string target = scenario == "positive-29bit" ? "18DA10F1" : "7E0";
        string response = scenario == "positive-29bit" ? "18DAF110" : "7E8";
        string common = "{\"operation\":\"format_uds_read_transport_result\",\"readout_attempt_id\":\"" + attempt
            + "\",\"target_ecu\":\"" + target + "\",\"expected_response_ecu\":\"" + response
            + "\",\"response_wait_ms\":1500,";
        if (scenario == "positive" || scenario == "positive-29bit")
            return common + "\"source_ecu\":\"" + response + "\",\"response_count\":1,\"requested_data_identifier\":\"F189\","
                + "\"response_data_identifier\":\"F189\",\"payload_byte_count\":6}";
        if (scenario == "negative" || scenario == "pending")
            return common + "\"source_ecu\":\"" + response + "\",\"response_count\":1,\"negative_requested_service\":\"22\","
                + "\"negative_response_code\":\"" + (scenario == "pending" ? "78" : "31") + "\"}";
        string status = scenario == "transport-error" ? "transport_error" : scenario;
        return common + "\"transport_status\":\"" + status + "\",\"response_count\":0}";
    }

    private static string Envelope(string scenario)
    {
        return "{\"schema_version\":\"j2534-uds-transport-fixture-v1\",\"fixture_only\":true,\"native_fixture_executed\":true,"
            + "\"vendor_dll_executed\":false,\"vehicle_connection_attempted\":false,\"vehicle_communication_started\":false,"
            + "\"execution_enabled\":false,\"would_transmit\":false,\"vehicle_command_enabled\":false,"
            + "\"architecture\":\"" + (IntPtr.Size == 4 ? "x86" : "x64") + "\",\"pointer_bits\":" + (IntPtr.Size * 8)
            + ",\"scenario\":\"" + scenario + "\",\"transport_result_candidate\":" + Candidate(scenario) + "}";
    }

    public static int Main(string[] args)
    {
        if (args.Length != 2 || args[0] != "--fixture" || Array.IndexOf(Scenarios, args[1]) < 0) return 2;
        Console.Out.Write(Envelope(args[1]));
        return 0;
    }
}