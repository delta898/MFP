using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.IO.Compression;
using System.Linq;
using System.Text;
using System.Windows.Forms;

internal static class BlogGeniusLauncher
{
    private const string RuntimeName = "BlogGenius-runtime.exe";
    private const string SafeModeSwitch = "--bloggenius-safe-mode";

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
            Directory.CreateDirectory(logDir);
            Directory.CreateDirectory(diagnosticsDir);
        }
        string launcherLog = Path.Combine(logDir, "launcher.log");
        string runtimePath = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, RuntimeName);

        WriteLog(launcherLog, "launcher entered", new {
            version = Application.ProductVersion,
            os = Environment.OSVersion.VersionString,
            is64BitOperatingSystem = Environment.Is64BitOperatingSystem,
            is64BitProcess = Environment.Is64BitProcess,
            runtimePath = runtimePath,
            switches = args.Where(arg => arg.StartsWith("-", StringComparison.Ordinal)).ToArray()
        });

        if (!File.Exists(runtimePath))
        {
            return Fail(launcherLog, diagnosticsDir, "Electron 실행 파일을 찾을 수 없습니다: " + runtimePath, root);
        }

        bool shortLived = IsShortLived(args);
        LaunchResult normal = Launch(runtimePath, args, root, launcherLog, "normal");
        if (shortLived || normal.ExitCode == 0 || normal.Ready)
        {
            return normal.ExitCode;
        }

        if (Contains(args, SafeModeSwitch))
        {
            return Fail(launcherLog, diagnosticsDir, "안전 모드가 비정상 종료되었습니다. 종료 코드: " + normal.ExitCode, root);
        }

        WriteLog(launcherLog, "normal mode failed before readiness; retrying safe mode", new { exitCode = normal.ExitCode });
        string[] safeArgs = AddMissing(args, SafeModeSwitch, "--disable-gpu", "--no-stdio-init");
        LaunchResult safe = Launch(runtimePath, safeArgs, root, launcherLog, "safe");
        if (safe.ExitCode == 0)
        {
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
        string attemptDir = Path.Combine(root, "startup");
        Directory.CreateDirectory(attemptDir);
        string readyPath = Path.Combine(attemptDir, "ready-" + Process.GetCurrentProcess().Id + "-" + mode + ".json");
        TryDelete(readyPath);

        ProcessStartInfo info = new ProcessStartInfo {
            FileName = runtimePath,
            Arguments = JoinArguments(args),
            WorkingDirectory = AppDomain.CurrentDomain.BaseDirectory,
            UseShellExecute = false
        };
        info.EnvironmentVariables["BLOGGENIUS_STARTUP_READY_FILE"] = readyPath;
        info.EnvironmentVariables["BLOGGENIUS_LAUNCHER_PATH"] = Application.ExecutablePath;
        info.EnvironmentVariables["BLOGGENIUS_DIAGNOSTIC_ROOT"] = root;

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
                Stopwatch startupTimer = Stopwatch.StartNew();
                while (!child.WaitForExit(200))
                {
                    if (!ready && File.Exists(readyPath))
                    {
                        ready = true;
                        WriteLog(launcherLog, mode + " mode ready", new { pid = child.Id, readyPath = readyPath });
                        TryDelete(readyPath);
                        return new LaunchResult(true, 0);
                    }
                    if (!ready && startupTimer.Elapsed > TimeSpan.FromSeconds(45))
                    {
                        WriteLog(launcherLog, mode + " mode readiness timeout", new { pid = child.Id });
                        try { child.Kill(); } catch { }
                        try { child.WaitForExit(5000); } catch { }
                        TryDelete(readyPath);
                        return new LaunchResult(false, -2);
                    }
                }
                if (!ready && File.Exists(readyPath)) ready = true;
                int exitCode = child.ExitCode;
                WriteLog(launcherLog, mode + " mode exited", new { pid = child.Id, ready = ready, exitCode = exitCode, exitCodeHex = ToHex(exitCode) });
                TryDelete(readyPath);
                return new LaunchResult(ready, exitCode);
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
        string bundle = Path.Combine(diagnosticsDir, "BlogGenius-diagnostics-" + DateTime.Now.ToString("yyyyMMdd-HHmmss") + ".zip");
        try
        {
            using (FileStream stream = new FileStream(bundle, FileMode.CreateNew))
            using (ZipArchive archive = new ZipArchive(stream, ZipArchiveMode.Create))
            {
                AddFile(archive, Path.Combine(root, "logs", "launcher.log"), "logs/launcher.log");
                AddFile(archive, Path.Combine(root, "logs", "bootstrap.log"), "logs/bootstrap.log");
                AddDirectory(archive, Path.Combine(root, "crashes"), "crashes");
                AddText(archive, "system.txt",
                    "created=" + DateTime.UtcNow.ToString("o") + Environment.NewLine +
                    "os=" + Environment.OSVersion.VersionString + Environment.NewLine +
                    "64bit_os=" + Environment.Is64BitOperatingSystem + Environment.NewLine +
                    "64bit_process=" + Environment.Is64BitProcess + Environment.NewLine);
            }
            return bundle;
        }
        catch { return String.Empty; }
    }

    private static void AddDirectory(ZipArchive archive, string directory, string prefix)
    {
        if (!Directory.Exists(directory)) return;
        foreach (string file in Directory.GetFiles(directory))
        {
            try { archive.CreateEntryFromFile(file, prefix + "/" + Path.GetFileName(file), CompressionLevel.Optimal); } catch { }
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
