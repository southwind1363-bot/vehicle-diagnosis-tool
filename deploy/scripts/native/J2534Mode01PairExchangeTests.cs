using System;
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
    }
}
