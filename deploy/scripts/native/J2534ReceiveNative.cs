using System;
using System.Runtime.InteropServices;
using System.Threading;

namespace VehicleDiagnosis.Native
{
    // Development-only v04.04 receive boundary. No loader, channel creation or retry.
    internal sealed class J2534ReceiveNative
    {
        [UnmanagedFunctionPointer(CallingConvention.StdCall)]
        internal delegate int ReadFunction(uint channel, IntPtr messages, IntPtr count, uint timeout);
        internal sealed class Message
        {
            internal uint ProtocolId, RxStatus, TxFlags, Timestamp, ExtraDataIndex;
            internal byte[] Data;
        }
        internal sealed class Result
        {
            internal int Status;
            internal uint ReportedCount;
            internal Message[] Messages;
        }
        internal const int MessageSize = 24 + 4128;
        private readonly ReadFunction read;
        private int consumed;
        internal J2534ReceiveNative(ReadFunction read)
        {
            if (read == null) throw new ArgumentNullException("read");
            this.read = read;
        }
        private static uint UInt32(IntPtr address, int offset)
        { return unchecked((uint)Marshal.ReadInt32(address, offset)); }

        // One call per instance, including uncertain failures. The future isolated
        // worker must own the channel/module and enforce the process deadline.
        internal Result ReadOnce(uint channel, int capacity)
        {
            if (capacity < 1 || capacity > 16) throw new ArgumentOutOfRangeException("capacity");
            if (Interlocked.Exchange(ref consumed, 1) != 0)
                throw new InvalidOperationException("native_receive_already_attempted");
            using (var messages = new GuardedMemory(capacity * MessageSize))
            using (var count = new GuardedMemory(4))
            {
                Marshal.WriteInt32(count.Pointer, capacity);
                int status;
                try { status = read(channel, messages.Pointer, count.Pointer, 0); }
                finally
                {
                    // Guard damage takes precedence even if the callback throws.
                    messages.Check();
                    count.Check();
                    GC.KeepAlive(read);
                }
                uint returned = UInt32(count.Pointer, 0);
                if (returned > capacity) throw new InvalidOperationException("native_receive_count_invalid");
                var result = new Result { Status = status, ReportedCount = returned, Messages = new Message[0] };
                // Preserve the status; do not turn buffer-empty/loss/errors into
                // diagnostic success. Only success/partial timeout carry data.
                if (status != 0 && status != 9) return result;
                var copied = new Message[(int)returned];
                for (int i = 0; i < copied.Length; i++)
                {
                    IntPtr p = IntPtr.Add(messages.Pointer, i * MessageSize);
                    uint size = UInt32(p, 16), extra = UInt32(p, 20);
                    if (size > 4128 || extra > size)
                        throw new InvalidOperationException("native_receive_length_invalid");
                    var data = new byte[(int)size];
                    Marshal.Copy(IntPtr.Add(p, 24), data, 0, data.Length);
                    copied[i] = new Message { ProtocolId = UInt32(p, 0), RxStatus = UInt32(p, 4),
                        TxFlags = UInt32(p, 8), Timestamp = UInt32(p, 12), ExtraDataIndex = extra, Data = data };
                }
                result.Messages = copied;
                return result;
            }
        }
        private sealed class GuardedMemory : IDisposable
        {
            private IntPtr allocation;
            private readonly int length;
            internal IntPtr Pointer { get { return IntPtr.Add(allocation, 16); } }
            internal GuardedMemory(int length)
            {
                this.length = length;
                var initial = new byte[length + 32];
                // Sentinel fields reject an unwritten message header.
                for (int i = 0; i < initial.Length; i++) initial[i] = 0xff;
                allocation = Marshal.AllocHGlobal(initial.Length);
                Marshal.Copy(initial, 0, allocation, initial.Length);
            }
            internal void Check()
            {
                for (int i = 0; i < 16; i++)
                    if (Marshal.ReadByte(allocation, i) != 0xff || Marshal.ReadByte(Pointer, length + i) != 0xff)
                        throw new InvalidOperationException("native_receive_buffer_overrun");
            }
            public void Dispose()
            {
                if (allocation != IntPtr.Zero) Marshal.FreeHGlobal(allocation);
                allocation = IntPtr.Zero;
            }
        }
    }
}
