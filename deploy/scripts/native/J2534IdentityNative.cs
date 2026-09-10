using System;
using System.IO;
using System.Runtime.InteropServices;

namespace VehicleDiagnosis.Native
{
    internal interface IIdentityLibrary
    {
        IntPtr Resolve(string name);
        bool Release(bool allowUnload);
    }

    // Internal binding only; no driver discovery, CLI, or vehicle-channel API.
    internal sealed class WindowsIdentityLibrary : IIdentityLibrary
    {
        private IntPtr module;
        private bool released;
        internal bool ReferenceReleased { get; private set; }

        [DllImport("kernel32.dll", CharSet = CharSet.Unicode, ExactSpelling = true, SetLastError = true)]
        private static extern IntPtr LoadLibraryExW(string path, IntPtr file, uint flags);
        [DllImport("kernel32.dll", CharSet = CharSet.Ansi, ExactSpelling = true, SetLastError = true)]
        private static extern IntPtr GetProcAddress(IntPtr library, string name);
        [DllImport("kernel32.dll", ExactSpelling = true, SetLastError = true)]
        [ return: MarshalAs(UnmanagedType.Bool) ]
        private static extern bool FreeLibrary(IntPtr library);

        internal static string ValidatePath(string path)
        {
            try
            {
                if (String.IsNullOrEmpty(path) || path.Length < 4 || !Char.IsLetter(path[0])
                    || path[1] != ':' || path[2] != '\\' || path.IndexOf('/') >= 0 || path.IndexOf(':', 2) >= 0
                    || !path.EndsWith(".dll", StringComparison.OrdinalIgnoreCase)) throw new Exception();
                string fullPath = Path.GetFullPath(path);
                if (!String.Equals(fullPath, path, StringComparison.OrdinalIgnoreCase)
                    || new DriveInfo(Path.GetPathRoot(fullPath)).DriveType != DriveType.Fixed
                    || !File.Exists(fullPath)) throw new Exception();
                for (string current = fullPath; current != null; current = Path.GetDirectoryName(current))
                {
                    if ((File.GetAttributes(current) & FileAttributes.ReparsePoint) != 0) throw new Exception();
                }
                return fullPath;
            }
            catch { throw new InvalidOperationException("native_library_path_rejected"); }
        }

        internal static WindowsIdentityLibrary Load(string path)
        {
            string fullPath = ValidatePath(path);
            // Dependencies are restricted to the selected DLL directory and System32.
            IntPtr handle = LoadLibraryExW(fullPath, IntPtr.Zero, 0x00000900);
            if (handle == IntPtr.Zero) throw new InvalidOperationException("native_library_load_failed");
            return new WindowsIdentityLibrary { module = handle };
        }

        public IntPtr Resolve(string name)
        {
            if (released) throw new ObjectDisposedException("identity_library");
            if (name != "PassThruOpen" && name != "PassThruReadVersion" && name != "PassThruClose")
                throw new InvalidOperationException("native_export_not_allowed");
            return GetProcAddress(module, name);
        }

        public bool Release(bool allowUnload)
        {
            if (released) return ReferenceReleased;
            released = true;
            // Uncertain device ownership retains the module reference until process exit.
            ReferenceReleased = allowUnload && FreeLibrary(module);
            module = IntPtr.Zero;
            return ReferenceReleased;
        }
    }

    internal sealed class NativeVersions
    {
        internal readonly int Status;
        internal readonly byte[] Firmware, Dll, Api;
        internal NativeVersions(int status, byte[] firmware, byte[] dll, byte[] api)
        { Status = status; Firmware = firmware; Dll = dll; Api = api; }
    }

    internal sealed class VersionBuffer : IDisposable
    {
        private IntPtr allocation;
        internal IntPtr Data
        {
            get
            {
                if (allocation == IntPtr.Zero) throw new ObjectDisposedException("version_buffer");
                return IntPtr.Add(allocation, 16);
            }
        }
        internal VersionBuffer()
        {
            allocation = Marshal.AllocHGlobal(112);
            for (int i = 0; i < 112; i++) Marshal.WriteByte(allocation, i, 0xA5);
        }
        internal void CheckGuards()
        {
            if (allocation == IntPtr.Zero) throw new ObjectDisposedException("version_buffer");
            for (int i = 0; i < 16; i++)
                if (Marshal.ReadByte(allocation, i) != 0xA5 || Marshal.ReadByte(allocation, 96 + i) != 0xA5)
                    throw new InvalidOperationException("native_version_buffer_overrun");
        }
        internal byte[] Copy()
        {
            CheckGuards();
            byte[] bytes = new byte[80];
            Marshal.Copy(Data, bytes, 0, bytes.Length);
            return bytes;
        }
        public void Dispose()
        {
            if (allocation == IntPtr.Zero) return;
            Marshal.FreeHGlobal(allocation);
            allocation = IntPtr.Zero;
        }
    }

