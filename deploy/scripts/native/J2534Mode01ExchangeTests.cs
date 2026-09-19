using System;
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
    }
}
