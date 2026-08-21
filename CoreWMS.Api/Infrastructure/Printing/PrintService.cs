using Microsoft.AspNetCore.SignalR;

namespace CoreWMS.Api.Infrastructure.Printing;

public interface IPrintService
{
    Task<string> SendPrintJobAsync(Guid companyId, string stationName, string printerName, string zplContent);
}

public class PrintService : IPrintService
{
    private readonly IHubContext<PrintHub, IPrintClient> _hubContext;

    public PrintService(IHubContext<PrintHub, IPrintClient> hubContext)
    {
        _hubContext = hubContext;
    }

    public async Task<string> SendPrintJobAsync(Guid companyId, string stationName, string printerName, string zplContent)
    {
        var jobId = Guid.NewGuid().ToString("N");
        var stationGroup = $"company:{companyId}:station:{stationName.ToLower()}";

        // Dispara o evento WebSockets direto para a estação específica em submilissegundos
        await _hubContext.Clients.Group(stationGroup).ExecutePrintJob(jobId, printerName, zplContent);

        return jobId;
    }
}