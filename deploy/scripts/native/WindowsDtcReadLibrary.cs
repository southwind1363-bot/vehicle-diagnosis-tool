#if J2534_DTC_DEVELOPMENT
using System;
using System.Collections.Generic;
using System.IO;
using System.Runtime.InteropServices;
using System.Security.Cryptography;

namespace VehicleDiagnosis.Native
{
    // Development binding only. No discovery, CLI or public execution route.
    // The caller must provide an independently verified digest and own the
    // isolated process. A matching digest is not publisher authentication.
    internal sealed class WindowsDtcReadLibrary : IIdentityLibrary
    {
        private readonly object gate = new object();
        private readonly Dictionary<string, IntPtr> exports = new Dictionary<string, IntPtr>(StringComparer.Ordinal);
        private IntPtr module;
        private bool released;
        internal bool Retained { get; private set; }

        [DllImport("kernel32.dll", CharSet = CharSet.Unicode, ExactSpelling = true)]
        private static extern IntPtr LoadLibraryExW(string path, IntPtr file, uint flags);
        [DllImport("kernel32.dll", CharSet = CharSet.Ansi, ExactSpelling = true)]
        private static extern IntPtr GetProcAddress(IntPtr library, string name);
        [DllImport("kernel32.dll", ExactSpelling = true)]
        [return: MarshalAs(UnmanagedType.Bool)]
        private static extern bool FreeLibrary(IntPtr library);

        internal static WindowsDtcReadLibrary LoadVerified(string path, string expectedDigest, long expectedSize, string architecture)
        {
            WindowsDtcReadLibrary library = null;
            var verification = J2534RegisteredDriverPreflight.VerifyWhileHandleHeld(path, expectedDigest == null ? null : expectedDigest.ToLowerInvariant(),
                expectedSize, architecture, delegate(string verifiedPath) {
                    library = Load(verifiedPath, expectedDigest.ToUpperInvariant());
                });
            if (verification.Status != "verified_non_executable" || library == null) {
                if (library != null) library.Release(true); // No PassThru operation has occurred.
                throw new InvalidOperationException("native_dtc_verified_binding_failed");
            }
            // Do not return preflight flags as execution evidence: the callback
            // loaded a module, although preflight itself is a non-executing check.
            return library;
        }

        private static WindowsDtcReadLibrary Load(string path, string expectedDigest)
        {
            if (expectedDigest == null || expectedDigest.Length != 64)
                throw new InvalidOperationException("native_dtc_digest_invalid");
            foreach (char c in expectedDigest)
                if (!((c >= '0' && c <= '9') || (c >= 'A' && c <= 'F')))
                    throw new InvalidOperationException("native_dtc_digest_invalid");
            var library = new WindowsDtcReadLibrary();
            try {
                string fullPath = WindowsIdentityLibrary.ValidatePath(path);
                // Keep replacement/write/delete denied through hashing, loading
                // and export binding. Never resolve a caller-supplied export.
                using (var file = new FileStream(fullPath, FileMode.Open, FileAccess.Read, FileShare.Read))
                using (var sha = SHA256.Create()) {
                    if (BitConverter.ToString(sha.ComputeHash(file)).Replace("-", "") != expectedDigest)
                        throw new InvalidOperationException();
                    library.module = LoadLibraryExW(fullPath, IntPtr.Zero, 0x00000900);
                    if (library.module == IntPtr.Zero) throw new InvalidOperationException();
                    foreach (string name in new string[] { "PassThruOpen", "PassThruReadVersion", "PassThruClose",
                        "PassThruConnect", "PassThruDisconnect", "PassThruReadMsgs",
                        "PassThruStartMsgFilter", "PassThruStopMsgFilter", "PassThruWriteMsgs" }) {
                        IntPtr address = GetProcAddress(library.module, name);
                        if (address == IntPtr.Zero) throw new InvalidOperationException();
                        library.exports.Add(name, address);
                    }
                }
                return library;
            } catch {
                // No PassThru call has occurred. Failure still ends this attempt.
                if (library.module != IntPtr.Zero) library.Release(true);
                throw new InvalidOperationException("native_dtc_binding_failed");
            }
        }

        public IntPtr Resolve(string name)
        {
            lock (gate) {
                if (released) throw new ObjectDisposedException("dtc_library");
                IntPtr address;
                if (name == null || !exports.TryGetValue(name, out address))
                    throw new InvalidOperationException("native_export_not_allowed");
                return address;
            }
        }

        public bool Release(bool allowUnload)
        {
            lock (gate) {
                if (released) return !Retained;
                released = true;
                Retained = !(allowUnload && FreeLibrary(module));
                module = IntPtr.Zero;
                exports.Clear();
                return !Retained;
            }
        }
    }
}
#endif
