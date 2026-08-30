using System;
using System.Diagnostics;
using System.IO;
using System.Threading;
using VehicleDiagnosis.Native;

internal static class J2534GlobalMutexLeaseTests
{
    private static int Child(string mode)
    {
        J2534GlobalMutexLease lease;
        if (!J2534GlobalMutexLease.TryAcquire(out lease)) { Console.WriteLine("busy"); return 3; }
        using (lease)
        {
            Console.WriteLine("acquired");
            Console.Out.Flush();
            if (mode == "hold") Thread.Sleep(1200);
        }
        return 0;
    }

    public static int Main(string[] args)
    {
        if (args.Length == 1 && (args[0] == "hold" || args[0] == "probe")) return Child(args[0]);
        if (args.Length != 0) return 2;
        string executable = Process.GetCurrentProcess().MainModule.FileName;
        Process hold = Process.Start(new ProcessStartInfo(executable, "hold") {
            UseShellExecute = false, RedirectStandardOutput = true, CreateNoWindow = true
        });
        if (hold.StandardOutput.ReadLine() != "acquired") return 10;
        Process blocked = Process.Start(new ProcessStartInfo(executable, "probe") {
            UseShellExecute = false, RedirectStandardOutput = true, CreateNoWindow = true
        });
        blocked.WaitForExit();
        if (blocked.ExitCode != 3 || blocked.StandardOutput.ReadLine() != "busy") return 11;
        hold.WaitForExit();
        if (hold.ExitCode != 0) return 12;
        Process released = Process.Start(new ProcessStartInfo(executable, "probe") {
            UseShellExecute = false, RedirectStandardOutput = true, CreateNoWindow = true
        });
        released.WaitForExit();
        if (released.ExitCode != 0 || released.StandardOutput.ReadLine() != "acquired") return 13;
        Console.WriteLine("global-mutex-process-checks-ok");
        return 0;
    }
}