using System;
using System.Collections.Generic;
using System.IO;
using System.Runtime.Serialization;
using System.Runtime.Serialization.Json;
using System.Text;

namespace VehicleDiagnosis.Native
{
    [DataContract]
    internal sealed class PreflightRequest
    {
        [DataMember(Name = "contract_version", IsRequired = true)] internal string ContractVersion = null;
        [DataMember(Name = "operation", IsRequired = true)] internal string Operation = null;
        [DataMember(Name = "request_nonce", IsRequired = true)] internal string RequestNonce = null;
        [DataMember(Name = "selected_device_id", IsRequired = true)] internal string SelectedDeviceId = null;
        [DataMember(Name = "descriptor_version", IsRequired = true)] internal string DescriptorVersion = null;
        [DataMember(Name = "descriptor_source", IsRequired = true)] internal string DescriptorSource = null;
        [DataMember(Name = "private_library_path", IsRequired = true)] internal string PrivateLibraryPath = null;
        [DataMember(Name = "expected_sha256", IsRequired = true)] internal string ExpectedSha256 = null;
        [DataMember(Name = "expected_file_size", IsRequired = true)] internal long ExpectedFileSize = 0;
        [DataMember(Name = "expected_architecture", IsRequired = true)] internal string ExpectedArchitecture = null;
        [DataMember(Name = "execution_enabled", IsRequired = true)] internal bool ExecutionEnabled = false;
        [DataMember(Name = "vehicle_command_enabled", IsRequired = true)] internal bool VehicleCommandEnabled = false;
    }

    [DataContract]
    internal sealed class PreflightResponse
    {
        [DataMember(Name = "contract_version")] internal string ContractVersion = "j2534-native-preflight-response-v2";
        [DataMember(Name = "operation")] internal string Operation;
        [DataMember(Name = "request_nonce")] internal string RequestNonce;
        [DataMember(Name = "selected_device_id")] internal string SelectedDeviceId;
        [DataMember(Name = "descriptor_version")] internal string DescriptorVersion;
        [DataMember(Name = "descriptor_source")] internal string DescriptorSource;
        [DataMember(Name = "expected_architecture")] internal string ExpectedArchitecture;
        [DataMember(Name = "verification_status")] internal string VerificationStatus = "rejected";
        [DataMember(Name = "blockers")] internal string[] Blockers = new string[] { "native_preflight_request_invalid" };
        [DataMember(Name = "authenticode_status")] internal string AuthenticodeStatus = "not_verified";
        [DataMember(Name = "authenticode_network_retrieval_allowed")] internal bool AuthenticodeNetworkRetrievalAllowed = false;
        [DataMember(Name = "global_mutex_status")] internal string GlobalMutexStatus = "not_acquired";
        [DataMember(Name = "fixed_drive_verified")] internal bool FixedDriveVerified;
        [DataMember(Name = "final_path_matches")] internal bool FinalPathMatches;
        [DataMember(Name = "file_identity_stable")] internal bool FileIdentityStable;
        [DataMember(Name = "sha256_matches")] internal bool Sha256Matches;
        [DataMember(Name = "size_matches")] internal bool SizeMatches;
        [DataMember(Name = "architecture_matches")] internal bool ArchitectureMatches;
        [DataMember(Name = "runtime_architecture_matches")] internal bool RuntimeArchitectureMatches;
        [DataMember(Name = "dll_load_attempted")] internal bool DllLoadAttempted = false;
        [DataMember(Name = "get_proc_address_attempted")] internal bool GetProcAddressAttempted = false;
        [DataMember(Name = "pass_thru_open_attempted")] internal bool PassThruOpenAttempted = false;
        [DataMember(Name = "vehicle_connection_attempted")] internal bool VehicleConnectionAttempted = false;
        [DataMember(Name = "vehicle_communication_started")] internal bool VehicleCommunicationStarted = false;
        [DataMember(Name = "would_transmit")] internal bool WouldTransmit = false;
        [DataMember(Name = "vehicle_command_enabled")] internal bool VehicleCommandEnabled = false;
        [DataMember(Name = "execution_enabled")] internal bool ExecutionEnabled = false;
    }

    internal static class J2534RegisteredDriverPreflightWorker
    {
        private const long MaximumExpectedFileSize = 64L * 1024L * 1024L;
        private const int MaximumRequestBytes = 8192;
        private static readonly HashSet<string> ExactRequestKeys = new HashSet<string>(StringComparer.Ordinal) {
            "contract_version", "operation", "request_nonce", "selected_device_id", "descriptor_version",
            "descriptor_source", "private_library_path", "expected_sha256", "expected_file_size",
            "expected_architecture", "execution_enabled", "vehicle_command_enabled"
        };

        private static bool SafeToken(string value, int minimum, int maximum)
        {
            if (value == null || value.Length < minimum || value.Length > maximum) return false;
            for (int i = 0; i < value.Length; i++)
                if (!((value[i] >= 'a' && value[i] <= 'z') || (value[i] >= 'A' && value[i] <= 'Z')
                    || (value[i] >= '0' && value[i] <= '9') || value[i] == '-' || value[i] == '_')) return false;
            return true;
        }

        private static bool LowerHexSha256(string value)
        {
            if (value == null || value.Length != 64) return false;
            for (int i = 0; i < value.Length; i++)
                if (!((value[i] >= '0' && value[i] <= '9') || (value[i] >= 'a' && value[i] <= 'f'))) return false;
            return true;
        }

        private static bool SafeLibraryPath(string value)
        {
            try { return value != null && value.Length > 0 && value.Length <= 32767 && Path.IsPathRooted(value); }
            catch { return false; }
        }

