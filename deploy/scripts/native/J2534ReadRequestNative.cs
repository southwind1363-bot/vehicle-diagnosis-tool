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
        [UnmanagedFunctionPointer(CallingConvention.StdCall)]
        internal delegate int StartFilterFunction(uint channel, uint type, IntPtr mask, IntPtr pattern, IntPtr flow, IntPtr filterId);
        [UnmanagedFunctionPointer(CallingConvention.StdCall)]
        internal delegate int StopFilterFunction(uint channel, uint filterId);
        private readonly J2534IdentityNative owner;
        private readonly uint device;
        private readonly WriteFunction write;
        internal J2534ReadRequestNative(J2534IdentityNative owner, uint device, WriteFunction write)
        {
            if (owner == null || write == null) throw new ArgumentNullException("request_binding");
            this.owner = owner; this.device = device; this.write = write;
        }

        // Fixed standard 11-bit OBD address pair only. This can cause automatic
        // transport flow-control if wired to a driver: development-only, NOT a
        // passive receive filter or permission to execute on a vehicle.
        internal int PrepareDtcFilterOnce(uint channel, uint requestEcu,
            StartFilterFunction start, StopFilterFunction stop, out uint filterId)
        {
            if (start == null || stop == null) throw new ArgumentNullException("filter_binding");
            return owner.InstallDtcReadFilter(device, channel, requestEcu, delegate(IntPtr output) {
                using (var mask = new RequestBuffer(4152))
                using (var pattern = new RequestBuffer(4152))
                using (var flow = new RequestBuffer(4152))
                {
                    foreach (var buffer in new RequestBuffer[] { mask, pattern, flow }) {
                        Marshal.WriteInt32(buffer.Data, 0, 6);
                        Marshal.WriteInt32(buffer.Data, 8, 0x40);
                        Marshal.WriteInt32(buffer.Data, 16, 4);
                    }
                    Marshal.WriteInt32(mask.Data, 24, -1);
                    Marshal.WriteByte(pattern.Data, 26, 7);
                    Marshal.WriteByte(pattern.Data, 27, (byte)(requestEcu + 8));
                    Marshal.WriteByte(flow.Data, 26, 7);
                    Marshal.WriteByte(flow.Data, 27, (byte)requestEcu);
                    try { return start(channel, 3, mask.Data, pattern.Data, flow.Data, output); }
                    finally { mask.Check(); pattern.Check(); flow.Check(); GC.KeepAlive(start); }
                }
            }, delegate(uint c, uint id) { return stop(c, id); }, out filterId);
        }

        // Only standard stored/pending/permanent DTC read services. Protocol
        // applicability and isolated-worker integration remain prerequisites.
        internal int DispatchDtcReadOnce(uint channel, uint requestEcu, byte service)
        {
            if (requestEcu < 0x7e0 || requestEcu > 0x7e7
                || (service != 0x03 && service != 0x07 && service != 0x0a))
                throw new InvalidOperationException("native_read_request_not_allowed");
            return DispatchOnce(channel, requestEcu, service, null);
        }
#if J2534_DTC_DEVELOPMENT
        // First Mode01 stage only. Value PIDs cannot bypass the support check.
        internal int DispatchMode01SupportedReadOnce(uint channel, uint requestEcu)
        {
            if (requestEcu < 0x7e0 || requestEcu > 0x7e7)
                throw new InvalidOperationException("native_read_request_not_allowed");
            return DispatchOnce(channel, requestEcu, 1, 0);
        }
#endif
        private int DispatchOnce(uint channel, uint requestEcu, byte service, byte? pid)
        {
            return owner.RunOwnedReadRequest(device, channel, requestEcu, delegate {
                return WriteFixed(channel, requestEcu, service, pid);
            });
        }
