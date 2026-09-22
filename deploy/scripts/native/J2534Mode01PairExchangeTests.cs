using System;
using System.Runtime.InteropServices;
namespace VehicleDiagnosis.Native
{
    internal static class J2534Mode01PairExchangeTests
    {
        private static int checks;
        private static void Check(bool ok) { checks++; if (!ok) throw new Exception("pair check " + checks); }
        private static void Reject(Action run)
        { bool rejected = false; try { run(); } catch (InvalidOperationException) { rejected = true; } Check(rejected); }
        private static J2534ReceiveNative.Result Read(uint ecu, int status, params byte[] payload)
        {
            byte[] data = new byte[payload.Length + 4];
            data[2] = (byte)(ecu >> 8); data[3] = (byte)ecu;
            Array.Copy(payload, 0, data, 4, payload.Length);
            return new J2534ReceiveNative.Result { Status = status, ReportedCount = 1,
                Messages = new[] { new J2534ReceiveNative.Message { ProtocolId = 6, Data = data } } };
        }
        private static J2534ReceiveNative.Result Support(uint ecu, int status)
        { return Read(ecu, status, 0x41, 0, 8, 16, 0, 0); }
        private static void Main()
        {
            CheckOwnedPair();
            var originalSupport = Support(0x7e8, 9);
            var originalCoolant = Read(0x7e8, 9, 0x41, 5, 130);
            var originalRpm = Read(0x7e8, 9, 0x41, 12, 0x1f, 0x41);
            var retained = new J2534Mode01PairObservation(0x7e0,
                new J2534Mode01PairExchange.Values(90, 2000.25), originalSupport, originalCoolant, originalRpm);
            foreach (var original in new[] { originalSupport, originalCoolant, originalRpm }) {
                original.Messages[0].Data[4] = 0; original.Messages = null; original.Status = 1;
            }
            CheckObservation(retained);
            foreach (int status in new[] { 0, 9 }) for (uint ecu = 0x7e0; ecu <= 0x7e7; ecu++) {
                var pair = new J2534Mode01PairExchange(ecu);
                byte[] request = pair.BeginSupportedRead();
                Check(request.Length == 6 && request[3] == (byte)ecu && request[5] == 0);
                Check(pair.AcceptSupportedRead(Support(ecu + 8, status))[5] == 5);
                Check(pair.AcceptCoolantRead(Read(ecu + 8, status, 0x41, 5, 40))[5] == 12);
                var values = pair.AcceptRpmRead(Read(ecu + 8, status, 0x41, 12, 0, 0));
                Check(values.CoolantCelsius == 0 && values.Rpm == 0);
                Reject(delegate { pair.BeginSupportedRead(); });
                Reject(delegate { pair.AcceptRpmRead(null); });
            }
            foreach (var bad in new[] { Read(0x7e8, 0, 0x41, 0, 8, 0, 0, 0),
                Read(0x7e8, 0, 0x41, 0, 0, 16, 0, 0), Support(0x7e9, 0),
                Support(0x7e8, 1), Read(0x7e8, 9, 0x41, 0, 8), null }) {
                var pair = new J2534Mode01PairExchange(0x7e0); pair.BeginSupportedRead();
                Check(pair.AcceptSupportedRead(bad) == null);
                Reject(delegate { pair.AcceptSupportedRead(Support(0x7e8, 0)); });
                Reject(delegate { pair.AcceptCoolantRead(null); });
            }
            for (int stage = 0; stage < 4; stage++) {
                var pair = new J2534Mode01PairExchange(0x7e0);
                if (stage > 0) pair.BeginSupportedRead();
                if (stage > 1) pair.AcceptSupportedRead(Support(0x7e8, 0));
                if (stage > 2) pair.AcceptCoolantRead(Read(0x7e8, 0, 0x41, 5, 130));
                pair.Abort(); pair.Abort();
                Reject(delegate { pair.BeginSupportedRead(); });
                Reject(delegate { pair.AcceptRpmRead(null); });
            }
            foreach (bool failCoolant in new[] { true, false }) {
                var pair = new J2534Mode01PairExchange(0x7e0); pair.BeginSupportedRead();
                pair.AcceptSupportedRead(Support(0x7e8, 0));
                if (failCoolant) Check(pair.AcceptCoolantRead(Read(0x7e8, 0, 0x41, 12, 0, 0)) == null);
                else {
                    pair.AcceptCoolantRead(Read(0x7e8, 0, 0x41, 5, 130));
                    Check(pair.AcceptRpmRead(Read(0x7e9, 0, 0x41, 12, 0x1f, 0x41)) == null);
                }
                Reject(delegate { pair.AcceptRpmRead(Read(0x7e8, 0, 0x41, 12, 0, 0)); });
            }
            var nonzero = new J2534Mode01PairExchange(0x7e0);
            nonzero.BeginSupportedRead();
            nonzero.AcceptSupportedRead(Support(0x7e8, 0));
            nonzero.AcceptCoolantRead(Read(0x7e8, 9, 0x41, 5, 130));
            var complete = nonzero.AcceptRpmRead(Read(0x7e8, 0, 0x41, 12, 0x1f, 0x41));
            Check(complete.CoolantCelsius == 90 && complete.Rpm == 2000.25);
            nonzero.Abort();
            Check(complete.CoolantCelsius == 90 && complete.Rpm == 2000.25);
            foreach (var bad in new[] { Read(0x7e8, 9, 0x41, 12, 0x1f),
                Read(0x7e8, 1, 0x41, 12, 0x1f, 0x41), null }) {
                var pair = new J2534Mode01PairExchange(0x7e0);
                pair.BeginSupportedRead(); pair.AcceptSupportedRead(Support(0x7e8, 0));
                pair.AcceptCoolantRead(Read(0x7e8, 0, 0x41, 5, 130));
                Check(pair.AcceptRpmRead(bad) == null);
                Reject(delegate { pair.AcceptRpmRead(Read(0x7e8, 0, 0x41, 12, 0, 0)); });
            }
            var wrongOrder = new J2534Mode01PairExchange(0x7e0);
            Reject(delegate { wrongOrder.AcceptRpmRead(null); });
            Reject(delegate { wrongOrder.BeginSupportedRead(); });
            Console.WriteLine("Mode01 fixed pair checks: " + checks + " / Errors: 0 (no driver I/O)");
        }
        private static void CheckOwnedPair()
        {
            // 1..6: write/read failures at each stage; 7..10: cleanup/release;
            // 11: filter failure; 12: callback exception; 13: legitimate zeros.
            for (int fault = 0; fault <= 13; fault++) {
                var library = new Library { FailClose = fault == 9, FailRelease = fault == 10 };
                using (var owner = new J2534IdentityNative(library)) {
                    uint device, channel; int writes = 0, reads = 0, stops = 0, disconnects = 0;
                    owner.Open(out device);
                    owner.Connect(device, 6, 0, 500000,
                        delegate(uint d, uint p, uint f, uint b, IntPtr o) { Marshal.WriteInt32(o, 20); return 0; },
                        delegate { disconnects++; return fault == 8 ? 1 : 0; }, out channel);
                    var request = new J2534ReadRequestNative(owner, device, delegate(uint c, IntPtr m, IntPtr n, uint t) {
                        writes++;
                        Check(c == channel && t == 0 && Marshal.ReadInt32(n) == 1);
                        Check(Marshal.ReadByte(m, 28) == 1 && Marshal.ReadByte(m, 29) == (writes == 1 ? 0 : writes == 2 ? 5 : 12));
                        Reject(delegate { owner.Dispose(); });
                        if (fault == 12) throw new Exception("fixture");
                        return fault == writes * 2 - 1 ? 1 : 0;
                    });
                    J2534ReceiveNative.ReadFunction read = delegate(uint c, IntPtr m, IntPtr n, uint t) {
                        reads++; Check(c == channel && t == 1000);
                        Reject(delegate { request.DispatchMode01SupportedReadOnce(channel, 0x7e0); });
                        byte[] payload = reads == 1 ? new byte[] { 0x41, 0, 8, 16, 0, 0 }
                            : reads == 2 ? new byte[] { 0x41, 5, (byte)(fault == 13 ? 40 : 130) }
                            : new byte[] { 0x41, 12, (byte)(fault == 13 ? 0 : 0x1f), (byte)(fault == 13 ? 0 : 0x41) };
                        if (fault == reads * 2) payload[1] = 255;
                        byte[] message = new byte[4152]; message[0] = 6;
                        message[16] = (byte)(payload.Length + 4); message[26] = 7; message[27] = 232;
                        Array.Copy(payload, 0, message, 28, payload.Length);
                        Marshal.Copy(message, 0, m, message.Length); Marshal.WriteInt32(n, 1); return 9;
                    };
                    Func<J2534Mode01PairObservation> run = delegate {
                        return request.ReadMode01PairObservationAndFinish(channel, 0x7e0, read,
                            delegate(uint c, uint t, IntPtr m, IntPtr p, IntPtr f, IntPtr o) { Marshal.WriteInt32(o, 30); return fault == 11 ? 1 : 0; },
                            delegate { stops++; return fault == 7 ? 1 : 0; });
                    };
                    if (fault == 12) Reject(delegate { run(); });
                    else {
                        var values = run();
                        Check(fault == 0 || fault == 13 ? values != null : values == null);
                        if (values != null) {
                            Check(values.Coolant.Value == (fault == 13 ? 0 : 90) && values.Rpm.Value == (fault == 13 ? 0 : 2000.25));
                            CheckObservation(values);
                        }
                    }
                    int expectedWrites = fault == 11 ? 0 : fault == 12 ? 1 : fault >= 1 && fault <= 6 ? (fault + 1) / 2 : 3;
                    int expectedReads = fault == 12 ? 0 : expectedWrites - (fault >= 1 && fault <= 6 && fault % 2 == 1 ? 1 : 0);
                    Check(writes == expectedWrites && reads == expectedReads);
                    Reject(delegate { run(); });
                    Check(writes == expectedWrites && reads == expectedReads);
                    bool reachedCleanup = fault == 0 || fault >= 7 && fault <= 10 || fault == 13;
                    Check(stops == (reachedCleanup ? 1 : 0));
                    Check(disconnects == (reachedCleanup && fault != 7 ? 1 : 0));
                    Check(library.CloseCalls == (reachedCleanup && fault != 7 && fault != 8 ? 1 : 0));
                    Check(owner.ReferenceReleased == (fault == 0 || fault == 13));
                }
                Check(library.Released == (fault == 0 || fault == 13));
            }
        }
        private static void CheckObservation(J2534Mode01PairObservation pair)
        {
            Check(pair.Coolant.Pid == 5 && pair.Rpm.Pid == 12);
            Check(pair.Coolant.RequestEcu == 0x7e0 && pair.Rpm.RequestEcu == 0x7e0);
            Check(Convert.ToBase64String(pair.Coolant.SupportedRead.Messages[0].Data)
                == Convert.ToBase64String(pair.Rpm.SupportedRead.Messages[0].Data));
            foreach (var item in new[] { pair.Coolant, pair.Rpm }) {
                Check(item.SupportedRead.Status == 9 && item.ValueRead.Status == 9);
                var support = item.SupportedRead;
                support.Messages[0].Data[4] = 0; support.Status = 0; support.Messages = null;
                var value = item.ValueRead;
                value.Messages[0].Data[6] = 255; value.ReportedCount = 0; value.Messages = null;
                var replay = new J2534Mode01Exchange(item.RequestEcu, item.Pid);
                replay.BeginSupportedRead();
                Check(replay.AcceptSupportedRead(item.SupportedRead)[5] == item.Pid);
                Check(replay.AcceptValueRead(item.ValueRead) == item.Value);
                Check(item.SupportedRead.Status == 9 && item.ValueRead.Status == 9 && item.ValueRead.ReportedCount == 1);
            }
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