        private static string ReadBoundedRequest()
        {
            Stream input = Console.OpenStandardInput();
            byte[] bytes = new byte[MaximumRequestBytes + 1];
            int count = 0;
            while (count < bytes.Length)
            {
                int read = input.Read(bytes, count, bytes.Length - count);
                if (read == 0) break;
                count += read;
            }
            if (count == 0 || count > MaximumRequestBytes) throw new SerializationException();
            return new UTF8Encoding(false, true).GetString(bytes, 0, count);
        }

        private static void VerifyExactKeys(string json)
        {
            HashSet<string> keys = new HashSet<string>(StringComparer.Ordinal);
            bool quoted = false, escaped = false;
            StringBuilder token = new StringBuilder();
            for (int i = 0; i < json.Length; i++)
            {
                char value = json[i];
                if (!quoted) { if (value == '"') { quoted = true; token.Length = 0; } continue; }
                if (escaped) { escaped = false; token.Append(value); continue; }
                if (value == '\\') { escaped = true; continue; }
                if (value != '"') { token.Append(value); continue; }
                quoted = false;
                int cursor = i + 1;
                while (cursor < json.Length && Char.IsWhiteSpace(json[cursor])) cursor++;
                if (cursor < json.Length && json[cursor] == ':' && !keys.Add(token.ToString())) throw new SerializationException();
            }
            if (quoted || keys.Count != ExactRequestKeys.Count || !keys.SetEquals(ExactRequestKeys)) throw new SerializationException();
        }

        private static PreflightRequest ParseRequest(string json)
        {
            VerifyExactKeys(json);
            DataContractJsonSerializer serializer = new DataContractJsonSerializer(typeof(PreflightRequest));
            using (MemoryStream stream = new MemoryStream(Encoding.UTF8.GetBytes(json)))
                return (PreflightRequest)serializer.ReadObject(stream);
        }

        private static void WriteResponse(PreflightResponse response)
        {
            DataContractJsonSerializer serializer = new DataContractJsonSerializer(typeof(PreflightResponse));
            using (MemoryStream stream = new MemoryStream())
            {
                serializer.WriteObject(stream, response);
                Console.OpenStandardOutput().Write(stream.GetBuffer(), 0, (int)stream.Length);
            }
        }

        public static int Main(string[] args)
        {
            if (args.Length != 0) return 2;
            try
            {
                PreflightRequest request = ParseRequest(ReadBoundedRequest());
                if (request.ContractVersion != "j2534-native-preflight-request-v2"
                    || request.Operation != "verify_registered_driver_non_executable"
                    || request.DescriptorVersion != "j2534-registered-driver-descriptor-v1"
                    || request.DescriptorSource != "live_windows_registry"
                    || !SafeToken(request.RequestNonce, 32, 64) || !SafeToken(request.SelectedDeviceId, 8, 96)
                    || !SafeLibraryPath(request.PrivateLibraryPath) || !LowerHexSha256(request.ExpectedSha256)
                    || request.ExpectedFileSize < 1 || request.ExpectedFileSize > MaximumExpectedFileSize
                    || (request.ExpectedArchitecture != "x86" && request.ExpectedArchitecture != "x64")
                    || request.ExecutionEnabled || request.VehicleCommandEnabled) return 2;
                J2534GlobalMutexLease lease;
                if (!J2534GlobalMutexLease.TryAcquire(out lease))
                {
                    WriteResponse(new PreflightResponse {
                        Operation = request.Operation, RequestNonce = request.RequestNonce, SelectedDeviceId = request.SelectedDeviceId,
                        DescriptorVersion = request.DescriptorVersion, DescriptorSource = request.DescriptorSource,
                        ExpectedArchitecture = request.ExpectedArchitecture,
                        Blockers = new string[] { "native_global_mutex_not_acquired" }
                    });
                    return 0;
                }
                using (lease)
                {
                    RegisteredDriverPreflightResult result = J2534RegisteredDriverPreflight.Verify(request.PrivateLibraryPath,
                        request.ExpectedSha256, request.ExpectedFileSize, request.ExpectedArchitecture);
                    WriteResponse(new PreflightResponse {
                        Operation = request.Operation, RequestNonce = request.RequestNonce, SelectedDeviceId = request.SelectedDeviceId,
                        DescriptorVersion = request.DescriptorVersion, DescriptorSource = request.DescriptorSource,
                        ExpectedArchitecture = request.ExpectedArchitecture, VerificationStatus = result.Status,
                        Blockers = result.Blockers, AuthenticodeStatus = result.AuthenticodeStatus,
                        AuthenticodeNetworkRetrievalAllowed = result.AuthenticodeNetworkRetrievalAllowed,
                        GlobalMutexStatus = "acquired_for_preflight",
                        FixedDriveVerified = result.FixedDriveVerified,
                        FinalPathMatches = result.FinalPathMatches, FileIdentityStable = result.FileIdentityStable,
                        Sha256Matches = result.Sha256Matches, SizeMatches = result.SizeMatches,
                        ArchitectureMatches = result.ArchitectureMatches,
                        RuntimeArchitectureMatches = result.RuntimeArchitectureMatches,
                        DllLoadAttempted = result.DllLoadAttempted,
                        GetProcAddressAttempted = result.GetProcAddressAttempted,
                        PassThruOpenAttempted = result.PassThruOpenAttempted,
                        VehicleConnectionAttempted = result.VehicleConnectionAttempted,
                        VehicleCommunicationStarted = result.VehicleCommunicationStarted,
                        WouldTransmit = result.WouldTransmit,
                        VehicleCommandEnabled = result.VehicleCommandEnabled,
                        ExecutionEnabled = result.ExecutionEnabled
                    });
                }
                return 0;
            }
            catch { return 2; }
        }
    }
}
