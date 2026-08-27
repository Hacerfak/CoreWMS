using CoreWMS.Api.Infrastructure.Data;
using CoreWMS.Api.Infrastructure.Printing;
using MediatR;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace CoreWMS.Api.Features.Printing;

public record SendTestPrintCommand(string StationName, string PrinterName, string? CustomZpl) : IRequest<IResult>;

public class SendTestPrintHandler : IRequestHandler<SendTestPrintCommand, IResult>
{
    private readonly ApplicationDbContext _db;
    private readonly IPrintService _printService;

    public SendTestPrintHandler(ApplicationDbContext db, IPrintService printService)
    {
        _db = db;
        _printService = printService;
    }

    public async Task<IResult> Handle(SendTestPrintCommand request, CancellationToken ct)
    {
        var printer = await _db.Printers.Include(p => p.PrintAgent)
            .FirstOrDefaultAsync(p => p.PrintAgent.Name == request.StationName && p.Name == request.PrinterName, ct);

        var targetHardware = printer?.Target ?? request.PrinterName;
        var zpl = request.CustomZpl ?? "^XA^FO50,50^A0N,40,40^FDCoreWMS - Teste de Impressao^FS^FO50,110^BY3^BCN,100,Y,N,N^FDTEST-123456^FS^XZ";

        var jobId = await _printService.SendPrintJobAsync(request.StationName, targetHardware, zpl);

        return Results.Ok(new { Message = "Comando de impressão enviado com sucesso.", JobId = jobId, TargetStation = request.StationName, ResolvedTarget = targetHardware });
    }
}

public static class PrintEndpoints
{
    public static void MapPrintEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapPost("/api/print/send-test", async ([FromBody] SendTestPrintCommand command, IMediator mediator) =>
            await mediator.Send(command))
        .WithTags("Printing").RequireAuthorization();
    }
}