using CoreWMS.Api.Infrastructure.Data;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;

namespace CoreWMS.Api.Infrastructure.Printing;

public interface IPrintClient
{
    Task ExecutePrintJob(string jobId, string printerName, string zplContent);
}

public class PrintHub : Hub<IPrintClient>
{
    private readonly ApplicationDbContext _db;

    public PrintHub(ApplicationDbContext db)
    {
        _db = db;
    }

    public override async Task OnConnectedAsync()
    {
        var httpContext = Context.GetHttpContext();
        var apiKey = httpContext?.Request.Headers["X-Api-Key"].ToString();

        if (string.IsNullOrEmpty(apiKey))
        {
            apiKey = httpContext?.Request.Query["api_key"].ToString();
        }

        if (string.IsNullOrEmpty(apiKey))
        {
            Context.Abort();
            return;
        }

        // Valida se a API Key do Agente existe no banco global
        var agent = await _db.PrintAgents.FirstOrDefaultAsync(a => a.ApiKey == apiKey && a.IsActive);
        if (agent == null)
        {
            Context.Abort();
            return;
        }

        // Adiciona o canal a um grupo específico pelo Nome do Agente
        var agentGroup = $"agent:{agent.Name.ToLower()}";
        await Groups.AddToGroupAsync(Context.ConnectionId, agentGroup);

        Context.Items["AgentName"] = agent.Name;
        Console.WriteLine($"[PRINT AGENT CONNECTED] Agente Global '{agent.Name}' autenticado via API Key.");

        await base.OnConnectedAsync();
    }

    public Task ConfirmPrintJob(string jobId, bool success, string? errorMessage)
    {
        var agentName = Context.Items["AgentName"]?.ToString() ?? "Desconhecido";
        if (success)
            Console.WriteLine($"[PRINT ACK SUCCESS] Job {jobId} impresso com sucesso no Agente '{agentName}'.");
        else
            Console.WriteLine($"[PRINT ACK ERROR] Job {jobId} falhou no Agente '{agentName}': {errorMessage}");

        return Task.CompletedTask;
    }
}