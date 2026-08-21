using CoreWMS.Api.Core.CQRS;
using CoreWMS.Api.Infrastructure.Printing;
using Microsoft.AspNetCore.Mvc;

namespace CoreWMS.Api.Features.Printing;

// ==============================================================================
// 1. CONTRATOS & DTOs
// ==============================================================================
public record SendTestPrintCommand(
    Guid CompanyId,
    string StationName,
    string PrinterName,
    string? CustomZpl
) : ICommand<IResult>;

// ==============================================================================
// 2. HANDLER
// ==============================================================================
public class SendTestPrintHandler : ICommandHandler<SendTestPrintCommand, IResult>
{
    private readonly IPrintService _printService;

    public SendTestPrintHandler(IPrintService printService)
    {
        _printService = printService;
    }

    public async Task<IResult> HandleAsync(SendTestPrintCommand command, CancellationToken ct = default)
    {
        // ZPL padrão de teste (Imprime uma caixa com um código de barras Code128)
        var zpl = command.CustomZpl ?? @"
^XA
^FO50,50^A0N,40,40^FDCoreWMS - Teste de Impressao^FS
^FO50,110^BY3^BCN,100,Y,N,N^FDTEST-123456^FS
^XZ";

        var jobId = await _printService.SendPrintJobAsync(
            command.CompanyId,
            command.StationName,
            command.PrinterName,
            zpl
        );

        return Results.Ok(new
        {
            Message = "Comando de impressão enviado para a fila do SignalR.",
            JobId = jobId,
            TargetStation = command.StationName,
            TargetPrinter = command.PrinterName
        });
    }
}

// ==============================================================================
// 3. ENDPOINT
// ==============================================================================
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