#if J2534_DTC_DEVELOPMENT && J2534_MODE01_DEVELOPMENT
        // Internal result only: a supervising parent must still confirm normal
        // worker exit. Any cleanup failure withholds the captured value.
        internal double? ReadMode01AndFinish(uint channel, uint requestEcu, byte pid,
            J2534ReceiveNative.ReadFunction read, StartFilterFunction start, StopFilterFunction stop)
        {
            var observation = ReadMode01ObservationAndFinish(channel, requestEcu, pid, read, start, stop);
            return observation == null ? (double?)null : observation.Value;
        }

        internal J2534Mode01Observation ReadMode01ObservationAndFinish(uint channel, uint requestEcu, byte pid,
            J2534ReceiveNative.ReadFunction read, StartFilterFunction start, StopFilterFunction stop)
        {
            if (read == null || start == null || stop == null) throw new ArgumentNullException("mode01_binding");
            // Validate before acquiring a filter or invoking any callback.
            new J2534Mode01Exchange(requestEcu, pid);
            uint filter;
            if (PrepareDtcFilterOnce(channel, requestEcu, start, stop, out filter) != 0) return null;
            J2534ReceiveNative.Result supported, valueRead;
            double? captured = ReadMode01Core(channel, requestEcu, pid, read, out supported, out valueRead);
            if (!captured.HasValue) return null;
            if (owner.StopDtcReadFilter(device, channel, filter) != 0) return null;
            if (owner.Disconnect(device, channel) != 0) return null;
            if (owner.Close(device) != 0) return null;
            owner.Dispose();
            return owner.ReferenceReleased ? new J2534Mode01Observation(requestEcu, pid, captured.Value, supported, valueRead) : null;
        }

        internal double? ReadMode01Once(uint channel, uint requestEcu, byte pid, J2534ReceiveNative.ReadFunction read)
        {
            J2534ReceiveNative.Result supported, valueRead;
            return ReadMode01Core(channel, requestEcu, pid, read, out supported, out valueRead);
        }

        private double? ReadMode01Core(uint channel, uint requestEcu, byte pid, J2534ReceiveNative.ReadFunction read,
            out J2534ReceiveNative.Result supportedRead, out J2534ReceiveNative.Result valueRead)
        {
            supportedRead = null; valueRead = null;
            if (read == null) throw new ArgumentNullException("read");
            var exchange = new J2534Mode01Exchange(requestEcu, pid);
            J2534ReceiveNative.Result supported = null, observed = null;
            double? value = owner.RunOwnedMode01Acquisition(device, channel, requestEcu, delegate {
                exchange.BeginSupportedRead();
                if (WriteFixed(channel, requestEcu, 1, 0) != 0) return null;
                supported = new J2534ReceiveNative(read).ReadMode01StageOnce(channel);
                if (exchange.AcceptSupportedRead(supported) == null) return null;
                if (WriteFixed(channel, requestEcu, 1, pid) != 0) return null;
                observed = new J2534ReceiveNative(read).ReadMode01StageOnce(channel);
                return exchange.AcceptValueRead(observed);
            });
            if (value.HasValue) { supportedRead = supported; valueRead = observed; }
            return value;
        }
#endif
        private int WriteFixed(uint channel, uint requestEcu, byte service, byte? pid)
        {
                using (var message = new RequestBuffer(4152))
                using (var count = new RequestBuffer(4))
                {
                    Marshal.WriteInt32(message.Data, 0, 6); // ISO15765
                    Marshal.WriteInt32(message.Data, 8, 0x40); // frame padding, 11-bit ID
                    Marshal.WriteInt32(message.Data, 16, pid.HasValue ? 6 : 5);
                    Marshal.WriteByte(message.Data, 26, (byte)(requestEcu >> 8));
                    Marshal.WriteByte(message.Data, 27, (byte)requestEcu);
                    Marshal.WriteByte(message.Data, 28, service);
                    if (pid.HasValue) Marshal.WriteByte(message.Data, 29, pid.Value);
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
