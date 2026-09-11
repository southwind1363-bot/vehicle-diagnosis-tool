using System;
using System.Runtime.InteropServices;
using System.Threading;
using System.Threading.Tasks;
using VehicleDiagnosis.Native;

internal static class NativeReadRequestTests
{
    private const uint Device = 0xf1234567, Channel = 0xe1234567;
    private static int checks;
    private static void Check(bool value, string message)
    { if (!value) throw new Exception(message); checks++; }
    private static void Reject(Action action, string code)
    {
        try { action(); }
        catch (InvalidOperationException error) { Check(error.Message == code && error.InnerException == null, "Request failure was not sanitized: " + error.Message); return; }
        throw new Exception("Expected request rejection: " + code);
    }
    private static uint Prepare(J2534ReadRequestNative request, uint ecu)
    {
        uint filter;
        Check(request.PrepareDtcFilterOnce(Channel, ecu,
            delegate(uint c, uint t, IntPtr m, IntPtr p, IntPtr f, IntPtr id) { Marshal.WriteInt32(id, unchecked((int)0xd1234567)); return 0; },
            delegate { return 0; }, out filter) == 0, "Filter setup failed");
        return filter;
    }
    private static J2534IdentityNative Open(out MockIdentityLibrary library, uint protocol, uint flags, bool connect)
    {
        library = new MockIdentityLibrary();
        library.Open = delegate(IntPtr name, out uint id) { id = Device; return 0; };
        library.Read = delegate { return 0; };
        library.Close = delegate { return 0; };
        var owner = new J2534IdentityNative(library);
        uint device, channel;
        Check(owner.Open(out device) == 0 && device == Device, "Request fixture open failed");
        if (connect) Check(owner.Connect(device, protocol, flags, 500000,
            delegate(uint d, uint p, uint f, uint b, IntPtr output) { Marshal.WriteInt32(output, unchecked((int)Channel)); return 0; },
            delegate { return 0; }, out channel) == 0 && channel == Channel, "Request fixture connect failed");
        return owner;
    }
    internal static int Run()
    {
        foreach (byte service in new byte[] { 3, 7, 10 })
        foreach (uint ecu in new uint[] { 0x7e0, 0x7e7 })
        {
            MockIdentityLibrary library;
            using (var owner = Open(out library, 6, 0, true))
            {
                int calls = 0;
                J2534ReadRequestNative.WriteFunction write = delegate(uint channel, IntPtr message, IntPtr count, uint timeout) {
                    calls++;
                    Check(channel == Channel && timeout == 0 && Marshal.ReadInt32(count) == 1, "Request call arguments changed");
                    byte[] actual = new byte[4152], expected = new byte[4152];
                    Marshal.Copy(message, actual, 0, actual.Length);
                    expected[0] = 6; expected[8] = 0x40; expected[16] = 5;
                    expected[26] = (byte)(ecu >> 8); expected[27] = (byte)ecu; expected[28] = service;
                    Check(Convert.ToBase64String(actual) == Convert.ToBase64String(expected), "Request layout or zero initialization changed");
                    Reject(delegate { owner.Dispose(); }, "native_identity_call_in_progress");
                    Reject(delegate { owner.Disconnect(Device, Channel); }, "native_identity_call_in_progress");
                    Reject(delegate { owner.Close(Device); }, "native_identity_call_in_progress");
                    return 0;
                };
                var request = new J2534ReadRequestNative(owner, Device, write);
                for (int sid = 0; sid <= 255; sid++)
                    if (sid != 3 && sid != 7 && sid != 10) {
                        byte denied = (byte)sid;
                        Reject(delegate { request.DispatchDtcReadOnce(Channel, ecu, denied); }, "native_read_request_not_allowed");
                    }
                foreach (uint denied in new uint[] { 0, 0x7df, 0x7e8, 0xffffffff })
                    Reject(delegate { request.DispatchDtcReadOnce(Channel, denied, service); }, "native_read_request_not_allowed");
                Reject(delegate { request.DispatchDtcReadOnce(Channel + 1, ecu, service); }, "native_channel_not_owned");
                Reject(delegate { new J2534ReadRequestNative(owner, Device + 1, write).DispatchDtcReadOnce(Channel, ecu, service); }, "native_identity_device_not_owned");
                Check(calls == 0, "Rejected request invoked callback");
                Reject(delegate { request.DispatchDtcReadOnce(Channel, ecu, service); }, "native_request_filter_required");
                uint filter = Prepare(request, ecu);
                Reject(delegate { request.DispatchDtcReadOnce(Channel, ecu == 0x7e0 ? 0x7e1u : 0x7e0u, service); }, "native_request_filter_required");
                Check(request.DispatchDtcReadOnce(Channel, ecu, service) == 0 && calls == 1, "Allowed request was not queued once");
                Reject(delegate { new J2534ReadRequestNative(owner, Device, write).DispatchDtcReadOnce(Channel, ecu, service); }, "native_request_already_attempted");
                var receiver = new J2534ReceiveNative(owner, Device, delegate(uint c, IntPtr m, IntPtr n, uint t) { Marshal.WriteInt32(n, 0); return 0; });
                Check(receiver.ReadOnce(Channel, 1).Messages.Length == 0, "Queue acceptance fabricated diagnostic data");
                Reject(delegate { owner.Disconnect(Device, Channel); }, "native_filter_cleanup_required");
                Check(owner.StopDtcReadFilter(Device, Channel, filter) == 0, "Filter cleanup failed");
                Check(owner.Disconnect(Device, Channel) == 0 && owner.Close(Device) == 0, "Request cleanup failed");
            }
            Check(library.AllowedUnload && library.Exports.Count == 3, "Request resolved exports or retained cleaned module");
        }
        foreach (int scenario in new int[] { 0, 1, 2, 3 })
        {
            MockIdentityLibrary library;
            using (var owner = Open(out library, scenario == 1 ? 5u : 6u, scenario == 2 ? 0x100u : 0u, scenario != 0))
            {
                int calls = 0;
                if (scenario == 3) new J2534ReceiveNative(owner, Device, delegate(uint c, IntPtr m, IntPtr n, uint t) { Marshal.WriteInt32(n, 0); return 0; }).ReadOnce(Channel, 1);
                var request = new J2534ReadRequestNative(owner, Device, delegate { calls++; return 0; });
                uint filter;
                Reject(delegate { request.PrepareDtcFilterOnce(Channel, 0x7e0,
                    delegate { calls++; return 0; }, delegate { calls++; return 0; }, out filter); },
                    scenario == 0 ? "native_channel_not_owned" : scenario == 3 ? "native_filter_already_attempted" : "native_request_channel_unsupported");
                Reject(delegate { request.DispatchDtcReadOnce(Channel, 0x7e0, 3); }, scenario == 0 ? "native_channel_not_owned" : scenario == 3 ? "native_request_already_attempted" : "native_request_channel_unsupported");
                Check(calls == 0, "Invalid owner state dispatched request");
            }
        }
        for (int fault = 0; fault < 8; fault++)
        {
            MockIdentityLibrary library;
            using (var owner = Open(out library, 6, 0, true))
            {
                int calls = 0;
                var request = new J2534ReadRequestNative(owner, Device, delegate(uint c, IntPtr m, IntPtr n, uint t) {
                    calls++;
                    if (fault == 0) { Marshal.WriteInt32(n, 0); return 8; }
                    if (fault == 1 || fault == 2) Marshal.WriteInt32(n, fault == 1 ? 0 : 2);
                    if (fault == 3) throw new Exception("private path and driver error");
                    if (fault >= 4) Marshal.WriteByte(fault < 6 ? m : n, fault == 4 || fault == 6 ? -1 : fault == 5 ? 4152 : 4, 0);
                    return 0;
                });
                Prepare(request, 0x7e0);
                if (fault == 0) Check(request.DispatchDtcReadOnce(Channel, 0x7e0, 3) == 8, "Native failure status lost");
                else Reject(delegate { request.DispatchDtcReadOnce(Channel, 0x7e0, 3); }, fault < 3 ? "native_read_request_count_invalid" : fault == 3 ? "native_read_request_threw" : "native_read_request_buffer_overrun");
                Reject(delegate { request.DispatchDtcReadOnce(Channel, 0x7e0, 3); }, "native_identity_corrupted");
                Reject(delegate { owner.Disconnect(Device, Channel); }, "native_identity_corrupted");
                Reject(delegate { owner.Close(Device); }, "native_identity_corrupted");
                Reject(delegate { new J2534ReceiveNative(owner, Device, delegate { throw new Exception("must not read"); }).ReadOnce(Channel, 1); }, "native_identity_corrupted");
                Check(calls == 1, "Faulted request was retried");
            }
            Check(!library.AllowedUnload, "Uncertain request state unloaded module");
        }
        MockIdentityLibrary blocked;
        using (var owner = Open(out blocked, 6, 0, true))
        using (var entered = new ManualResetEvent(false))
        using (var release = new ManualResetEvent(false))
        {
            var request = new J2534ReadRequestNative(owner, Device, delegate {
                entered.Set(); if (!release.WaitOne(3000)) throw new Exception("test deadline"); return 0;
            });
            Prepare(request, 0x7e0);
            Task dispatching = Task.Run(delegate { request.DispatchDtcReadOnce(Channel, 0x7e0, 3); });
            Check(entered.WaitOne(3000), "Request callback did not enter");
            Task disposing = Task.Run(delegate { owner.Dispose(); });
            try { Check(!disposing.Wait(50) && blocked.Releases == 0, "Module released during request"); }
            finally { release.Set(); }
            Check(Task.WaitAll(new Task[] { dispatching, disposing }, 5000), "Request disposal deadlocked");
            Check(!blocked.AllowedUnload, "Unclosed request owner unloaded");
        }
        RunFilters();
        return checks;
    }

