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
        // 1. Caso seja impressora de rede (IP:Porta ex: 192.168.1.150:9100)
        if (printerTarget.Contains(':') && int.TryParse(printerTarget.Split(':')[1], out var port))
        {
            var ip = printerTarget.Split(':')[0];
            await PrintViaTcpSocketAsync(ip, port, zplContent);
            return;
        }

        // 2. Caso seja impressora local no Linux (/dev/usb/lp0 ou fila CUPS)
        if (RuntimeInformation.IsOSPlatform(OSPlatform.Linux))
        {
            await PrintLinuxRawAsync(printerTarget, zplContent);
            return;
        }

        // 3. Caso seja impressora USB no Windows
        _logger.LogInformation("Enviando bytes ZPL para impressora local Windows: {Printer}", printerTarget);
        await Task.Delay(100); // Simulação de I/O de Spooler
    }

    private async Task PrintViaTcpSocketAsync(string ip, int port, string zpl)
    {
        _logger.LogInformation("Conectando via TCP Socket Direct em {Ip}:{Port}...", ip, port);
        using var client = new TcpClient();
        await client.ConnectAsync(ip, port);
        using var stream = client.GetStream();

        byte[] bytes = Encoding.UTF8.GetBytes(zpl);
        await stream.WriteAsync(bytes, 0, bytes.Length);
        await stream.FlushAsync();
        _logger.LogInformation("Bytes ZPL descarregados com sucesso na placa de rede da impressora.");
    }

    private async Task PrintLinuxRawAsync(string printerTarget, string zpl)
    {
        _logger.LogInformation("Disparando comando de impressão RAW Linux (CUPS/Device)...");
        var tempFile = Path.GetTempFileName();
        await File.WriteAllTextAsync(tempFile, zpl);

        var process = new System.Diagnostics.Process
        {
            StartInfo = new System.Diagnostics.ProcessStartInfo
            {
                FileName = "lpr",
                Arguments = $"-P \"{printerTarget}\" -o raw \"{tempFile}\"",
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                UseShellExecute = false,
                CreateNoWindow = true
            }
        };

        process.Start();
        await process.WaitForExitAsync();
        File.Delete(tempFile);
    }
}