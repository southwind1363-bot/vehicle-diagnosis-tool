#if J2534_DTC_DEVELOPMENT
using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Runtime.InteropServices;
using System.Security.Cryptography;

namespace VehicleDiagnosis.Native
{
    // Immutable handoff from a trusted selector, not proof of trust or permission.
    // Construction performs no file access, loading, or vehicle operation.
    internal sealed class J2534DtcReadSelection
    {
        internal readonly string Path, Sha256, Architecture;
        internal readonly long Size;
        internal readonly uint RequestEcu;
        internal readonly byte Service;

        internal J2534DtcReadSelection(string path, string sha256, long size, string architecture, uint requestEcu, uint service)
        {
            bool validPath = false;
            try {
                validPath = path != null && path.Length > 3 && Char.IsLetter(path[0]) && path[1] == ':' && path[2] == '\\'
                    && String.Equals(System.IO.Path.GetFullPath(path), path, StringComparison.Ordinal);
            } catch { }
            bool validHash = sha256 != null && sha256.Length == 64;
            if (validHash) foreach (char digit in sha256)
                if (!((digit >= '0' && digit <= '9') || (digit >= 'a' && digit <= 'f') || (digit >= 'A' && digit <= 'F'))) validHash = false;
            if (!validPath || !validHash || size <= 0 || (architecture != "x86" && architecture != "x64")
                || requestEcu < 0x7e0 || requestEcu > 0x7e7 || (service != 3 && service != 7 && service != 10))
                throw new InvalidOperationException("native_dtc_selection_invalid");
            Path = path; Sha256 = sha256.ToUpperInvariant(); Size = size; Architecture = architecture;
            RequestEcu = requestEcu; Service = (byte)service;
        }

        // Compare an IPC handoff to an independently pinned selection. Never
        // construct trust from the arguments or perform I/O while matching.
        internal bool MatchesArguments(string[] args, int offset)
        {
            if (args == null || offset < 0 || offset > args.Length || args.Length - offset != 6) return false;
            long size; uint ecu; uint service;
            return Int64.TryParse(args[offset + 2], NumberStyles.None, CultureInfo.InvariantCulture, out size)
                && UInt32.TryParse(args[offset + 4], NumberStyles.None, CultureInfo.InvariantCulture, out ecu)
                && UInt32.TryParse(args[offset + 5], NumberStyles.None, CultureInfo.InvariantCulture, out service)
                && args[offset] == Path && String.Equals(args[offset + 1], Sha256, StringComparison.OrdinalIgnoreCase)
                && size == Size && args[offset + 3] == Architecture && ecu == RequestEcu && service == Service;
        }
    }

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
#if NATIVE_RECEIVE_FIXTURE_TESTS
        internal static Action FixtureBeforeLoad { get; set; }
#endif

        [DllImport("kernel32.dll", CharSet = CharSet.Unicode, ExactSpelling = true)]
        private static extern IntPtr LoadLibraryExW(string path, IntPtr file, uint flags);
        [DllImport("kernel32.dll", CharSet = CharSet.Ansi, ExactSpelling = true)]
        private static extern IntPtr GetProcAddress(IntPtr library, string name);
        [DllImport("kernel32.dll", ExactSpelling = true)]
        [return: MarshalAs(UnmanagedType.Bool)]
        private static extern bool FreeLibrary(IntPtr library);

