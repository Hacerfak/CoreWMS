using System.ComponentModel;
using System.Diagnostics;
using System.Net.Sockets;
using System.Runtime.InteropServices;
using System.Text;

namespace CoreWMS.PrintAgent.Services;

public interface IRawPrinterService
{
    Task PrintAsync(string printerTarget, string zplContent);
}

public class RawPrinterService : IRawPrinterService
{
    private readonly ILogger<RawPrinterService> _logger;

    public RawPrinterService(ILogger<RawPrinterService> logger)
    {
        _logger = logger;
    }

    public async Task PrintAsync(string printerTarget, string zplContent)
    {
        if (string.IsNullOrWhiteSpace(printerTarget))
            throw new ArgumentExtensionException("O alvo da impressora (printerTarget) não foi informado.");

        // ----------------------------------------------------------------------
        // MODO 1: Impressora de Rede / Socket TCP (Formato "IP:Porta" ex: 192.168.1.150:9100)
        // ----------------------------------------------------------------------
        if (printerTarget.Contains(':') && int.TryParse(printerTarget.Split(':')[1], out var port))
        {
            var ip = printerTarget.Split(':')[0];
            await PrintViaTcpSocketAsync(ip, port, zplContent);
            return;
        }

        // ----------------------------------------------------------------------
        // MODO 2: Dispositivo Direto no Sistema (Linux /dev/usb/lp* ou Windows COM/LPT)
        // ----------------------------------------------------------------------
        if (printerTarget.StartsWith("/dev/") || printerTarget.StartsWith("COM", StringComparison.OrdinalIgnoreCase) || printerTarget.StartsWith("LPT", StringComparison.OrdinalIgnoreCase))
        {
            await PrintViaDirectDeviceAsync(printerTarget, zplContent);
            return;
        }

        // ----------------------------------------------------------------------
        // MODO 3: Spooler de Impressão do Sistema Operacional (Nome da Impressora)
        // ----------------------------------------------------------------------
        if (RuntimeInformation.IsOSPlatform(OSPlatform.Windows))
        {
            await PrintViaWindowsSpoolerAsync(printerTarget, zplContent);
        }
        else if (RuntimeInformation.IsOSPlatform(OSPlatform.Linux))
        {
            await PrintViaLinuxCupsAsync(printerTarget, zplContent);
        }
        else
        {
            throw new PlatformNotSupportedException("Sistema operacional não suportado para impressão em spooler.");
        }
    }

    // --- IMPLEMENTAÇÃO MODO 1: TCP SOCKET DIRECT ---
    private async Task PrintViaTcpSocketAsync(string ip, int port, string zpl)
    {
        _logger.LogInformation("[MODO 1 - TCP Socket] Conectando diretamente a {Ip}:{Port}...", ip, port);
        using var client = new TcpClient();
        await client.ConnectAsync(ip, port);
        using var stream = client.GetStream();

        byte[] bytes = Encoding.UTF8.GetBytes(zpl);
        await stream.WriteAsync(bytes, 0, bytes.Length);
        await stream.FlushAsync();
        _logger.LogInformation("[MODO 1 - TCP Socket] Bytes ZPL descarregados com sucesso na placa de rede da impressora.");
    }

    // --- IMPLEMENTAÇÃO MODO 2: DIRECT DEVICE (/dev/usb/lp0, COM1, LPT1) ---
    private async Task PrintViaDirectDeviceAsync(string devicePath, string zpl)
    {
        _logger.LogInformation("[MODO 2 - Direct Device] Escrevendo diretamente no dispositivo {Path}...", devicePath);

        if (!File.Exists(devicePath) && RuntimeInformation.IsOSPlatform(OSPlatform.Linux))
        {
            throw new FileNotFoundException($"Dispositivo físico '{devicePath}' não encontrado no sistema. Verifique a conexão USB/Serial.");
        }

        byte[] bytes = Encoding.UTF8.GetBytes(zpl);
        await File.WriteAllBytesAsync(devicePath, bytes);
        _logger.LogInformation("[MODO 2 - Direct Device] ZPL enviado diretamente ao hardware {Path}.", devicePath);
    }

    // --- IMPLEMENTAÇÃO MODO 3A: WINDOWS NATIVE SPOOLER (winspool.drv API) ---
    private async Task PrintViaWindowsSpoolerAsync(string printerName, string zpl)
    {
        _logger.LogInformation("[MODO 3A - Windows Spooler] Enviando RAW ZPL para '{Printer}'...", printerName);

        await Task.Run(() =>
        {
            if (!WinSpoolApi.OpenPrinter(printerName.Normalize(), out var hPrinter, IntPtr.Zero))
            {
                throw new Win32Exception(Marshal.GetLastWin32Error(), $"Não foi possível abrir a impressora Windows '{printerName}'. Verifique se o nome está correto no Painel de Controle.");
            }

            try
            {
                var docInfo = new WinSpoolApi.DOCINFO { pDocName = "CoreWMS_ZPL_Job", pDataType = "RAW" };
                if (!WinSpoolApi.StartDocPrinter(hPrinter, 1, docInfo))
                    throw new Win32Exception(Marshal.GetLastWin32Error(), "Falha ao iniciar o documento no spooler Windows.");

                if (!WinSpoolApi.StartPagePrinter(hPrinter))
                    throw new Win32Exception(Marshal.GetLastWin32Error(), "Falha ao iniciar a página no spooler.");

                byte[] bytes = Encoding.UTF8.GetBytes(zpl);
                IntPtr pUnmanagedBytes = Marshal.AllocHGlobal(bytes.Length);
                Marshal.Copy(bytes, 0, pUnmanagedBytes, bytes.Length);

                bool success = WinSpoolApi.WritePrinter(hPrinter, pUnmanagedBytes, bytes.Length, out _);
                Marshal.FreeHGlobal(pUnmanagedBytes);

                WinSpoolApi.EndPagePrinter(hPrinter);
                WinSpoolApi.EndDocPrinter(hPrinter);

                if (!success)
                    throw new Win32Exception(Marshal.GetLastWin32Error(), "Falha ao gravar os bytes no driver de impressão do Windows.");

                _logger.LogInformation("[MODO 3A - Windows Spooler] Impressão RAW concluída no Windows.");
            }
            finally
            {
                WinSpoolApi.ClosePrinter(hPrinter);
            }
        });
    }

