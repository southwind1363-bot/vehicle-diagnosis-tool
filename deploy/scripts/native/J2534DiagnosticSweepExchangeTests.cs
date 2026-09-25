using System;
namespace VehicleDiagnosis.Native
{
    internal static class J2534DiagnosticSweepExchangeTests
    {
        private static int checks;
        private static void Check(bool ok) { checks++; if (!ok) throw new Exception("sweep check " + checks); }
        private static void Reject(Action action)
        { bool rejected = false; try { action(); } catch (InvalidOperationException) { rejected = true; } Check(rejected); }
        private static byte[] Dtc(byte service) { return new byte[] { (byte)(service + 64), 0, 0 }; }
        private static void Main()
        {
            J2534DiagnosticSweepOwnedTests.Run();
            foreach (int status in new[] { 0, 9 }) foreach (bool indicator in new[] { false, true }) {
                var sweep = new J2534DiagnosticSweepExchange(0x7e0); sweep.Begin();
                var response = new J2534ReceiveNative.Message { ProtocolId = 6,
                    Data = new byte[] { 0, 0, 7, 232, 67, 0, 0 } };
                var start = new J2534ReceiveNative.Message { ProtocolId = 6, RxStatus = 2,
                    Data = new byte[] { 0, 0, 7, 232 } };
                Check(sweep.AcceptDtcRead(3, new J2534ReceiveNative.Result { Status = status,
                    ReportedCount = indicator ? 2u : 1u,
                    Messages = indicator ? new[] { start, response } : new[] { response } })[4] == 7);
            }
            for (int fault = 0; fault < 10; fault++) {
                var sweep = new J2534DiagnosticSweepExchange(0x7e0); sweep.Begin();
                var message = new J2534ReceiveNative.Message { ProtocolId = 6,
                    Data = new byte[] { 0, 0, 7, 232, 67, 0, 0 } };
                var read = new J2534ReceiveNative.Result { ReportedCount = 1, Messages = new[] { message } };
                if (fault == 0) read.Status = 1;
                if (fault == 1) read.ReportedCount = 2;
                if (fault == 2) message.ProtocolId = 5;
                if (fault == 3) message.TxFlags = 1;
                if (fault == 4) message.ExtraDataIndex = 1;
                if (fault == 5) message.Data[3]++;
                if (fault == 6) message.RxStatus = 1;
                if (fault == 7) { read.Messages = new[] { message, message }; read.ReportedCount = 2; }
                if (fault == 8) { message.RxStatus = 2; message.Data = new byte[] { 0, 0, 7, 232 }; }
                if (fault == 9) read.Messages = null;
                Check(sweep.AcceptDtcRead(3, read) == null);
                Reject(delegate { sweep.Begin(); });
            }
            for (uint ecu = 0x7e0; ecu <= 0x7e7; ecu++) {
                var sweep = new J2534DiagnosticSweepExchange(ecu);
                Check(sweep.Begin()[4] == 3);
                byte[] stored = Dtc(3);
                Check(sweep.AcceptDtcResponse(3, ecu + 8, stored)[4] == 7);
                stored[0] = 0;
                Check(sweep.AcceptDtcResponse(7, ecu + 8, Dtc(7))[4] == 10);
                Check(sweep.AcceptDtcResponse(10, ecu + 8, Dtc(10))[5] == 0);
                Check(sweep.AcceptSupportedResponse(ecu + 8, new byte[] { 65, 0, 8, 16, 0, 0 })[5] == 5);
                Check(sweep.AcceptCoolantResponse(ecu + 8, new byte[] { 65, 5, 40 })[5] == 12);
                var capture = sweep.AcceptRpmResponse(ecu + 8, new byte[] { 65, 12, 0, 0 });
                Check(capture != null && capture.CoolantCelsius == 0 && capture.Rpm == 0);
                byte[] copy = capture.DtcPayload(0); copy[0] = 0;
                Check(capture.DtcPayload(0)[0] == 67);
                Reject(delegate { sweep.Begin(); });
                Reject(delegate { sweep.AcceptRpmResponse(ecu + 8, null); });
            }
            for (int fail = 0; fail < 6; fail++) {
                var sweep = new J2534DiagnosticSweepExchange(0x7e0); sweep.Begin();
                for (int stage = 0; stage <= fail; stage++) {
                    byte[] next = null;
                    if (stage < 3) {
                        byte service = new byte[] { 3, 7, 10 }[stage];
                        next = sweep.AcceptDtcResponse(service, 0x7e8, stage == fail ? null : Dtc(service));
                    } else if (stage == 3) next = sweep.AcceptSupportedResponse(0x7e8,
                        stage == fail ? null : new byte[] { 65, 0, 8, 16, 0, 0 });
                    else if (stage == 4) next = sweep.AcceptCoolantResponse(0x7e8,
                        stage == fail ? null : new byte[] { 65, 5, 130 });
                    else Check(sweep.AcceptRpmResponse(0x7e8, null) == null);
                    if (stage < 5) Check((next == null) == (stage == fail));
                }
                Reject(delegate { sweep.Begin(); });
                Reject(delegate { sweep.AcceptRpmResponse(0x7e8, new byte[] { 65, 12, 0, 0 }); });
            }
            foreach (byte[] bad in new[] { new byte[] { 67 }, new byte[] { 67, 0 },
                new byte[] { 71, 0, 0 }, new byte[] { 67, 0, 0, 1, 1 }, new byte[4097] }) {
                var sweep = new J2534DiagnosticSweepExchange(0x7e0); sweep.Begin();
                Check(sweep.AcceptDtcResponse(3, 0x7e8, bad) == null);
                Reject(delegate { sweep.AcceptDtcResponse(3, 0x7e8, Dtc(3)); });
            }
            var wrong = new J2534DiagnosticSweepExchange(0x7e0); wrong.Begin();
            Reject(delegate { wrong.AcceptDtcResponse(7, 0x7e8, Dtc(7)); });
            Reject(delegate { wrong.Begin(); });
            var mismatch = new J2534DiagnosticSweepExchange(0x7e0); mismatch.Begin();
            Check(mismatch.AcceptDtcResponse(3, 0x7e9, Dtc(3)) == null);
            Reject(delegate { mismatch.Begin(); });
            var unsupported = new J2534DiagnosticSweepExchange(0x7e0); unsupported.Begin();
            foreach (byte service in new byte[] { 3, 7, 10 }) unsupported.AcceptDtcResponse(service, 0x7e8, Dtc(service));
            Check(unsupported.AcceptSupportedResponse(0x7e8, new byte[] { 65, 0, 8, 0, 0, 0 }) == null);
            Reject(delegate { unsupported.AcceptCoolantResponse(0x7e8, new byte[] { 65, 5, 130 }); });
            var aborted = new J2534DiagnosticSweepExchange(0x7e0); aborted.Begin(); aborted.Abort(); aborted.Abort();
            Reject(delegate { aborted.AcceptDtcResponse(3, 0x7e8, Dtc(3)); });
            Console.WriteLine("diagnostic sweep checks " + checks + ", Errors: 0 (pure payloads; no DLL)");
        }
    }
}
