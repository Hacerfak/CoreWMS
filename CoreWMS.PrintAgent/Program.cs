using CoreWMS.PrintAgent.Services;
using CoreWMS.PrintAgent.Storage;
using Microsoft.AspNetCore.Mvc;

var builder = WebApplication.CreateBuilder(args);

builder.Host.UseWindowsService();
builder.Host.UseSystemd();

// Configuração de Logs
var logBuffer = new InMemoryLogBuffer();
builder.Logging.ClearProviders(); // Limpa loggers padrão redundantes
builder.Logging.AddConsole();     // Mantém log bonito no terminal
builder.Logging.AddProvider(logBuffer);
builder.Logging.AddFilter("Microsoft.AspNetCore", LogLevel.Warning); // Silencia HTTP estático


builder.Services.AddSingleton(logBuffer);
builder.Services.AddSingleton<AgentConfigManager>();
builder.Services.AddSingleton<LocalQueueRepository>();
builder.Services.AddSingleton<IRawPrinterService, RawPrinterService>();
builder.Services.AddSingleton<PrintAgentWorker>();
builder.Services.AddHostedService(sp => sp.GetRequiredService<PrintAgentWorker>());

var app = builder.Build();

var htmlPath = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "index.html");

string RenderHtml(bool isConfigView, AgentConfig cfg, int port)
{
    if (!File.Exists(htmlPath)) return "<h1>Arquivo index.html não encontrado no diretório de execução.</h1>";

    var html = File.ReadAllText(htmlPath);
    return html
        .Replace("{{SHOW_DASHBOARD}}", isConfigView ? "none" : "block")
        .Replace("{{SHOW_CONFIG}}", isConfigView ? "block" : "none")
        .Replace("{{AGENT_ID}}", cfg.AgentId)
        .Replace("{{TENANT}}", string.IsNullOrWhiteSpace(cfg.Cnpj) ? "Não configurado" : cfg.Cnpj)
        .Replace("{{VAL_CNPJ}}", cfg.Cnpj)
        .Replace("{{VAL_DOMINIO}}", cfg.Dominio)
        .Replace("{{VAL_KEY}}", cfg.ApiKey)
        .Replace("{{PORT}}", port.ToString());
}

// ROUTING HTML
app.MapGet("/", (AgentConfigManager configMgr) =>
    Results.Content(RenderHtml(false, configMgr.Config, configMgr.Config.LocalPort), "text/html"));

app.MapGet("/config", (AgentConfigManager configMgr) =>
    Results.Content(RenderHtml(true, configMgr.Config, configMgr.Config.LocalPort), "text/html"));

// API DE DADOS PARA O DASHBOARD (POLLING)
app.MapGet("/status-data", (PrintAgentWorker worker) => new
{
    online = worker.IsConnected,
    lastCheck = worker.LastCheck.ToString("dd/MM/yyyy HH:mm:ss")
});

app.MapGet("/logs-data", (InMemoryLogBuffer buffer) =>
    Results.Text(buffer.GetLogsText()));

// DEMAIS AÇÕES DE CONFIGURAÇÃO E SERVIÇO OS
app.MapPost("/api/save-config", ([FromBody] AgentConfig body, AgentConfigManager configMgr) =>
{
    configMgr.Save(body);
    return Results.Ok("Configurações salvas com sucesso! O agente irá reconectar.");
});

app.MapPost("/api/install-service", () =>
{
    var res = ServiceManager.InstallService();
    return res.Success ? Results.Ok(res.Message) : Results.BadRequest(res.Message);
});

app.MapPost("/api/uninstall-service", () =>
{
    var res = ServiceManager.UninstallService();
    return res.Success ? Results.Ok(res.Message) : Results.BadRequest(res.Message);
});

var port = app.Services.GetRequiredService<AgentConfigManager>().Config.LocalPort;
app.Run($"http://localhost:{port}");