        // Conservative development gate: imported dependencies have no approved
        // identity policy yet. An empty table is NOT proof of trustworthy code
        // (runtime loading remains separate). Initialization entry
        // points and TLS are rejected too; this is not a code sandbox.
        internal static void RequireNoDeclaredDependencies(Stream file)
        {
            long original = file.Position;
            try {
                using (var reader = new BinaryReader(file, System.Text.Encoding.UTF8, true)) {
                    if (file.Length < 64) throw new InvalidOperationException();
                    file.Position = 0;
                    if (reader.ReadUInt16() != 0x5a4d) throw new InvalidOperationException();
                    file.Position = 60;
                    long pe = reader.ReadUInt32();
                    if (pe < 64 || pe > file.Length - 24) throw new InvalidOperationException();
                    file.Position = pe;
                    if (reader.ReadUInt32() != 0x4550) throw new InvalidOperationException();
                    file.Position = pe + 20;
                    int optionalSize = reader.ReadUInt16();
                    long optional = pe + 24;
                    if (optionalSize < 2 || optionalSize > file.Length - optional) throw new InvalidOperationException();
                    file.Position = optional;
                    int magic = reader.ReadUInt16();
                    int directories = magic == 0x10b ? 96 : magic == 0x20b ? 112 : -1;
                    if (directories < 0 || optionalSize < directories + 16 * 8) throw new InvalidOperationException();
                    file.Position = optional + 16; // AddressOfEntryPoint, PE32 and PE32+.
                    if (reader.ReadUInt32() != 0) throw new InvalidOperationException();
                    file.Position = optional + directories - 4;
                    if (reader.ReadUInt32() != 16) throw new InvalidOperationException();
                    // Import, TLS, bound import, IAT, delay import and CLR directories.
                    foreach (int index in new int[] { 1, 9, 11, 12, 13, 14 }) {
                        file.Position = optional + directories + index * 8;
                        uint address = reader.ReadUInt32(), size = reader.ReadUInt32();
                        if (address != 0 || size != 0) throw new InvalidOperationException();
                    }
                    file.Position = pe + 6;
                    int sectionCount = reader.ReadUInt16();
                    long sectionTable = optional + optionalSize;
                    if (sectionCount < 1 || sectionCount > 96 || sectionTable + sectionCount * 40 > file.Length)
                        throw new InvalidOperationException();
                    file.Position = optional + directories;
                    uint exportRva = reader.ReadUInt32(), exportSize = reader.ReadUInt32();
                    if (exportRva == 0 || exportSize < 40 || (ulong)exportRva + exportSize > 0x100000000UL)
                        throw new InvalidOperationException();
                    long exportOffset = MapDeclaredRva(reader, sectionTable, sectionCount, exportRva, exportSize);
                    file.Position = exportOffset + 20;
                    uint functionCount = reader.ReadUInt32();
                    if (functionCount == 0 || functionCount > 4096) throw new InvalidOperationException();
                    file.Position = exportOffset + 28;
                    uint functionsRva = reader.ReadUInt32();
                    long functionsOffset = MapDeclaredRva(reader, sectionTable, sectionCount, functionsRva, functionCount * 4);
                    file.Position = functionsOffset;
                    for (uint index = 0; index < functionCount; index++) {
                        uint functionRva = reader.ReadUInt32();
                        // An EAT entry inside the export directory is a forwarder.
                        if (functionRva >= exportRva && (ulong)functionRva < (ulong)exportRva + exportSize)
                            throw new InvalidOperationException();
                    }
                }
            } catch { throw new InvalidOperationException("native_dtc_dependencies_unverified"); }
            finally { file.Position = original; }
        }

        private static long MapDeclaredRva(BinaryReader reader, long sectionTable, int sectionCount, uint rva, uint length)
        {
            long found = -1;
            if (rva == 0 || length == 0 || (ulong)rva + length > 0x100000000UL) throw new InvalidOperationException();
            for (int index = 0; index < sectionCount; index++) {
                reader.BaseStream.Position = sectionTable + index * 40 + 8;
                uint virtualSize = reader.ReadUInt32(), address = reader.ReadUInt32();
                uint rawSize = reader.ReadUInt32(), rawOffset = reader.ReadUInt32();
                ulong span = Math.Max(virtualSize, rawSize);
                if ((ulong)rva < address + span && (ulong)address < (ulong)rva + length) {
                    if (found >= 0 || rva < address || (ulong)rva - address + length > rawSize
                        || rawOffset < sectionTable + sectionCount * 40
                        || (ulong)rawOffset + rawSize > (ulong)reader.BaseStream.Length) throw new InvalidOperationException();
                    found = (long)rawOffset + rva - address;
                }
            }
            if (found < 0) throw new InvalidOperationException();
            return found;
        }

        internal static WindowsDtcReadLibrary LoadSelected(J2534DtcReadSelection selection)
        {
            if (selection == null) throw new InvalidOperationException("native_dtc_selection_invalid");
            return LoadVerified(selection.Path, selection.Sha256, selection.Size, selection.Architecture);
        }

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
                    RequireNoDeclaredDependencies(file);
#if NATIVE_RECEIVE_FIXTURE_TESTS
                    if (FixtureBeforeLoad != null) FixtureBeforeLoad();
#endif
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
