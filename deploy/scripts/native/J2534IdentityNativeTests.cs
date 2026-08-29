using System;
using System.Collections.Generic;
using System.IO;
using System.Runtime.InteropServices;
using System.Threading;
using System.Threading.Tasks;
using VehicleDiagnosis.Native;

internal sealed class MockIdentityLibrary : IIdentityLibrary
{
    internal J2534IdentityNative.OpenFunction Open;
    internal J2534IdentityNative.ReadVersionFunction Read;
    internal J2534IdentityNative.CloseFunction Close;
    internal readonly List<string> Exports = new List<string>();
    internal int Releases;
    internal bool AllowedUnload;
    internal string MissingExport;
    internal bool ResolveThrows, ReleaseThrows;
    public IntPtr Resolve(string name)
    {
        Exports.Add(name);
        if (ResolveThrows) throw new Exception("C:\\private\\driver.dll");
        if (name == MissingExport) return IntPtr.Zero;
        if (name == "PassThruOpen") return Marshal.GetFunctionPointerForDelegate(Open);
        if (name == "PassThruReadVersion") return Marshal.GetFunctionPointerForDelegate(Read);
        if (name == "PassThruClose") return Marshal.GetFunctionPointerForDelegate(Close);
        throw new Exception("Unexpected export");
    }
    public bool Release(bool allowUnload)
    {
        Releases++;
        AllowedUnload = allowUnload;
        if (ReleaseThrows) throw new Exception("C:\\private\\release.dll");
        return allowUnload;
    }
}

