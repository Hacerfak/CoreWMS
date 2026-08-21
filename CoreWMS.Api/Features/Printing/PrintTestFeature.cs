using CoreWMS.Api.Core.CQRS;
using CoreWMS.Api.Infrastructure.Data;
using CoreWMS.Api.Infrastructure.Printing;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace CoreWMS.Api.Features.Printing;

public record SendTestPrintCommand(
    string StationName,
    string PrinterName,
    string? CustomZpl
) : ICommand<IResult>;

public class SendTestPrintHandler : ICommandHandler<SendTestPrintCommand, IResult>
{
    private readonly ApplicationDbContext _db;
    private readonly IPrintService _printService;

    public SendTestPrintHandler(ApplicationDbContext db, IPrintService printService)
    {
        _db = db;
        _printService = printService;
    }

    public async Task<IResult> HandleAsync(SendTestPrintCommand command, CancellationToken ct = default)
    {
        // 1. Busca a impressora no PostgreSQL pelo Nome do Agente e Nome da Impressora
        var printer = await _db.Printers
            .Include(p => p.PrintAgent)
            .FirstOrDefaultAsync(p => p.PrintAgent.Name == command.StationName && p.Name == command.PrinterName, ct);

        // Se encontrou no banco, usa o Target (ex: "192.168.1.20:9100"). Se não, usa o que foi enviado no comando.
        var targetHardware = printer?.Target ?? command.PrinterName;

        var zpl = command.CustomZpl ?? @"
^XA
^FO50,50^A0N,40,40^FDCoreWMS - Teste de Impressao^FS
^FO50,110^BY3^BCN,100,Y,N,N^FDTEST-123456^FS
^XZ";

        // 2. Dispara o Target real para o Agente via SignalR
        var jobId = await _printService.SendPrintJobAsync(
            command.StationName,
            targetHardware,
            zpl
        );

        return Results.Ok(new
        {
            Message = "Comando de impressão enviado com sucesso.",
            JobId = jobId,
            TargetStation = command.StationName,
            ResolvedTarget = targetHardware
        });
    }
}

public static class PrintEndpoints
{
    public static void MapPrintEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapPost("/api/print/send-test", async (
            [FromBody] SendTestPrintCommand command,
            [FromServices] ICommandHandler<SendTestPrintCommand, IResult> handler,
            CancellationToken ct) => await handler.HandleAsync(command, ct))
            .WithTags("Printing")
            .RequireAuthorization();
    }
}