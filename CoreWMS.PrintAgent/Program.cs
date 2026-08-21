using CoreWMS.PrintAgent.Services;
using CoreWMS.PrintAgent.Storage;

var builder = WebApplication.CreateBuilder(args);

// Suporte para rodar como Windows Service ou Linux systemd
builder.Host.UseWindowsService();
builder.Host.UseSystemd();

// Injeção dos Serviços
builder.Services.AddSingleton<LocalQueueRepository>();
builder.Services.AddSingleton<IRawPrinterService, RawPrinterService>();
builder.Services.AddSingleton<PrintAgentWorker>();
builder.Services.AddHostedService(sp => sp.GetRequiredService<PrintAgentWorker>());

var app = builder.Build();

// Endpoints da API Local (Painel de Monitoramento na Estação Local)
app.MapGet("/", (PrintAgentWorker worker, LocalQueueRepository repo) => new
{
    AgentStatus = "CoreWMS Print Agent Active",
    CloudConnection = worker.ConnectionStatus,
    IsConnected = worker.IsConnected,
    Timestamp = DateTime.UtcNow
});

app.MapGet("/pending-jobs", async (LocalQueueRepository repo) =>
{
    var jobs = await repo.GetPendingAsync();
    return Results.Ok(new { TotalPending = jobs.Count, Jobs = jobs });
});

app.MapPost("/test-local-print", async (string printerTarget, string? zpl, IRawPrinterService printer) =>
{
    var zplToPrint = zpl ?? @"
^XA
^FO50,50^A0N,30,30^FDCoreWMS - Impressao Local Direta^FS
^FO50,100^BY2^BCN,80,Y,N,N^FDLOCAL-TEST^FS
^XZ";

    try
    {
        await printer.PrintAsync(printerTarget, zplToPrint);
        return Results.Ok(new { Status = "Sucesso", Target = printerTarget });
    }
    catch (Exception ex)
    {
        return Results.BadRequest(new { Status = "Erro", Message = ex.Message });
    }
});

var port = builder.Configuration.GetValue<int>("AgentSettings:LocalApiPort", 9191);
app.Run($"http://localhost:{port}");