internal static class NativeIdentityTests
{
    private static int checks;
    private static void Check(bool value, string message)
    { if (!value) throw new Exception(message); checks++; }
    private static void Reject(Action action, string code)
    {
        try { action(); }
        catch (InvalidOperationException error) { Check(error.Message == code, "Unexpected safe failure: " + error.Message); return; }
        throw new Exception("Expected rejection: " + code);
    }
    private static void Write(IntPtr target, string value)
    {
        byte[] bytes = System.Text.Encoding.ASCII.GetBytes(value + "\0");
        Marshal.Copy(bytes, 0, target, bytes.Length);
    }
    private static MockIdentityLibrary Fixture(uint deviceId)
    {
        return new MockIdentityLibrary {
            Open = delegate(IntPtr name, out uint id) { Check(name == IntPtr.Zero, "Open name was not NULL"); id = deviceId; return 0; },
            Read = delegate(uint id, IntPtr firmware, IntPtr dll, IntPtr api) {
                Check(id == deviceId && firmware != dll && dll != api && firmware != api, "Read ID/buffer ownership changed");
                Write(firmware, "fixture-fw"); Write(dll, "fixture-dll"); Write(api, "04.04"); return 0;
            },
            Close = delegate(uint id) { Check(id == deviceId, "Close ID changed"); return 0; }
        };
    }
    private static void Run()
    {
        foreach (uint id in new uint[] { 0, 1, UInt32.MaxValue })
        {
            MockIdentityLibrary mock = Fixture(id);
            using (J2534IdentityNative binding = new J2534IdentityNative(mock))
            {
                Check(String.Join(",", mock.Exports) == "PassThruOpen,PassThruReadVersion,PassThruClose", "Unexpected export inventory");
                uint opened;
                Check(binding.Open(out opened) == 0 && opened == id, "Unsigned ID changed");
                NativeVersions versions = binding.ReadVersion(opened);
                Check(versions.Status == 0 && versions.Firmware.Length == 80 && versions.Dll.Length == 80 && versions.Api.Length == 80, "Wrong bounded version buffers");
                Check(versions.Api[0] == 48 && versions.Api[5] == 0 && versions.Api[6] == 0xA5, "Version data was silently padded or decoded");
                Check(binding.Close(opened) == 0, "Close failed");
            }
            Check(mock.Releases == 1 && mock.AllowedUnload, "Successful close did not release module reference");
            GC.KeepAlive(mock);
        }
        foreach (string missing in new string[] { "PassThruOpen", "PassThruReadVersion", "PassThruClose" })
        {
            MockIdentityLibrary mock = Fixture(0); mock.MissingExport = missing;
            Reject(delegate { new J2534IdentityNative(mock); }, "native_identity_binding_failed");
            Check(mock.Releases == 1 && mock.AllowedUnload, "Partial binding leaked acquired module reference");
        }
        MockIdentityLibrary brokenResolver = Fixture(0); brokenResolver.ResolveThrows = true; brokenResolver.ReleaseThrows = true;
        Reject(delegate { new J2534IdentityNative(brokenResolver); }, "native_identity_binding_failed");
        Check(brokenResolver.Releases == 1, "Binding failure retried module release");

        MockIdentityLibrary brokenRelease = Fixture(0); brokenRelease.ReleaseThrows = true;
        J2534IdentityNative brokenReleaseBinding = new J2534IdentityNative(brokenRelease);
        Reject(delegate { brokenReleaseBinding.Dispose(); }, "native_library_release_failed");
        brokenReleaseBinding.Dispose();
        Check(brokenRelease.Releases == 1 && !brokenReleaseBinding.ReferenceReleased, "Failed release was retried or confirmed");

        foreach (string stage in new string[] { "open", "read", "close" })
        foreach (bool throws in new bool[] { false, true })
        {
            MockIdentityLibrary mock = Fixture(0);
            if (stage == "open") mock.Open = delegate(IntPtr name, out uint id) { id = 0; if (throws) throw new Exception("private"); return -7; };
            if (stage == "read") mock.Read = delegate(uint id, IntPtr f, IntPtr d, IntPtr a) { if (throws) throw new Exception("private"); return -7; };
            if (stage == "close") mock.Close = delegate(uint id) { if (throws) throw new Exception("private"); return -7; };
            J2534IdentityNative binding = new J2534IdentityNative(mock);
            uint opened = 0;
            if (stage == "open")
            {
                if (throws) Reject(delegate { binding.Open(out opened); }, "native_identity_open_threw");
                else Check(binding.Open(out opened) == -7, "Open status was lost");
                Reject(delegate { binding.Open(out opened); }, "native_identity_open_already_attempted");
                Reject(delegate { binding.Close(0); }, "native_identity_device_not_owned");
            }
            else
            {
                binding.Open(out opened);
                if (stage == "read")
                {
                    if (throws) Reject(delegate { binding.ReadVersion(opened); }, "native_identity_read_threw");
                    else { NativeVersions failed = binding.ReadVersion(opened); Check(failed.Status == -7 && failed.Firmware == null && failed.Dll == null && failed.Api == null, "Failed read exposed buffer contents"); }
                    Check(binding.Close(opened) == 0, "Read failure prevented explicit Close");
                }
                else
                {
                    if (throws) Reject(delegate { binding.Close(opened); }, "native_identity_close_threw");
                    else Check(binding.Close(opened) == -7, "Close failure was lost");
                    Reject(delegate { binding.Close(opened); }, "native_identity_device_not_owned");
                }
            }
            binding.Dispose(); binding.Dispose();
            bool permitted = stage == "read" || (stage == "open" && !throws);
            Check(mock.Releases == 1 && mock.AllowedUnload == permitted && binding.ReferenceReleased == permitted, "Uncertain ownership released DLL or retried cleanup");
            GC.KeepAlive(mock);
        }
        foreach (int offset in new int[] { -1, 80 })
        foreach (int target in new int[] { 0, 1, 2 })
        foreach (bool throws in new bool[] { false, true })
        {
            MockIdentityLibrary mock = Fixture(0);
            int closes = 0;
            mock.Close = delegate { closes++; return 0; };
            mock.Read = delegate(uint id, IntPtr f, IntPtr d, IntPtr a) {
                Marshal.WriteByte(new IntPtr[] { f, d, a }[target], offset, 0);
                if (throws) throw new Exception("private");
                return 0;
            };
            using (J2534IdentityNative binding = new J2534IdentityNative(mock))
            {
                uint id; binding.Open(out id);
                Reject(delegate { binding.ReadVersion(id); }, "native_version_buffer_overrun");
                Reject(delegate { binding.Close(id); }, "native_identity_corrupted");
                Reject(delegate { binding.ReadVersion(id); }, "native_identity_corrupted");
                Reject(delegate { binding.Open(out id); }, "native_identity_corrupted");
            }
            Check(closes == 0 && mock.Releases == 1 && !mock.AllowedUnload, "Corrupted driver was called or unloaded");
        }

        foreach (string stage in new string[] { "open", "read", "close" })
        {
            MockIdentityLibrary mock = Fixture(0);
            J2534IdentityNative binding = null;
            Action reenter = delegate {
                uint id;
                Reject(delegate { binding.Open(out id); }, "native_identity_call_in_progress");
                Reject(delegate { binding.ReadVersion(0); }, "native_identity_call_in_progress");
                Reject(delegate { binding.Close(0); }, "native_identity_call_in_progress");
                Reject(delegate { binding.Dispose(); }, "native_identity_call_in_progress");
                Check(mock.Releases == 0, "Reentrant Dispose released the library");
            };
            if (stage == "open") mock.Open = delegate(IntPtr name, out uint id) { reenter(); id = 0; return 0; };
            if (stage == "read") mock.Read = delegate { reenter(); return 7; };
            if (stage == "close") mock.Close = delegate { reenter(); return 0; };
            using (binding = new J2534IdentityNative(mock))
            {
                uint id; Check(binding.Open(out id) == 0, "Open failed after rejected reentrancy");
                Check(binding.ReadVersion(id).Status == (stage == "read" ? 7 : 0), "Read failed after rejected reentrancy");
                Check(binding.Close(id) == 0, "Close failed after rejected reentrancy");
            }
            Check(mock.Releases == 1 && mock.AllowedUnload, "Outer lifecycle failed after rejected reentrancy");
        }
        MockIdentityLibrary unwritten = Fixture(0); unwritten.Read = delegate { return 0; };
        using (J2534IdentityNative binding = new J2534IdentityNative(unwritten))
        {
            Reject(delegate { binding.ReadVersion(0); }, "native_identity_device_not_owned");
            uint id; binding.Open(out id);
            Reject(delegate { binding.ReadVersion(1); }, "native_identity_device_not_owned");
            Check(Array.TrueForAll(binding.ReadVersion(id).Api, delegate(byte value) { return value == 0xA5; }), "Unwritten response became a fabricated empty string");
            Reject(delegate { binding.ReadVersion(id); }, "native_identity_read_already_attempted");
            Reject(delegate { binding.Close(1); }, "native_identity_device_not_owned");
            binding.Close(id);
        }
        MockIdentityLibrary abandoned = Fixture(0);
        J2534IdentityNative abandonedBinding = new J2534IdentityNative(abandoned);
        uint abandonedId; abandonedBinding.Open(out abandonedId); abandonedBinding.Dispose();
        Check(!abandoned.AllowedUnload && !abandonedBinding.ReferenceReleased, "Dispose silently closed or unloaded an owned device");
        try { abandonedBinding.Close(abandonedId); throw new Exception("Disposed binding accepted Close"); }
        catch (ObjectDisposedException) { checks++; }

        MockIdentityLibrary blocked = Fixture(0);
        using (ManualResetEvent entered = new ManualResetEvent(false))
        using (ManualResetEvent release = new ManualResetEvent(false))
        {
            blocked.Read = delegate { entered.Set(); if (!release.WaitOne(3000)) throw new Exception("test deadline"); return 7; };
            J2534IdentityNative binding = new J2534IdentityNative(blocked);
            uint id; binding.Open(out id);
            Task reading = Task.Run(delegate { binding.ReadVersion(id); });
            Check(entered.WaitOne(3000), "Read fixture did not enter");
            Task disposing = Task.Run(delegate { binding.Dispose(); });
            Check(!disposing.Wait(50) && blocked.Releases == 0, "Dispose released module during an active call");
            release.Set(); Task.WaitAll(reading, disposing);
            Check(!blocked.AllowedUnload, "Unclosed device was unloaded after pending read");
        }
        foreach (string path in new string[] { null, "version.dll", "C:version.dll", "\\\\server\\share\\driver.dll", "\\\\?\\C:\\driver.dll", "C:\\driver.dll:stream", "C:/driver.dll", "C:\\..\\driver.dll", "C:\\missing-driver.dll", "C:\\driver.exe" })
            Reject(delegate { WindowsIdentityLibrary.Load(path); }, "native_library_path_rejected");
        WindowsIdentityLibrary systemLibrary = WindowsIdentityLibrary.Load(Path.Combine(Environment.SystemDirectory, "version.dll"));
        Reject(delegate { new J2534IdentityNative(systemLibrary); }, "native_identity_binding_failed");
        Check(systemLibrary.ReferenceReleased, "Missing system-DLL exports did not release our library reference");
    }
    public static int Main(string[] args)
    {
        if (args.Length != 1 || args[0] != "--self-test") return 2;
        try { Run(); Console.WriteLine("Native identity binding checks: " + checks + " / bitness: " + (IntPtr.Size * 8) + " / vendor DLL executed: false / Errors: 0"); return 0; }
        catch (Exception error) { Console.Error.WriteLine(error.Message); return 1; }
    }
}