    // --- IMPLEMENTAÇÃO MODO 3B: LINUX CUPS (lpr / lp) ---
    private async Task PrintViaLinuxCupsAsync(string printerName, string zpl)
    {
        _logger.LogInformation("[MODO 3B - Linux CUPS] Enviando para a fila CUPS '{Printer}'...", printerName);

        var tempFile = Path.GetTempFileName();
        await File.WriteAllTextAsync(tempFile, zpl);

        try
        {
            // Tenta executar via 'lpr'
            var (success, error) = await ExecuteProcessAsync("lpr", $"-P \"{printerName}\" -o raw \"{tempFile}\"");

            // Fallback para 'lp' se lpr não estiver disponível
            if (!success && error.Contains("No such file or directory", StringComparison.OrdinalIgnoreCase))
            {
                (success, error) = await ExecuteProcessAsync("lp", $"-d \"{printerName}\" -o raw \"{tempFile}\"");
            }

            if (!success)
            {
                if (error.Contains("No such file or directory", StringComparison.OrdinalIgnoreCase))
                {
                    throw new InvalidOperationException("O utilitário de impressão do Linux (lpr/lp) não está instalado. " +
                        "Para usar o Spooler CUPS, execute 'sudo apt install cups-bsd' ou 'sudo apt install cups'. " +
                        "Como alternativa, cadastre a impressora usando IP:Porta (ex: 192.168.1.150:9100) ou dispositivo direto (ex: /dev/usb/lp0).");
                }

                throw new InvalidOperationException($"Erro ao enviar para o CUPS no Linux: {error}");
            }

            _logger.LogInformation("[MODO 3B - Linux CUPS] Etiqueta enviada para a fila de impressão CUPS.");
        }
        finally
        {
            if (File.Exists(tempFile)) File.Delete(tempFile);
        }
    }

    private static async Task<(bool Success, string Error)> ExecuteProcessAsync(string command, string args)
    {
        try
        {
            var psi = new ProcessStartInfo
            {
                FileName = command,
                Arguments = args,
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                UseShellExecute = false,
                CreateNoWindow = true
            };

            using var process = Process.Start(psi);
            if (process == null) return (false, "Falha ao iniciar o processo.");

            await process.WaitForExitAsync();
            var stderr = await process.StandardError.ReadToEndAsync();

            return (process.ExitCode == 0, stderr);
        }
        catch (Exception ex)
        {
            return (false, ex.Message);
        }
    }

    // --- P/INVOKE WIN32 SPOOLER API ---
    private static class WinSpoolApi
    {
        [DllImport("winspool.drv", CharSet = CharSet.Auto, SetLastError = true)]
        public static extern bool OpenPrinter(string pPrinterName, out IntPtr phPrinter, IntPtr pDefault);

        [DllImport("winspool.drv", SetLastError = true)]
        public static extern bool ClosePrinter(IntPtr hPrinter);

        [DllImport("winspool.drv", CharSet = CharSet.Auto, SetLastError = true)]
        public static extern bool StartDocPrinter(IntPtr hPrinter, int level, [In] DOCINFO pDocInfo);

        [DllImport("winspool.drv", SetLastError = true)]
        public static extern bool EndDocPrinter(IntPtr hPrinter);

        [DllImport("winspool.drv", SetLastError = true)]
        public static extern bool StartPagePrinter(IntPtr hPrinter);

        [DllImport("winspool.drv", SetLastError = true)]
        public static extern bool EndPagePrinter(IntPtr hPrinter);

        [DllImport("winspool.drv", SetLastError = true)]
        public static extern bool WritePrinter(IntPtr hPrinter, IntPtr pBytes, int dwCount, out int dwWritten);

        [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Auto)]
        public class DOCINFO
        {
            [MarshalAs(UnmanagedType.LPStr)] public string pDocName = "CoreWMS_ZPL_Job";
            [MarshalAs(UnmanagedType.LPStr)] public string? pOutputFile;
            [MarshalAs(UnmanagedType.LPStr)] public string pDataType = "RAW";
        }
    }
}

public class ArgumentExtensionException : Exception
{
    public ArgumentExtensionException(string message) : base(message) { }
}