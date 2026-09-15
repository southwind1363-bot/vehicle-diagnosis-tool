// Development executable only. Reads a selected file; never loads its code.
// WTD_CHOICE_FILE checks embedded signatures, not catalog membership.
using System;
using System.IO;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Text.RegularExpressions;

// Resolve OS verification APIs only from the Windows system directory.
// This does not authorize loading the file being inspected.
[assembly: DefaultDllImportSearchPaths(DllImportSearchPath.System32)]

internal static class DevelopmentSignatureProbe
{
    [StructLayout(LayoutKind.Sequential)]
    private struct FileInfoNative
    {
        public uint Size;
        public IntPtr Path, Handle, KnownSubject;
    }
    [StructLayout(LayoutKind.Sequential)]
    private struct TrustData
    {
        public uint Size;
        public IntPtr Policy, Sip;
        public uint Ui, Revocation, Choice;
        public IntPtr File;
        public uint StateAction;
        public IntPtr State, Url;
        public uint Flags, Context;
        public IntPtr SignatureSettings;
    }
    [DllImport("wintrust.dll", ExactSpelling = true, CallingConvention = CallingConvention.Winapi)]
    private static extern int WinVerifyTrust(IntPtr window, ref Guid action, ref TrustData data);
    [DllImport("wintrust.dll", ExactSpelling = true)]
    private static extern IntPtr WTHelperProvDataFromStateData(IntPtr state);
    [DllImport("wintrust.dll", ExactSpelling = true)]
    private static extern IntPtr WTHelperGetProvSignerFromChain(IntPtr provider, uint signer,
        [MarshalAs(UnmanagedType.Bool)] bool counterSigner, uint counterIndex);
    [DllImport("wintrust.dll", ExactSpelling = true)]
    private static extern IntPtr WTHelperGetProvCertFromChain(IntPtr signer, uint certificate);

    [StructLayout(LayoutKind.Sequential)]
    internal struct ProviderCertificatePrefix
    {
        public uint Size;
        public IntPtr Certificate;
    }
    [StructLayout(LayoutKind.Sequential)]
    internal struct CertificateContext
    {
        public uint Encoding;
        public IntPtr Encoded;
        public uint EncodedSize;
        public IntPtr Info, Store;
    }
    // Only called with provider-owned memory before WTD_STATEACTION_CLOSE.
    // Copies bounded DER bytes; never retains a provider pointer or certificate subject.
    internal static string HashProviderCertificate(IntPtr providerCertificate)
    {
        if (providerCertificate == IntPtr.Zero) throw new InvalidDataException();
        if (unchecked((uint)Marshal.ReadInt32(providerCertificate)) < Marshal.SizeOf(typeof(ProviderCertificatePrefix)))
            throw new InvalidDataException();
        var prefix = (ProviderCertificatePrefix)Marshal.PtrToStructure(providerCertificate, typeof(ProviderCertificatePrefix));
        if (prefix.Certificate == IntPtr.Zero) throw new InvalidDataException();
        var context = (CertificateContext)Marshal.PtrToStructure(prefix.Certificate, typeof(CertificateContext));
        if ((context.Encoding & 1) == 0 || context.Encoded == IntPtr.Zero
            || context.EncodedSize < 1 || context.EncodedSize > 65536) throw new InvalidDataException();
        var bytes = new byte[(int)context.EncodedSize];
        Marshal.Copy(context.Encoded, bytes, 0, bytes.Length);
        using (var sha = SHA256.Create())
            return BitConverter.ToString(sha.ComputeHash(bytes)).Replace("-", "");
    }

    private static string SignerHash(IntPtr state)
    {
        if (state == IntPtr.Zero) throw new InvalidDataException();
        IntPtr provider = WTHelperProvDataFromStateData(state);
        if (provider == IntPtr.Zero) throw new InvalidDataException();
        IntPtr signer = WTHelperGetProvSignerFromChain(provider, 0, false, 0);
        if (signer == IntPtr.Zero) throw new InvalidDataException();
        return HashProviderCertificate(WTHelperGetProvCertFromChain(signer, 0));
    }

