using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.IO.Compression;
using System.Linq;
using System.Runtime.InteropServices;
using System.Text;
using System.Windows.Forms;
using Microsoft.Win32;

internal static class BlogGeniusLauncher
{
    private const string RuntimeName = "BlogGenius-runtime.exe";
    private const string SafeModeSwitch = "--bloggenius-safe-mode";
    private const uint AttachParentProcess = 0xFFFFFFFF;
    private static readonly TimeSpan StartupTimeout = TimeSpan.FromSeconds(45);
    private static readonly TimeSpan ReadyStabilityWindow = TimeSpan.FromSeconds(5);

    [STAThread]
    private static int Main(string[] args)
    {
        string root = ResolveDiagnosticRoot();
        string logDir = Path.Combine(root, "logs");
        string diagnosticsDir = Path.Combine(root, "diagnostics");
        try
        {
            Directory.CreateDirectory(logDir);
            Directory.CreateDirectory(diagnosticsDir);
        }
        catch
        {
            root = Path.Combine(Path.GetTempPath(), "BlogGenius");
            logDir = Path.Combine(root, "logs");
            diagnosticsDir = Path.Combine(root, "diagnostics");
            try
            {
                Directory.CreateDirectory(logDir);
                Directory.CreateDirectory(diagnosticsDir);
            }
            catch (Exception error)
            {
                MessageBox.Show(
                    "BlogGenius 진단 폴더를 만들 수 없어 시작을 중단했습니다.\n\n" + error.Message,
                    "BlogGenius 시작 오류",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Error
                );
                return -1;
            }
        }
        string launcherLog = Path.Combine(logDir, "launcher.log");
        string runtimePath = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, RuntimeName);

        WriteLog(launcherLog, "launcher entered", new {
            version = Application.ProductVersion,
            os = Environment.OSVersion.VersionString,
            is64BitOperatingSystem = Environment.Is64BitOperatingSystem,
            is64BitProcess = Environment.Is64BitProcess,
            windowsBuild = GetWindowsBuild(),
            processArchitecture = Environment.GetEnvironmentVariable("PROCESSOR_ARCHITECTURE") ?? String.Empty,
            runtimePath = runtimePath,
            runtimeVersion = TryGetFileVersion(runtimePath),
            switches = args.Where(arg => arg.StartsWith("-", StringComparison.Ordinal)).ToArray()
        });

        if (!File.Exists(runtimePath))
        {
            return Fail(launcherLog, diagnosticsDir, "Electron 실행 파일을 찾을 수 없습니다: " + runtimePath, root);
        }

        int shortLivedExitCode;
        if (TryHandleShortLived(args, runtimePath, launcherLog, out shortLivedExitCode))
        {
            return shortLivedExitCode;
        }

        string[] normalArgs = AddMissing(args, "--no-stdio-init");
        LaunchResult normal = Launch(runtimePath, normalArgs, root, launcherLog, "normal");
        if (normal.Ready)
        {
            return normal.ExitCode;
        }

        if (Contains(args, SafeModeSwitch))
        {
            return Fail(launcherLog, diagnosticsDir, "안전 모드가 비정상 종료되었습니다. 종료 코드: " + normal.ExitCode, root);
        }

        WriteLog(launcherLog, "normal mode failed before readiness; retrying safe mode", new { exitCode = normal.ExitCode });
        string[] safeArgs = AddMissing(normalArgs, SafeModeSwitch, "--disable-gpu");
        LaunchResult safe = Launch(runtimePath, safeArgs, root, launcherLog, "safe");
        if (safe.Ready)
        {
            string recoveredBundle = CreateDiagnosticBundle(diagnosticsDir, root);
            WriteLog(launcherLog, "safe mode recovered startup", new { diagnosticBundle = recoveredBundle });
            return safe.ExitCode;
        }

