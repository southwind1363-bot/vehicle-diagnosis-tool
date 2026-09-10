using System;
using System.IO;
using System.Runtime.InteropServices;
using VehicleDiagnosis.Native;

internal static class NativeReceiveTests
{
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern IntPtr LoadLibraryExW(string path, IntPtr file, uint flags);
    [DllImport("kernel32.dll", CharSet = CharSet.Ansi, ExactSpelling = true)]
    private static extern IntPtr GetProcAddress(IntPtr module, string name);
    [DllImport("kernel32.dll")]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool FreeLibrary(IntPtr module);
    private static void RunNative()
    {
        // Self-test executable has no driver/path CLI; only its generated fixture.
        string path = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "receive-success.dll");
        IntPtr module = LoadLibraryExW(path, IntPtr.Zero, 0x00000900);
        Check(module != IntPtr.Zero);
        try
        {
            IntPtr export = GetProcAddress(module, "PassThruReadMsgs");
            Check(export != IntPtr.Zero && GetProcAddress(module, "PassThruOpen") == IntPtr.Zero);
            var read = (J2534ReceiveNative.ReadFunction)Marshal.GetDelegateForFunctionPointer(export, typeof(J2534ReceiveNative.ReadFunction));
            var result = new J2534ReceiveNative(read).ReadOnce(0xf1234567, 3);
            Check(result.Status == 0 && result.ReportedCount == 2 && result.Messages.Length == 2);
            Check(result.Messages[0].ProtocolId == 6 && result.Messages[0].Timestamp == 0xf1234567);
            Check(result.Messages[0].Data.Length == 4 && result.Messages[0].Data[0] == 1 && result.Messages[0].Data[3] == 4);
            Check(result.Messages[1].Timestamp == 7 && result.Messages[1].RxStatus == 2 && result.Messages[1].Data.Length == 0);
            Check(new J2534ReceiveNative(read).ReadOnce(0, 3).Status == -8);
            Check(new J2534ReceiveNative(read).ReadOnce(0xf1234567, 2).Status == -8);
            GC.KeepAlive(read);
        }
        finally { Check(FreeLibrary(module)); }
    }
    private static int checks;
    private static void Check(bool value) { if (!value) throw new Exception("receive_assertion_failed"); checks++; }
    private static void Reject(Action action, string code)
    {
        try { action(); } catch (InvalidOperationException ex) { Check(ex.Message == code); return; }
        throw new Exception("receive_expected_rejection");
    }
    private static void Fill(IntPtr p, int size)
    {
        for (int i = 0; i < 6; i++) Marshal.WriteInt32(p, i * 4, 0);
        Marshal.WriteInt32(p, 0, 6);
        Marshal.WriteInt32(p, 4, 2); // Indicator retained, not promoted to ECU data.
        Marshal.WriteInt32(p, 12, unchecked((int)0xf1234567));
        Marshal.WriteInt32(p, 16, size);
        Marshal.WriteInt32(p, 20, size);
        if (size > 0 && size <= 4128) Marshal.WriteByte(p, 24 + size - 1, 0x62);
    }
    internal static int Run()
    {
        var reader = new J2534ReceiveNative(delegate(uint channel, IntPtr p, IntPtr n, uint timeout) {
            Check(channel == 0xf1234567 && timeout == 0 && Marshal.ReadInt32(n) == 2);
            Fill(p, 4128); Fill(IntPtr.Add(p, J2534ReceiveNative.MessageSize), 0);
            return 9;
        });
        var result = reader.ReadOnce(0xf1234567, 2);
        Check(result.Status == 9 && result.ReportedCount == 2 && result.Messages.Length == 2);
        Check(result.Messages[0].Data.Length == 4128 && result.Messages[0].Data[4127] == 0x62);
        Check(result.Messages[0].Timestamp == 0xf1234567 && result.Messages[0].RxStatus == 2);
        Check(result.Messages[1].Data.Length == 0);
        Reject(delegate { reader.ReadOnce(1, 1); }, "native_receive_already_attempted");
        foreach (int status in new int[] { 0, 16, -1 })
        {
            int captured = status;
            result = new J2534ReceiveNative(delegate(uint c, IntPtr p, IntPtr n, uint t) {
                Marshal.WriteInt32(n, 0); return captured;
            }).ReadOnce(0, 1);
            Check(result.Status == status && result.Messages.Length == 0);
        }
        foreach (int count in new int[] { 2, -1 })
        {
            int captured = count;
            Reject(delegate { new J2534ReceiveNative(delegate(uint c, IntPtr p, IntPtr n, uint t) {
                Marshal.WriteInt32(n, captured); return 0;
            }).ReadOnce(0, 1); }, "native_receive_count_invalid");
        }
        foreach (int scenario in new int[] { 0, 1, 2 })
        {
            int captured = scenario;
            Reject(delegate { new J2534ReceiveNative(delegate(uint c, IntPtr p, IntPtr n, uint t) {
                if (captured != 0) Fill(p, captured == 1 ? 4129 : 1);
                if (captured == 2) Marshal.WriteInt32(p, 20, 2);
                return 0;
            }).ReadOnce(0, 1); }, "native_receive_length_invalid");
        }
        foreach (int offset in new int[] { -1, J2534ReceiveNative.MessageSize, -2, 4 })
        {
            int captured = offset;
            Reject(delegate { new J2534ReceiveNative(delegate(uint c, IntPtr p, IntPtr n, uint t) {
                Marshal.WriteByte(captured == -2 || captured == 4 ? n : p, captured == -2 ? -1 : captured, 0);
                throw new Exception("callback_failed");
            }).ReadOnce(0, 1); }, "native_receive_buffer_overrun");
        }
        reader = new J2534ReceiveNative(delegate(uint c, IntPtr p, IntPtr n, uint t) {
            throw new InvalidOperationException("callback_failed");
        });
        Reject(delegate { reader.ReadOnce(0, 1); }, "callback_failed");
        Reject(delegate { reader.ReadOnce(0, 1); }, "native_receive_already_attempted");
        result = new J2534ReceiveNative(delegate(uint c, IntPtr p, IntPtr n, uint t) {
            Fill(p, 1); return 18; // Buffer overflow must not publish partial ECU data.
        }).ReadOnce(0, 1);
        Check(result.Status == 18 && result.ReportedCount == 1 && result.Messages.Length == 0);
        reader = new J2534ReceiveNative(delegate(uint c, IntPtr p, IntPtr n, uint t) {
            Reject(delegate { reader.ReadOnce(c, 1); }, "native_receive_already_attempted");
            Marshal.WriteInt32(n, 0); return 0;
        });
        foreach (int capacity in new int[] { 0, 17, int.MaxValue })
        {
            bool rejected = false;
            try { reader.ReadOnce(0, capacity); } catch (ArgumentOutOfRangeException) { rejected = true; }
            Check(rejected);
        }
        Check(reader.ReadOnce(0, 16).Messages.Length == 0);
        RunNative();
        return checks;
    }
}
