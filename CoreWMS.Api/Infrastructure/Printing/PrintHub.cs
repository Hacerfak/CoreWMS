using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;
using System.Security.Claims;

namespace CoreWMS.Api.Infrastructure.Printing;

public interface IPrintClient
{
    Task ExecutePrintJob(string jobId, string printerName, string zplContent);
}

[Authorize]
public class PrintHub : Hub<IPrintClient>
{
    // O Agent local chama este método ao se conectar para registrar suas impressoras disponíveis
    public async Task RegisterAgent(string stationName, List<string> availablePrinters)
    {
        var companyId = Context.GetHttpContext()?.Request.Headers["X-Company-Id"].ToString();
        var userId = Context.User?.FindFirst(ClaimTypes.NameIdentifier)?.Value;

        if (string.IsNullOrEmpty(companyId))
        {
            Context.Abort();
            return;
        }

        // Adiciona a conexão do Agent a um grupo exclusivo da Empresa e Estação
        var companyGroup = $"company:{companyId}";
        var stationGroup = $"company:{companyId}:station:{stationName.ToLower()}";

        await Groups.AddToGroupAsync(Context.ConnectionId, companyGroup);
        await Groups.AddToGroupAsync(Context.ConnectionId, stationGroup);

        // Mapeia os detalhes da conexão
        Context.Items["CompanyId"] = companyId;
        Context.Items["StationName"] = stationName;
        Context.Items["Printers"] = availablePrinters;
    }

    // Chamado pelo Agent Local após enviar os bytes para a impressora física (ACK)
    public Task ConfirmPrintJob(string jobId, bool success, string? errorMessage)
    {
        var stationName = Context.Items["StationName"]?.ToString() ?? "Desconhecida";

        if (success)
        {
            Console.WriteLine($"[PRINT SUCCESS] Job {jobId} impresso com sucesso na estação '{stationName}'.");
        }
        else
        {
            Console.WriteLine($"[PRINT ERROR] Job {jobId} falhou na estação '{stationName}': {errorMessage}");
        }

        return Task.CompletedTask;
    }

    public override Task OnDisconnectedAsync(Exception? exception)
    {
        var stationName = Context.Items["StationName"]?.ToString();
        if (!string.IsNullOrEmpty(stationName))
        {
            Console.WriteLine($"[PRINT AGENT DISCONNECTED] Estação '{stationName}' desconectou.");
        }
        return base.OnDisconnectedAsync(exception);
    }
}