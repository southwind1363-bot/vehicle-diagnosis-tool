// Artificial native memory, not a signed certificate or trusted publisher.
using System;
using System.IO;
using System.Runtime.InteropServices;
internal static class SignatureCertificateFixture
{
    private static void Reject(IntPtr pointer)
    {
        try { DevelopmentSignatureProbe.HashProviderCertificate(pointer); }
        catch (InvalidDataException) { return; }
        throw new Exception("expected_rejection");
    }
    private static int Main()
    {
        IntPtr bytes = Marshal.AllocHGlobal(3);
        IntPtr cert = Marshal.AllocHGlobal(Marshal.SizeOf(typeof(DevelopmentSignatureProbe.CertificateContext)));
        IntPtr provider = Marshal.AllocHGlobal(Marshal.SizeOf(typeof(DevelopmentSignatureProbe.ProviderCertificatePrefix)));
        try
        {
            Marshal.Copy(new byte[] { 97, 98, 99 }, 0, bytes, 3);
            var context = new DevelopmentSignatureProbe.CertificateContext { Encoding = 1, Encoded = bytes, EncodedSize = 3 };
            var prefix = new DevelopmentSignatureProbe.ProviderCertificatePrefix {
                Size = (uint)Marshal.SizeOf(typeof(DevelopmentSignatureProbe.ProviderCertificatePrefix)), Certificate = cert };
            Marshal.StructureToPtr(context, cert, false);
            Marshal.StructureToPtr(prefix, provider, false);
            if (DevelopmentSignatureProbe.HashProviderCertificate(provider) != "BA7816BF8F01CFEA414140DE5DAE2223B00361A396177A9CB410FF61F20015AD") throw new Exception("hash");
            Reject(IntPtr.Zero);
            foreach (uint size in new uint[] { 0, 65537, uint.MaxValue })
            {
                context.EncodedSize = size; Marshal.StructureToPtr(context, cert, false); Reject(provider);
            }
            context.EncodedSize = 3; context.Encoded = IntPtr.Zero;
            Marshal.StructureToPtr(context, cert, false); Reject(provider);
            context.Encoded = bytes; context.Encoding = 0;
            Marshal.StructureToPtr(context, cert, false); Reject(provider);
            prefix.Certificate = IntPtr.Zero; Marshal.StructureToPtr(prefix, provider, false); Reject(provider);
            prefix.Size = 1; Marshal.StructureToPtr(prefix, provider, false); Reject(provider);
            Console.WriteLine("Certificate memory checks: 9; artificial bytes only");
            return 0;
        }
        finally
        {
            Marshal.FreeHGlobal(provider); Marshal.FreeHGlobal(cert); Marshal.FreeHGlobal(bytes);
        }
    }
}
