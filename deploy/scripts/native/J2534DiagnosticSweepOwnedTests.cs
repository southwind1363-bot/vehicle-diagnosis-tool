using System;
using System.Runtime.InteropServices;
namespace VehicleDiagnosis.Native
{
    internal static class J2534DiagnosticSweepOwnedTests
    {
        private static int checks;
        private static void Check(bool ok) { checks++; if (!ok) throw new Exception("owned sweep check " + checks); }
        private static void Reject(Action action)
        { bool rejected = false; try { action(); } catch (InvalidOperationException) { rejected = true; } Check(rejected); }
        internal static void Run()
        {
            // 1..12 write/read failure per stage; 13..16 cleanup; 17 filter;
            // 18 callback throw. These are managed callbacks, not native DLLs.
            for (int fault = 0; fault <= 18; fault++) {
                var library = new Library { FailClose = fault == 15, FailRelease = fault == 16 };
                using (var owner = new J2534IdentityNative(library)) {
                    uint device, channel; int writes = 0, reads = 0, stops = 0, disconnects = 0;
                    Check(owner.Open(out device) == 0);
                    Check(owner.Connect(device, 6, 0, 500000,
                        delegate(uint d, uint p, uint f, uint b, IntPtr o) { Marshal.WriteInt32(o, 20); return 0; },
                        delegate { disconnects++; return fault == 14 ? 1 : 0; }, out channel) == 0);
                    var request = new J2534ReadRequestNative(owner, device, delegate(uint c, IntPtr m, IntPtr n, uint t) {
                        writes++;
                        Check(c == channel && t == 0 && Marshal.ReadInt32(n) == 1);
                        Check(Marshal.ReadByte(m, 28) == new byte[] { 3, 7, 10, 1, 1, 1 }[writes - 1]);
                        Check(Marshal.ReadInt32(m, 16) == (writes <= 3 ? 5 : 6));
                        if (writes > 3) Check(Marshal.ReadByte(m, 29) == new byte[] { 0, 5, 12 }[writes - 4]);
                        Reject(delegate { owner.Dispose(); });
                        if (fault == 18) throw new Exception("fixture");
                        return fault == writes * 2 - 1 ? 1 : 0;
                    });
                    J2534ReceiveNative.ReadFunction read = delegate(uint c, IntPtr m, IntPtr n, uint t) {
                        reads++; Check(c == channel && t == 1000 && Marshal.ReadInt32(n) == 3);
                        Reject(delegate { request.DispatchDtcReadOnce(channel, 0x7e0, 3); });
                        byte[] payload = reads <= 3 ? new byte[] { new byte[] { 67, 71, 74 }[reads - 1], 0, 0 }
                            : reads == 4 ? new byte[] { 65, 0, 8, 16, 0, 0 }
                            : reads == 5 ? new byte[] { 65, 5, 130 } : new byte[] { 65, 12, 31, 65 };
                        if (fault == reads * 2) payload[0] = 255;
                        byte[] message = new byte[4152]; message[0] = 6;
                        message[16] = (byte)(payload.Length + 4); message[26] = 7; message[27] = 232;
                        Array.Copy(payload, 0, message, 28, payload.Length);
                        Marshal.Copy(message, 0, m, message.Length); Marshal.WriteInt32(n, 1); return 9;
                    };
                    Func<J2534DiagnosticSweepExchange.Capture> run = delegate {
                        return request.ReadDiagnosticSweepAndFinish(channel, 0x7e0, read,
                            delegate(uint c, uint t, IntPtr m, IntPtr p, IntPtr f, IntPtr o) { Marshal.WriteInt32(o, 30); return fault == 17 ? 1 : 0; },
                            delegate { stops++; return fault == 13 ? 1 : 0; });
                    };
                    if (fault == 18) Reject(delegate { run(); });
                    else {
                        var capture = run(); Check((capture != null) == (fault == 0));
                        if (capture != null) {
                            Check(capture.CoolantCelsius == 90 && capture.Rpm == 2000.25);
                            for (int i = 0; i < 3; i++) Check(capture.DtcPayload(i)[0] == new byte[] { 67, 71, 74 }[i]);
                        }
                    }
                    int expectedWrites = fault == 17 ? 0 : fault == 18 ? 1 : fault >= 1 && fault <= 12 ? (fault + 1) / 2 : 6;
                    int expectedReads = fault == 18 ? 0 : expectedWrites - (fault >= 1 && fault <= 12 && fault % 2 == 1 ? 1 : 0);
                    Check(writes == expectedWrites && reads == expectedReads);
                    Reject(delegate { run(); }); Check(writes == expectedWrites && reads == expectedReads);
                    bool cleanup = fault == 0 || fault >= 13 && fault <= 16;
                    Check(stops == (cleanup ? 1 : 0));
                    Check(disconnects == (cleanup && fault != 13 ? 1 : 0));
                    Check(library.CloseCalls == (cleanup && fault != 13 && fault != 14 ? 1 : 0));
                    Check(owner.ReferenceReleased == (fault == 0));
                }
                Check(library.Released == (fault == 0));
            }
            Console.WriteLine("owned sweep checks " + checks + ", Errors: 0 (managed callbacks; no DLL)");
        }
        private sealed class Library : IIdentityLibrary
        {
            private readonly J2534IdentityNative.OpenFunction open = delegate(IntPtr p, out uint id) { id = 10; return 0; };
            private readonly J2534IdentityNative.ReadVersionFunction read = delegate { return 0; };
            private readonly J2534IdentityNative.CloseFunction close;
            internal bool FailClose, FailRelease, Released;
            internal int CloseCalls;
            internal Library() { close = delegate { CloseCalls++; return FailClose ? 1 : 0; }; }
            public IntPtr Resolve(string name)
            {
                if (name == "PassThruOpen") return Marshal.GetFunctionPointerForDelegate(open);
                if (name == "PassThruReadVersion") return Marshal.GetFunctionPointerForDelegate(read);
                if (name == "PassThruClose") return Marshal.GetFunctionPointerForDelegate(close);
                throw new Exception("unexpected export");
            }
            public bool Release(bool allowed) { Released = allowed && !FailRelease; return Released; }
        }
    }
}
