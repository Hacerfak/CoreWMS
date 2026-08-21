using CoreWMS.PrintAgent.Storage;
using Microsoft.AspNetCore.SignalR.Client;

namespace CoreWMS.PrintAgent.Services;

public class PrintAgentWorker : BackgroundService
{
    private readonly IConfiguration _config;
    private readonly IRawPrinterService _printerService;
    private readonly LocalQueueRepository _queueRepo;
    private readonly ILogger<PrintAgentWorker> _logger;
    private HubConnection? _hubConnection;

    public bool IsConnected => _hubConnection?.State == HubConnectionState.Connected;
    public string ConnectionStatus => _hubConnection?.State.ToString() ?? "Disconnected";

    public PrintAgentWorker(
        IConfiguration config,
        IRawPrinterService printerService,
        LocalQueueRepository queueRepo,
        ILogger<PrintAgentWorker> logger)
    {
        _config = config;
        _printerService = printerService;
        _queueRepo = queueRepo;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        var serverUrl = _config["AgentSettings:ServerUrl"]!;
        var token = _config["AgentSettings:JwtToken"]!;
        var companyId = _config["AgentSettings:CompanyId"]!;

        _hubConnection = new HubConnectionBuilder()
            .WithUrl(serverUrl, options =>
            {
                options.AccessTokenProvider = () => Task.FromResult<string?>(token);
                options.Headers.Add("X-Company-Id", companyId);
            })
            .WithAutomaticReconnect(new[] { TimeSpan.Zero, TimeSpan.FromSeconds(2), TimeSpan.FromSeconds(5), TimeSpan.FromSeconds(10) })
            .Build();

        // Registra o ouvinte para a chamada do backend
        _hubConnection.On<string, string, string>("ExecutePrintJob", async (jobId, printerName, zplContent) =>
        {
            _logger.LogInformation("[JOB RECEIVED] Recebido JobId: {JobId} para Impressora: {Printer}", jobId, printerName);
            await ProcessJobAsync(jobId, printerName, zplContent);
        });

        _hubConnection.Reconnected += async (connectionId) =>
        {
            _logger.LogInformation("Reconectado ao CoreWMS Cloud! Processando fila pendente no SQLite...");
            await RegisterAgentAsync();
            await ProcessPendingQueueAsync();
        };

        try
        {
            await _hubConnection.StartAsync(stoppingToken);
            _logger.LogInformation("Conexão WebSocket estabelecida com o CoreWMS Cloud!");
            await RegisterAgentAsync();
            await ProcessPendingQueueAsync();
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Falha inicial de conexão com a nuvem. O agente continuará operando offline.");
        }

        // Loop de monitoramento de fila offline
        while (!stoppingToken.IsCancellationRequested)
        {
            if (IsConnected)
            {
                await ProcessPendingQueueAsync();
            }
            await Task.Delay(5000, stoppingToken);
        }
    }

    private async Task RegisterAgentAsync()
    {
        if (_hubConnection == null || !IsConnected) return;

        var stationName = _config["AgentSettings:StationName"] ?? "Estacao_Default";
        var printers = _config.GetSection("PrinterMappings").GetChildren().Select(x => x.Key).ToList();

        await _hubConnection.InvokeAsync("RegisterAgent", stationName, printers);
        _logger.LogInformation("Estação '{Station}' registrada com sucesso no Hub.", stationName);
    }

    private async Task ProcessJobAsync(string jobId, string printerAlias, string zplContent)
    {
        var targetHardware = _config[$"PrinterMappings:{printerAlias}"] ?? printerAlias;

        try
        {
            await _printerService.PrintAsync(targetHardware, zplContent);

            if (IsConnected && _hubConnection != null)
            {
                await _hubConnection.InvokeAsync("ConfirmPrintJob", jobId, true, null);
            }

            await _queueRepo.DeleteAsync(jobId);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Erro ao imprimir JobId {JobId}. Salvando no banco SQLite para nova tentativa...", jobId);
            await _queueRepo.SaveAsync(new PendingJob(jobId, printerAlias, zplContent, DateTime.UtcNow));

            if (IsConnected && _hubConnection != null)
            {
                await _hubConnection.InvokeAsync("ConfirmPrintJob", jobId, false, ex.Message);
            }
        }
    }

    private async Task ProcessPendingQueueAsync()
    {
        var pending = await _queueRepo.GetPendingAsync();
        if (pending.Count == 0) return;

        _logger.LogWarning("Encontradas {Count} etiquetas pendentes na fila SQLite local. Disparando...", pending.Count);

        foreach (var job in pending)
        {
            await ProcessJobAsync(job.JobId, job.PrinterName, job.ZplContent);
        }
    }
}