using System.Text;
using CoreWMS.Api.Features.Identity.Constants;
using CoreWMS.Api.Infrastructure.Data;
using CoreWMS.Api.Infrastructure.Printing;
using CoreWMS.Api.Infrastructure.Security;
using FluentValidation;
using MediatR;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace CoreWMS.Api.Features.Printing.Operations;

public record PrintLocationsCommand(
    List<Guid> LocationIds,
    Guid TemplateId,
    string StationName,
    string PrinterName
) : IRequest<IResult>;

public class PrintLocationsCommandValidator : AbstractValidator<PrintLocationsCommand>
{
    public PrintLocationsCommandValidator()
    {
        RuleFor(x => x.LocationIds).NotEmpty().WithMessage("Informe ao menos um endereço para impressão.");
        RuleFor(x => x.TemplateId).NotEmpty().WithMessage("O template de etiqueta é obrigatório.");
        RuleFor(x => x.StationName).NotEmpty().WithMessage("A estação (agente de impressão) é obrigatória.");
        RuleFor(x => x.PrinterName).NotEmpty().WithMessage("A impressora é obrigatória.");
    }
}

public class PrintLocationsHandler : IRequestHandler<PrintLocationsCommand, IResult>
{
    private readonly ApplicationDbContext _db;
    private readonly ITenantProvider _tenant;
    private readonly IPrintService _printService;
    private readonly IZplTemplateEngine _zplEngine;

    public PrintLocationsHandler(
        ApplicationDbContext db,
        ITenantProvider tenant,
        IPrintService printService,
        IZplTemplateEngine zplEngine)
    {
        _db = db;
        _tenant = tenant;
        _printService = printService;
        _zplEngine = zplEngine;
    }

    public async Task<IResult> Handle(PrintLocationsCommand request, CancellationToken ct)
    {
        var companyId = _tenant.GetCompanyId();

        var template = await _db.LabelTemplates
            .AsNoTracking()
            .FirstOrDefaultAsync(t => t.Id == request.TemplateId, ct);

        if (template == null)
            return Results.BadRequest(new { Message = "Template de etiqueta não encontrado." });

        var locations = await _db.Locations
            .AsNoTracking()
            .Include(l => l.Zone)
                .ThenInclude(z => z.Warehouse)
            .Include(l => l.StorageType)
            .Where(l => request.LocationIds.Contains(l.Id))
            .ToListAsync(ct);

        if (!locations.Any())
            return Results.NotFound(new { Message = "Nenhum endereço encontrado para impressão." });

        var printer = await _db.Printers
            .Include(p => p.PrintAgent)
            .FirstOrDefaultAsync(p => p.PrintAgent.Name == request.StationName && p.Name == request.PrinterName, ct);

        var targetHardware = printer?.Target ?? request.PrinterName;

        var combinedZpl = new StringBuilder();
        foreach (var location in locations)
        {
            var renderedZpl = _zplEngine.RenderLocationTemplate(template.ZplContent, location);
            combinedZpl.AppendLine(renderedZpl);
        }

        var jobId = await _printService.SendPrintJobAsync(request.StationName, targetHardware, combinedZpl.ToString());

        return Results.Ok(new
        {
            Message = $"{locations.Count} etiqueta(s) de endereço enviada(s) para impressão com sucesso.",
            JobId = jobId,
            TargetStation = request.StationName,
            ResolvedTarget = targetHardware
        });
    }
}

public static class PrintLocationsEndpoints
{
    public static void MapPrintLocationsEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapPost("/api/print/locations", async ([FromBody] PrintLocationsCommand command, IMediator mediator) =>
            await mediator.Send(command))
        .WithTags("Printing")
        .RequireAuthorization()
        .RequirePermission(Permissions.Printing.Manage);
    }
}