    internal sealed class J2534IdentityNative : IDisposable
    {
        [UnmanagedFunctionPointer(CallingConvention.StdCall)]
        internal delegate int OpenFunction(IntPtr name, out uint deviceId);
        [UnmanagedFunctionPointer(CallingConvention.StdCall)]
        internal delegate int ReadVersionFunction(uint deviceId, IntPtr firmware, IntPtr dll, IntPtr api);
        [UnmanagedFunctionPointer(CallingConvention.StdCall)]
        internal delegate int CloseFunction(uint deviceId);
        [UnmanagedFunctionPointer(CallingConvention.StdCall)]
        internal delegate int ConnectFunction(uint deviceId, uint protocolId, uint flags, uint baudRate, IntPtr channelId);
        [UnmanagedFunctionPointer(CallingConvention.StdCall)]
        internal delegate int DisconnectFunction(uint channelId);

        private readonly object gate = new object();
        private readonly IIdentityLibrary library;
        private readonly OpenFunction open;
        private readonly ReadVersionFunction readVersion;
        private readonly CloseFunction close;
        private bool disposed, openAttempted, readAttempted, closeAttempted;
        private bool callInProgress, corrupted, receiveAttempted;
        private bool channelAttempted, disconnectAttempted, channelCleanupConfirmed;
        private uint? ownedChannel;
        private DisconnectFunction disconnect;
        private bool allowUnload = true;
        private uint? ownedDevice;
        internal bool ReferenceReleased { get; private set; }

        internal J2534IdentityNative(IIdentityLibrary library)
        {
            if (library == null) throw new ArgumentNullException("library");
            this.library = library;
            try
            {
                IntPtr openAddress = library.Resolve("PassThruOpen");
                IntPtr readAddress = library.Resolve("PassThruReadVersion");
                IntPtr closeAddress = library.Resolve("PassThruClose");
                if (openAddress == IntPtr.Zero || readAddress == IntPtr.Zero || closeAddress == IntPtr.Zero) throw new Exception();
                open = (OpenFunction)Marshal.GetDelegateForFunctionPointer(openAddress, typeof(OpenFunction));
                readVersion = (ReadVersionFunction)Marshal.GetDelegateForFunctionPointer(readAddress, typeof(ReadVersionFunction));
                close = (CloseFunction)Marshal.GetDelegateForFunctionPointer(closeAddress, typeof(CloseFunction));
            }
            catch
            {
                try { library.Release(true); } catch { /* Binding failed; the worker must exit without retry. */ }
                throw new InvalidOperationException("native_identity_binding_failed");
            }
        }

        private void CheckUsable()
        {
            if (disposed) throw new ObjectDisposedException("identity_binding");
            if (callInProgress) throw new InvalidOperationException("native_identity_call_in_progress");
            if (corrupted) throw new InvalidOperationException("native_identity_corrupted");
        }
        private void CheckOwner(uint deviceId)
        {
            CheckUsable();
            if (!ownedDevice.HasValue || ownedDevice.Value != deviceId || closeAttempted)
                throw new InvalidOperationException("native_identity_device_not_owned");
        }

        internal int Open(out uint deviceId)
        {
            lock (gate)
            {
                CheckUsable();
                if (openAttempted) throw new InvalidOperationException("native_identity_open_already_attempted");
                openAttempted = true;
                allowUnload = false;
                deviceId = 0;
                int status;
                callInProgress = true;
                try { status = open(IntPtr.Zero, out deviceId); }
                catch { throw new InvalidOperationException("native_identity_open_threw"); }
                finally { callInProgress = false; }
                if (status == 0) ownedDevice = deviceId;
                else allowUnload = true;
                return status;
            }
        }

        internal NativeVersions ReadVersion(uint deviceId)
        {
            lock (gate)
            {
                CheckOwner(deviceId);
                if (readAttempted) throw new InvalidOperationException("native_identity_read_already_attempted");
                readAttempted = true;
                using (VersionBuffer firmware = new VersionBuffer())
                using (VersionBuffer dll = new VersionBuffer())
                using (VersionBuffer api = new VersionBuffer())
                {
                    int status;
                    callInProgress = true;
                    try
                    {
                        try { status = readVersion(deviceId, firmware.Data, dll.Data, api.Data); }
                        catch { throw new InvalidOperationException("native_identity_read_threw"); }
                        finally
                        {
                            // Damage takes precedence even when the callback also throws.
                            try { firmware.CheckGuards(); dll.CheckGuards(); api.CheckGuards(); }
                            catch { corrupted = true; allowUnload = false; throw; }
                        }
                    }
                    finally { callInProgress = false; }
                    return status == 0 ? new NativeVersions(status, firmware.Copy(), dll.Copy(), api.Copy())
                        : new NativeVersions(status, null, null, null);
                }
            }
        }

