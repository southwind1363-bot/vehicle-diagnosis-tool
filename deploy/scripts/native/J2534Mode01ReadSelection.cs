#if J2534_DTC_DEVELOPMENT && J2534_MODE01_DEVELOPMENT
using System;
using System.Globalization;

namespace VehicleDiagnosis.Native
{
    // Trusted internal metadata, not publisher approval or execution permission.
    // No file access is performed by construction or IPC comparison.
    internal sealed class J2534Mode01ReadSelection
    {
        internal readonly string Path, Sha256, Architecture;
        internal readonly long Size;
        internal readonly uint RequestEcu;
        internal readonly byte Pid;

        internal J2534Mode01ReadSelection(string path, string sha256, long size, string architecture, uint requestEcu, uint pid)
        {
            if (pid != 5 && pid != 12) throw new InvalidOperationException("native_mode01_selection_invalid");
            // Reuse metadata validation only; do not extend the DTC service allowlist.
            J2534DtcReadSelection metadata;
            try { metadata = new J2534DtcReadSelection(path, sha256, size, architecture, requestEcu, 3); }
            catch { throw new InvalidOperationException("native_mode01_selection_invalid"); }
            Path = metadata.Path; Sha256 = metadata.Sha256; Size = metadata.Size;
            Architecture = metadata.Architecture; RequestEcu = metadata.RequestEcu; Pid = (byte)pid;
        }

        internal bool MatchesArguments(string[] args, int offset)
        {
            if (args == null || offset < 0 || offset > args.Length || args.Length - offset != 6) return false;
            long size; uint ecu, pid;
            return Int64.TryParse(args[offset + 2], NumberStyles.None, CultureInfo.InvariantCulture, out size)
                && UInt32.TryParse(args[offset + 4], NumberStyles.None, CultureInfo.InvariantCulture, out ecu)
                && UInt32.TryParse(args[offset + 5], NumberStyles.None, CultureInfo.InvariantCulture, out pid)
                && args[offset] == Path && String.Equals(args[offset + 1], Sha256, StringComparison.OrdinalIgnoreCase)
                && size == Size && args[offset + 3] == Architecture && ecu == RequestEcu && pid == Pid;
        }

        // Caller must own the existing execution lease. No public launcher.
        internal WindowsDtcReadLibrary LoadVerified()
        {
            return WindowsDtcReadLibrary.LoadVerified(Path, Sha256, Size, Architecture);
        }
    }
}
#endif
