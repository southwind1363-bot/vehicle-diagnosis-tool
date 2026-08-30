using System;
using System.Runtime.InteropServices;
using Microsoft.Win32.SafeHandles;

namespace VehicleDiagnosis.Native
{
    internal static class J2534AuthenticodeVerifier
    {
#if PREFLIGHT_FIXTURE_TESTS
        internal static string Verify(SafeFileHandle handle, string path)
        { return handle != null && !handle.IsInvalid && !String.IsNullOrEmpty(path) ? "verified_fixture_only" : "not_trusted"; }
#else
        private const uint WtdUiNone = 2;
        private const uint WtdRevokeNone = 0;
        private const uint WtdChoiceFile = 1;
        private const uint WtdStateActionVerify = 1;
        private const uint WtdStateActionClose = 2;
        private const uint WtdCacheOnlyUrlRetrieval = 0x1000;
        private const uint WtdDisableMd2Md4 = 0x2000;
        private static readonly Guid GenericVerifyV2 = new Guid("00AAC56B-CD44-11d0-8CC2-00C04FC295EE");

        [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
        private struct WinTrustFileInfo
        {
            internal uint StructSize;
            [MarshalAs(UnmanagedType.LPWStr)] internal string FilePath;
            internal IntPtr FileHandle;
            internal IntPtr KnownSubject;
        }

        [StructLayout(LayoutKind.Sequential)]
        private struct WinTrustData
        {
            internal uint StructSize;
            internal IntPtr PolicyCallbackData;
            internal IntPtr SipClientData;
            internal uint UiChoice;
            internal uint RevocationChecks;
            internal uint UnionChoice;
            internal IntPtr InfoStruct;
            internal uint StateAction;
            internal IntPtr StateData;
            internal IntPtr UrlReference;
            internal uint ProviderFlags;
            internal uint UiContext;
            internal IntPtr SignatureSettings;
        }

        [DllImport("wintrust.dll", ExactSpelling = true, SetLastError = true)]
        private static extern int WinVerifyTrust(IntPtr window, ref Guid action, ref WinTrustData data);

        internal static string Verify(SafeFileHandle handle, string path)
        {
            if (handle == null || handle.IsInvalid || String.IsNullOrEmpty(path)) return "not_trusted";
            WinTrustFileInfo info = new WinTrustFileInfo {
                StructSize = (uint)Marshal.SizeOf(typeof(WinTrustFileInfo)), FilePath = path,
                FileHandle = handle.DangerousGetHandle(), KnownSubject = IntPtr.Zero
            };
            IntPtr pointer = Marshal.AllocHGlobal(Marshal.SizeOf(typeof(WinTrustFileInfo)));
            try
            {
                Marshal.StructureToPtr(info, pointer, false);
                WinTrustData data = new WinTrustData {
                    StructSize = (uint)Marshal.SizeOf(typeof(WinTrustData)), UiChoice = WtdUiNone,
                    RevocationChecks = WtdRevokeNone, UnionChoice = WtdChoiceFile, InfoStruct = pointer,
                    StateAction = WtdStateActionVerify, ProviderFlags = WtdCacheOnlyUrlRetrieval | WtdDisableMd2Md4
                };
                Guid action = GenericVerifyV2;
                int status = WinVerifyTrust(new IntPtr(-1), ref action, ref data);
                data.StateAction = WtdStateActionClose;
                WinVerifyTrust(new IntPtr(-1), ref action, ref data);
                return status == 0 ? "verified_file_policy" : "not_trusted";
            }
            finally
            {
                Marshal.DestroyStructure(pointer, typeof(WinTrustFileInfo));
                Marshal.FreeHGlobal(pointer);
            }
        }
#endif
    }
}