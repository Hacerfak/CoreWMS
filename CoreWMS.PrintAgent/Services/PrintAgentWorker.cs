using CoreWMS.PrintAgent.Storage;
using Microsoft.AspNetCore.SignalR.Client;

namespace CoreWMS.PrintAgent.Services;

public class PrintAgentWorker : BackgroundService
{
    private readonly AgentConfigManager _configMgr;
    private readonly IRawPrinterService _printerService;
    private readonly LocalQueueRepository _queueRepo;
    private readonly ILogger<PrintAgentWorker> _logger;
    private HubConnection? _hubConnection;

    public bool IsConnected => _hubConnection?.State == HubConnectionState.Connected;
    public string ConnectionStatus => _hubConnection?.State.ToString() ?? "Disconnected";
    public DateTime LastCheck { get; private set; } = DateTime.Now;

    public PrintAgentWorker(
        AgentConfigManager configMgr,
        IRawPrinterService printerService,
        LocalQueueRepository queueRepo,
        ILogger<PrintAgentWorker> logger)
    {
        _configMgr = configMgr;
        _printerService = printerService;
        _queueRepo = queueRepo;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            var cfg = _configMgr.Config;

            if (string.IsNullOrWhiteSpace(cfg.ApiKey) || string.IsNullOrWhiteSpace(cfg.Dominio))
            {
                _logger.LogWarning("Agente não configurado. Acesse http://localhost:{Port}/config para realizar o setup.", cfg.LocalPort);
                await Task.Delay(5000, stoppingToken);
                continue;
            }

            if (_hubConnection == null || _hubConnection.State == HubConnectionState.Disconnected)
            {
                await ConnectSignalRAsync(cfg);
            }

            LastCheck = DateTime.Now;
            await ProcessPendingQueueAsync();
            await Task.Delay(3000, stoppingToken);
        }
    }

    private async Task ConnectSignalRAsync(AgentConfig cfg)
    {
        _hubConnection = new HubConnectionBuilder()
            .WithUrl(cfg.ServerUrl, options =>
            {
                // Autenticação direta e limpa via API Key Global do Agente
                options.Headers.Add("X-Api-Key", cfg.ApiKey);
            })
            .WithAutomaticReconnect()
            .Build();

        _hubConnection.On<string, string, string>("ExecutePrintJob", async (jobId, printerName, zplContent) =>
        {
            _logger.LogInformation("[JOB RECEIVED] Impressora: {Printer} | JobId: {JobId}", printerName, jobId);
            await ProcessJobAsync(jobId, printerName, zplContent);
        });

        try
        {
            await _hubConnection.StartAsync();
            _logger.LogInformation("Conectado com sucesso ao CoreWMS Cloud ({Url}) via API Key!", cfg.ServerUrl);
        }
        catch (Exception ex)
        {
            _logger.LogError("Falha de conexão com a Nuvem: {Message}", ex.Message);
        }
    }

    private async Task ProcessJobAsync(string jobId, string printerAlias, string zplContent)
    {
        try
        {
            await _printerService.PrintAsync(printerAlias, zplContent);

            if (IsConnected && _hubConnection != null)
                await _hubConnection.InvokeAsync("ConfirmPrintJob", jobId, true, null);

            await _queueRepo.DeleteAsync(jobId);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Erro de impressão no Job {JobId}. Salvando em fila offline...", jobId);
            await _queueRepo.SaveAsync(new PendingJob(jobId, printerAlias, zplContent, DateTime.UtcNow));

            if (IsConnected && _hubConnection != null)
                await _hubConnection.InvokeAsync("ConfirmPrintJob", jobId, false, ex.Message);
        }
    }

    private async Task ProcessPendingQueueAsync()
    {
        var pending = await _queueRepo.GetPendingAsync();
        if (pending.Count == 0) return;

        foreach (var job in pending)
        {
            await ProcessJobAsync(job.JobId, job.PrinterName, job.ZplContent);
        }
    }
}