    private static void RunFilters()
    {
        foreach (uint ecu in new uint[] { 0x7e0, 0x7e7 })
        foreach (uint assignedId in new uint[] { 0, 0xffffffff })
        {
            MockIdentityLibrary library;
            using (var owner = Open(out library, 6, 0, true))
            {
                int starts = 0, stops = 0;
                var request = new J2534ReadRequestNative(owner, Device, delegate { return 0; });
                J2534ReadRequestNative.StartFilterFunction start = delegate(uint channel, uint type, IntPtr m, IntPtr p, IntPtr f, IntPtr id) {
                    starts++;
                    Check(channel == Channel && type == 3, "Filter arguments changed");
                    IntPtr[] messages = { m, p, f };
                    for (int i = 0; i < messages.Length; i++) {
                        byte[] actual = new byte[4152], expected = new byte[4152];
                        expected[0] = 6; expected[8] = 0x40; expected[16] = 4;
                        if (i == 0) for (int j = 24; j < 28; j++) expected[j] = 255;
                        else { expected[26] = 7; expected[27] = (byte)(ecu + (i == 1 ? 8u : 0u)); }
                        Marshal.Copy(messages[i], actual, 0, actual.Length);
                        Check(Convert.ToBase64String(actual) == Convert.ToBase64String(expected), "Filter layout changed");
                    }
                    Reject(delegate { owner.Dispose(); }, "native_identity_call_in_progress");
                    Reject(delegate { request.DispatchDtcReadOnce(Channel, ecu, 3); }, "native_identity_call_in_progress");
                    Marshal.WriteInt32(id, unchecked((int)assignedId)); return 0;
                };
                J2534ReadRequestNative.StopFilterFunction stop = delegate(uint c, uint id) {
                    stops++; Check(c == Channel && id == assignedId, "Wrong filter stopped");
                    Reject(delegate { owner.Disconnect(Device, Channel); }, "native_identity_call_in_progress");
                    return 0;
                };
                uint filter;
                Reject(delegate { request.PrepareDtcFilterOnce(Channel, 0x7df, start, stop, out filter); }, "native_read_request_not_allowed");
                Reject(delegate { request.PrepareDtcFilterOnce(Channel + 1, ecu, start, stop, out filter); }, "native_channel_not_owned");
                Check(request.PrepareDtcFilterOnce(Channel, ecu, start, stop, out filter) == 0 && filter == assignedId, "Filter ID lost");
                Reject(delegate { request.PrepareDtcFilterOnce(Channel, ecu, start, stop, out filter); }, "native_filter_already_attempted");
                Reject(delegate { owner.StopDtcReadFilter(Device, Channel, assignedId ^ 1); }, "native_filter_not_owned");
                Reject(delegate { owner.StopDtcReadFilter(Device, Channel + 1, assignedId); }, "native_channel_not_owned");
                Check(owner.StopDtcReadFilter(Device, Channel, assignedId) == 0, "Filter stop failed");
                Reject(delegate { owner.StopDtcReadFilter(Device, Channel, assignedId); }, "native_filter_not_owned");
                Reject(delegate { request.DispatchDtcReadOnce(Channel, ecu, 3); }, "native_request_filter_required");
                Reject(delegate { new J2534ReceiveNative(owner, Device, delegate { throw new Exception("must not receive after filter stop"); }).ReadOnce(Channel, 1); }, "native_request_filter_required");
                Check(starts == 1 && stops == 1, "Filter operation retried");
                owner.Disconnect(Device, Channel); owner.Close(Device);
            }
            Check(library.AllowedUnload, "Cleaned filter retained module");
        }
        for (int fault = 0; fault < 8; fault++)
        {
            MockIdentityLibrary library;
            using (var owner = Open(out library, 6, 0, true))
            {
                int starts = 0, stops = 0;
                var request = new J2534ReadRequestNative(owner, Device, delegate { throw new Exception("must not dispatch"); });
                J2534ReadRequestNative.StartFilterFunction start = delegate(uint c, uint t, IntPtr m, IntPtr p, IntPtr f, IntPtr id) {
                    starts++;
                    if (fault == 0) return 8;
                    if (fault == 1) throw new Exception("private start");
                    if (fault >= 2 && fault <= 4) Marshal.WriteByte(new IntPtr[] { m, p, f }[fault - 2], 4152, 0);
                    if (fault == 5) Marshal.WriteByte(id, 4, 0);
                    Marshal.WriteInt32(id, 123); return 0;
                };
                J2534ReadRequestNative.StopFilterFunction stop = delegate {
                    stops++;
                    if (fault == 7) throw new Exception("private stop");
                    return 8;
                };
                uint filter;
                if (fault == 0) Check(request.PrepareDtcFilterOnce(Channel, 0x7e0, start, stop, out filter) == 8, "Filter failure status lost");
                else if (fault <= 5) Reject(delegate { request.PrepareDtcFilterOnce(Channel, 0x7e0, start, stop, out filter); }, fault == 5 ? "native_filter_buffer_overrun" : "native_filter_start_threw");
                else {
                    request.PrepareDtcFilterOnce(Channel, 0x7e0, start, stop, out filter);
                    if (fault == 7) Reject(delegate { owner.StopDtcReadFilter(Device, Channel, 123); }, "native_filter_stop_threw");
                    else Check(owner.StopDtcReadFilter(Device, Channel, 123) == 8, "Stop failure status lost");
                }
                Reject(delegate { request.DispatchDtcReadOnce(Channel, 0x7e0, 3); }, "native_identity_corrupted");
                Reject(delegate { owner.Disconnect(Device, Channel); }, "native_identity_corrupted");
                Reject(delegate { owner.StopDtcReadFilter(Device, Channel, 123); }, "native_identity_corrupted");
                Check(starts == 1 && stops == (fault > 5 ? 1 : 0), "Faulted filter retried");
            }
            Check(!library.AllowedUnload, "Uncertain filter unloaded module");
        }
    }
}
