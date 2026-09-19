using System;
using System.Runtime.InteropServices;
namespace VehicleDiagnosis.Native
{
    internal static class J2534Mode01ExchangeTests
    {
        private static int checks;
        private static void Check(bool ok) { checks++; if (!ok) throw new Exception("check " + checks); }
        private static void Reject(Action action)
        {
            bool rejected = false;
            try { action(); } catch (ArgumentException) { rejected = true; }
            catch (InvalidOperationException) { rejected = true; }
            Check(rejected);
        }
        private static byte[] Support(byte pid)
        {
            uint bits = 1u << (32 - pid);
            return new byte[] { 0x41, 0, (byte)(bits >> 24), (byte)(bits >> 16), (byte)(bits >> 8), (byte)bits };
        }
        private static J2534Mode01Exchange Ready(uint ecu, byte pid)
        {
            var exchange = new J2534Mode01Exchange(ecu, pid);
            byte[] first = exchange.BeginSupportedRead();
            Check(BitConverter.ToString(first) == "00-00-07-" + ((byte)ecu).ToString("X2") + "-01-00");
            byte[] next = exchange.AcceptSupportedResponse(ecu + 8, Support(pid));
            Check(next.Length == 6 && next[4] == 1 && next[5] == pid);
            Reject(delegate { exchange.BeginSupportedRead(); });
            return exchange;
        }
        private static void Main()
        {
            CheckOwnedSupport();
            CheckNativeResults();
            for (uint ecu = 0x7e0; ecu <= 0x7e7; ecu++) {
                Check(Ready(ecu, 12).AcceptValueResponse(ecu + 8, new byte[] { 0x41, 12, 0x1f, 0x40 }) == 2000);
                Check(Ready(ecu, 5).AcceptValueResponse(ecu + 8, new byte[] { 0x41, 5, 130 }) == 90);
            }
            foreach (byte pid in new byte[] { 5, 12 }) {
                var fresh = new J2534Mode01Exchange(0x7e0, pid);
                Reject(delegate { fresh.AcceptValueResponse(0x7e8, null); });
                Reject(delegate { fresh.AcceptSupportedResponse(0x7e8, Support(pid)); });
                foreach (byte[] bad in new byte[][] { null, new byte[0], new byte[] { 0x41, 0, 0, 0, 0, 0 }, new byte[] { 0x41, 0, 255, 255, 255 }, new byte[] { 0x41, 1, 255, 255, 255, 255 } }) {
                    var x = new J2534Mode01Exchange(0x7e0, pid); x.BeginSupportedRead();
                    Check(x.AcceptSupportedResponse(0x7e8, bad) == null);
                    Reject(delegate { x.AcceptSupportedResponse(0x7e8, Support(pid)); });
                }
                var wrong = new J2534Mode01Exchange(0x7e0, pid); wrong.BeginSupportedRead();
                Check(wrong.AcceptSupportedResponse(0x7e9, Support(pid)) == null);
                var value = Ready(0x7e0, pid);
                Check(value.AcceptValueResponse(0x7e9, new byte[] { 0x41, 5, 130 }) == null);
                Reject(delegate { value.AcceptValueResponse(0x7e8, null); });
                Check(Ready(0x7e0, pid).AcceptValueResponse(0x7e8, new byte[] { 0x7f, 1, 0x78 }) == null);
            }
            Check(Ready(0x7e0, 12).AcceptValueResponse(0x7e8, new byte[] { 0x41, 12, 0, 0 }) == 0);
            Check(Ready(0x7e0, 5).AcceptValueResponse(0x7e8, new byte[] { 0x41, 5, 0 }) == -40);
            Reject(delegate { new J2534Mode01Exchange(0x7df, 5); });
            Reject(delegate { new J2534Mode01Exchange(0x7e8, 5); });
            Reject(delegate { new J2534Mode01Exchange(0x7e0, 4); });
            Console.WriteLine("Mode01 pure exchange checks: " + checks);
        }
        private static J2534ReceiveNative.Result Native(byte[] payload, int status)
        {
            byte[] data = new byte[payload.Length + 4];
            data[2] = 7; data[3] = 232; Array.Copy(payload, 0, data, 4, payload.Length);
            return new J2534ReceiveNative.Result { Status = status, ReportedCount = 1,
                Messages = new J2534ReceiveNative.Message[] { new J2534ReceiveNative.Message {
                    ProtocolId = 6, Data = data, RxStatus = 0, TxFlags = 0, Timestamp = 0, ExtraDataIndex = 0 } } };
        }
        private static void CheckNativeResults()
        {
            foreach (int status in new int[] { 0, 9 }) {
                var x = new J2534Mode01Exchange(0x7e0, 12); x.BeginSupportedRead();
                Check(x.AcceptSupportedRead(Native(Support(12), status))[5] == 12);
                Check(x.AcceptValueRead(Native(new byte[] { 0x41, 12, 0x1f, 0x40 }, status)) == 2000);
                Reject(delegate { x.AcceptValueRead(Native(new byte[] { 0x41, 12, 0, 0 }, 0)); });
            }
            for (int fault = 0; fault < 13; fault++) {
                var bad = Native(Support(5), 0);
                var m = bad.Messages[0];
                switch (fault) {
                    case 0: bad.Status = 16; break;
                    case 1: bad.ReportedCount = 0; break;
                    case 2: m.ProtocolId = 5; break;
                    case 3: m.RxStatus = 8; break;
                    case 4: m.TxFlags = 64; break;
                    case 5: m.ExtraDataIndex = 4; break;
                    case 6: m.Data[3] = 233; break;
                    case 7: m.Data = null; break;
                    case 8: bad.Messages = null; break;
                    case 9: bad.Messages[0] = null; break;
                    case 10: bad.Messages = new J2534ReceiveNative.Message[] { m, m }; bad.ReportedCount = 2; break;
                    case 11: bad = Native(new byte[0], 0); bad.Messages[0].RxStatus = 2; break;
                    case 12: bad.Messages = new J2534ReceiveNative.Message[0]; bad.ReportedCount = 0; break;
                }
                var x = new J2534Mode01Exchange(0x7e0, 5); x.BeginSupportedRead();
                Check(x.AcceptSupportedRead(bad) == null);
                Reject(delegate { x.AcceptSupportedRead(Native(Support(5), 0)); });
                Check(Ready(0x7e0, 5).AcceptValueRead(bad) == null);
            }
            var indicated = Native(Support(5), 9);
            var start = Native(new byte[0], 0).Messages[0]; start.RxStatus = 2;
            indicated.Messages = new J2534ReceiveNative.Message[] { start, indicated.Messages[0] };
            indicated.ReportedCount = 2;
            var exchange = new J2534Mode01Exchange(0x7e0, 5); exchange.BeginSupportedRead();
            Check(exchange.AcceptSupportedRead(indicated)[5] == 5);
            var value = Native(new byte[] { 0x41, 5, 40 }, 9);
            value.Messages[0].ExtraDataIndex = (uint)value.Messages[0].Data.Length;
            Check(exchange.AcceptValueRead(value) == 0);
            Check(Ready(0x7e0, 12).AcceptValueRead(null) == null);
        }
        private sealed class Library : IIdentityLibrary
        {
            private readonly J2534IdentityNative.OpenFunction open = delegate(IntPtr p, out uint id) { id = 10; return 0; };
            private readonly J2534IdentityNative.ReadVersionFunction read = delegate { return 0; };
            private readonly J2534IdentityNative.CloseFunction close = delegate { return 0; };
            internal bool Released;
            public IntPtr Resolve(string name)
            {
                if (name == "PassThruOpen") return Marshal.GetFunctionPointerForDelegate(open);
                if (name == "PassThruReadVersion") return Marshal.GetFunctionPointerForDelegate(read);
                if (name == "PassThruClose") return Marshal.GetFunctionPointerForDelegate(close);
                throw new Exception("unexpected export");
            }
            public bool Release(bool allowed) { Released = allowed; return allowed; }
        }
        private static void CheckOwnedSupport()
        {
            foreach (int failure in new int[] { 0, 1, 2, 3 }) {
                var library = new Library();
                using (var owner = new J2534IdentityNative(library)) {
                    uint device, channel, filter;
                    Check(owner.Open(out device) == 0);
                    Check(owner.Connect(device, 6, 0, 500000,
                        delegate(uint d, uint p, uint f, uint b, IntPtr output) { Marshal.WriteInt32(output, 20); return 0; },
                        delegate { return 0; }, out channel) == 0);
                    int calls = 0;
                    var request = new J2534ReadRequestNative(owner, device,
                        delegate(uint c, IntPtr m, IntPtr n, uint t) {
                            calls++;
                            byte[] actual = new byte[4152], expected = new byte[4152];
                            Marshal.Copy(m, actual, 0, actual.Length);
                            expected[0] = 6; expected[8] = 64; expected[16] = 6;
                            expected[26] = 7; expected[27] = 224; expected[28] = 1;
                            Check(Convert.ToBase64String(actual) == Convert.ToBase64String(expected));
                            Check(c == channel && t == 0 && Marshal.ReadInt32(n) == 1);
                            Reject(delegate { owner.Dispose(); });
                            if (failure == 2) Marshal.WriteInt32(n, 0);
                            if (failure == 3) throw new Exception("artificial failure");
                            return failure == 1 ? 9 : 0;
                        });
                    Reject(delegate { request.DispatchMode01SupportedReadOnce(channel, 0x7df); });
                    Reject(delegate { request.DispatchMode01SupportedReadOnce(channel, 0x7e0); });
                    Check(calls == 0);
                    Check(request.PrepareDtcFilterOnce(channel, 0x7e0,
                        delegate(uint c, uint t, IntPtr m, IntPtr p, IntPtr f, IntPtr id) { Marshal.WriteInt32(id, 30); return 0; },
                        delegate { return 0; }, out filter) == 0);
                    Reject(delegate { request.DispatchMode01SupportedReadOnce(channel + 1, 0x7e0); });
                    if (failure >= 2) Reject(delegate { request.DispatchMode01SupportedReadOnce(channel, 0x7e0); });
                    else Check(request.DispatchMode01SupportedReadOnce(channel, 0x7e0) == (failure == 1 ? 9 : 0));
                    Reject(delegate { request.DispatchMode01SupportedReadOnce(channel, 0x7e0); });
                    Check(calls == 1);
                    if (failure == 0) {
                        var receiver = new J2534ReceiveNative(owner, device, delegate(uint c, IntPtr m, IntPtr n, uint t) {
                            Check(c == channel && t == 1000);
                            byte[] message = new byte[4152];
                            message[0] = 6; message[16] = 10; message[26] = 7; message[27] = 232;
                            Array.Copy(Support(5), 0, message, 28, 6);
                            Marshal.Copy(message, 0, m, message.Length); Marshal.WriteInt32(n, 1); return 9;
                        });
                        var exchange = new J2534Mode01Exchange(0x7e0, 5); exchange.BeginSupportedRead();
                        Check(exchange.AcceptSupportedRead(receiver.ReadDtcResponseOnce(channel, 3))[5] == 5);
                        Check(owner.StopDtcReadFilter(device, channel, filter) == 0);
                        Check(owner.Disconnect(device, channel) == 0 && owner.Close(device) == 0);
                    }
                }
                Check(library.Released == (failure == 0));
            }
        }
    }
}
