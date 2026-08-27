using Microsoft.AspNetCore.SignalR;
using CoreWMS.Api.Infrastructure.Printing;
using CoreWMS.Api.Infrastructure.Data;
using Microsoft.Extensions.DependencyInjection;

namespace CoreWMS.Api.Features.Printing;

public interface IPrintClient
{
    Task ExecutePrintJob(string jobId, string printerName, string zplContent);
}

public class PrintHub : Hub<IPrintClient>
{
    private readonly IPrintConnectionManager _connectionManager;
    private readonly IServiceProvider _serviceProvider;

    public PrintHub(IPrintConnectionManager connectionManager, IServiceProvider serviceProvider)
    {
        _connectionManager = connectionManager;
        _serviceProvider = serviceProvider;
    }

    public override async Task OnConnectedAsync()
    {
        var httpContext = Context.GetHttpContext();

        var apiKey = httpContext?.Request.Headers["X-Api-Key"].ToString();
        if (string.IsNullOrEmpty(apiKey))
        {
            apiKey = httpContext?.Request.Query["apiKey"].ToString();
        }

        if (!string.IsNullOrEmpty(apiKey))
        {
            // 1. Registra no rastreador para dar o status "Online" no painel
            _connectionManager.AddConnection(Context.ConnectionId, apiKey);

            // 2. RECUPERA O ERRO: Coloca o Agente de volta no Grupo de impressão!
            using var scope = _serviceProvider.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();

            var agent = db.PrintAgents.FirstOrDefault(a => a.ApiKey == apiKey);
            if (agent != null)
            {
                var agentGroup = $"agent:{agent.Name.ToLower()}";
                await Groups.AddToGroupAsync(Context.ConnectionId, agentGroup);
            }
        }

        await base.OnConnectedAsync();
    }

    public override async Task OnDisconnectedAsync(Exception? exception)
    {
        _connectionManager.RemoveConnection(Context.ConnectionId);

        // Nota: O próprio SignalR já remove conexões caídas dos Grupos automaticamente.
        await base.OnDisconnectedAsync(exception);
    }

    public async Task ConfirmPrintJob(string jobId, bool success, string? errorMessage)
    {
        // Apenas aguarda, sem fazer nada por enquanto.
        await Task.CompletedTask;
    }
}