#if NATIVE_RECEIVE_FIXTURE_TESTS
using System;
using System.Collections;
using System.IO;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using VehicleDiagnosis.Native;

// Isolated integration harness only. Never included in the workstation worker.
// Expected digest is compiled by the validator, not supplied by a caller.
internal static class J2534OwnedReceiveFixtureWorker
{
    private sealed class FixtureLibrary : IIdentityLibrary
    {
        private IntPtr module;
        private bool disposed;
        internal bool Retained;
        [DllImport("kernel32.dll", CharSet = CharSet.Unicode, ExactSpelling = true)]
        private static extern IntPtr LoadLibraryExW(string path, IntPtr file, uint flags);
        [DllImport("kernel32.dll", CharSet = CharSet.Ansi, ExactSpelling = true)]
        private static extern IntPtr GetProcAddress(IntPtr library, string name);
        [DllImport("kernel32.dll", ExactSpelling = true)]
        [return: MarshalAs(UnmanagedType.Bool)]
        private static extern bool FreeLibrary(IntPtr library);

        internal FixtureLibrary()
        {
            string path = WindowsIdentityLibrary.ValidatePath(Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "owned-receive.dll"));
            // Deny replacement/deletion from digest verification through loading.
            using (var file = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.Read))
            using (var sha = SHA256.Create())
            {
                if (BitConverter.ToString(sha.ComputeHash(file)).Replace("-", "") != OwnedReceiveFixtureDigest.Value)
                    throw new InvalidOperationException("fixture_digest_rejected");
                module = LoadLibraryExW(path, IntPtr.Zero, 0x00000900);
            }
            if (module == IntPtr.Zero) throw new InvalidOperationException("fixture_load_failed");
        }
        public IntPtr Resolve(string name)
        {
            if (disposed) throw new ObjectDisposedException("fixture_library");
            if (name != "PassThruOpen" && name != "PassThruClose" && name != "PassThruReadVersion"
                && name != "PassThruReadMsgs" && name != "PassThruConnect" && name != "PassThruDisconnect"
#if OWNED_DTC_REQUEST_FIXTURE
                && name != "PassThruStartMsgFilter" && name != "PassThruStopMsgFilter" && name != "PassThruWriteMsgs"
#endif
                )
                throw new InvalidOperationException("fixture_export_rejected");
            return GetProcAddress(module, name);
        }
        public bool Release(bool allowUnload)
        {
            if (disposed) return !Retained;
            disposed = true;
            Retained = !(allowUnload && FreeLibrary(module));
            module = IntPtr.Zero;
            return !Retained;
        }
    }

    public static int Main(string[] args)
    {
        if (args.Length != 1 || args[0] != "--fixture-owned-receive") return 2;
        try
        {
            foreach (DictionaryEntry entry in Environment.GetEnvironmentVariables())
            {
                string key = Convert.ToString(entry.Key).ToUpperInvariant();
                if (key.StartsWith("COR_") || key.StartsWith("CORECLR_") || key.StartsWith("COMPLUS_") || key == "NODE_OPTIONS" || key == "NODE_PATH") return 3;
            }
            var library = new FixtureLibrary();
            bool failed = false;
            int receivedCount = 0;
            using (var owner = new J2534IdentityNative(library))
            {
                uint device;
                if (owner.Open(out device) != 0) return 1;
                var read = (J2534ReceiveNative.ReadFunction)Marshal.GetDelegateForFunctionPointer(
                    library.Resolve("PassThruReadMsgs"), typeof(J2534ReceiveNative.ReadFunction));
                var connect = (J2534IdentityNative.ConnectFunction)Marshal.GetDelegateForFunctionPointer(
                    library.Resolve("PassThruConnect"), typeof(J2534IdentityNative.ConnectFunction));
                var disconnect = (J2534IdentityNative.DisconnectFunction)Marshal.GetDelegateForFunctionPointer(
                    library.Resolve("PassThruDisconnect"), typeof(J2534IdentityNative.DisconnectFunction));
                uint channel;
#if OWNED_DTC_REQUEST_FIXTURE
                const uint channelFlags = 0;
#else
                const uint channelFlags = 0x100;
#endif
                if (owner.Connect(device, 6, channelFlags, 500000, connect, disconnect, out channel) != 0) failed = true;
                else
                {
                    if (channel != 0xe1234567 || channel == device) return 1;
#if OWNED_DTC_REQUEST_FIXTURE
                    var start = (J2534ReadRequestNative.StartFilterFunction)Marshal.GetDelegateForFunctionPointer(
                        library.Resolve("PassThruStartMsgFilter"), typeof(J2534ReadRequestNative.StartFilterFunction));
                    var stop = (J2534ReadRequestNative.StopFilterFunction)Marshal.GetDelegateForFunctionPointer(
                        library.Resolve("PassThruStopMsgFilter"), typeof(J2534ReadRequestNative.StopFilterFunction));
                    var write = (J2534ReadRequestNative.WriteFunction)Marshal.GetDelegateForFunctionPointer(
                        library.Resolve("PassThruWriteMsgs"), typeof(J2534ReadRequestNative.WriteFunction));
                    var request = new J2534ReadRequestNative(owner, device, write);
                    uint filter;
                    if (request.PrepareDtcFilterOnce(channel, 0x7e0, start, stop, out filter) != 0) failed = true;
                    else if (request.DispatchDtcReadOnce(channel, 0x7e0, 3) != 0) failed = true;
                    // Queue acceptance is not a readout. Read fixture records
                    // only after both preceding calls succeeded; no retry.
#endif
                    if (!failed)
                    {
                        var receiver = new J2534ReceiveNative(owner, device, read);
                        var result = receiver.ReadOnce(channel, 3);
                        if (result.Status != 0 || result.ReportedCount != 2 || result.Messages.Length != 2
                            || result.Messages[0].Data.Length != 4 || result.Messages[0].Data[0] != 1
                            || result.Messages[0].Data[3] != 4 || result.Messages[1].Data.Length != 0
                            || result.Messages[1].RxStatus != 2) return 1;
                        receivedCount = result.Messages.Length;
#if OWNED_DTC_REQUEST_FIXTURE
                        if (owner.StopDtcReadFilter(device, channel, filter) != 0) failed = true;
#endif
                        // A failed Disconnect must never fall through to Close.
                        if (!failed) {
                            if (owner.Disconnect(device, channel) != 0) failed = true;
                            else if (owner.Close(device) != 0) failed = true;
                        }
                    }
                }
            }
            if (library.Retained != failed) return 1;
            Console.Out.Write("{\"fixture_only\":true,\"pointer_bits\":" + (IntPtr.Size * 8)
                + ",\"received_count\":" + receivedCount + ",\"module_retained\":" + (failed ? "true" : "false")
                + ",\"cleanup_confirmed\":" + (failed ? "false" : "true") + ",\"vehicle_communication\":false}");
            // Even a well-formed failure summary is not a successful worker result.
#if OWNED_RECEIVE_RESULT_THEN_HANG
            Console.Out.Flush();
            System.Threading.Thread.Sleep(System.Threading.Timeout.Infinite);
#endif
            return failed ? 1 : 0;
        }
        catch { return 1; } // No native data, paths, or exception text on either stream.
    }
}
#endif
