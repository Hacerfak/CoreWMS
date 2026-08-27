using CoreWMS.Api.Features.Printing;

namespace CoreWMS.Api.Infrastructure.Printing;

public interface IPrintService
{
    Task<string> SendPrintJobAsync(string agentName, string printerName, string zplContent);
}

public class PrintService : IPrintService
{
    private readonly Microsoft.AspNetCore.SignalR.IHubContext<PrintHub, IPrintClient> _hubContext;

    public PrintService(Microsoft.AspNetCore.SignalR.IHubContext<PrintHub, IPrintClient> hubContext)
    {
        _hubContext = hubContext;
    }

    public async Task<string> SendPrintJobAsync(string agentName, string printerName, string zplContent)
    {
        var jobId = Guid.NewGuid().ToString("N");
        var agentGroup = $"agent:{agentName.ToLower()}";

        // Envia o comando ZPL direto para o grupo do Agente Global em tempo real
        await _hubContext.Clients.Group(agentGroup).ExecutePrintJob(jobId, printerName, zplContent);

        return jobId;
    }
}