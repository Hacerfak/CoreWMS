using CoreWMS.Api.Infrastructure.Data;
using CoreWMS.Api.Infrastructure.Printing;
using FluentValidation;
using MediatR;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace CoreWMS.Api.Features.Printing;

// 1. CONTRATOS
public record SendTestPrintCommand(string StationName, string PrinterName, string? CustomZpl) : IRequest<IResult>;

// 2. VALIDADOR
public class SendTestPrintCommandValidator : AbstractValidator<SendTestPrintCommand>
{
    public SendTestPrintCommandValidator()
    {
        RuleFor(x => x.StationName).NotEmpty().WithMessage("O nome da estação (agente) é obrigatório.");
        RuleFor(x => x.PrinterName).NotEmpty().WithMessage("O nome da impressora é obrigatório.");
    }
}

// 3. HANDLER
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
        // 1. Busca a impressora no PostgreSQL pelo Nome do Agente e Nome da Impressora
        var printer = await _db.Printers
            .Include(p => p.PrintAgent)
            .FirstOrDefaultAsync(p => p.PrintAgent.Name == request.StationName && p.Name == request.PrinterName, ct);

        // Se encontrou no banco, usa o Target (ex: "192.168.1.20:9100"). Se não, usa o que foi enviado no comando.
        var targetHardware = printer?.Target ?? request.PrinterName;

        // ZPL de teste padrão caso não seja enviado um customizado
        var zpl = string.IsNullOrWhiteSpace(request.CustomZpl)
            ? "^XA^FO50,50^A0N,40,40^FDCoreWMS - Teste de Impressao^FS^FO50,110^BY3^BCN,100,Y,N,N^FDTEST-123456^FS^XZ"
            : request.CustomZpl;

        // 2. Dispara o Target real para o Agente via SignalR
        var jobId = await _printService.SendPrintJobAsync(request.StationName, targetHardware, zpl);

        return Results.Ok(new
        {
            Message = "Comando de impressão enviado com sucesso.",
            JobId = jobId,
            TargetStation = request.StationName,
            ResolvedTarget = targetHardware
        });
    }
}

// 4. ENDPOINT
public static class PrintEndpoints
{
    public static void MapPrintEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapPost("/api/print/send-test", async ([FromBody] SendTestPrintCommand command, IMediator mediator) =>
            await mediator.Send(command))
        .WithTags("Printing")
        .RequireAuthorization(); // Se precisar, pode adicionar o .RequirePermission(...) aqui no futuro
    }
}