        // Internal, disabled in shipped workers. Delegates must belong to this
        // owner's module. This adds no export resolution or runtime permissions.
        internal int Connect(uint deviceId, uint protocolId, uint flags, uint baudRate,
            ConnectFunction connect, DisconnectFunction disconnectFunction, out uint channelId)
        {
            if (connect == null || disconnectFunction == null) throw new ArgumentNullException("channel_functions");
            channelId = 0;
            lock (gate)
            {
                CheckOwner(deviceId);
                if (channelAttempted || receiveAttempted) throw new InvalidOperationException("native_channel_connect_already_attempted");
                channelAttempted = true;
                disconnect = disconnectFunction;
                allowUnload = false;
                callInProgress = true;
                try
                {
                    // Only the first DWORD may be written; retain guard checks
                    // even when the callback fails. No raw callback text escapes.
                    using (var output = new VersionBuffer())
                    {
                        int status;
                        try { status = connect(deviceId, protocolId, flags, baudRate, output.Data); }
                        catch { throw new InvalidOperationException("native_channel_connect_threw"); }
                        finally
                        {
                            byte[] bytes = output.Copy();
                            for (int i = 4; i < bytes.Length; i++)
                                if (bytes[i] != 0xa5) throw new InvalidOperationException("native_channel_buffer_overrun");
                            GC.KeepAlive(connect);
                        }
                        if (status == 0) ownedChannel = channelId = unchecked((uint)Marshal.ReadInt32(output.Data));
                        else corrupted = true; // Uncertain channel state: no cleanup guess or retry.
                        return status;
                    }
                }
                catch { corrupted = true; throw; }
                finally { callInProgress = false; }
            }
        }

        internal int Disconnect(uint deviceId, uint channelId)
        {
            lock (gate)
            {
                CheckOwner(deviceId);
                if (!ownedChannel.HasValue || ownedChannel.Value != channelId || disconnectAttempted)
                    throw new InvalidOperationException("native_channel_not_owned");
                disconnectAttempted = true;
                callInProgress = true;
                try
                {
                    int status;
                    try { status = disconnect(channelId); }
                    catch { throw new InvalidOperationException("native_channel_disconnect_threw"); }
                    if (status == 0) { ownedChannel = null; channelCleanupConfirmed = true; }
                    else corrupted = true;
                    return status;
                }
                catch { corrupted = true; throw; }
                finally { callInProgress = false; GC.KeepAlive(disconnect); }
            }
        }

        // Untracked fixture channels retain the module as before. A managed
        // channel must match exactly and be disconnected before device Close.
        internal T RunOwnedReceive<T>(uint deviceId, Func<T> receive)
        { return RunReceive(deviceId, null, receive); }
        internal T RunOwnedReceive<T>(uint deviceId, uint channelId, Func<T> receive)
        { return RunReceive(deviceId, channelId, receive); }
        private T RunReceive<T>(uint deviceId, uint? channelId, Func<T> receive)
        {
            if (receive == null) throw new ArgumentNullException("receive");
            lock (gate)
            {
                CheckOwner(deviceId);
                if (channelAttempted && (!ownedChannel.HasValue || !channelId.HasValue
                    || ownedChannel.Value != channelId.Value || disconnectAttempted))
                    throw new InvalidOperationException("native_channel_not_owned");
                if (receiveAttempted) throw new InvalidOperationException("native_identity_receive_already_attempted");
                receiveAttempted = true;
                allowUnload = false;
                callInProgress = true;
                try { return receive(); }
                catch { corrupted = true; throw; }
                finally { callInProgress = false; }
            }
        }

        internal int Close(uint deviceId)
        {
            lock (gate)
            {
                CheckOwner(deviceId);
                if ((receiveAttempted || channelAttempted) && !channelCleanupConfirmed)
                    throw new InvalidOperationException("native_identity_receive_cleanup_unconfirmed");
                closeAttempted = true;
                int status;
                callInProgress = true;
                try { status = close(deviceId); }
                catch { throw new InvalidOperationException("native_identity_close_threw"); }
                finally { callInProgress = false; }
                if (status == 0) { ownedDevice = null; allowUnload = true; }
                return status;
            }
        }

        public void Dispose()
        {
            lock (gate)
            {
                if (disposed) return;
                if (callInProgress) throw new InvalidOperationException("native_identity_call_in_progress");
                disposed = true;
                try { ReferenceReleased = library.Release(allowUnload); }
                catch { throw new InvalidOperationException("native_library_release_failed"); }
                // Dispose never invokes Close or assumes an uncertain device was released.
            }
        }
    }
}
