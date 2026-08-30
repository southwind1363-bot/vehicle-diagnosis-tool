using System;
using System.IO;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Text;
using Microsoft.Win32.SafeHandles;

namespace VehicleDiagnosis.Native
{
    internal sealed class RegisteredDriverPreflightResult
    {
        internal string Status = "rejected";
        internal string[] Blockers = new string[0];
        internal bool FixedDriveVerified, FinalPathMatches, FileIdentityStable;
        internal bool Sha256Matches, SizeMatches, ArchitectureMatches, RuntimeArchitectureMatches;
        internal bool DllLoadAttempted = false;
        internal bool GetProcAddressAttempted = false;
        internal bool PassThruOpenAttempted = false;
        internal bool VehicleConnectionAttempted = false;
        internal bool VehicleCommunicationStarted = false;
        internal bool WouldTransmit = false;
        internal bool VehicleCommandEnabled = false;
        internal bool ExecutionEnabled = false;
    }

    internal static class J2534RegisteredDriverPreflight
    {
#if PREFLIGHT_FIXTURE_TESTS
        internal static Action<string> FixtureHandleVerified;
        internal static bool FixtureIdentityMutationRejected()
        {
            ByHandleFileInformation left = new ByHandleFileInformation();
            left.VolumeSerialNumber = 1; left.FileIndexLow = 2; left.FileSizeLow = 3; left.LastWriteTime.Low = 4;
            ByHandleFileInformation right = left;
            right.FileIndexLow = 5;
            return !SameIdentity(left, right);
        }
        internal static bool FixtureFileId128MutationRejected()
        {
            FileIdInformation left = new FileIdInformation { VolumeSerialNumber = 1, FileId = new byte[16] };
            left.FileId[15] = 2;
            FileIdInformation right = new FileIdInformation {
                VolumeSerialNumber = left.VolumeSerialNumber,
                FileId = (byte[])left.FileId.Clone()
            };
            right.FileId[15] = 3;
            return !SameFileId(left, right);
        }
#endif
        private const long MaximumFileSize = 64L * 1024L * 1024L;
        private const uint GenericRead = 0x80000000;
        private const uint FileShareRead = 0x00000001;
        private const uint OpenExisting = 3;
        private const uint FileAttributeNormal = 0x00000080;
        private const uint FileAttributeDirectory = 0x00000010;
        private const uint FileAttributeReparsePoint = 0x00000400;
        private const uint FileFlagOpenReparsePoint = 0x00200000;
        private const uint FileFlagSequentialScan = 0x08000000;
        private const uint DriveFixed = 3;
        private const uint VolumeNameDos = 0;
        private const uint VolumeNameGuid = 1;

        [StructLayout(LayoutKind.Sequential)]
        private struct NativeFileTime
        {
            internal uint Low;
            internal uint High;
        }

        [StructLayout(LayoutKind.Sequential)]
        private struct ByHandleFileInformation
        {
            internal uint FileAttributes;
            internal NativeFileTime CreationTime;
            internal NativeFileTime LastAccessTime;
            internal NativeFileTime LastWriteTime;
            internal uint VolumeSerialNumber;
            internal uint FileSizeHigh;
            internal uint FileSizeLow;
            internal uint NumberOfLinks;
            internal uint FileIndexHigh;
            internal uint FileIndexLow;
        }

        [StructLayout(LayoutKind.Sequential)]
        private struct FileIdInformation
        {
            internal ulong VolumeSerialNumber;
            [MarshalAs(UnmanagedType.ByValArray, SizeConst = 16)]
            internal byte[] FileId;
        }

        private sealed class Rejected : Exception
        {
            internal readonly string Code;
            internal Rejected(string code) { Code = code; }
        }

        [DllImport("kernel32.dll", CharSet = CharSet.Unicode, ExactSpelling = true, SetLastError = true)]
        private static extern SafeFileHandle CreateFileW(string fileName, uint desiredAccess, uint shareMode,
            IntPtr securityAttributes, uint creationDisposition, uint flagsAndAttributes, IntPtr templateFile);
        [DllImport("kernel32.dll", CharSet = CharSet.Unicode, ExactSpelling = true, SetLastError = true)]
        private static extern uint GetFinalPathNameByHandleW(SafeFileHandle file, StringBuilder filePath,
            uint filePathLength, uint flags);
        [DllImport("kernel32.dll", ExactSpelling = true, SetLastError = true)]
        [return: MarshalAs(UnmanagedType.Bool)]
        private static extern bool GetFileInformationByHandle(SafeFileHandle file, out ByHandleFileInformation information);
        [DllImport("kernel32.dll", ExactSpelling = true, SetLastError = true)]
        [return: MarshalAs(UnmanagedType.Bool)]
        private static extern bool GetFileInformationByHandleEx(SafeFileHandle file, int fileInformationClass,
            out FileIdInformation fileInformation, uint bufferSize);
        [DllImport("kernel32.dll", CharSet = CharSet.Unicode, ExactSpelling = true)]
        private static extern uint GetDriveTypeW(string rootPathName);