        return Fail(
            launcherLog,
            diagnosticsDir,
            "정상 모드와 안전 모드가 모두 준비되기 전에 종료되었습니다. 정상 종료 코드: " +
                normal.ExitCode + ", 안전 모드 종료 코드: " + safe.ExitCode,
            root
        );
    }

    private static LaunchResult Launch(string runtimePath, string[] args, string root, string launcherLog, string mode)
    {
        bool startupProbe = Contains(args, "--bloggenius-startup-probe");
        string attemptDir = Path.Combine(root, "startup");
        Directory.CreateDirectory(attemptDir);
        string readyPath = Path.Combine(attemptDir, "ready-" + Process.GetCurrentProcess().Id + "-" + mode + ".json");
        TryDelete(readyPath);
        string chromiumLog = Path.Combine(root, "logs", "chromium-" + mode + ".log");
        RotateLog(chromiumLog);

        ProcessStartInfo info = new ProcessStartInfo {
            FileName = runtimePath,
            Arguments = JoinArguments(args),
            WorkingDirectory = AppDomain.CurrentDomain.BaseDirectory,
            UseShellExecute = false
        };
        info.EnvironmentVariables["BLOGGENIUS_STARTUP_READY_FILE"] = readyPath;
        info.EnvironmentVariables["BLOGGENIUS_LAUNCHER_PATH"] = Application.ExecutablePath;
        info.EnvironmentVariables["BLOGGENIUS_DIAGNOSTIC_ROOT"] = root;
        info.EnvironmentVariables["ELECTRON_ENABLE_LOGGING"] = "file";
        info.EnvironmentVariables["ELECTRON_LOG_FILE"] = chromiumLog;

        try
        {
            using (Process child = Process.Start(info))
            {
                if (child == null) throw new InvalidOperationException("Process.Start returned null");
                WriteLog(launcherLog, mode + " mode process started", new {
                    pid = child.Id,
                    switches = args.Where(arg => arg.StartsWith("-", StringComparison.Ordinal)).ToArray()
                });
                bool ready = false;
                DateTime readyObservedAt = DateTime.MinValue;
                Stopwatch startupTimer = Stopwatch.StartNew();
                while (!child.WaitForExit(200))
                {
                    if (!ready && File.Exists(readyPath))
                    {
                        ready = true;
                        readyObservedAt = DateTime.UtcNow;
                        WriteLog(launcherLog, mode + " mode renderer ready checkpoint", new { pid = child.Id, readyPath = readyPath });
                        TryDelete(readyPath);
                    }
                    if (ready && !startupProbe && DateTime.UtcNow - readyObservedAt >= ReadyStabilityWindow)
                    {
                        WriteLog(launcherLog, mode + " mode startup stable", new { pid = child.Id, stabilitySeconds = ReadyStabilityWindow.TotalSeconds });
                        return new LaunchResult(true, 0);
                    }
                    if ((!ready || startupProbe) && startupTimer.Elapsed > StartupTimeout)
                    {
                        WriteLog(launcherLog, mode + " mode startup timeout", new { pid = child.Id, ready = ready, startupProbe = startupProbe });
                        try { child.Kill(); } catch { }
                        try { child.WaitForExit(5000); } catch { }
                        TryDelete(readyPath);
                        return new LaunchResult(false, -2);
                    }
                }
                bool checkpointAtExit = ready || File.Exists(readyPath);
                int exitCode = child.ExitCode;
                WriteLog(launcherLog, mode + " mode exited", new { pid = child.Id, ready = false, checkpointAtExit = checkpointAtExit, exitCode = exitCode, exitCodeHex = ToHex(exitCode) });
                TryDelete(readyPath);
                return new LaunchResult(checkpointAtExit && exitCode == 0, exitCode);
            }
        }
        catch (Exception error)
        {
            WriteLog(launcherLog, mode + " mode launch failed", new { message = error.Message, type = error.GetType().FullName });
            return new LaunchResult(false, -1);
        }
    }

    private static int Fail(string launcherLog, string diagnosticsDir, string message, string diagnosticRoot)
    {
        WriteLog(launcherLog, "startup failed", new { message = message });
        string bundle = CreateDiagnosticBundle(diagnosticsDir, diagnosticRoot);
        string target = String.IsNullOrEmpty(bundle) ? diagnosticsDir : bundle;
        MessageBox.Show(
            "BlogGenius를 시작하지 못했습니다.\n\n" + message +
            "\n\n아래 진단 자료를 개발자에게 전달해 주세요.\n" + target,
            "BlogGenius 시작 오류",
            MessageBoxButtons.OK,
            MessageBoxIcon.Error
        );
        try { Process.Start("explorer.exe", "/select,\"" + target + "\""); } catch { }
        return -1;
    }

    private static string CreateDiagnosticBundle(string diagnosticsDir, string root)
    {
        if (String.IsNullOrEmpty(root) || !Directory.Exists(root)) return String.Empty;
        string bundle = Path.Combine(diagnosticsDir, "BlogGenius-diagnostics-" + DateTime.Now.ToString("yyyyMMdd-HHmmss-fff") + ".zip");
        try
        {
            using (FileStream stream = new FileStream(bundle, FileMode.CreateNew))
            using (ZipArchive archive = new ZipArchive(stream, ZipArchiveMode.Create))
            {
                AddFile(archive, Path.Combine(root, "logs", "launcher.log"), "logs/launcher.log");
                AddFile(archive, Path.Combine(root, "logs", "bootstrap.log"), "logs/bootstrap.log");
                AddFile(archive, Path.Combine(root, "logs", "chromium-normal.log"), "logs/chromium-normal.log");
                AddFile(archive, Path.Combine(root, "logs", "chromium-safe.log"), "logs/chromium-safe.log");
                AddRecentFiles(archive, Path.Combine(root, "logs"), "*.log", "logs", 8, 10 * 1024 * 1024);
                AddRecentFiles(archive, Path.Combine(root, "crashes"), "*", "crashes", 12, 25 * 1024 * 1024);
                AddText(archive, "system.txt",
                    "created=" + DateTime.UtcNow.ToString("o") + Environment.NewLine +
                    "os=" + Environment.OSVersion.VersionString + Environment.NewLine +
                    "windows_build=" + GetWindowsBuild() + Environment.NewLine +
                    "64bit_os=" + Environment.Is64BitOperatingSystem + Environment.NewLine +
                    "64bit_process=" + Environment.Is64BitProcess + Environment.NewLine +
                    "process_architecture=" + (Environment.GetEnvironmentVariable("PROCESSOR_ARCHITECTURE") ?? String.Empty) + Environment.NewLine);
            }
            return bundle;
        }
        catch { return String.Empty; }
    }

    private static void AddRecentFiles(ZipArchive archive, string directory, string pattern, string prefix, int maxFiles, long maxFileBytes)
    {
        if (!Directory.Exists(directory)) return;
        foreach (string file in Directory.GetFiles(directory, pattern)
            .OrderByDescending(candidate => File.GetLastWriteTimeUtc(candidate))
            .Take(maxFiles))
        {
            try
            {
                FileInfo info = new FileInfo(file);
                if (info.Length <= maxFileBytes && archive.GetEntry(prefix + "/" + info.Name) == null)
                {
                    archive.CreateEntryFromFile(file, prefix + "/" + info.Name, CompressionLevel.Optimal);
                }
            }
            catch { }
        }
    }

    private static void AddFile(ZipArchive archive, string file, string name)
    {
        if (!File.Exists(file)) return;
        try { archive.CreateEntryFromFile(file, name, CompressionLevel.Optimal); } catch { }
    }

    private static void AddText(ZipArchive archive, string name, string text)
    {
        ZipArchiveEntry entry = archive.CreateEntry(name);
        using (StreamWriter writer = new StreamWriter(entry.Open(), Encoding.UTF8)) writer.Write(text);
    }

    private static string ResolveDiagnosticRoot()
    {
        string local = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
        if (String.IsNullOrEmpty(local)) local = Path.GetTempPath();
        return Path.Combine(local, "BlogGenius");
    }

    private static string GetWindowsBuild()
    {
        try
        {
            using (RegistryKey key = Registry.LocalMachine.OpenSubKey(@"SOFTWARE\Microsoft\Windows NT\CurrentVersion"))
            {
                if (key == null) return Environment.OSVersion.VersionString;
                string product = Convert.ToString(key.GetValue("ProductName")) ?? String.Empty;
                string display = Convert.ToString(key.GetValue("DisplayVersion")) ?? String.Empty;
                string build = Convert.ToString(key.GetValue("CurrentBuildNumber")) ?? String.Empty;
                string ubr = Convert.ToString(key.GetValue("UBR")) ?? String.Empty;
                return String.Join(" ", new[] { product, display, build + (String.IsNullOrEmpty(ubr) ? "" : "." + ubr) }.Where(value => !String.IsNullOrWhiteSpace(value)));
            }
        }
        catch { return Environment.OSVersion.VersionString; }
    }

    private static string TryGetFileVersion(string path)
    {
        try { return FileVersionInfo.GetVersionInfo(path).FileVersion ?? String.Empty; }
        catch { return String.Empty; }
    }

    private static bool TryHandleShortLived(string[] args, string runtimePath, string launcherLog, out int exitCode)
    {
        exitCode = 0;
        if (!IsShortLived(args)) return false;

        bool help = args.Any(arg => String.Equals(arg, "--help", StringComparison.OrdinalIgnoreCase) || String.Equals(arg, "-h", StringComparison.OrdinalIgnoreCase));
        string output = help
            ? "Usage: BlogGenius [options]" + Environment.NewLine + Environment.NewLine +
              "Options:" + Environment.NewLine +
              "  --version, -v    Print the application version and exit" + Environment.NewLine +
              "  --help, -h       Show this help and exit"
            : TryGetFileVersion(runtimePath);

        if (String.IsNullOrWhiteSpace(output))
        {
            WriteLog(launcherLog, "short-lived command failed", new { reason = "runtime version unavailable" });
            exitCode = -1;
            return true;
        }

        TryWriteParentConsole(output);
        WriteLog(launcherLog, "short-lived command handled by launcher", new { command = help ? "help" : "version", exitCode = 0 });
        return true;
    }

    private static void TryWriteParentConsole(string output)
    {
        bool attached = false;
        try
        {
            attached = AttachConsole(AttachParentProcess);
            using (Stream stream = Console.OpenStandardOutput())
            using (StreamWriter writer = new StreamWriter(stream, new UTF8Encoding(false)))
            {
                writer.AutoFlush = true;
                writer.WriteLine(output);
            }
        }
        catch { }
        finally
        {
            if (attached) try { FreeConsole(); } catch { }
        }
    }

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool AttachConsole(uint processId);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool FreeConsole();

    private static bool IsShortLived(string[] args)
    {
        return Contains(args, "--version") || Contains(args, "-v") || Contains(args, "--help") || Contains(args, "-h");
    }

    private static bool Contains(string[] args, string value)
    {
        return args.Any(arg => String.Equals(arg, value, StringComparison.OrdinalIgnoreCase));
    }

    private static string[] AddMissing(string[] args, params string[] additions)
    {
        List<string> result = new List<string>(args);
        foreach (string addition in additions) if (!Contains(result.ToArray(), addition)) result.Add(addition);
        return result.ToArray();
    }

    private static string JoinArguments(string[] args)
    {
        return String.Join(" ", args.Select(QuoteArgument));
    }

    private static string QuoteArgument(string value)
    {
        if (String.IsNullOrEmpty(value)) return "\"\"";
        if (!value.Any(ch => Char.IsWhiteSpace(ch) || ch == '"')) return value;
        StringBuilder result = new StringBuilder("\"");
        int slashes = 0;
        foreach (char ch in value)
        {
            if (ch == '\\') { slashes++; continue; }
            if (ch == '"') { result.Append('\\', slashes * 2 + 1); result.Append(ch); slashes = 0; continue; }
            result.Append('\\', slashes); slashes = 0; result.Append(ch);
        }
        result.Append('\\', slashes * 2); result.Append('"');
        return result.ToString();
    }

    private static void WriteLog(string path, string message, object details)
    {
        try
        {
            FileInfo current = new FileInfo(path);
            if (current.Exists && current.Length > 5 * 1024 * 1024)
            {
                string previous = Path.Combine(current.DirectoryName, "launcher.previous.log");
                TryDelete(previous);
                File.Move(path, previous);
            }
            File.AppendAllText(path, DateTime.UtcNow.ToString("o") + " " + message + " " + FormatDetails(details) + Environment.NewLine, Encoding.UTF8);
        }
        catch { }
    }

    private static void RotateLog(string path)
    {
        try
        {
            if (!File.Exists(path)) return;
            string previous = path + ".previous";
            TryDelete(previous);
            File.Move(path, previous);
        }
        catch { }
    }

    private static string FormatDetails(object details)
    {
        if (details == null) return String.Empty;
        try
        {
            return String.Join(" ", details.GetType().GetProperties().Select(property => {
                object value = property.GetValue(details, null);
                Array values = value as Array;
                string text = values == null
                    ? Convert.ToString(value)
                    : String.Join(",", values.Cast<object>().Select(item => Convert.ToString(item)));
                return property.Name + "=" + (text ?? String.Empty).Replace("\r", " ").Replace("\n", " ");
            }));
        }
        catch { return details.ToString(); }
    }

    private static string ToHex(int value) { return "0x" + unchecked((uint)value).ToString("X8"); }
    private static void TryDelete(string path) { try { if (File.Exists(path)) File.Delete(path); } catch { } }

    private sealed class LaunchResult
    {
        public readonly bool Ready;
        public readonly int ExitCode;
        public LaunchResult(bool ready, int exitCode) { Ready = ready; ExitCode = exitCode; }
    }
}
