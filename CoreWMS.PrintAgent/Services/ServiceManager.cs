using System.Diagnostics;
using System.Runtime.InteropServices;

namespace CoreWMS.PrintAgent.Services;

public static class ServiceManager
{
    public static (bool Success, string Message) InstallService()
    {
        var exePath = Process.GetCurrentProcess().MainModule?.FileName;
        if (string.IsNullOrEmpty(exePath)) return (false, "Caminho do executável não encontrado.");

        if (RuntimeInformation.IsOSPlatform(OSPlatform.Windows))
        {
            return RunProcess("sc.exe", $"create \"CoreWMSPrintAgent\" binPath= \"{exePath}\" start= auto");
        }
        else
        {
            var serviceContent = $@"
[Unit]
Description=CoreWMS Print Agent Service

[Service]
Type=notify
ExecStart={exePath}
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target";

            try
            {
                File.WriteAllText("/etc/systemd/system/corewms-print.service", serviceContent);
                RunProcess("systemctl", "daemon-reload");
                return RunProcess("systemctl", "enable --now corewms-print");
            }
            catch (Exception ex)
            {
                return (false, $"Erro ao criar arquivo de serviço Linux: {ex.Message}");
            }
        }
    }

    public static (bool Success, string Message) UninstallService()
    {
        if (RuntimeInformation.IsOSPlatform(OSPlatform.Windows))
        {
            RunProcess("sc.exe", "stop \"CoreWMSPrintAgent\"");
            return RunProcess("sc.exe", "delete \"CoreWMSPrintAgent\"");
        }
        else
        {
            RunProcess("systemctl", "disable --now corewms-print");
            if (File.Exists("/etc/systemd/system/corewms-print.service"))
                File.Delete("/etc/systemd/system/corewms-print.service");

            return RunProcess("systemctl", "daemon-reload");
        }
    }

    private static (bool Success, string Message) RunProcess(string filename, string arguments)
    {
        try
        {
            var psi = new ProcessStartInfo
            {
                FileName = filename,
                Arguments = arguments,
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                UseShellExecute = false,
                CreateNoWindow = true
            };

            using var process = Process.Start(psi);
            process?.WaitForExit();

            var output = process?.StandardOutput.ReadToEnd() ?? "";
            var error = process?.StandardError.ReadToEnd() ?? "";

            var success = process?.ExitCode == 0;
            var message = success ? (string.IsNullOrWhiteSpace(output) ? "Sucesso." : output) : $"Falha: {error}";

            return (success, message);
        }
        catch (Exception ex)
        {
            return (false, ex.Message);
        }
    }
}