        internal static RegisteredDriverPreflightResult Verify(string privatePath, string expectedSha256,
            long expectedSize, string expectedArchitecture)
        {
            RegisteredDriverPreflightResult result = new RegisteredDriverPreflightResult();
            try
            {
                string canonicalPath = ValidateInputs(privatePath, expectedSha256, expectedSize, expectedArchitecture);
                using (SafeFileHandle handle = CreateFileW(canonicalPath, GenericRead, FileShareRead, IntPtr.Zero,
                    OpenExisting, FileAttributeNormal | FileFlagOpenReparsePoint | FileFlagSequentialScan, IntPtr.Zero))
                {
                    if (handle == null || handle.IsInvalid) throw new Rejected("native_file_open_failed");
                    ByHandleFileInformation before = GetInformation(handle);
                    FileIdInformation beforeFileId = GetFileIdInformation(handle);
                    if ((before.FileAttributes & (FileAttributeDirectory | FileAttributeReparsePoint)) != 0)
                        throw new Rejected("native_file_type_rejected");
                    long size = FileSize(before);
                    if (size <= 0 || size > MaximumFileSize) throw new Rejected(size > MaximumFileSize
                        ? "native_file_too_large" : "native_file_empty");

                    string finalDosPath = StripDosPrefix(GetFinalPath(handle, VolumeNameDos));
                    if (!String.Equals(finalDosPath, canonicalPath, StringComparison.OrdinalIgnoreCase))
                        throw new Rejected("native_final_path_mismatch");
                    result.FinalPathMatches = true;

                    string volumeRoot = GetVolumeGuidRoot(GetFinalPath(handle, VolumeNameGuid));
                    if (GetDriveTypeW(volumeRoot) != DriveFixed) throw new Rejected("native_drive_not_fixed");
                    result.FixedDriveVerified = true;

                    string actualSha256;
                    string actualArchitecture;
                    using (SafeFileHandle borrowedHandle = new SafeFileHandle(handle.DangerousGetHandle(), false))
                    using (FileStream stream = new FileStream(borrowedHandle, FileAccess.Read, 65536, false))
                    {
                        actualArchitecture = ReadPeArchitecture(stream);
                        stream.Position = 0;
                        using (SHA256 sha256 = SHA256.Create())
                            actualSha256 = ToHex(sha256.ComputeHash(stream));
                        ByHandleFileInformation after = GetInformation(handle);
                        FileIdInformation afterFileId = GetFileIdInformation(handle);
                        if (!SameIdentity(before, after) || !SameFileId(beforeFileId, afterFileId))
                            throw new Rejected("native_file_identity_changed");
                        result.FileIdentityStable = true;
                    }

                    result.SizeMatches = size == expectedSize;
                    if (!result.SizeMatches) throw new Rejected("native_file_size_mismatch");
                    result.Sha256Matches = String.Equals(actualSha256, expectedSha256, StringComparison.Ordinal);
                    if (!result.Sha256Matches) throw new Rejected("native_file_sha256_mismatch");
                    result.ArchitectureMatches = String.Equals(actualArchitecture, expectedArchitecture, StringComparison.Ordinal);
                    if (!result.ArchitectureMatches) throw new Rejected("native_file_architecture_mismatch");
                    string runtimeArchitecture = IntPtr.Size == 4 ? "x86" : "x64";
                    result.RuntimeArchitectureMatches = String.Equals(actualArchitecture, runtimeArchitecture, StringComparison.Ordinal);
                    if (!result.RuntimeArchitectureMatches) throw new Rejected("native_runtime_architecture_mismatch");
#if PREFLIGHT_FIXTURE_TESTS
                    if (FixtureHandleVerified != null) FixtureHandleVerified(canonicalPath);
#endif
                    result.Status = "verified_non_executable";
                    return result;
                }
            }
            catch (Rejected rejected)
            {
                result.Blockers = new string[] { rejected.Code };
                return result;
            }
            catch
            {
                result.Blockers = new string[] { "native_preflight_failed" };
                return result;
            }
        }

        private static string ValidateInputs(string filePath, string expectedSha256, long expectedSize, string expectedArchitecture)
        {
            if (String.IsNullOrEmpty(filePath) || filePath.Length < 4 || !Char.IsLetter(filePath[0])
                || filePath[1] != ':' || filePath[2] != '\\' || filePath.IndexOf('/') >= 0
                || filePath.IndexOf(':', 2) >= 0 || !filePath.EndsWith(".dll", StringComparison.OrdinalIgnoreCase))
                throw new Rejected("native_library_path_rejected");
            string fullPath;
            try { fullPath = Path.GetFullPath(filePath); }
            catch { throw new Rejected("native_library_path_rejected"); }
            if (!String.Equals(fullPath, filePath, StringComparison.OrdinalIgnoreCase))
                throw new Rejected("native_library_path_rejected");
            if (String.IsNullOrEmpty(expectedSha256) || expectedSha256.Length != 64)
                throw new Rejected("native_expected_sha256_rejected");
            for (int i = 0; i < expectedSha256.Length; i++)
                if (!((expectedSha256[i] >= '0' && expectedSha256[i] <= '9')
                    || (expectedSha256[i] >= 'a' && expectedSha256[i] <= 'f')))
                    throw new Rejected("native_expected_sha256_rejected");
            if (expectedSize <= 0 || expectedSize > MaximumFileSize)
                throw new Rejected("native_expected_size_rejected");
            if (expectedArchitecture != "x86" && expectedArchitecture != "x64")
                throw new Rejected("native_expected_architecture_rejected");
            return fullPath;
        }