    private static string Hash(Stream stream)
    {
        stream.Position = 0;
        using (var sha = SHA256.Create())
            return BitConverter.ToString(sha.ComputeHash(stream)).Replace("-", "");
    }
    private static int Main(string[] args)
    {
        try
        {
            if (args.Length != 2 || !Regex.IsMatch(args[1], "\\A[0-9A-Fa-f]{64}\\z")) throw new InvalidDataException();
            string path = args[0];
            if (!System.IO.Path.IsPathRooted(path) || path.StartsWith(@"\\")
                || path != System.IO.Path.GetFullPath(path)) throw new InvalidDataException();
            var info = new FileInfo(path);
            if (!info.Exists || info.Length < 1 || info.Length > 67108864) throw new InvalidDataException();
            if ((info.Attributes & FileAttributes.ReparsePoint) != 0) throw new InvalidDataException();
            for (var dir = info.Directory; dir != null; dir = dir.Parent)
                if ((dir.Attributes & FileAttributes.ReparsePoint) != 0) throw new InvalidDataException();
            using (var stream = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.Read))
            {
                string digest = Hash(stream);
                if (digest != args[1].ToUpperInvariant()) throw new InvalidDataException();
                IntPtr name = Marshal.StringToCoTaskMemUni(path), file = IntPtr.Zero;
                int status;
                string signerHash = null;
                try
                {
                    var nativeFile = new FileInfoNative { Size = (uint)Marshal.SizeOf(typeof(FileInfoNative)),
                        Path = name, Handle = stream.SafeFileHandle.DangerousGetHandle() };
                    file = Marshal.AllocHGlobal(Marshal.SizeOf(typeof(FileInfoNative)));
                    Marshal.StructureToPtr(nativeFile, file, false);
                    var data = new TrustData { Size = (uint)Marshal.SizeOf(typeof(TrustData)), Ui = 2,
                        Choice = 1, File = file, StateAction = 1,
                        // Cache-only chain revocation checks; no online freshness claim.
                        Flags = 0x1000 | 0x80 | 0x2000 };
                    var action = new Guid("00AAC56B-CD44-11d0-8CC2-00C04FC295EE");
                    int closed = -1;
                    try
                    {
                        status = WinVerifyTrust(new IntPtr(-1), ref action, ref data);
                        if (status == 0) signerHash = SignerHash(data.State);
                    }
                    finally
                    {
                        data.StateAction = 2;
                        closed = WinVerifyTrust(new IntPtr(-1), ref action, ref data);
                    }
                    if (closed != 0) throw new InvalidDataException();
                }
                finally
                {
                    if (file != IntPtr.Zero) Marshal.FreeHGlobal(file);
                    Marshal.FreeCoTaskMem(name);
                }
                if (Hash(stream) != digest) throw new InvalidDataException();
                // Raw status only: zero is not a publisher identity or consent.
                Console.WriteLine("{\"observation_status\":\"observed_only\",\"wintrust_status\":\"0x"
                    + unchecked((uint)status).ToString("X8") + "\",\"file_sha256\":\"" + digest
                    + "\",\"signer_certificate_sha256\":" + (signerHash == null ? "null" : "\"" + signerHash + "\"")
                    + ",\"scope\":\"embedded_file\",\"cache_only\":true,\"publisher_verified\":false,"
                    + "\"dependency_closure_verified\":false,\"execution_enabled\":false}");
                return 0;
            }
        }
        catch
        {
            Console.WriteLine("{\"observation_status\":\"unverified\",\"publisher_verified\":false,"
                + "\"dependency_closure_verified\":false,\"execution_enabled\":false}");
            return 1;
        }
    }
}
