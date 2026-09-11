using System;
using System.Runtime.InteropServices;

namespace VehicleDiagnosis.Native
{
    // Disabled internal v04.04 building block. No loader, CLI, raw payload,
    // functional broadcast, write/service operation, or automatic retry API.
    internal sealed class J2534ReadRequestNative
    {
        [UnmanagedFunctionPointer(CallingConvention.StdCall)]
        internal delegate int WriteFunction(uint channel, IntPtr messages, IntPtr count, uint timeout);
        private readonly J2534IdentityNative owner;
        private readonly uint device;
        private readonly WriteFunction write;
        internal J2534ReadRequestNative(J2534IdentityNative owner, uint device, WriteFunction write)
        {
            if (owner == null || write == null) throw new ArgumentNullException("request_binding");
            this.owner = owner; this.device = device; this.write = write;
        }

        // Only standard stored/pending/permanent DTC read services. Protocol
        // applicability and flow-control filters remain prerequisites for a
        // future isolated worker; this method is not wired to any live driver.
        internal int DispatchDtcReadOnce(uint channel, uint requestEcu, byte service)
        {
            if (requestEcu < 0x7e0 || requestEcu > 0x7e7
                || (service != 0x03 && service != 0x07 && service != 0x0a))
                throw new InvalidOperationException("native_read_request_not_allowed");
            return owner.RunOwnedReadRequest(device, channel, delegate {
                using (var message = new RequestBuffer(4152))
                using (var count = new RequestBuffer(4))
                {
                    Marshal.WriteInt32(message.Data, 0, 6); // ISO15765
                    Marshal.WriteInt32(message.Data, 8, 0x40); // frame padding, 11-bit ID
                    Marshal.WriteInt32(message.Data, 16, 5); // address DWORD + SID
                    Marshal.WriteByte(message.Data, 26, (byte)(requestEcu >> 8));
                    Marshal.WriteByte(message.Data, 27, (byte)requestEcu);
                    Marshal.WriteByte(message.Data, 28, service);
                    Marshal.WriteInt32(count.Data, 1);
                    int status;
                    try { status = write(channel, message.Data, count.Data, 0); }
                    catch { throw new InvalidOperationException("native_read_request_threw"); }
                    finally { message.Check(); count.Check(); GC.KeepAlive(write); }
                    uint accepted = unchecked((uint)Marshal.ReadInt32(count.Data));
                    if (accepted > 1 || (status == 0 && accepted != 1))
                        throw new InvalidOperationException("native_read_request_count_invalid");
                    // Status zero means accepted into the driver queue only.
                    // It must never be turned into a diagnostic completion.
                    return status;
                }
            });
        }
        private sealed class RequestBuffer : IDisposable
        {
            private IntPtr allocation;
            private readonly int size;
            internal IntPtr Data { get { return IntPtr.Add(allocation, 16); } }
            internal RequestBuffer(int size)
            {
                this.size = size;
                byte[] bytes = new byte[size + 32];
                for (int i = 0; i < 16; i++) { bytes[i] = 0xa5; bytes[size + 16 + i] = 0xa5; }
                allocation = Marshal.AllocHGlobal(bytes.Length);
                Marshal.Copy(bytes, 0, allocation, bytes.Length);
            }
            internal void Check()
            {
                for (int i = 0; i < 16; i++)
                    if (Marshal.ReadByte(allocation, i) != 0xa5 || Marshal.ReadByte(Data, size + i) != 0xa5)
                        throw new InvalidOperationException("native_read_request_buffer_overrun");
            }
            public void Dispose()
            {
                if (allocation != IntPtr.Zero) Marshal.FreeHGlobal(allocation);
                allocation = IntPtr.Zero;
            }
        }
    }
}