        private static ByHandleFileInformation GetInformation(SafeFileHandle handle)
        {
            ByHandleFileInformation information;
            if (!GetFileInformationByHandle(handle, out information)) throw new Rejected("native_file_information_failed");
            return information;
        }

        private static FileIdInformation GetFileIdInformation(SafeFileHandle handle)
        {
            FileIdInformation information;
            uint size = checked((uint)Marshal.SizeOf(typeof(FileIdInformation)));
            if (!GetFileInformationByHandleEx(handle, 18, out information, size)
                || information.FileId == null || information.FileId.Length != 16)
                throw new Rejected("native_file_id_information_failed");
            return information;
        }

        private static string GetFinalPath(SafeFileHandle handle, uint flags)
        {
            StringBuilder buffer = new StringBuilder(1024);
            uint length = GetFinalPathNameByHandleW(handle, buffer, (uint)buffer.Capacity, flags);
            if (length == 0 || length > 32767) throw new Rejected("native_final_path_failed");
            if (length >= buffer.Capacity)
            {
                buffer = new StringBuilder((int)length + 1);
                length = GetFinalPathNameByHandleW(handle, buffer, (uint)buffer.Capacity, flags);
                if (length == 0 || length >= buffer.Capacity) throw new Rejected("native_final_path_failed");
            }
            return buffer.ToString();
        }

        private static string StripDosPrefix(string path)
        {
            if (path == null || !path.StartsWith("\\\\?\\", StringComparison.Ordinal)
                || path.StartsWith("\\\\?\\UNC\\", StringComparison.OrdinalIgnoreCase))
                throw new Rejected("native_final_path_failed");
            return path.Substring(4);
        }

        private static string GetVolumeGuidRoot(string path)
        {
            const string prefix = "\\\\?\\Volume{";
            if (path == null || !path.StartsWith(prefix, StringComparison.OrdinalIgnoreCase))
                throw new Rejected("native_volume_path_failed");
            int closingBrace = path.IndexOf('}', prefix.Length);
            if (closingBrace < 0 || closingBrace + 1 >= path.Length || path[closingBrace + 1] != '\\')
                throw new Rejected("native_volume_path_failed");
            return path.Substring(0, closingBrace + 2);
        }

        private static long FileSize(ByHandleFileInformation value)
        {
            ulong size = ((ulong)value.FileSizeHigh << 32) | value.FileSizeLow;
            if (size > Int64.MaxValue) throw new Rejected("native_file_too_large");
            return (long)size;
        }

        private static bool SameIdentity(ByHandleFileInformation left, ByHandleFileInformation right)
        {
            return left.VolumeSerialNumber == right.VolumeSerialNumber
                && left.FileIndexHigh == right.FileIndexHigh && left.FileIndexLow == right.FileIndexLow
                && left.FileSizeHigh == right.FileSizeHigh && left.FileSizeLow == right.FileSizeLow
                && left.LastWriteTime.High == right.LastWriteTime.High
                && left.LastWriteTime.Low == right.LastWriteTime.Low;
        }

        private static bool SameFileId(FileIdInformation left, FileIdInformation right)
        {
            if (left.VolumeSerialNumber != right.VolumeSerialNumber || left.FileId == null || right.FileId == null
                || left.FileId.Length != 16 || right.FileId.Length != 16) return false;
            for (int index = 0; index < 16; index++)
                if (left.FileId[index] != right.FileId[index]) return false;
            return true;
        }

        private static string ReadPeArchitecture(FileStream stream)
        {
            byte[] header = new byte[4096];
            int count = 0;
            while (count < header.Length)
            {
                int read = stream.Read(header, count, header.Length - count);
                if (read == 0) break;
                count += read;
            }
            if (count < 64 || header[0] != 0x4d || header[1] != 0x5a)
                throw new Rejected("native_file_invalid_pe");
            int peOffset = BitConverter.ToInt32(header, 0x3c);
            if (peOffset < 64 || peOffset + 6 > count || BitConverter.ToUInt32(header, peOffset) != 0x00004550)
                throw new Rejected("native_file_invalid_pe");
            ushort machine = BitConverter.ToUInt16(header, peOffset + 4);
            if (machine == 0x014c) return "x86";
            if (machine == 0x8664) return "x64";
            throw new Rejected("native_file_architecture_unknown");
        }

        private static string ToHex(byte[] bytes)
        {
            StringBuilder value = new StringBuilder(bytes.Length * 2);
            for (int i = 0; i < bytes.Length; i++) value.Append(bytes[i].ToString("x2"));
            return value.ToString();
        }
    }
}
